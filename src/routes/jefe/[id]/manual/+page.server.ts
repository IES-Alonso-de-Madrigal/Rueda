import { fail } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { requireJefeOrJefatura } from '$lib/server/auth/guards';
import { getDb } from '$lib/server/db';
import {
  asignaciones,
  excepcionesElegibilidad,
  grupoEspecialidades,
  grupos,
  participantes,
  profesorEspecialidades,
  profesores,
  repartos
} from '$lib/server/db/schema';
import { esElegible } from '$lib/motor';
import { aplicarEventosYPersistir, reconstruirEstadoReparto } from '$lib/server/reparto-service';

function validarFaseManual(repartoId: number): string | null {
  const rep = getDb().select().from(repartos).where(eq(repartos.id, repartoId)).get();
  if (!rep) return 'Reparto no encontrado.';
  if (rep.estado !== 'FaseManual') {
    return 'Estas acciones solo están permitidas durante la Fase manual.';
  }
  return null;
}

function grupoPerteneceAReparto(grupoId: number, repartoId: number): boolean {
  return Boolean(
    getDb()
      .select({ id: grupos.id })
      .from(grupos)
      .where(and(eq(grupos.id, grupoId), eq(grupos.repartoId, repartoId)))
      .get()
  );
}

function participantePerteneceAReparto(participanteId: number, repartoId: number): boolean {
  return Boolean(
    getDb()
      .select({ id: participantes.id })
      .from(participantes)
      .where(and(eq(participantes.id, participanteId), eq(participantes.repartoId, repartoId)))
      .get()
  );
}

