import { asc, eq } from 'drizzle-orm';
import {
  aplicarEvento,
  reconstruirEstado,
  type EstadoMotor,
  type EventoMotor,
  type FotoListas
} from '$lib/motor';
import { getDb, getSqlite } from './db';
import {
  asignaciones,
  eventos,
  excepcionesElegibilidad,
  grupoEspecialidades,
  grupos,
  itemsLista,
  listas,
  participantes,
  profesorEspecialidades,
  repartos
} from './db/schema';
import { publishRepartoUpdate } from './sse';
import { crearCopiaSeguridad } from './backup';

const TIPOS_EVENTO_MOTOR = new Set<EventoMotor['tipo']>([
  'RONDA_EJECUTADA',
  'VENTANA_CERRADA',
  'BLOQUEO_RESUELTO_ELECCION',
  'BLOQUEO_RESUELTO_SALTAR',
  'PASE_A_MANUAL',
  'MANUAL_ASIGNAR',
  'MANUAL_MOVER',
  'MANUAL_DESASIGNAR',
  'MANUAL_TRUEQUE',
  'EXCEPCION_CREADA',
  'DESHACER_ULTIMA_ACCION',
  'DESHACER_ULTIMA_RONDA',
  'REPARTO_CERRADO',
  'REPARTO_REABIERTO'
]);

const repartosEnEjecucion = new Set<number>();

export function obtenerFotoListasActual(repartoId: number): FotoListas {
  const db = getDb();
  const parts = db
    .select({ id: participantes.id })
    .from(participantes)
    .where(eq(participantes.repartoId, repartoId))
    .all();

  const foto: FotoListas = {};
  for (const p of parts) {
    const l = db.select().from(listas).where(eq(listas.participanteId, p.id)).get();
    if (!l) {
      foto[p.id] = [];
      continue;
    }
    const items = db
      .select({ grupoId: itemsLista.grupoId })
      .from(itemsLista)
      .where(eq(itemsLista.listaId, l.id))
      .orderBy(asc(itemsLista.posicion))
      .all();
    foto[p.id] = items.map((i) => i.grupoId);
  }
  return foto;
}

/**
 * Reconstruye el EstadoMotor exacto a partir de la foto inicial de ListasCerradas
 * y todos los EventoMotor persistidos en orden.
 */
export function reconstruirEstadoReparto(repartoId: number): EstadoMotor {
  const db = getDb();
  const rep = db.select().from(repartos).where(eq(repartos.id, repartoId)).get();
  if (!rep) throw new Error('Reparto no encontrado');

  if (!rep.fotoInicialJson) {
    // Si aún no se cerraron listas, construimos estado base en vivo
    const parts = db
      .select()
      .from(participantes)
      .where(eq(participantes.repartoId, repartoId))
      .orderBy(asc(participantes.orden))
      .all();
    const grps = db.select().from(grupos).where(eq(grupos.repartoId, repartoId)).all();
    const profEsps = db.select().from(profesorEspecialidades).all();
    const grpEsps = db.select().from(grupoEspecialidades).all();

    const profEspMap = new Map<number, number[]>();
    for (const pe of profEsps) {
      const arr = profEspMap.get(pe.profesorId) ?? [];
      arr.push(pe.especialidadId);
      profEspMap.set(pe.profesorId, arr);
    }
    const grpEspMap = new Map<number, number[]>();
    for (const ge of grpEsps) {
      const arr = grpEspMap.get(ge.grupoId) ?? [];
      arr.push(ge.especialidadId);
      grpEspMap.set(ge.grupoId, arr);
    }

    return {
      fase: 'ListasCerradas',
      rondaActual: rep.rondaActual,
      restringirPorTurno: rep.restringirPorTurno,
      participantes: parts.map((p) => ({
        id: p.id,
        orden: p.orden,
        horasACubrir: p.horasACubrir,
        esVacante: p.esVacante,
        especialidadesIds: profEspMap.get(p.profesorId) ?? [],
        pendienteDeCuadrar: p.pendienteDeCuadrar,
        turno: p.turno ?? null
      })),
      grupos: grps.map((g) => ({
        id: g.id,
        horasSemanales: g.horasSemanales,
        tipo: g.tipo,
        especialidadesIds: grpEspMap.get(g.id) ?? [],
        turno: g.turno
      })),
      excepciones: [],
      asignaciones: [],
      bloqueo: null,
      historialManual: [],
      historialRondas: []
    };
  }

  const parsed = JSON.parse(rep.fotoInicialJson) as { estadoInicial: EstadoMotor };
  const rows = db
    .select()
    .from(eventos)
    .where(eq(eventos.repartoId, repartoId))
    .orderBy(asc(eventos.id))
    .all();

  const motorEventos: EventoMotor[] = [];
  for (const row of rows) {
    if (TIPOS_EVENTO_MOTOR.has(row.tipo as EventoMotor['tipo'])) {
      motorEventos.push(JSON.parse(row.datosJson) as EventoMotor);
    }
  }

  return reconstruirEstado(parsed.estadoInicial, motorEventos);
}

