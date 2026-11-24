import { error } from '@sveltejs/kit';
import { and, count, eq } from 'drizzle-orm';
import type { LayoutServerLoad } from './$types';
import { requireJefeOrJefatura } from '$lib/server/auth/guards';
import { getDb } from '$lib/server/db';
import {
  cursosAcademicos,
  departamentos,
  grupos,
  participantes,
  repartos
} from '$lib/server/db/schema';

export const load: LayoutServerLoad = async ({ locals, params }) => {
  const repartoId = Number(params.id);
  if (!Number.isInteger(repartoId) || repartoId <= 0) {
    throw error(400, 'ID de reparto no válido');
  }

  const user = requireJefeOrJefatura(locals, repartoId);
  const db = getDb();

  const reparto = db
    .select({
      id: repartos.id,
      cursoId: repartos.cursoId,
      departamentoId: repartos.departamentoId,
      jefeId: repartos.jefeId,
      estado: repartos.estado,
      restringirPorTurno: repartos.restringirPorTurno,
      rondaActual: repartos.rondaActual,
      version: repartos.version,
      cursoNombre: cursosAcademicos.nombre,
      departamentoNombre: departamentos.nombre
    })
    .from(repartos)
    .innerJoin(cursosAcademicos, eq(repartos.cursoId, cursosAcademicos.id))
    .innerJoin(departamentos, eq(repartos.departamentoId, departamentos.id))
    .where(eq(repartos.id, repartoId))
    .get();

  if (!reparto) throw error(404, 'Reparto no encontrado');

  const miParticipacion = db
    .select({ id: participantes.id })
    .from(participantes)
    .where(and(eq(participantes.repartoId, repartoId), eq(participantes.profesorId, user.id)))
    .get();

  const numParticipantes =
    db
      .select({ total: count() })
      .from(participantes)
      .where(eq(participantes.repartoId, repartoId))
      .get()?.total ?? 0;

  const numGrupos =
    db.select({ total: count() }).from(grupos).where(eq(grupos.repartoId, repartoId)).get()
      ?.total ?? 0;

  return {
    user,
    reparto,
    esParticipante: Boolean(miParticipacion),
    numParticipantes,
    numGrupos
  };
};
