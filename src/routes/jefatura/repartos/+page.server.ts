import { fail } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { requireJefatura } from '$lib/server/auth/guards';
import { getDb } from '$lib/server/db';
import {
  cursosAcademicos,
  departamentos,
  eventos,
  profesores,
  repartos
} from '$lib/server/db/schema';
import { publishRepartoUpdate } from '$lib/server/sse';

export const load: PageServerLoad = async ({ locals }) => {
  requireJefatura(locals);
  const db = getDb();

  const listaRepartos = db
    .select({
      id: repartos.id,
      estado: repartos.estado,
      restringirPorTurno: repartos.restringirPorTurno,
      rondaActual: repartos.rondaActual,
      cursoId: repartos.cursoId,
      cursoNombre: cursosAcademicos.nombre,
      cursoEstado: cursosAcademicos.estado,
      departamentoNombre: departamentos.nombre,
      jefeId: repartos.jefeId
    })
    .from(repartos)
    .innerJoin(cursosAcademicos, eq(repartos.cursoId, cursosAcademicos.id))
    .innerJoin(departamentos, eq(repartos.departamentoId, departamentos.id))
    .orderBy(desc(cursosAcademicos.id), departamentos.nombre)
    .all();

  const listaProfesores = db
    .select()
    .from(profesores)
    .where(eq(profesores.activo, true))
    .orderBy(profesores.apellidos, profesores.nombre)
    .all();

  const profMap = new Map(listaProfesores.map((p) => [p.id, `${p.apellidos}, ${p.nombre}`]));

  return {
    repartos: listaRepartos.map((r) => ({
      ...r,
      jefeNombre: r.jefeId ? (profMap.get(r.jefeId) ?? 'Sin asignar') : 'Sin asignar'
    })),
    cursosTodos: db.select().from(cursosAcademicos).orderBy(desc(cursosAcademicos.id)).all(),
    cursosActivos: db
      .select()
      .from(cursosAcademicos)
      .where(eq(cursosAcademicos.estado, 'activo'))
      .orderBy(desc(cursosAcademicos.id))
      .all(),
    departamentos: db.select().from(departamentos).orderBy(departamentos.nombre).all(),
    profesores: listaProfesores
  };
};

const repartoSchema = z.object({
  cursoId: z.coerce.number().int().positive(),
  departamentoId: z.coerce.number().int().positive(),
  jefeId: z.coerce.number().int().positive().nullable().optional(),
  restringirPorTurno: z.boolean().default(false)
});

export const actions: Actions = {
  crear: async ({ locals, request }) => {
    requireJefatura(locals);
    const fd = await request.formData();
    const rawJefe = fd.get('jefeId')?.toString().trim();
    const parsed = repartoSchema.safeParse({
      cursoId: fd.get('cursoId'),
      departamentoId: fd.get('departamentoId'),
      jefeId: rawJefe ? Number(rawJefe) : null,
      restringirPorTurno: fd.get('restringirPorTurno') === 'on'
    });
    if (!parsed.success) return fail(400, { error: 'Selecciona curso y departamento.' });

    try {
      getDb()
        .insert(repartos)
        .values({
          cursoId: parsed.data.cursoId,
          departamentoId: parsed.data.departamentoId,
          jefeId: parsed.data.jefeId ?? null,
          restringirPorTurno: parsed.data.restringirPorTurno,
          estado: 'Borrador'
        })
        .run();
    } catch {
      return fail(400, { error: 'Ya existe un reparto para ese departamento en ese curso.' });
    }

    return { ok: 'Reparto creado. Ya puedes configurar sus participantes y grupos.' };
  },

  eliminar: async ({ locals, request }) => {
    requireJefatura(locals);
    const fd = await request.formData();
    const id = Number(fd.get('id'));
    const db = getDb();
    const rep = db.select().from(repartos).where(eq(repartos.id, id)).get();
    if (!rep || rep.estado !== 'Borrador') {
      return fail(400, { error: 'Solo se pueden eliminar repartos en estado En preparación.' });
    }
    db.delete(repartos).where(eq(repartos.id, id)).run();
    return { ok: 'Reparto eliminado.' };
  },

  reabrir: async ({ locals, request }) => {
    const user = requireJefatura(locals);
    const fd = await request.formData();
    const id = Number(fd.get('id'));
    const motivo = fd.get('motivo')?.toString().trim() || 'Reapertura por Jefatura';

    const db = getDb();
    const rep = db.select().from(repartos).where(eq(repartos.id, id)).get();
    if (!rep || rep.estado !== 'Cerrado') {
      return fail(400, { error: 'Solo se pueden reabrir repartos en estado Cerrado.' });
    }

    const nuevaVersion = rep.version + 1;
    db.update(repartos)
      .set({ estado: 'FaseManual', version: nuevaVersion })
      .where(eq(repartos.id, id))
      .run();

    db.insert(eventos)
      .values({
        repartoId: id,
        tipo: 'REPARTO_REABIERTO',
        datosJson: JSON.stringify({ tipo: 'REPARTO_REABIERTO', motivo }),
        actorId: user.id
      })
      .run();

    publishRepartoUpdate(id, nuevaVersion, 'REPARTO_REABIERTO');
    return { ok: 'Reparto reabierto en Fase manual (quedará reflejado en el acta).' };
  }
};
