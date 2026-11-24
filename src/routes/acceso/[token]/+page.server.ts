import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createSession, setSessionCookie, verifyAccesoToken } from '$lib/server/auth';

export const load: PageServerLoad = async ({ params, cookies }) => {
  const profesorId = verifyAccesoToken(params.token);
  if (!profesorId) {
    throw error(403, 'El enlace de acceso no es válido, ha caducado o ha sido revocado.');
  }

  const { rawToken, expiresAt } = createSession(profesorId);
  setSessionCookie(cookies, rawToken, expiresAt);

  throw redirect(303, '/');
};
