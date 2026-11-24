import { error } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { requireUser } from '$lib/server/auth/guards';
import { getDb } from '$lib/server/db';
import {
  asignaciones,
  centros,
  cursosAcademicos,
  departamentos,
  eventos,
  excepcionesElegibilidad,
  grupos,
  participantes,
  profesores,
  repartos
} from '$lib/server/db/schema';
import { formatFechaHora } from '$lib/ui';

export const load: PageServerLoad = async ({ locals, params }) => {
  const user = requireUser(locals);
  const repartoId = Number(params.id);
  if (!Number.isInteger(repartoId) || repartoId <= 0) throw error(400, 'Reparto no válido');

  const db = getDb();
  const rep = db
    .select({
      id: repartos.id,
      estado: repartos.estado,
      restringirPorTurno: repartos.restringirPorTurno,
      jefeId: repartos.jefeId,
      rondaActual: repartos.rondaActual,
      iniciadoEn: repartos.iniciadoEn,
      cerradoEn: repartos.cerradoEn,
      justificacionCierre: repartos.justificacionCierre,
      asistentesJson: repartos.asistentesJson,
      cursoNombre: cursosAcademicos.nombre,
      departamentoNombre: departamentos.nombre
    })
    .from(repartos)
    .innerJoin(cursosAcademicos, eq(repartos.cursoId, cursosAcademicos.id))
    .innerJoin(departamentos, eq(repartos.departamentoId, departamentos.id))
    .where(eq(repartos.id, repartoId))
    .get();

  if (!rep) throw error(404, 'Reparto no encontrado');

  if (!user.esJefatura && rep.jefeId !== user.id) {
    const part = db
      .select({ id: participantes.id })
      .from(participantes)
      .where(and(eq(participantes.repartoId, repartoId), eq(participantes.profesorId, user.id)))
      .get();
    if (!part) throw error(403, 'Sin acceso al acta de este reparto');
  }

  const centro = db.select().from(centros).get() ?? null;
  const parts = db
    .select({
      id: participantes.id,
      orden: participantes.orden,
      horasACubrir: participantes.horasACubrir,
      situacion: participantes.situacion,
      esVacante: participantes.esVacante,
      turno: participantes.turno,
      nombre: profesores.nombre,
      apellidos: profesores.apellidos
    })
    .from(participantes)
    .innerJoin(profesores, eq(participantes.profesorId, profesores.id))
    .where(eq(participantes.repartoId, repartoId))
    .orderBy(asc(participantes.orden))
    .all();

  const allGrupos = db.select().from(grupos).where(eq(grupos.repartoId, repartoId)).all();
  const grupoById = new Map(allGrupos.map((g) => [g.id, g]));
  const partById = new Map(parts.map((p) => [p.id, p]));

  const nombrePart = (id: unknown) => {
    const p = partById.get(Number(id));
    return p ? `${p.apellidos}, ${p.nombre}` : `Participante #${id}`;
  };

  const nombreGrupo = (id: unknown) => {
    const g = grupoById.get(Number(id));
    if (!g) return `Grupo #${id}`;
    const suf = [g.curso, g.nombreGrupo].filter(Boolean).join(' ');
    return `${g.materia}${suf ? ` (${suf})` : ''} — ${g.horasSemanales} h`;
  };

  const allAsigs = db
    .select()
    .from(asignaciones)
    .where(eq(asignaciones.repartoId, repartoId))
    .all();
  const excs = db
    .select()
    .from(excepcionesElegibilidad)
    .where(eq(excepcionesElegibilidad.repartoId, repartoId))
    .all();

  const evs = db
    .select({
      id: eventos.id,
      tipo: eventos.tipo,
      datosJson: eventos.datosJson,
      creadoEn: eventos.creadoEn,
      actorNombre: profesores.nombre,
      actorApellidos: profesores.apellidos
    })
    .from(eventos)
    .leftJoin(profesores, eq(eventos.actorId, profesores.id))
    .where(eq(eventos.repartoId, repartoId))
    .orderBy(asc(eventos.id))
    .all();

  const asistentes: string[] = rep.asistentesJson ? JSON.parse(rep.asistentesJson) : [];
  const gruposFuera = allGrupos.filter((g) => g.tipo === 'fuera_del_reparto');

  // Sección 4: Elecciones ronda a ronda (con orden, turno y horas)
  const rondasAsignaciones = allAsigs
    .filter((a) => a.origen === 'ronda')
    .sort((a, b) => {
      const dr = (a.numeroRonda ?? 0) - (b.numeroRonda ?? 0);
      if (dr !== 0) return dr;
      const oa = partById.get(a.participanteId)?.orden ?? 0;
      const ob = partById.get(b.participanteId)?.orden ?? 0;
      return oa - ob;
    })
    .map((a) => {
      const g = grupoById.get(a.grupoId);
      const p = partById.get(a.participanteId);
      return {
        ronda: a.numeroRonda ?? 0,
        orden: p?.orden ?? 0,
        profesor: p ? `${p.apellidos}, ${p.nombre}` : `#${a.participanteId}`,
        grupo: g
          ? `${g.materia} (${[g.curso, g.nombreGrupo].filter(Boolean).join(' ')})`
          : `#${a.grupoId}`,
        turno: g?.turno ?? '—',
        horas: g?.horasSemanales ?? 0
      };
    });

  // Formateo seguro en servidor (SIN exponer datosJson ni fotoListas nunca al cliente)
  const parseSafe = (raw: string): Record<string, unknown> => {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  };

  const actorLabel = (ev: (typeof evs)[number]) =>
    ev.actorApellidos ? `${ev.actorApellidos}, ${ev.actorNombre}` : '';

  // Sección 5: Bloqueos y resolución (sanitizado)
  const bloqueosLegibles = evs
    .filter((e) => e.tipo === 'BLOQUEO_RESUELTO_ELECCION' || e.tipo === 'BLOQUEO_RESUELTO_SALTAR')
    .map((ev) => {
      const d = parseSafe(ev.datosJson);
      const fecha = formatFechaHora(ev.creadoEn);
      if (ev.tipo === 'BLOQUEO_RESUELTO_ELECCION') {
        return {
          fecha,
          descripcion: `${nombrePart(d.participanteId)} eligió en directo ${nombreGrupo(d.grupoId)}.`
        };
      }
      return {
        fecha,
        descripcion: `${nombrePart(d.participanteId)} saltó su turno y pasó a «pendiente de cuadrar».`
      };
    });

  // Sección 6: Cambios en fase manual y anulaciones (sanitizado)
  const manualesLegibles = evs
    .filter((e) =>
      [
        'MANUAL_ASIGNAR',
        'MANUAL_MOVER',
        'MANUAL_DESASIGNAR',
        'MANUAL_TRUEQUE',
        'DESHACER_ULTIMA_ACCION',
        'DESHACER_ULTIMA_RONDA',
        'REPARTO_REABIERTO'
      ].includes(e.tipo)
    )
    .map((ev) => {
      const d = parseSafe(ev.datosJson);
      const fecha = formatFechaHora(ev.creadoEn);
      const actor = actorLabel(ev);
      const nota = typeof d.nota === 'string' && d.nota.trim() ? ` — Nota: ${d.nota.trim()}` : '';
      let descripcion = '';

      switch (ev.tipo) {
        case 'MANUAL_ASIGNAR':
          descripcion = `Asignación manual de ${nombreGrupo(d.grupoId)} a ${nombrePart(d.participanteId)}${nota}`;
          break;
        case 'MANUAL_MOVER':
          descripcion = `Traslado de ${nombreGrupo(d.grupoId)} a ${nombrePart(d.haciaParticipanteId)}${nota}`;
          break;
        case 'MANUAL_DESASIGNAR':
          descripcion = `Liberación del grupo ${nombreGrupo(d.grupoId)}${nota}`;
          break;
        case 'MANUAL_TRUEQUE': {
          const movs = Array.isArray(d.movimientos)
            ? (d.movimientos as Array<{ grupoId: number; haciaParticipanteId: number }>)
                .map((m) => `${nombreGrupo(m.grupoId)} → ${nombrePart(m.haciaParticipanteId)}`)
                .join(' ; ')
            : '';
          descripcion = `Trueque: ${movs}${nota}`;
          break;
        }
        case 'DESHACER_ULTIMA_ACCION':
          descripcion = `Anulación de la última acción manual${nota}`;
          break;
        case 'DESHACER_ULTIMA_RONDA':
          descripcion = `Anulación de la última ronda ejecutada${nota}`;
          break;
        case 'REPARTO_REABIERTO': {
          const mot = typeof d.motivo === 'string' && d.motivo.trim() ? `: ${d.motivo.trim()}` : '';
          descripcion = `Reparto reabierto por Jefatura${mot}`;
          break;
        }
      }

      return { fecha, actor, descripcion };
    });

  // Sección 7: Auditoría del jefe (sanitizado, sin revelar grupos ni listas)
  const auditoriaLegible = evs
    .filter((e) => e.tipo === 'CONSULTA_LISTA_AJENA' || e.tipo === 'AJUSTE_LISTA_JEFE')
    .map((ev) => {
      const d = parseSafe(ev.datosJson);
      const fecha = formatFechaHora(ev.creadoEn);
      const actor = actorLabel(ev);
      if (ev.tipo === 'CONSULTA_LISTA_AJENA') {
        const quien =
          typeof d.profesorNombre === 'string' ? d.profesorNombre : nombrePart(d.participanteId);
        return {
          fecha,
          actor,
          descripcion: `Consultó la lista de ${quien}.`
        };
      }
      const ronda = d.rondaActual != null ? ` tras la ronda ${d.rondaActual}` : '';
      return {
        fecha,
        actor,
        descripcion: `Modificó su propia lista durante la ventana de ajuste${ronda}.`
      };
    });

  const resultadoFinal = parts.map((p) => {
    const suyas = allAsigs
      .filter((a) => a.participanteId === p.id)
      .map((a) => grupoById.get(a.grupoId))
      .filter((g): g is NonNullable<typeof g> => g != null);
    const totalHoras = suyas.reduce((s, g) => s + g.horasSemanales, 0);
    return {
      ...p,
      grupos: suyas,
      totalHoras,
      desviacion: totalHoras - p.horasACubrir
    };
  });

  const excepcionesDetalle = excs.map((ex) => {
    const p = partById.get(ex.participanteId);
    const g = grupoById.get(ex.grupoId);
    return {
      profesor: p ? `${p.apellidos}, ${p.nombre}` : `#${ex.participanteId}`,
      grupo: g
        ? `${g.materia} (${[g.curso, g.nombreGrupo].filter(Boolean).join(' ')})`
        : `#${ex.grupoId}`,
      motivo: ex.motivo
    };
  });

  return {
    centro,
    reparto: {
      ...rep,
      iniciadoFormateado: formatFechaHora(rep.iniciadoEn),
      cerradoFormateado: rep.cerradoEn ? formatFechaHora(rep.cerradoEn) : 'Pendiente de cierre'
    },
    asistentes,
    participantes: parts,
    gruposFuera,
    rondasAsignaciones,
    bloqueosLegibles,
    manualesLegibles,
    auditoriaLegible,
    excepcionesDetalle,
    resultadoFinal
  };
};
