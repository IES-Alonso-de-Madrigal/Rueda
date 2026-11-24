import { error, fail } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { requireUser } from '$lib/server/auth/guards';
import { getDb, getSqlite } from '$lib/server/db';
import {
  asignaciones,
  cursosAcademicos,
  departamentos,
  excepcionesElegibilidad,
  grupoEspecialidades,
  grupos,
  itemsLista,
  listas,
  participantes,
  profesorEspecialidades,
  profesores,
  repartos
} from '$lib/server/db/schema';
import { esDisponible, esElegible, normalizarTurno, opcionesValidasEnDirecto } from '$lib/motor';
import {
  aplicarEventosYPersistir,
  obtenerFotoListasActual,
  reconstruirEstadoReparto
} from '$lib/server/reparto-service';

export const load: PageServerLoad = async ({ locals, params }) => {
  const user = requireUser(locals);
  const repartoId = Number(params.id);
  if (!Number.isInteger(repartoId) || repartoId <= 0) {
    throw error(400, 'ID de reparto no válido');
  }

  const db = getDb();

  const rep = db
    .select({
      id: repartos.id,
      jefeId: repartos.jefeId,
      estado: repartos.estado,
      restringirPorTurno: repartos.restringirPorTurno,
      rondaActual: repartos.rondaActual,
      ventanaHasta: repartos.ventanaHasta,
      bloqueoParticipanteId: repartos.bloqueoParticipanteId,
      cursoNombre: cursosAcademicos.nombre,
      departamentoNombre: departamentos.nombre
    })
    .from(repartos)
    .innerJoin(cursosAcademicos, eq(repartos.cursoId, cursosAcademicos.id))
    .innerJoin(departamentos, eq(repartos.departamentoId, departamentos.id))
    .where(eq(repartos.id, repartoId))
    .get();

  if (!rep) throw error(404, 'Reparto no encontrado');

  const part = db
    .select()
    .from(participantes)
    .where(and(eq(participantes.repartoId, repartoId), eq(participantes.profesorId, user.id)))
    .get();

  if (!part) {
    throw error(403, 'No eres participante de este reparto.');
  }

  const allGrupos = db.select().from(grupos).where(eq(grupos.repartoId, repartoId)).all();
  const grupoById = new Map(allGrupos.map((g) => [g.id, g]));
  const allAsigs = db
    .select()
    .from(asignaciones)
    .where(eq(asignaciones.repartoId, repartoId))
    .all();

  // Tablero público del departamento (sin listas ajenas ni motivos privados de reducción)
  const todosParts = db
    .select({
      id: participantes.id,
      orden: participantes.orden,
      horasACubrir: participantes.horasACubrir,
      esVacante: participantes.esVacante,
      pendienteDeCuadrar: participantes.pendienteDeCuadrar,
      nombre: profesores.nombre,
      apellidos: profesores.apellidos
    })
    .from(participantes)
    .innerJoin(profesores, eq(participantes.profesorId, profesores.id))
    .where(eq(participantes.repartoId, repartoId))
    .orderBy(asc(participantes.orden))
    .all();

  const tableroDepartamento = todosParts.map((p) => {
    const suyas = allAsigs
      .filter((a) => a.participanteId === p.id)
      .map((a) => {
        const g = grupoById.get(a.grupoId);
        return g
          ? {
              id: a.id,
              materia: g.materia,
              curso: g.curso,
              nombreGrupo: g.nombreGrupo,
              turno: g.turno,
              horasSemanales: g.horasSemanales,
              origen: a.origen,
              numeroRonda: a.numeroRonda
            }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const horasCubiertas = suyas.reduce((s, a) => s + a.horasSemanales, 0);
    return {
      ...p,
      esMio: p.id === part.id,
      asignaciones: suyas,
      horasCubiertas,
      desviacion: horasCubiertas - p.horasACubrir
    };
  });

  const bloqueado = rep.bloqueoParticipanteId
    ? todosParts.find((p) => p.id === rep.bloqueoParticipanteId)
    : null;
  const bloqueadoNombre = bloqueado ? `${bloqueado.apellidos}, ${bloqueado.nombre}` : null;

  const profEsps = db
    .select({ especialidadId: profesorEspecialidades.especialidadId })
    .from(profesorEspecialidades)
    .where(eq(profesorEspecialidades.profesorId, user.id))
    .all()
    .map((x) => x.especialidadId);

  const grpEsps = db.select().from(grupoEspecialidades).all();
  const grpEspMap = new Map<number, number[]>();
  for (const ge of grpEsps) {
    const arr = grpEspMap.get(ge.grupoId) ?? [];
    arr.push(ge.especialidadId);
    grpEspMap.set(ge.grupoId, arr);
  }

  const excs = db
    .select()
    .from(excepcionesElegibilidad)
    .where(eq(excepcionesElegibilidad.participanteId, part.id))
    .all();

  const partMotor = {
    id: part.id,
    orden: part.orden,
    horasACubrir: part.horasACubrir,
    esVacante: part.esVacante,
    especialidadesIds: profEsps,
    pendienteDeCuadrar: part.pendienteDeCuadrar,
    turno: part.turno ?? null
  };

  const asigsMotor = allAsigs.map((a) => ({
    grupoId: a.grupoId,
    participanteId: a.participanteId,
    origen: a.origen,
    numeroRonda: a.numeroRonda
  }));

  const turnosDisponibles = Array.from(
    new Set(
      allGrupos
        .filter((g) => g.tipo === 'normal')
        .map((g) => g.turno.trim())
        .filter(Boolean)
    )
  );

  // Si la restricción por turno está activa y el profesor aún no tiene turno elegido,
  // no mostramos grupos hasta que elija su turno.
  const debeElegirTurnoPrimero = rep.restringirPorTurno && !part.turno;

  const gruposElegiblesDisponibles = debeElegirTurnoPrimero
    ? []
    : allGrupos.filter((g) => {
        const gm = {
          id: g.id,
          horasSemanales: g.horasSemanales,
          tipo: g.tipo,
          especialidadesIds: grpEspMap.get(g.id) ?? [],
          turno: g.turno
        };
        return (
          esDisponible(gm, asigsMotor) && esElegible(gm, partMotor, excs, rep.restringirPorTurno)
        );
      });

  const lista = db.select().from(listas).where(eq(listas.participanteId, part.id)).get();
  const items = lista
    ? db
        .select({ grupoId: itemsLista.grupoId, posicion: itemsLista.posicion })
        .from(itemsLista)
        .where(eq(itemsLista.listaId, lista.id))
        .orderBy(asc(itemsLista.posicion))
        .all()
    : [];

  const misAsignaciones = allAsigs
    .filter((a) => a.participanteId === part.id)
    .map((a) => ({
      ...a,
      grupo: grupoById.get(a.grupoId) ?? null
    }));

  const horasCubiertas = misAsignaciones.reduce(
    (sum, a) => sum + (a.grupo?.horasSemanales ?? 0),
    0
  );

  let opcionesBloqueo: typeof allGrupos = [];
  if (rep.estado === 'Bloqueo' && rep.bloqueoParticipanteId === part.id) {
    const estadoMotor = reconstruirEstadoReparto(repartoId);
    const validIds = new Set(opcionesValidasEnDirecto(estadoMotor, part.id).map((g) => g.id));
    opcionesBloqueo = allGrupos.filter((g) => validIds.has(g.id));
  }

  return {
    reparto: rep,
    puedeGestionar: user.esJefatura || rep.jefeId === user.id,
    participante: part,
    turnosDisponibles,
    puedeCambiarTurno:
      rep.restringirPorTurno &&
      !part.esVacante &&
      !part.turnoFijadoPorJefe &&
      (rep.estado === 'ListasAbiertas' ||
        (rep.estado === 'Ventana' && misAsignaciones.length === 0)),
    gruposElegiblesDisponibles,
    miListaGrupoIds: items.map((i) => i.grupoId),
    actualizadaEn: lista?.actualizadaEn ?? null,
    misAsignaciones,
    horasCubiertas,
    desviacion: horasCubiertas - part.horasACubrir,
    opcionesBloqueo,
    bloqueadoNombre,
    tableroDepartamento
  };
};

export const actions: Actions = {
  elegirTurno: async ({ locals, params, request }) => {
    const user = requireUser(locals);
    const repartoId = Number(params.id);
    const fd = await request.formData();
    const turnoElegido = fd.get('turno')?.toString().trim() ?? '';

    const db = getDb();
    const sqlite = getSqlite();

    const rep = db.select().from(repartos).where(eq(repartos.id, repartoId)).get();
    if (!rep || !rep.restringirPorTurno) {
      return fail(400, { error: 'Este reparto no tiene restricción por turno activada.' });
    }

    const part = db
      .select()
      .from(participantes)
      .where(and(eq(participantes.repartoId, repartoId), eq(participantes.profesorId, user.id)))
      .get();
    if (!part || part.esVacante) return fail(403, { error: 'No participas en este reparto.' });
    if (part.turnoFijadoPorJefe) {
      return fail(403, {
        error: 'Tu turno fue asignado por el departamento y no se puede cambiar.'
      });
    }

    const misAsigs = db
      .select({ id: asignaciones.id })
      .from(asignaciones)
      .where(eq(asignaciones.participanteId, part.id))
      .all();

    const permitido =
      rep.estado === 'ListasAbiertas' || (rep.estado === 'Ventana' && misAsigs.length === 0);
    if (!permitido) {
      return fail(409, { error: 'Ya no se puede cambiar el turno en esta fase del reparto.' });
    }

    const turnosValidos = db
      .select({ turno: grupos.turno })
      .from(grupos)
      .where(eq(grupos.repartoId, repartoId))
      .all()
      .map((g) => g.turno.trim())
      .filter(Boolean);

    const turnoCanonico = turnosValidos.find(
      (t) => normalizarTurno(t) === normalizarTurno(turnoElegido)
    );
    if (!turnoCanonico) {
      return fail(400, { error: 'Turno no válido para este reparto.' });
    }

    sqlite.transaction(() => {
      db.update(participantes)
        .set({ turno: turnoCanonico })
        .where(eq(participantes.id, part.id))
        .run();

      // Eliminar de su lista cualquier grupo que no pertenezca al turno elegido
      const lista = db.select().from(listas).where(eq(listas.participanteId, part.id)).get();
      if (lista) {
        const items = db
          .select({ id: itemsLista.id, grupoId: itemsLista.grupoId })
          .from(itemsLista)
          .where(eq(itemsLista.listaId, lista.id))
          .all();
        const grpTurnos = new Map(
          db
            .select({ id: grupos.id, turno: grupos.turno })
            .from(grupos)
            .where(eq(grupos.repartoId, repartoId))
            .all()
            .map((g) => [g.id, g.turno])
        );
        for (const it of items) {
          const tg = grpTurnos.get(it.grupoId);
          if (tg && normalizarTurno(tg) !== normalizarTurno(turnoCanonico)) {
            db.delete(itemsLista).where(eq(itemsLista.id, it.id)).run();
          }
        }
      }
    })();

    return {
      ok: `Turno «${turnoCanonico}» seleccionado. Solo verás y podrás elegir asignaturas de este turno.`
    };
  },

  elegirEnDirecto: async ({ locals, params, request }) => {
    const user = requireUser(locals);
    const repartoId = Number(params.id);
    const fd = await request.formData();
    const grupoId = Number(fd.get('grupoId'));

    const db = getDb();
    const rep = db.select().from(repartos).where(eq(repartos.id, repartoId)).get();
    const part = db
      .select()
      .from(participantes)
      .where(and(eq(participantes.repartoId, repartoId), eq(participantes.profesorId, user.id)))
      .get();

    if (!part) return fail(403, { error: 'No participas en este reparto.' });
    if (!rep || rep.estado !== 'Bloqueo' || rep.bloqueoParticipanteId !== part.id) {
      return fail(409, { error: 'Ya no es tu turno de elección en directo.' });
    }

    try {
      const fotoListas = obtenerFotoListasActual(repartoId);
      aplicarEventosYPersistir({
        repartoId,
        actorId: user.id,
        eventosNuevos: [
          {
            tipo: 'BLOQUEO_RESUELTO_ELECCION',
            participanteId: part.id,
            grupoId,
            fotoListas
          }
        ]
      });
      return { ok: 'Elección registrada. La ronda continúa.' };
    } catch (err) {
      return fail(400, {
        error: err instanceof Error ? err.message : 'No se pudo elegir el grupo'
      });
    }
  }
};
