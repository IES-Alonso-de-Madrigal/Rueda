import { fail } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { requireJefatura } from '$lib/server/auth/guards';
import {
  crearCopiaSeguridad,
  listarCopiasSeguridad,
  restaurarCopiaDesdeBuffer
} from '$lib/server/backup';
import { getDb } from '$lib/server/db';
import {
  asignaciones,
  cursosAcademicos,
  departamentos,
  grupos,
  participantes,
  profesores,
  repartos
} from '$lib/server/db/schema';

export const load: PageServerLoad = async ({ locals, url }) => {
  requireJefatura(locals);
  const db = getDb();

  const profesorQueryId = Number(url.searchParams.get('profesorId') ?? 0) || null;

  const listaProfesores = db
    .select()
    .from(profesores)
    .orderBy(profesores.apellidos, profesores.nombre)
    .all();

  const historialProfesor = profesorQueryId
    ? db
        .select({
          cursoNombre: cursosAcademicos.nombre,
          departamentoNombre: departamentos.nombre,
          ensenanza: grupos.ensenanza,
          curso: grupos.curso,
          nombreGrupo: grupos.nombreGrupo,
          turno: grupos.turno,
          materia: grupos.materia,
          horasSemanales: grupos.horasSemanales,
          repartoId: repartos.id
        })
        .from(asignaciones)
        .innerJoin(participantes, eq(asignaciones.participanteId, participantes.id))
        .innerJoin(grupos, eq(asignaciones.grupoId, grupos.id))
        .innerJoin(repartos, eq(asignaciones.repartoId, repartos.id))
        .innerJoin(cursosAcademicos, eq(repartos.cursoId, cursosAcademicos.id))
        .innerJoin(departamentos, eq(repartos.departamentoId, departamentos.id))
        .where(eq(participantes.profesorId, profesorQueryId))
        .orderBy(desc(cursosAcademicos.id))
        .all()
    : [];

  const todosRepartos = db
    .select({
      id: repartos.id,
      estado: repartos.estado,
      cursoNombre: cursosAcademicos.nombre,
      departamentoNombre: departamentos.nombre,
      cerradoEn: repartos.cerradoEn
    })
    .from(repartos)
    .innerJoin(cursosAcademicos, eq(repartos.cursoId, cursosAcademicos.id))
    .innerJoin(departamentos, eq(repartos.departamentoId, departamentos.id))
    .orderBy(desc(cursosAcademicos.id), departamentos.nombre)
    .all();

  return {
    profesores: listaProfesores,
    profesorQueryId,
    historialProfesor,
    todosRepartos,
    backups: listarCopiasSeguridad()
  };
};

export const actions: Actions = {
  crearBackup: async ({ locals }) => {
    requireJefatura(locals);
    try {
      const filename = await crearCopiaSeguridad('manual');
      return { ok: filename ? `Copia creada: ${filename}` : 'Copia omitida (BD en memoria).' };
    } catch (err) {
      return fail(500, { error: err instanceof Error ? err.message : 'Error creando copia' });
    }
  },

  restaurarBackup: async ({ locals, request }) => {
    requireJefatura(locals);
    const fd = await request.formData();
    const file = fd.get('archivo');
    if (!(file instanceof File) || file.size === 0) {
      return fail(400, { error: 'Selecciona un archivo .db válido.' });
    }

    try {
      const buf = Buffer.from(await file.arrayBuffer());
      restaurarCopiaDesdeBuffer(buf);
      return { ok: 'Base de datos restaurada correctamente.' };
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : 'No se pudo restaurar' });
    }
  }
};
