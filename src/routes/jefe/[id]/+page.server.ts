import { fail } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { requireJefeOrJefatura, requireJefatura } from '$lib/server/auth/guards';
import { parseCsv } from '$lib/server/csv';
import { getDb, getSqlite } from '$lib/server/db';
import {
  SITUACIONES_PARTICIPANTE,
  grupos,
  participantes,
  profesores,
  repartos
} from '$lib/server/db/schema';
import { publishRepartoUpdate } from '$lib/server/sse';

function esEditableEstado(estado: string) {
  return estado === 'Borrador' || estado === 'ListasAbiertas';
}

export const load: PageServerLoad = async ({ locals, params }) => {
  const repartoId = Number(params.id);
  requireJefeOrJefatura(locals, repartoId);
  const db = getDb();

  const listaParticipantes = db
    .select({
      id: participantes.id,
      profesorId: participantes.profesorId,
      orden: participantes.orden,
      horasACubrir: participantes.horasACubrir,
      situacion: participantes.situacion,
      esVacante: participantes.esVacante,
      turno: participantes.turno,
      turnoFijadoPorJefe: participantes.turnoFijadoPorJefe,
      motivoReduccion: participantes.motivoReduccion,
      nombre: profesores.nombre,
      apellidos: profesores.apellidos,
      email: profesores.email
    })
    .from(participantes)
    .innerJoin(profesores, eq(participantes.profesorId, profesores.id))
    .where(eq(participantes.repartoId, repartoId))
    .orderBy(asc(participantes.orden))
    .all();

  const turnosDeGrupos = Array.from(
    new Set(
      db
        .select({ turno: grupos.turno })
        .from(grupos)
        .where(eq(grupos.repartoId, repartoId))
        .all()
        .map((g) => g.turno.trim())
        .filter(Boolean)
    )
  );

  const profesoresActivos = db
    .select()
    .from(profesores)
    .where(eq(profesores.activo, true))
    .orderBy(profesores.apellidos, profesores.nombre)
    .all();

  return {
    participantes: listaParticipantes,
    profesoresActivos,
    turnosSugeridos:
      turnosDeGrupos.length > 0
        ? turnosDeGrupos
        : ['Mañana', 'Tarde', 'Diurno', 'Vespertino', 'Nocturno']
  };
};

const participanteSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  profesorId: z.coerce.number().int().positive(),
  horasACubrir: z.coerce.number().int().min(0).max(40),
  situacion: z.enum(SITUACIONES_PARTICIPANTE),
  esVacante: z.boolean().default(false),
  turno: z.string().trim().optional().nullable(),
  motivoReduccion: z.string().trim().optional().nullable()
});

