import { fail } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { requireJefeOrJefatura } from '$lib/server/auth/guards';
import { getDb } from '$lib/server/db';
import { asignaciones, grupos, participantes, profesores, repartos } from '$lib/server/db/schema';
import { opcionesValidasEnDirecto } from '$lib/motor';
import {
  aplicarEventosYPersistir,
  lanzarSiguienteRonda,
  obtenerFotoListasActual,
  reconstruirEstadoReparto
} from '$lib/server/reparto-service';

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

  const tablero = parts.map((p) => {
    const suyas = allAsigs
      .filter((a) => a.participanteId === p.id)
      .map((a) => ({
        ...a,
        grupo: grupoById.get(a.grupoId) ?? null
      }));
    const horasCubiertas = suyas.reduce((s, a) => s + (a.grupo?.horasSemanales ?? 0), 0);
    return {
      ...p,
      asignaciones: suyas,
      horasCubiertas,
      desviacion: horasCubiertas - p.horasACubrir
    };
  });

  const gruposLibresNormales = allGrupos.filter(
    (g) => g.tipo === 'normal' && !asigGrupoIds.has(g.id)
  );

  let opcionesBloqueo: typeof allGrupos = [];
  let bloqueadoNombre = '';
  if (rep.estado === 'Bloqueo' && rep.bloqueoParticipanteId) {
    const estadoMotor = reconstruirEstadoReparto(repartoId);
    const validIds = new Set(
      opcionesValidasEnDirecto(estadoMotor, rep.bloqueoParticipanteId).map((g) => g.id)
    );
    opcionesBloqueo = allGrupos.filter((g) => validIds.has(g.id));
    const bp = parts.find((p) => p.id === rep.bloqueoParticipanteId);
    if (bp) bloqueadoNombre = `${bp.apellidos}, ${bp.nombre}`;
  }

  return {
    ventanaHasta: rep.ventanaHasta,
    bloqueoParticipanteId: rep.bloqueoParticipanteId,
    bloqueadoNombre,
    opcionesBloqueo,
    tablero,
    gruposLibresNormales
  };
};

export const actions: Actions = {
  lanzarRonda: async ({ locals, params, request }) => {
    const repartoId = Number(params.id);
    const user = requireJefeOrJefatura(locals, repartoId);
    const fd = await request.formData();
    const minutos = Number(fd.get('minutosVentana') ?? 0) || null;

    try {
      const res = lanzarSiguienteRonda(repartoId, user.id, minutos);
      return { ok: `Ronda ${res.estado.rondaActual} ejecutada.` };
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : 'Error al lanzar ronda' });
    }
  },

  resolverEleccion: async ({ locals, params, request }) => {
    const repartoId = Number(params.id);
    const user = requireJefeOrJefatura(locals, repartoId);
    const db = getDb();
    const rep = db.select().from(repartos).where(eq(repartos.id, repartoId)).get();
    if (!rep || rep.estado !== 'Bloqueo') {
      return fail(400, { error: 'No hay ningún bloqueo activo.' });
    }

    const fd = await request.formData();
    const participanteId = Number(fd.get('participanteId'));
    const grupoId = Number(fd.get('grupoId'));

    const g = db
      .select({ id: grupos.id })
      .from(grupos)
      .where(and(eq(grupos.id, grupoId), eq(grupos.repartoId, repartoId)))
      .get();
    if (!g) return fail(400, { error: 'El grupo no pertenece a este reparto.' });

    try {
      const fotoListas = obtenerFotoListasActual(repartoId);
      aplicarEventosYPersistir({
        repartoId,
        actorId: user.id,
        eventosNuevos: [{ tipo: 'BLOQUEO_RESUELTO_ELECCION', participanteId, grupoId, fotoListas }]
      });
      return { ok: 'Bloqueo resuelto y ronda continuada.' };
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : 'Error al resolver bloqueo' });
    }
  },

  resolverSaltar: async ({ locals, params, request }) => {
    const repartoId = Number(params.id);
    const user = requireJefeOrJefatura(locals, repartoId);
    const db = getDb();
    const rep = db.select().from(repartos).where(eq(repartos.id, repartoId)).get();
    if (!rep || rep.estado !== 'Bloqueo') {
      return fail(400, { error: 'No hay ningún bloqueo activo.' });
    }

    const fd = await request.formData();
    const participanteId = Number(fd.get('participanteId'));

    try {
      const fotoListas = obtenerFotoListasActual(repartoId);
      aplicarEventosYPersistir({
        repartoId,
        actorId: user.id,
        eventosNuevos: [{ tipo: 'BLOQUEO_RESUELTO_SALTAR', participanteId, fotoListas }]
      });
      return { ok: 'Turno saltado (pendiente de cuadrar) y ronda continuada.' };
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : 'Error al saltar turno' });
    }
  },

  pasarAManual: async ({ locals, params }) => {
    const repartoId = Number(params.id);
    const user = requireJefeOrJefatura(locals, repartoId);
    const db = getDb();
    const rep = db.select().from(repartos).where(eq(repartos.id, repartoId)).get();
    if (
      !rep ||
      (rep.estado !== 'ListasCerradas' && rep.estado !== 'Ventana' && rep.estado !== 'Bloqueo')
    ) {
      return fail(400, {
        error: 'Solo se puede pasar a Fase manual desde Listas cerradas, Ventana o Bloqueo.'
      });
    }

    try {
      aplicarEventosYPersistir({
        repartoId,
        actorId: user.id,
        eventosNuevos: [{ tipo: 'PASE_A_MANUAL', motivo: 'Decisión del jefe de departamento' }]
      });
      return { ok: 'Reparto pasado a Fase manual.' };
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : 'Error' });
    }
  }
};
