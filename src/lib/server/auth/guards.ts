import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { repartos } from '../db/schema';

export function requireUser(locals: App.Locals): App.UserSession {
  if (!locals.user) {
    throw redirect(303, '/acceso');
  }
  return locals.user;
}

export function requireJefatura(locals: App.Locals): App.UserSession {
  const user = requireUser(locals);
  if (!user.esJefatura) {
    throw error(403, 'Acceso restringido a Jefatura de estudios');
  }
  return user;
}

export function requireJefeOrJefatura(locals: App.Locals, repartoId: number): App.UserSession {
  const user = requireUser(locals);
  if (user.esJefatura) return user;

  const rep = getDb()
    .select({ jefeId: repartos.jefeId })
    .from(repartos)
    .where(eq(repartos.id, repartoId))
    .get();

  if (!rep || rep.jefeId !== user.id) {
    throw error(403, 'Acceso restringido al jefe del departamento o a Jefatura');
  }
  return user;
}
