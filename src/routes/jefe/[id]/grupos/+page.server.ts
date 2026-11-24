import { fail } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { requireJefeOrJefatura } from '$lib/server/auth/guards';
import { parseCsv } from '$lib/server/csv';
import { getDb, getSqlite } from '$lib/server/db';
import {
  TIPOS_GRUPO,
  especialidades,
  grupoEspecialidades,
  grupos,
  participantes,
  repartos
} from '$lib/server/db/schema';

function esEditableEstado(estado: string) {
  return estado === 'Borrador' || estado === 'ListasAbiertas';
}

export const load: PageServerLoad = async ({ locals, params }) => {
  const repartoId = Number(params.id);
  requireJefeOrJefatura(locals, repartoId);
  const db = getDb();

  const listaGrupos = db.select().from(grupos).where(eq(grupos.repartoId, repartoId)).all();
  const rels = db.select().from(grupoEspecialidades).all();
  const espsPorGrupo = new Map<number, number[]>();
  for (const r of rels) {
    const arr = espsPorGrupo.get(r.grupoId) ?? [];
    arr.push(r.especialidadId);
    espsPorGrupo.set(r.grupoId, arr);
  }

  const parts = db
    .select({ horasACubrir: participantes.horasACubrir })
    .from(participantes)
    .where(eq(participantes.repartoId, repartoId))
    .all();

  const horasParticipantes = parts.reduce((s, p) => s + p.horasACubrir, 0);
  const horasGruposReparto = listaGrupos
    .filter((g) => g.tipo !== 'fuera_del_reparto')
    .reduce((s, g) => s + g.horasSemanales, 0);

  return {
    grupos: listaGrupos.map((g) => ({
      ...g,
      especialidadesIds: espsPorGrupo.get(g.id) ?? []
    })),
    especialidades: db.select().from(especialidades).orderBy(especialidades.codigo).all(),
    horasParticipantes,
    horasGruposReparto
  };
};

const grupoSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  ensenanza: z.string().trim().default(''),
  curso: z.string().trim().default(''),
  nombreGrupo: z.string().trim().default(''),
  turno: z.string().trim().default('Diurno'),
  materia: z.string().trim().min(1, 'Materia o módulo requerido'),
  horasSemanales: z.coerce.number().int().min(1).max(30),
  tipo: z.enum(TIPOS_GRUPO),
  profesorExterno: z.string().trim().optional().nullable(),
  notas: z.string().trim().optional().nullable()
});