export const actions: Actions = {
  configurarTurno: async ({ locals, params, request }) => {
    const repartoId = Number(params.id);
    requireJefeOrJefatura(locals, repartoId);
    const db = getDb();

    const rep = db.select().from(repartos).where(eq(repartos.id, repartoId)).get();
    if (!rep || !esEditableEstado(rep.estado)) {
      return fail(400, {
        error: 'Solo se puede activar o desactivar la restricción por turno antes de cerrar listas.'
      });
    }

    const fd = await request.formData();
    const activar = fd.get('restringirPorTurno') === 'true';
    const nuevaVersion = rep.version + 1;

    db.update(repartos)
      .set({ restringirPorTurno: activar, version: nuevaVersion })
      .where(eq(repartos.id, repartoId))
      .run();

    publishRepartoUpdate(repartoId, nuevaVersion, 'CONFIG_TURNO');

    return {
      ok: activar
        ? 'Restricción por turno activada: cada profesor solo podrá elegir asignaturas de su turno.'
        : 'Restricción por turno desactivada: los profesores pueden mezclar turnos.'
    };
  },

  guardar: async ({ locals, params, request }) => {
    const repartoId = Number(params.id);
    requireJefeOrJefatura(locals, repartoId);
    const db = getDb();

    const rep = db.select().from(repartos).where(eq(repartos.id, repartoId)).get();
    if (!rep || !esEditableEstado(rep.estado)) {
      return fail(400, {
        error:
          'Solo se pueden editar participantes mientras el reparto esté en preparación o listas abiertas.'
      });
    }

    const fd = await request.formData();
    const rawId = fd.get('id')?.toString().trim();
    const parsed = participanteSchema.safeParse({
      id: rawId ? Number(rawId) : undefined,
      profesorId: fd.get('profesorId'),
      horasACubrir: fd.get('horasACubrir'),
      situacion: fd.get('situacion'),
      esVacante: fd.get('esVacante') === 'on',
      turno: fd.get('turno')?.toString().trim() || null,
      motivoReduccion: fd.get('motivoReduccion')?.toString().trim() || null
    });
    if (!parsed.success) return fail(400, { error: parsed.error.issues[0]?.message });

    const turnoValor = parsed.data.turno || null;
    const turnoFijado = Boolean(turnoValor);

    try {
      if (parsed.data.id) {
        const res = db
          .update(participantes)
          .set({
            horasACubrir: parsed.data.horasACubrir,
            situacion: parsed.data.situacion,
            esVacante: parsed.data.esVacante,
            turno: turnoValor,
            turnoFijadoPorJefe: turnoFijado,
            motivoReduccion: parsed.data.motivoReduccion ?? null
          })
          .where(and(eq(participantes.id, parsed.data.id), eq(participantes.repartoId, repartoId)))
          .run();
        if (res.changes === 0)
          return fail(404, { error: 'Participante no pertenece a este reparto.' });
      } else {
        const actuales = db
          .select({ orden: participantes.orden })
          .from(participantes)
          .where(eq(participantes.repartoId, repartoId))
          .all();
        const maxOrden = actuales.reduce((m, x) => Math.max(m, x.orden), 0);

        db.insert(participantes)
          .values({
            repartoId,
            profesorId: parsed.data.profesorId,
            orden: maxOrden + 1,
            horasACubrir: parsed.data.horasACubrir,
            situacion: parsed.data.situacion,
            esVacante: parsed.data.esVacante,
            turno: turnoValor,
            turnoFijadoPorJefe: turnoFijado,
            motivoReduccion: parsed.data.motivoReduccion ?? null
          })
          .run();
      }
    } catch {
      return fail(400, { error: 'Ese profesor ya participa en este reparto.' });
    }

    return { ok: parsed.data.id ? 'Participante actualizado.' : 'Participante añadido.' };
  },

  moverOrden: async ({ locals, params, request }) => {
    const repartoId = Number(params.id);
    requireJefeOrJefatura(locals, repartoId);
    const db = getDb();
    const sqlite = getSqlite();

    const rep = db.select().from(repartos).where(eq(repartos.id, repartoId)).get();
    if (!rep || !esEditableEstado(rep.estado)) {
      return fail(400, { error: 'No se puede cambiar el orden una vez cerradas las listas.' });
    }

    const fd = await request.formData();
    const id = Number(fd.get('id'));
    const dir = fd.get('dir')?.toString();

    const lista = db
      .select()
      .from(participantes)
      .where(eq(participantes.repartoId, repartoId))
      .orderBy(asc(participantes.orden))
      .all();

    const idx = lista.findIndex((p) => p.id === id);
    if (idx === -1) return fail(404, { error: 'Participante no encontrado' });

    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= lista.length) return { ok: 'Sin cambios.' };

    const a = lista[idx];
    const b = lista[swapIdx];

    sqlite.transaction(() => {
      db.update(participantes).set({ orden: b.orden }).where(eq(participantes.id, a.id)).run();
      db.update(participantes).set({ orden: a.orden }).where(eq(participantes.id, b.id)).run();
    })();

    return { ok: 'Orden actualizado.' };
  },

  eliminar: async ({ locals, params, request }) => {
    const repartoId = Number(params.id);
    requireJefeOrJefatura(locals, repartoId);
    const db = getDb();

    const rep = db.select().from(repartos).where(eq(repartos.id, repartoId)).get();
    if (!rep || !esEditableEstado(rep.estado)) {
      return fail(400, { error: 'No se pueden quitar participantes una vez cerradas las listas.' });
    }

    const fd = await request.formData();
    const id = Number(fd.get('id'));
    db.delete(participantes)
      .where(and(eq(participantes.id, id), eq(participantes.repartoId, repartoId)))
      .run();
    return { ok: 'Participante eliminado.' };
  },

  cambiarJefe: async ({ locals, params, request }) => {
    requireJefatura(locals);
    const repartoId = Number(params.id);
    const fd = await request.formData();
    const raw = fd.get('jefeId')?.toString().trim();
    const jefeId = raw ? Number(raw) : null;

    getDb().update(repartos).set({ jefeId }).where(eq(repartos.id, repartoId)).run();
    return { ok: 'Jefe de departamento actualizado.' };
  },

  importarCsv: async ({ locals, params, request }) => {
    const repartoId = Number(params.id);
    requireJefeOrJefatura(locals, repartoId);
    const db = getDb();
    const sqlite = getSqlite();

    const rep = db.select().from(repartos).where(eq(repartos.id, repartoId)).get();
    if (!rep || !esEditableEstado(rep.estado)) {
      return fail(400, {
        error: 'No se pueden importar participantes una vez cerradas las listas.'
      });
    }

    const fd = await request.formData();
    const csvText = fd.get('csv')?.toString() ?? '';
    const { rows } = parseCsv(csvText);
    if (rows.length === 0) return fail(400, { error: 'El CSV está vacío.' });

    const allProfs = db.select().from(profesores).where(eq(profesores.activo, true)).all();
    const profByEmail = new Map(allProfs.map((p) => [p.email.toLowerCase(), p.id]));

    const existentes = db
      .select({ profesorId: participantes.profesorId, orden: participantes.orden })
      .from(participantes)
      .where(eq(participantes.repartoId, repartoId))
      .all();
    const yaParticipan = new Set(existentes.map((e) => e.profesorId));
    let siguienteOrden = existentes.reduce((m, e) => Math.max(m, e.orden), 0) + 1;

    let importados = 0;
    let duplicados = 0;
    const errores: string[] = [];

    sqlite.transaction(() => {
      rows.forEach((row, idx) => {
        const email = (row['email'] ?? row['correo'] ?? '').trim().toLowerCase();
        const profId = profByEmail.get(email);
        if (!profId) {
          errores.push(`Línea ${idx + 2}: no existe profesor activo con correo "${email}"`);
          return;
        }
        if (yaParticipan.has(profId)) {
          duplicados++;
          return;
        }

        const ordenRaw = (row['orden'] ?? '').trim();
        const ordenNum = Number(ordenRaw);
        const orden =
          ordenRaw !== '' && Number.isInteger(ordenNum) && ordenNum > 0
            ? ordenNum
            : siguienteOrden++;

        const horasRaw = (row['horas a cubrir'] ?? row['horas'] ?? '').trim();
        const horasNum = Number(horasRaw);
        const horas =
          horasRaw !== '' && Number.isInteger(horasNum) && horasNum >= 0 && horasNum <= 40
            ? horasNum
            : 18;

        const sitRaw = (row['situacion'] ?? 'definitivo').trim().toLowerCase();
        const situacion = SITUACIONES_PARTICIPANTE.includes(
          sitRaw as (typeof SITUACIONES_PARTICIPANTE)[number]
        )
          ? (sitRaw as (typeof SITUACIONES_PARTICIPANTE)[number])
          : 'definitivo';

        const vacRaw = (row['es vacante'] ?? row['vacante'] ?? '').trim().toLowerCase();
        const esVacante = ['si', 'sí', 'true', '1'].includes(vacRaw);
        const turnoCsv = (row['turno'] ?? '').trim() || null;

        db.insert(participantes)
          .values({
            repartoId,
            profesorId: profId,
            orden,
            horasACubrir: horas,
            situacion,
            esVacante,
            turno: turnoCsv,
            turnoFijadoPorJefe: Boolean(turnoCsv)
          })
          .run();

        yaParticipan.add(profId);
        importados++;
      });
    })();

    if (importados === 0) {
      return fail(400, {
        error: `No se importó ningún participante (${duplicados} ya estaban en el reparto). ${errores.slice(0, 3).join(' ')}`
      });
    }

    return {
      ok: `Importados ${importados} participantes.${
        duplicados > 0 ? ` ${duplicados} ya figuraban.` : ''
      }${errores.length > 0 ? ` Errores: ${errores.slice(0, 3).join(' ')}` : ''}`
    };
  }
};
