import { fail } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { requireJefatura } from '$lib/server/auth/guards';
import { getDb, getSqlite } from '$lib/server/db';
import {
  centros,
  cursosAcademicos,
  departamentos,
  especialidades,
  grupoEspecialidades,
  grupos,
  participantes,
  profesores,
  repartos
} from '$lib/server/db/schema';

export const load: PageServerLoad = async ({ locals }) => {
  requireJefatura(locals);
  const db = getDb();

  return {
    centro: db.select().from(centros).get() ?? null,
    cursos: db.select().from(cursosAcademicos).orderBy(desc(cursosAcademicos.id)).all(),
    departamentos: db.select().from(departamentos).orderBy(departamentos.nombre).all(),
    especialidades: db.select().from(especialidades).orderBy(especialidades.codigo).all()
  };
};

const centroSchema = z.object({
  nombre: z.string().trim().min(2, 'Nombre del centro requerido'),
  codigo: z.string().trim().default(''),
  localidad: z.string().trim().default('')
});

const cursoSchema = z.object({
  nombre: z.string().trim().min(4, 'Ej. 2026-27'),
  copiarDeCursoId: z.string().optional()
});

const departamentoSchema = z.object({
  nombre: z.string().trim().min(2, 'Nombre del departamento requerido')
});

const especialidadSchema = z.object({
  codigo: z.string().trim().min(1, 'Código requerido'),
  nombre: z.string().trim().min(2, 'Nombre requerido')
});

