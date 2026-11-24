import type { Handle } from '@sveltejs/kit';
import { initDb } from '$lib/server/db';
import { SESSION_COOKIE_NAME, ensureInitialSetupToken, getSessionUser } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
  initDb();
  ensureInitialSetupToken();

  const rawSession = event.cookies.get(SESSION_COOKIE_NAME);
  const found = getSessionUser(rawSession);

  event.locals.user = found?.user ?? null;
  event.locals.sessionId = found?.sessionId ?? null;

  return resolve(event);
};
