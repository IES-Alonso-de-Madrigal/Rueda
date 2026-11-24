import { error } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/auth/guards';
import { toCsv } from '$lib/server/csv';
import { getDb } from '$lib/server/db';
import { asignaciones, grupos, participantes, profesores, repartos } from '$lib/server/db/schema';

export const GET: RequestHandler = async ({ locals, params }) => {
  const user = requireUser(locals);
  const repartoId = Number(params.id);
  if (!Number.isInteger(repartoId) || repartoId <= 0) throw error(400, 'Reparto no válido');

  const db = getDb();
  const rep = db.select().from(repartos).where(eq(repartos.id, repartoId)).get();
  if (!rep) throw error(404, 'Reparto no encontrado');

  if (!user.esJefatura && rep.jefeId !== user.id) {
    const part = db
      .select({ id: participantes.id })
      .from(participantes)
      .where(and(eq(participantes.repartoId, repartoId), eq(participantes.profesorId, user.id)))
      .get();
    if (!part) throw error(403, 'Sin acceso');
  }

  const parts = db
    .select({
      id: participantes.id,
      orden: participantes.orden,
      horasACubrir: participantes.horasACubrir,
      situacion: participantes.situacion,
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

  const rows: Array<Array<string | number>> = [];
  for (const p of parts) {
    const suyas = allAsigs.filter((a) => a.participanteId === p.id);
    if (suyas.length === 0) {
      rows.push([
        p.orden,
        `${p.apellidos}, ${p.nombre}`,
        p.situacion,
        p.horasACubrir,
        '',
        '',
        '',
        '',
        0,
        ''
      ]);
    } else {
      for (const a of suyas) {
        const g = grupoById.get(a.grupoId);
        if (!g) continue;
        rows.push([
          p.orden,
          `${p.apellidos}, ${p.nombre}`,
          p.situacion,
          p.horasACubrir,
          g.ensenanza,
          g.curso,
          g.nombreGrupo,
          g.materia,
          g.horasSemanales,
          a.origen
        ]);
      }
    }
  }

  const csv = toCsv(
    [
      'Orden',
      'Profesor',
      'Situacion',
      'HorasACubrir',
      'Ensenanza',
      'Curso',
      'Grupo',
      'Materia',
      'Horas',
      'Origen'
    ],
    rows
  );

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="reparto-${repartoId}.csv"`
    }
  });
};
