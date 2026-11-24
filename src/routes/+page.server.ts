import { redirect } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { cursosAcademicos, departamentos, participantes, repartos } from '$lib/server/db/schema';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) {
    throw redirect(303, '/acceso');
  }

  const db = getDb();

  const repartosComoJefe = db
    .select({
      id: repartos.id,
      estado: repartos.estado,
      curso: cursosAcademicos.nombre,
      departamento: departamentos.nombre
    })
    .from(repartos)
    .innerJoin(cursosAcademicos, eq(repartos.cursoId, cursosAcademicos.id))
    .innerJoin(departamentos, eq(repartos.departamentoId, departamentos.id))
    .where(eq(repartos.jefeId, locals.user.id))
    .orderBy(desc(cursosAcademicos.id), departamentos.nombre)
    .all();

  const repartosComoProfesor = db
    .select({
      id: repartos.id,
      estado: repartos.estado,
      curso: cursosAcademicos.nombre,
      departamento: departamentos.nombre,
      horasACubrir: participantes.horasACubrir,
      orden: participantes.orden
    })
    .from(participantes)
    .innerJoin(repartos, eq(participantes.repartoId, repartos.id))
    .innerJoin(cursosAcademicos, eq(repartos.cursoId, cursosAcademicos.id))
    .innerJoin(departamentos, eq(repartos.departamentoId, departamentos.id))
    .where(eq(participantes.profesorId, locals.user.id))
    .orderBy(desc(cursosAcademicos.id), departamentos.nombre)
    .all();

  // Si un profesor solo tiene 1 reparto y no es Jefatura ni jefe de departamento, llevarlo directo
  const forzarInicio = url.searchParams.get('inicio') === '1';
  if (
    !forzarInicio &&
    !locals.user.esJefatura &&
    repartosComoJefe.length === 0 &&
    repartosComoProfesor.length === 1
  ) {
    throw redirect(303, `/p/${repartosComoProfesor[0].id}`);
  }

  return {
    user: locals.user,
    repartosComoJefe,
    repartosComoProfesor
  };
};
