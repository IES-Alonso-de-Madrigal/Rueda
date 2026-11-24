import { error, fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { centros, profesores } from '$lib/server/db/schema';
import {
  consumeSetupToken,
  createSession,
  setSessionCookie,
  verifySetupToken
} from '$lib/server/auth';

const setupSchema = z.object({
  centroNombre: z.string().trim().min(2, 'Nombre del centro requerido'),
  centroCodigo: z.string().trim().optional().default(''),
  centroLocalidad: z.string().trim().optional().default(''),
  nombre: z.string().trim().min(2, 'Nombre requerido'),
  apellidos: z.string().trim().min(2, 'Apellidos requeridos'),
  email: z.string().trim().email('Correo electrónico no válido')
});

export const load: PageServerLoad = async ({ params }) => {
  const tokenId = verifySetupToken(params.token);
  if (!tokenId) {
    throw error(403, 'El enlace de configuración inicial no es válido o ya ha sido utilizado.');
  }
  return {};
};

export const actions: Actions = {
  default: async ({ params, request, cookies }) => {
    const tokenId = verifySetupToken(params.token);
    if (!tokenId) {
      throw error(403, 'El enlace de configuración inicial no es válido o ya ha sido utilizado.');
    }

    const formData = await request.formData();
    const parsed = setupSchema.safeParse({
      centroNombre: formData.get('centroNombre'),
      centroCodigo: formData.get('centroCodigo') ?? '',
      centroLocalidad: formData.get('centroLocalidad') ?? '',
      nombre: formData.get('nombre'),
      apellidos: formData.get('apellidos'),
      email: formData.get('email')
    });

    if (!parsed.success) {
      return fail(400, { error: parsed.error.issues[0]?.message ?? 'Datos no válidos' });
    }

    const db = getDb();
    const existingCentro = db.select({ id: centros.id }).from(centros).get();
    if (!existingCentro) {
      db.insert(centros)
        .values({
          nombre: parsed.data.centroNombre,
          codigo: parsed.data.centroCodigo,
          localidad: parsed.data.centroLocalidad
        })
        .run();
    }

    let inserted: { id: number };
    try {
      inserted = db
        .insert(profesores)
        .values({
          nombre: parsed.data.nombre,
          apellidos: parsed.data.apellidos,
          email: parsed.data.email.toLowerCase(),
          esJefatura: true,
          activo: true
        })
        .returning({ id: profesores.id })
        .get();
    } catch {
      return fail(400, { error: 'Ya existe un usuario con ese correo electrónico.' });
    }

    consumeSetupToken(tokenId);
    const { rawToken, expiresAt } = createSession(inserted.id);
    setSessionCookie(cookies, rawToken, expiresAt);

    throw redirect(303, '/');
  }
};