function ejecutarConBloqueo<T>(repartoId: number, fn: () => T): T {
  if (repartosEnEjecucion.has(repartoId)) {
    throw new Error('Hay otra operación en curso en este reparto. Inténtalo de nuevo.');
  }
  repartosEnEjecucion.add(repartoId);
  try {
    return fn();
  } finally {
    repartosEnEjecucion.delete(repartoId);
  }
}

export function aplicarEventosYPersistir(params: {
  repartoId: number;
  actorId: number;
  eventosNuevos: EventoMotor[];
  ventanaHasta?: string | null;
  justificacionCierre?: string | null;
  asistentes?: string[] | null;
}): { estado: EstadoMotor; version: number } {
  return ejecutarConBloqueo(params.repartoId, () => {
    const db = getDb();
    const sqlite = getSqlite();

    const rep = db.select().from(repartos).where(eq(repartos.id, params.repartoId)).get();
    if (!rep) throw new Error('Reparto no encontrado');

    let estado = reconstruirEstadoReparto(params.repartoId);
    for (const ev of params.eventosNuevos) {
      estado = aplicarEvento(estado, ev);
    }

    const nuevaVersion = rep.version + 1;

    sqlite.transaction(() => {
      // 1. Insertar eventos
      for (const ev of params.eventosNuevos) {
        db.insert(eventos)
          .values({
            repartoId: params.repartoId,
            tipo: ev.tipo,
            datosJson: JSON.stringify(ev),
            actorId: params.actorId
          })
          .run();
      }

      // 2. Sincronizar asignaciones vigentes
      db.delete(asignaciones).where(eq(asignaciones.repartoId, params.repartoId)).run();
      for (const a of estado.asignaciones) {
        db.insert(asignaciones)
          .values({
            repartoId: params.repartoId,
            grupoId: a.grupoId,
            participanteId: a.participanteId,
            origen: a.origen,
            numeroRonda: a.numeroRonda,
            nota: a.nota ?? null,
            registradoPorId: params.actorId
          })
          .run();
      }

      // 3. Sincronizar excepciones de elegibilidad
      for (const ex of estado.excepciones) {
        db.insert(excepcionesElegibilidad)
          .values({
            repartoId: params.repartoId,
            participanteId: ex.participanteId,
            grupoId: ex.grupoId,
            motivo: ex.motivo,
            creadoPorId: params.actorId
          })
          .onConflictDoNothing()
          .run();
      }

      // 4. Sincronizar pendienteDeCuadrar y turno en participantes
      for (const p of estado.participantes) {
        db.update(participantes)
          .set({
            pendienteDeCuadrar: p.pendienteDeCuadrar,
            turno: p.turno ?? null
          })
          .where(eq(participantes.id, p.id))
          .run();
      }

      // 5. Actualizar cabecera de reparto
      db.update(repartos)
        .set({
          estado: estado.fase,
          rondaActual: estado.rondaActual,
          version: nuevaVersion,
          ventanaHasta:
            params.ventanaHasta !== undefined
              ? params.ventanaHasta
              : estado.fase === 'Ventana'
                ? rep.ventanaHasta
                : null,
          bloqueoParticipanteId: estado.bloqueo?.participanteId ?? null,
          bloqueoSiguienteIndice: estado.bloqueo?.indiceSiguiente ?? null,
          justificacionCierre:
            params.justificacionCierre !== undefined
              ? params.justificacionCierre
              : rep.justificacionCierre,
          asistentesJson:
            params.asistentes !== undefined
              ? JSON.stringify(params.asistentes)
              : rep.asistentesJson,
          cerradoEn: estado.fase === 'Cerrado' ? new Date().toISOString() : rep.cerradoEn
        })
        .where(eq(repartos.id, params.repartoId))
        .run();
    })();

    const lastTipo = params.eventosNuevos[params.eventosNuevos.length - 1]?.tipo ?? 'UPDATE';
    publishRepartoUpdate(params.repartoId, nuevaVersion, lastTipo);

    if (estado.fase === 'Cerrado') {
      void crearCopiaSeguridad(`reparto-${params.repartoId}`);
    }

    return { estado, version: nuevaVersion };
  });
}

export function lanzarSiguienteRonda(
  repartoId: number,
  actorId: number,
  minutosVentana?: number | null
) {
  const db = getDb();
  const rep = db.select().from(repartos).where(eq(repartos.id, repartoId)).get();
  if (!rep) throw new Error('Reparto no encontrado');
  if (rep.estado !== 'ListasCerradas' && rep.estado !== 'Ventana') {
    throw new Error('Solo se puede lanzar una ronda desde Listas cerradas o Ventana de ajuste.');
  }

  const fotoListas = obtenerFotoListasActual(repartoId);
  const eventosNuevos: EventoMotor[] = [];
  if (rep.estado === 'Ventana') {
    eventosNuevos.push({ tipo: 'VENTANA_CERRADA', fotoListas });
  }
  eventosNuevos.push({ tipo: 'RONDA_EJECUTADA', fotoListas, desdeIndice: 0 });

  const ventanaHasta =
    minutosVentana && minutosVentana > 0
      ? new Date(Date.now() + minutosVentana * 60_000).toISOString()
      : null;

  return aplicarEventosYPersistir({
    repartoId,
    actorId,
    eventosNuevos,
    ventanaHasta
  });
}
