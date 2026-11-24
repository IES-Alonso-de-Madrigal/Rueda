import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clearSessionCookie, deleteSession } from '$lib/server/auth';

export const POST: RequestHandler = async ({ locals, cookies }) => {
  if (locals.sessionId != null) {
    deleteSession(locals.sessionId);
  }
  clearSessionCookie(cookies);
  throw redirect(303, '/acceso');
};
