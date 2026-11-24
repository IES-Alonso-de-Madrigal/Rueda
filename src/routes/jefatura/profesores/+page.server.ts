import { fail } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { requireJefatura } from '$lib/server/auth/guards';
import { emitAcceso } from '$lib/server/auth';
import { parseCsv } from '$lib/server/csv';
import { getDb, getSqlite } from '$lib/server/db';
import {
  cursosAcademicos,
  especialidades,
  profesorEspecialidades,
  profesores
} from '$lib/server/db/schema';
import { enviarCorreoAcceso, isMailConfigured } from '$lib/server/mail';

export const load: PageServerLoad = async ({ locals }) => {
  requireJefatura(locals);
  const db = getDb();

  const listaProfesores = db
    .select()
    .from(profesores)
    .orderBy(desc(profesores.activo), profesores.apellidos, profesores.nombre)
    .all();

  const listaEspecialidades = db.select().from(especialidades).orderBy(especialidades.codigo).all();

  const relaciones = db.select().from(profesorEspecialidades).all();
  const espsPorProfesor = new Map<number, number[]>();
  for (const r of relaciones) {
    const arr = espsPorProfesor.get(r.profesorId) ?? [];
    arr.push(r.especialidadId);
    espsPorProfesor.set(r.profesorId, arr);
  }

  return {
    profesores: listaProfesores.map((p) => ({
      ...p,
      esAnonimizado: p.email.endsWith('@anonimizado.local'),
      especialidadesIds: espsPorProfesor.get(p.id) ?? []
    })),
    especialidades: listaEspecialidades,
    smtpConfigurado: isMailConfigured()
  };
};

const profesorSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  nombre: z.string().trim().min(1, 'Nombre requerido'),
  apellidos: z.string().trim().min(1, 'Apellidos requeridos'),
  email: z.string().trim().email('Correo no válido'),
  esJefatura: z.boolean().default(false)
});