export const load: PageServerLoad = async ({ locals, params }) => {
  const repartoId = Number(params.id);
  requireJefeOrJefatura(locals, repartoId);
  const db = getDb();

  const rep = db.select().from(repartos).where(eq(repartos.id, repartoId)).get()!;
  const parts = db
    .select({
      id: participantes.id,
      profesorId: participantes.profesorId,
      orden: participantes.orden,
      horasACubrir: participantes.horasACubrir,
      situacion: participantes.situacion,
      esVacante: participantes.esVacante,
      turno: participantes.turno,
      pendienteDeCuadrar: participantes.pendienteDeCuadrar,
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
  const allAsigs = db
    .select()
    .from(asignaciones)
    .where(eq(asignaciones.repartoId, repartoId))
    .all();
  const asigGrupoIds = new Set(allAsigs.map((a) => a.grupoId));

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

  const excs = db
    .select()
    .from(excepcionesElegibilidad)
    .where(eq(excepcionesElegibilidad.repartoId, repartoId))
    .all();

  const estadoMotor = reconstruirEstadoReparto(repartoId);

  const columnas = parts.map((p) => {
    const partMotor = {
      id: p.id,
      orden: p.orden,
      horasACubrir: p.horasACubrir,
      esVacante: p.esVacante,
      especialidadesIds: profEspMap.get(p.profesorId) ?? [],
      pendienteDeCuadrar: p.pendienteDeCuadrar,
      turno: p.turno ?? null
    };

    const suyas = allAsigs
      .filter((a) => a.participanteId === p.id)
      .map((a) => {
        const g = grupoById.get(a.grupoId) ?? null;
        const fueraEspecialidad = g
          ? !esElegible(
              {
                id: g.id,
                horasSemanales: g.horasSemanales,
                tipo: g.tipo,
                especialidadesIds: grpEspMap.get(g.id) ?? [],
                turno: g.turno
              },
              partMotor,
              excs,
              rep.restringirPorTurno
            )
          : false;
        return { ...a, grupo: g, fueraEspecialidad };
      });

    const horasCubiertas = suyas.reduce((s, a) => s + (a.grupo?.horasSemanales ?? 0), 0);
    return {
      ...p,
      asignaciones: suyas,
      horasCubiertas,
      desviacion: horasCubiertas - p.horasACubrir
    };
  });

  const gruposLibres = allGrupos.filter(
    (g) => g.tipo !== 'fuera_del_reparto' && !asigGrupoIds.has(g.id)
  );

  const asignacionesPlanas = allAsigs
    .map((a) => {
      const g = grupoById.get(a.grupoId);
      const p = parts.find((x) => x.id === a.participanteId);
      return g && p
        ? {
            grupoId: g.id,
            participanteId: p.id,
            label: `${g.materia} (${g.curso} ${g.nombreGrupo}, ${g.horasSemanales}h) — ${p.apellidos}, ${p.nombre}`
          }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return {
    puedeEditar: rep.estado === 'FaseManual',
    puedeDeshacerAccion: estadoMotor.historialManual.length > 0,
    puedeDeshacerRonda: estadoMotor.historialRondas.length > 0,
    ultimaRondaNumero:
      estadoMotor.historialRondas[estadoMotor.historialRondas.length - 1]?.numeroRonda ?? null,
    columnas,
    gruposLibres,
    asignacionesPlanas,
    excepciones: excs
  };
};

export const actions: Actions = {
  asignar: async ({ locals, params, request }) => {
    const repartoId = Number(params.id);
    const user = requireJefeOrJefatura(locals, repartoId);
    const errEstado = validarFaseManual(repartoId);
    if (errEstado) return fail(400, { error: errEstado });

    const fd = await request.formData();
    const grupoId = Number(fd.get('grupoId'));
    const participanteId = Number(fd.get('participanteId'));
    const nota = fd.get('nota')?.toString().trim() || undefined;

    if (!grupoId || !participanteId)
      return fail(400, { error: 'Selecciona grupo y participante.' });
    if (
      !grupoPerteneceAReparto(grupoId, repartoId) ||
      !participantePerteneceAReparto(participanteId, repartoId)
    ) {
      return fail(400, { error: 'El grupo o participante no pertenece a este reparto.' });
    }

    try {
      aplicarEventosYPersistir({
        repartoId,
        actorId: user.id,
        eventosNuevos: [{ tipo: 'MANUAL_ASIGNAR', grupoId, participanteId, nota }]
      });
      return { ok: 'Grupo asignado.' };
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : 'Error al asignar' });
    }
  },

  mover: async ({ locals, params, request }) => {
    const repartoId = Number(params.id);
    const user = requireJefeOrJefatura(locals, repartoId);
    const errEstado = validarFaseManual(repartoId);
    if (errEstado) return fail(400, { error: errEstado });

    const fd = await request.formData();
    const grupoId = Number(fd.get('grupoId'));
    const haciaParticipanteId = Number(fd.get('haciaParticipanteId'));
    const nota = fd.get('nota')?.toString().trim() || undefined;

    if (!grupoId || !haciaParticipanteId) return fail(400, { error: 'Datos incompletos.' });
    if (
      !grupoPerteneceAReparto(grupoId, repartoId) ||
      !participantePerteneceAReparto(haciaParticipanteId, repartoId)
    ) {
      return fail(400, { error: 'El grupo o participante no pertenece a este reparto.' });
    }

    try {
      aplicarEventosYPersistir({
        repartoId,
        actorId: user.id,
        eventosNuevos: [{ tipo: 'MANUAL_MOVER', grupoId, haciaParticipanteId, nota }]
      });
      return { ok: 'Grupo movido.' };
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : 'Error al mover' });
    }
  },

  desasignar: async ({ locals, params, request }) => {
    const repartoId = Number(params.id);
    const user = requireJefeOrJefatura(locals, repartoId);
    const errEstado = validarFaseManual(repartoId);
    if (errEstado) return fail(400, { error: errEstado });

    const fd = await request.formData();
    const grupoId = Number(fd.get('grupoId'));
    const nota = fd.get('nota')?.toString().trim() || undefined;
    if (!grupoPerteneceAReparto(grupoId, repartoId)) {
      return fail(400, { error: 'El grupo no pertenece a este reparto.' });
    }

    try {
      aplicarEventosYPersistir({
        repartoId,
        actorId: user.id,
        eventosNuevos: [{ tipo: 'MANUAL_DESASIGNAR', grupoId, nota }]
      });
      return { ok: 'Grupo devuelto a la bandeja de libres.' };
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : 'Error al desasignar' });
    }
  },

  trueque: async ({ locals, params, request }) => {
    const repartoId = Number(params.id);
    const user = requireJefeOrJefatura(locals, repartoId);
    const errEstado = validarFaseManual(repartoId);
    if (errEstado) return fail(400, { error: errEstado });

    const fd = await request.formData();
    const grupoA = Number(fd.get('grupoA'));
    const grupoB = Number(fd.get('grupoB'));
    const nota = fd.get('nota')?.toString().trim() || 'Trueque acordado en fase manual';

    if (!grupoA || !grupoB || grupoA === grupoB) {
      return fail(400, { error: 'Selecciona dos grupos distintos asignados para el trueque.' });
    }

    const db = getDb();
    const a1 = db
      .select()
      .from(asignaciones)
      .where(and(eq(asignaciones.grupoId, grupoA), eq(asignaciones.repartoId, repartoId)))
      .get();
    const a2 = db
      .select()
      .from(asignaciones)
      .where(and(eq(asignaciones.grupoId, grupoB), eq(asignaciones.repartoId, repartoId)))
      .get();
    if (!a1 || !a2 || a1.participanteId === a2.participanteId) {
      return fail(400, {
        error: 'Los grupos deben pertenecer a dos participantes distintos de este reparto.'
      });
    }

    try {
      aplicarEventosYPersistir({
        repartoId,
        actorId: user.id,
        eventosNuevos: [
          {
            tipo: 'MANUAL_TRUEQUE',
            movimientos: [
              { grupoId: grupoA, haciaParticipanteId: a2.participanteId },
              { grupoId: grupoB, haciaParticipanteId: a1.participanteId }
            ],
            nota
          }
        ]
      });
      return { ok: 'Trueque realizado.' };
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : 'Error en trueque' });
    }
  },

  crearExcepcion: async ({ locals, params, request }) => {
    const repartoId = Number(params.id);
    const user = requireJefeOrJefatura(locals, repartoId);
    const errEstado = validarFaseManual(repartoId);
    if (errEstado) return fail(400, { error: errEstado });

    const fd = await request.formData();
    const participanteId = Number(fd.get('participanteId'));
    const grupoId = Number(fd.get('grupoId'));
    const motivo = fd.get('motivo')?.toString().trim() ?? '';

    if (!participanteId || !grupoId || motivo.length < 3) {
      return fail(400, { error: 'Indica participante, grupo y motivo de la excepción.' });
    }
    if (
      !grupoPerteneceAReparto(grupoId, repartoId) ||
      !participantePerteneceAReparto(participanteId, repartoId)
    ) {
      return fail(400, { error: 'El grupo o participante no pertenece a este reparto.' });
    }

    try {
      aplicarEventosYPersistir({
        repartoId,
        actorId: user.id,
        eventosNuevos: [{ tipo: 'EXCEPCION_CREADA', participanteId, grupoId, motivo }]
      });
      return { ok: 'Excepción de especialidad registrada.' };
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : 'Error al crear excepción' });
    }
  },

  deshacerAccion: async ({ locals, params }) => {
    const repartoId = Number(params.id);
    const user = requireJefeOrJefatura(locals, repartoId);
    const errEstado = validarFaseManual(repartoId);
    if (errEstado) return fail(400, { error: errEstado });

    try {
      aplicarEventosYPersistir({
        repartoId,
        actorId: user.id,
        eventosNuevos: [{ tipo: 'DESHACER_ULTIMA_ACCION' }]
      });
      return { ok: 'Última acción manual deshecha (registrada como anulación en el acta).' };
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : 'No se pudo deshacer' });
    }
  },

  deshacerRonda: async ({ locals, params }) => {
    const repartoId = Number(params.id);
    const user = requireJefeOrJefatura(locals, repartoId);
    const errEstado = validarFaseManual(repartoId);
    if (errEstado) return fail(400, { error: errEstado });

    try {
      aplicarEventosYPersistir({
        repartoId,
        actorId: user.id,
        eventosNuevos: [{ tipo: 'DESHACER_ULTIMA_RONDA' }]
      });
      return { ok: 'Última ronda deshecha (registrada como anulación en el acta).' };
    } catch (err) {
      return fail(400, {
        error: err instanceof Error ? err.message : 'No se pudo deshacer la ronda'
      });
    }
  }
};
