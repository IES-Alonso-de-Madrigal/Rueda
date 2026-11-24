import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { createSession, setSessionCookie, verifyAccesoShortCode } from '$lib/server/auth';
import { checkRateLimit, resetRateLimit } from '$lib/server/auth/rate-limit';

const codeSchema = z.object({
  codigo: z.string().trim().min(6, 'Introduce el código de 6 caracteres').max(12)
});

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user) {
    throw redirect(303, '/');
  }
  return {};
};

export const actions: Actions = {
  default: async ({ request, cookies, getClientAddress }) => {
    const ip = getClientAddress();
    const rate = checkRateLimit(`code:${ip}`, 10, 15 * 60 * 1000);
    if (!rate.allowed) {
      return fail(429, {
        error: `Demasiados intentos. Espera ${rate.retryAfterSec} segundos.`
      });
    }

    const formData = await request.formData();
    const parsed = codeSchema.safeParse({ codigo: formData.get('codigo') });
    if (!parsed.success) {
      return fail(400, { error: parsed.error.issues[0]?.message ?? 'Código no válido' });
    }

    const profesorId = verifyAccesoShortCode(parsed.data.codigo);
    if (!profesorId) {
      return fail(400, { error: 'Código incorrecto, caducado o revocado.' });
    }

    resetRateLimit(`code:${ip}`);
    const { rawToken, expiresAt } = createSession(profesorId);
    setSessionCookie(cookies, rawToken, expiresAt);

    throw redirect(303, '/');
  }
};