export const actions: Actions = {
  guardarCentro: async ({ locals, request }) => {
    requireJefatura(locals);
    const fd = await request.formData();
    const parsed = centroSchema.safeParse({
      nombre: fd.get('nombre'),
      codigo: fd.get('codigo') ?? '',
      localidad: fd.get('localidad') ?? ''
    });
    if (!parsed.success) return fail(400, { error: parsed.error.issues[0]?.message });

    const db = getDb();
    const existing = db.select().from(centros).get();
    if (existing) {
      db.update(centros).set(parsed.data).where(eq(centros.id, existing.id)).run();
    } else {
      db.insert(centros).values(parsed.data).run();
    }
    return { ok: 'Datos del centro guardados.' };
  },

  crearCurso: async ({ locals, request }) => {
    requireJefatura(locals);
    const fd = await request.formData();
    const parsed = cursoSchema.safeParse({
      nombre: fd.get('nombre'),
      copiarDeCursoId: fd.get('copiarDeCursoId')?.toString() || undefined
    });
    if (!parsed.success) return fail(400, { error: parsed.error.issues[0]?.message });

    const db = getDb();
    const sqlite = getSqlite();

    try {
      sqlite.transaction(() => {
        const nuevoCurso = db
          .insert(cursosAcademicos)
          .values({ nombre: parsed.data.nombre, estado: 'activo' })
          .returning()
          .get();

        if (parsed.data.copiarDeCursoId) {
          const origenId = Number(parsed.data.copiarDeCursoId);
          if (Number.isInteger(origenId) && origenId > 0) {
            const repartosOrigen = db
              .select()
              .from(repartos)
              .where(eq(repartos.cursoId, origenId))
              .all();

            for (const repOrig of repartosOrigen) {
              const nuevoRep = db
                .insert(repartos)
                .values({
                  cursoId: nuevoCurso.id,
                  departamentoId: repOrig.departamentoId,
                  jefeId: repOrig.jefeId,
                  restringirPorTurno: repOrig.restringirPorTurno,
                  estado: 'Borrador'
                })
                .returning()
                .get();

              // Copiar grupos sin asignaciones
              const gruposOrig = db
                .select()
                .from(grupos)
                .where(eq(grupos.repartoId, repOrig.id))
                .all();

              for (const g of gruposOrig) {
                const nuevoGrupo = db
                  .insert(grupos)
                  .values({
                    repartoId: nuevoRep.id,
                    ensenanza: g.ensenanza,
                    curso: g.curso,
                    nombreGrupo: g.nombreGrupo,
                    turno: g.turno,
                    materia: g.materia,
                    horasSemanales: g.horasSemanales,
                    tipo: g.tipo,
                    profesorExterno: g.profesorExterno,
                    notas: g.notas
                  })
                  .returning()
                  .get();

                const gEsps = db
                  .select()
                  .from(grupoEspecialidades)
                  .where(eq(grupoEspecialidades.grupoId, g.id))
                  .all();
                for (const ge of gEsps) {
                  db.insert(grupoEspecialidades)
                    .values({ grupoId: nuevoGrupo.id, especialidadId: ge.especialidadId })
                    .run();
                }
              }

              // Copiar participantes cuyos profesores sigan activos
              const partsOrig = db
                .select({
                  profesorId: participantes.profesorId,
                  orden: participantes.orden,
                  horasACubrir: participantes.horasACubrir,
                  situacion: participantes.situacion,
                  esVacante: participantes.esVacante,
                  activo: profesores.activo
                })
                .from(participantes)
                .innerJoin(profesores, eq(participantes.profesorId, profesores.id))
                .where(eq(participantes.repartoId, repOrig.id))
                .all();

              for (const p of partsOrig) {
                if (!p.activo) continue;
                db.insert(participantes)
                  .values({
                    repartoId: nuevoRep.id,
                    profesorId: p.profesorId,
                    orden: p.orden,
                    horasACubrir: p.horasACubrir,
                    situacion: p.situacion,
                    esVacante: p.esVacante
                  })
                  .run();
              }
            }
          }
        }
      })();
    } catch {
      return fail(400, { error: 'Ya existe un curso con ese nombre.' });
    }

    return { ok: `Curso ${parsed.data.nombre} creado.` };
  },

  archivarCurso: async ({ locals, request }) => {
    requireJefatura(locals);
    const fd = await request.formData();
    const id = Number(fd.get('id'));
    if (!Number.isInteger(id)) return fail(400, { error: 'Curso no válido' });

    const db = getDb();
    db.update(cursosAcademicos)
      .set({ estado: 'archivado' })
      .where(eq(cursosAcademicos.id, id))
      .run();
    db.update(repartos).set({ estado: 'Archivado' }).where(eq(repartos.cursoId, id)).run();
    return { ok: 'Curso archivado.' };
  },

  crearDepartamento: async ({ locals, request }) => {
    requireJefatura(locals);
    const fd = await request.formData();
    const parsed = departamentoSchema.safeParse({ nombre: fd.get('nombre') });
    if (!parsed.success) return fail(400, { error: parsed.error.issues[0]?.message });

    try {
      getDb().insert(departamentos).values(parsed.data).run();
    } catch {
      return fail(400, { error: 'Ese departamento ya existe.' });
    }
    return { ok: 'Departamento creado.' };
  },

  eliminarDepartamento: async ({ locals, request }) => {
    requireJefatura(locals);
    const fd = await request.formData();
    const id = Number(fd.get('id'));
    try {
      getDb().delete(departamentos).where(eq(departamentos.id, id)).run();
    } catch {
      return fail(400, { error: 'No se puede borrar un departamento que ya tiene repartos.' });
    }
    return { ok: 'Departamento eliminado.' };
  },

  crearEspecialidad: async ({ locals, request }) => {
    requireJefatura(locals);
    const fd = await request.formData();
    const parsed = especialidadSchema.safeParse({
      codigo: fd.get('codigo'),
      nombre: fd.get('nombre')
    });
    if (!parsed.success) return fail(400, { error: parsed.error.issues[0]?.message });

    try {
      getDb().insert(especialidades).values(parsed.data).run();
    } catch {
      return fail(400, { error: 'Ese código de especialidad ya existe.' });
    }
    return { ok: 'Especialidad creada.' };
  },

  eliminarEspecialidad: async ({ locals, request }) => {
    requireJefatura(locals);
    const fd = await request.formData();
    const id = Number(fd.get('id'));
    getDb().delete(especialidades).where(eq(especialidades.id, id)).run();
    return { ok: 'Especialidad eliminada.' };
  }
};