export const actions: Actions = {
  guardar: async ({ locals, params, request }) => {
    const repartoId = Number(params.id);
    requireJefeOrJefatura(locals, repartoId);
    const db = getDb();
    const sqlite = getSqlite();

    const rep = db.select().from(repartos).where(eq(repartos.id, repartoId)).get();
    if (!rep || !esEditableEstado(rep.estado)) {
      return fail(400, {
        error:
          'Solo se pueden editar grupos mientras el reparto esté en preparación o listas abiertas.'
      });
    }

    const fd = await request.formData();
    const rawId = fd.get('id')?.toString().trim();
    const parsed = grupoSchema.safeParse({
      id: rawId ? Number(rawId) : undefined,
      ensenanza: fd.get('ensenanza') ?? '',
      curso: fd.get('curso') ?? '',
      nombreGrupo: fd.get('nombreGrupo') ?? '',
      turno: fd.get('turno') ?? 'Diurno',
      materia: fd.get('materia'),
      horasSemanales: fd.get('horasSemanales'),
      tipo: fd.get('tipo'),
      profesorExterno: fd.get('profesorExterno')?.toString().trim() || null,
      notas: fd.get('notas')?.toString().trim() || null
    });
    if (!parsed.success) return fail(400, { error: parsed.error.issues[0]?.message });

    const espIds = fd
      .getAll('especialidades')
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n) && n > 0);

    try {
      sqlite.transaction(() => {
        let grupoId: number;
        if (parsed.data.id) {
          const res = db
            .update(grupos)
            .set({
              ensenanza: parsed.data.ensenanza,
              curso: parsed.data.curso,
              nombreGrupo: parsed.data.nombreGrupo,
              turno: parsed.data.turno,
              materia: parsed.data.materia,
              horasSemanales: parsed.data.horasSemanales,
              tipo: parsed.data.tipo,
              profesorExterno: parsed.data.profesorExterno ?? null,
              notas: parsed.data.notas ?? null
            })
            .where(and(eq(grupos.id, parsed.data.id), eq(grupos.repartoId, repartoId)))
            .run();
          if (res.changes === 0) throw new Error('Grupo no pertenece a este reparto');
          grupoId = parsed.data.id;
          db.delete(grupoEspecialidades).where(eq(grupoEspecialidades.grupoId, grupoId)).run();
        } else {
          const ins = db
            .insert(grupos)
            .values({
              repartoId,
              ensenanza: parsed.data.ensenanza,
              curso: parsed.data.curso,
              nombreGrupo: parsed.data.nombreGrupo,
              turno: parsed.data.turno,
              materia: parsed.data.materia,
              horasSemanales: parsed.data.horasSemanales,
              tipo: parsed.data.tipo,
              profesorExterno: parsed.data.profesorExterno ?? null,
              notas: parsed.data.notas ?? null
            })
            .returning({ id: grupos.id })
            .get();
          grupoId = ins.id;
        }

        for (const espId of espIds) {
          db.insert(grupoEspecialidades).values({ grupoId, especialidadId: espId }).run();
        }
      })();
    } catch (err) {
      return fail(400, {
        error: err instanceof Error ? err.message : 'No se pudo guardar el grupo.'
      });
    }

    return { ok: parsed.data.id ? 'Grupo actualizado.' : 'Grupo añadido.' };
  },

  eliminar: async ({ locals, params, request }) => {
    const repartoId = Number(params.id);
    requireJefeOrJefatura(locals, repartoId);
    const db = getDb();

    const rep = db.select().from(repartos).where(eq(repartos.id, repartoId)).get();
    if (!rep || !esEditableEstado(rep.estado)) {
      return fail(400, { error: 'No se pueden eliminar grupos una vez cerradas las listas.' });
    }

    const fd = await request.formData();
    const id = Number(fd.get('id'));
    db.delete(grupos)
      .where(and(eq(grupos.id, id), eq(grupos.repartoId, repartoId)))
      .run();
    return { ok: 'Grupo eliminado.' };
  },

  importarCsv: async ({ locals, params, request }) => {
    const repartoId = Number(params.id);
    requireJefeOrJefatura(locals, repartoId);
    const db = getDb();
    const sqlite = getSqlite();

    const rep = db.select().from(repartos).where(eq(repartos.id, repartoId)).get();
    if (!rep || !esEditableEstado(rep.estado)) {
      return fail(400, { error: 'No se pueden importar grupos una vez cerradas las listas.' });
    }

    const fd = await request.formData();
    const csvText = fd.get('csv')?.toString() ?? '';
    const { rows } = parseCsv(csvText);
    if (rows.length === 0) return fail(400, { error: 'El CSV está vacío.' });

    const allEsps = db.select().from(especialidades).all();
    const espByCodigo = new Map(allEsps.map((e) => [e.codigo.toLowerCase(), e.id]));
    const espByNombre = new Map(allEsps.map((e) => [e.nombre.toLowerCase(), e.id]));

    let creados = 0;
    const errores: string[] = [];
    const espsDesconocidas = new Set<string>();

    sqlite.transaction(() => {
      rows.forEach((row, idx) => {
        const materia = (row['materia'] ?? row['materia o modulo'] ?? '').trim();
        const horas = Number(row['horas'] ?? row['horas semanales'] ?? 0);
        if (!materia || !Number.isInteger(horas) || horas < 1 || horas > 30) {
          errores.push(`Línea ${idx + 2}: falta materia u horas válidas (1–30).`);
          return;
        }

        const tipoRaw = (row['tipo'] ?? '').trim().toLowerCase();
        let tipo: (typeof TIPOS_GRUPO)[number] = horas === 1 ? 'relleno' : 'normal';
        if (tipoRaw === 'normal' || tipoRaw === 'relleno' || tipoRaw === 'fuera_del_reparto') {
          tipo = tipoRaw;
        }

        const ins = db
          .insert(grupos)
          .values({
            repartoId,
            ensenanza: (row['ensenanza'] ?? '').trim(),
            curso: (row['curso'] ?? '').trim(),
            nombreGrupo: (row['grupo'] ?? row['nombre de grupo'] ?? '').trim(),
            turno: (row['turno'] ?? 'Diurno').trim() || 'Diurno',
            materia,
            horasSemanales: horas,
            tipo
          })
          .returning({ id: grupos.id })
          .get();

        const espsRaw = (row['especialidades'] ?? '').trim();
        if (espsRaw) {
          for (const t of espsRaw
            .split(/[|,]/)
            .map((x) => x.trim())
            .filter(Boolean)) {
            const espId = espByCodigo.get(t.toLowerCase()) ?? espByNombre.get(t.toLowerCase());
            if (espId) {
              db.insert(grupoEspecialidades)
                .values({ grupoId: ins.id, especialidadId: espId })
                .onConflictDoNothing()
                .run();
            } else {
              espsDesconocidas.add(t);
            }
          }
        }
        creados++;
      });
    })();

    if (creados === 0) {
      return fail(400, {
        error: `No se pudo importar ningún grupo. ${errores.slice(0, 3).join(' ')}`
      });
    }

    const avisos: string[] = [];
    if (errores.length > 0) avisos.push(`${errores.length} filas omitidas`);
    if (espsDesconocidas.size > 0) {
      avisos.push(`especialidades no encontradas: ${Array.from(espsDesconocidas).join(', ')}`);
    }

    return {
      ok: `Importados ${creados} grupos.${avisos.length > 0 ? ` (${avisos.join('; ')})` : ''}`
    };
  }
};