export const actions: Actions = {
  guardar: async ({ locals, request }) => {
    requireJefatura(locals);
    const fd = await request.formData();
    const rawId = fd.get('id')?.toString().trim();
    const parsed = profesorSchema.safeParse({
      id: rawId ? Number(rawId) : undefined,
      nombre: fd.get('nombre'),
      apellidos: fd.get('apellidos'),
      email: fd.get('email'),
      esJefatura: fd.get('esJefatura') === 'on'
    });

    if (!parsed.success) return fail(400, { error: parsed.error.issues[0]?.message });

    const espIds = fd
      .getAll('especialidades')
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n) && n > 0);

    const db = getDb();
    const sqlite = getSqlite();

    try {
      sqlite.transaction(() => {
        let profId: number;
        if (parsed.data.id) {
          db.update(profesores)
            .set({
              nombre: parsed.data.nombre,
              apellidos: parsed.data.apellidos,
              email: parsed.data.email.toLowerCase(),
              esJefatura: parsed.data.esJefatura
            })
            .where(eq(profesores.id, parsed.data.id))
            .run();
          profId = parsed.data.id;
          db.delete(profesorEspecialidades)
            .where(eq(profesorEspecialidades.profesorId, profId))
            .run();
        } else {
          const inserted = db
            .insert(profesores)
            .values({
              nombre: parsed.data.nombre,
              apellidos: parsed.data.apellidos,
              email: parsed.data.email.toLowerCase(),
              esJefatura: parsed.data.esJefatura,
              activo: true
            })
            .returning({ id: profesores.id })
            .get();
          profId = inserted.id;
        }

        for (const espId of espIds) {
          db.insert(profesorEspecialidades)
            .values({ profesorId: profId, especialidadId: espId })
            .run();
        }
      })();
    } catch {
      return fail(400, { error: 'Ya existe un profesor con ese correo electrónico.' });
    }

    return { ok: parsed.data.id ? 'Profesor actualizado.' : 'Profesor añadido.' };
  },

  importarCsv: async ({ locals, request }) => {
    requireJefatura(locals);
    const fd = await request.formData();
    const csvText = fd.get('csv')?.toString() ?? '';
    const { rows } = parseCsv(csvText);
    if (rows.length === 0) return fail(400, { error: 'El CSV está vacío o sin filas de datos.' });

    const db = getDb();
    const sqlite = getSqlite();
    const allEsps = db.select().from(especialidades).all();
    const espByCodigo = new Map(allEsps.map((e) => [e.codigo.toLowerCase(), e.id]));
    const espByNombre = new Map(allEsps.map((e) => [e.nombre.toLowerCase(), e.id]));

    let creados = 0;
    let actualizados = 0;
    const errores: string[] = [];
    const espsDesconocidas = new Set<string>();

    sqlite.transaction(() => {
      rows.forEach((row, idx) => {
        const nombre = row['nombre']?.trim();
        const apellidos = row['apellidos']?.trim();
        const email = row['email']?.trim().toLowerCase() || row['correo']?.trim().toLowerCase();
        const espsRaw = row['especialidades']?.trim() ?? '';

        if (!nombre || !apellidos || !email || !email.includes('@')) {
          errores.push(`Línea ${idx + 2}: faltan nombre, apellidos o correo válido.`);
          return;
        }

        const existing = db.select().from(profesores).where(eq(profesores.email, email)).get();
        let profId: number;
        if (existing) {
          db.update(profesores)
            .set({ nombre, apellidos, activo: true })
            .where(eq(profesores.id, existing.id))
            .run();
          profId = existing.id;
          actualizados++;
        } else {
          const ins = db
            .insert(profesores)
            .values({ nombre, apellidos, email, activo: true, esJefatura: false })
            .returning({ id: profesores.id })
            .get();
          profId = ins.id;
          creados++;
        }

        if (espsRaw) {
          db.delete(profesorEspecialidades)
            .where(eq(profesorEspecialidades.profesorId, profId))
            .run();
          const tokens = espsRaw
            .split(/[|,]/)
            .map((t) => t.trim())
            .filter(Boolean);
          for (const t of tokens) {
            const espId = espByCodigo.get(t.toLowerCase()) ?? espByNombre.get(t.toLowerCase());
            if (espId) {
              db.insert(profesorEspecialidades)
                .values({ profesorId: profId, especialidadId: espId })
                .onConflictDoNothing()
                .run();
            } else {
              espsDesconocidas.add(t);
            }
          }
        }
      });
    })();

    if (creados === 0 && actualizados === 0) {
      return fail(400, {
        error: `No se pudo importar ninguna fila. ${errores.slice(0, 4).join(' ')}`
      });
    }

    const avisos: string[] = [];
    if (errores.length > 0) avisos.push(`${errores.length} filas omitidas por error`);
    if (espsDesconocidas.size > 0) {
      avisos.push(
        `especialidades no encontradas en catálogo: ${Array.from(espsDesconocidas).join(', ')}`
      );
    }

    return {
      ok: `Importación completada: ${creados} creados, ${actualizados} actualizados.${
        avisos.length > 0 ? ` (${avisos.join('; ')})` : ''
      }`
    };
  },

  toggleActivo: async ({ locals, request }) => {
    const me = requireJefatura(locals);
    const fd = await request.formData();
    const id = Number(fd.get('id'));
    if (id === me.id) return fail(400, { error: 'No puedes darte de baja a ti mismo.' });

    const db = getDb();
    const target = db.select().from(profesores).where(eq(profesores.id, id)).get();
    if (!target) return fail(404, { error: 'Profesor no encontrado.' });
    if (!target.activo && target.email.endsWith('@anonimizado.local')) {
      return fail(400, { error: 'No se puede reactivar a un profesor anonimizado.' });
    }

    db.update(profesores).set({ activo: !target.activo }).where(eq(profesores.id, id)).run();
    return { ok: target.activo ? 'Profesor dado de baja lógica.' : 'Profesor reactivado.' };
  },

  anonimizar: async ({ locals, request }) => {
    const me = requireJefatura(locals);
    const fd = await request.formData();
    const id = Number(fd.get('id'));
    if (id === me.id) return fail(400, { error: 'No puedes anonimizarte a ti mismo.' });

    const db = getDb();
    db.update(profesores)
      .set({
        nombre: 'Profesor',
        apellidos: `#${id}`,
        email: `anon-${id}@anonimizado.local`,
        esJefatura: false,
        activo: false
      })
      .where(eq(profesores.id, id))
      .run();

    return { ok: 'Profesor anonimizado y desactivado (histórico de actas preservado).' };
  },

  emitirAcceso: async ({ locals, request }) => {
    requireJefatura(locals);
    const fd = await request.formData();
    const id = Number(fd.get('id'));
    const enviarEmail = fd.get('enviarEmail') === 'true';

    const db = getDb();
    const prof = db.select().from(profesores).where(eq(profesores.id, id)).get();
    if (!prof || !prof.activo) {
      return fail(400, { error: 'El profesor no existe o está inactivo.' });
    }

    const cursoActivo = db
      .select()
      .from(cursosAcademicos)
      .where(eq(cursosAcademicos.estado, 'activo'))
      .orderBy(desc(cursosAcademicos.id))
      .get();

    const acceso = emitAcceso({
      profesorId: prof.id,
      cursoId: cursoActivo?.id ?? null
    });

    let mailStatus = '';
    if (enviarEmail && isMailConfigured()) {
      try {
        await enviarCorreoAcceso({
          to: prof.email,
          nombre: prof.nombre,
          enlace: acceso.enlace,
          codigoCorto: acceso.codigoCorto,
          cursoNombre: cursoActivo?.nombre
        });
        mailStatus = ' y enviado por correo';
      } catch (err) {
        mailStatus = ` (error al enviar correo: ${err instanceof Error ? err.message : 'desconocido'})`;
      }
    }

    return {
      ok: `Acceso generado para ${prof.nombre} ${prof.apellidos}${mailStatus}.`,
      accesosEmitidos: [
        {
          profesor: `${prof.apellidos}, ${prof.nombre}`,
          email: prof.email,
          enlace: acceso.enlace,
          codigoCorto: acceso.codigoCorto
        }
      ]
    };
  },

  emitirAccesosMasivos: async ({ locals, request }) => {
    requireJefatura(locals);
    const fd = await request.formData();
    const enviarEmail = fd.get('enviarEmail') === 'true' && isMailConfigured();

    const db = getDb();
    const cursoActivo = db
      .select()
      .from(cursosAcademicos)
      .where(eq(cursosAcademicos.estado, 'activo'))
      .orderBy(desc(cursosAcademicos.id))
      .get();

    const activos = db
      .select()
      .from(profesores)
      .where(eq(profesores.activo, true))
      .orderBy(profesores.apellidos, profesores.nombre)
      .all();

    if (activos.length === 0) {
      return fail(400, { error: 'No hay profesores activos.' });
    }

    const accesosEmitidos: Array<{
      profesor: string;
      email: string;
      enlace: string;
      codigoCorto: string;
    }> = [];
    let enviados = 0;
    let fallosCorreo = 0;

    for (const prof of activos) {
      const acceso = emitAcceso({
        profesorId: prof.id,
        cursoId: cursoActivo?.id ?? null
      });
      accesosEmitidos.push({
        profesor: `${prof.apellidos}, ${prof.nombre}`,
        email: prof.email,
        enlace: acceso.enlace,
        codigoCorto: acceso.codigoCorto
      });

      if (enviarEmail) {
        try {
          await enviarCorreoAcceso({
            to: prof.email,
            nombre: prof.nombre,
            enlace: acceso.enlace,
            codigoCorto: acceso.codigoCorto,
            cursoNombre: cursoActivo?.nombre
          });
          enviados++;
        } catch {
          fallosCorreo++;
        }
      }
    }

    return {
      ok: enviarEmail
        ? `Generados ${accesosEmitidos.length} accesos (${enviados} correos enviados${fallosCorreo ? `, ${fallosCorreo} fallos` : ''}).`
        : `Generados ${accesosEmitidos.length} enlaces y códigos cortos listos para copiar.`,
      accesosEmitidos
    };
  }
};
