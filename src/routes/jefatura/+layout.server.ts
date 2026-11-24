import { count, eq } from 'drizzle-orm';
import type { LayoutServerLoad } from './$types';
import { requireJefatura } from '$lib/server/auth/guards';
import { getDb } from '$lib/server/db';
import {
  cursosAcademicos,
  departamentos,
  especialidades,
  profesores,
  repartos
} from '$lib/server/db/schema';

export const load: LayoutServerLoad = async ({ locals }) => {
  const user = requireJefatura(locals);
  const db = getDb();

  const resumen = {
    cursosActivos:
      db
        .select({ total: count() })
        .from(cursosAcademicos)
        .where(eq(cursosAcademicos.estado, 'activo'))
        .get()?.total ?? 0,
    departamentos: db.select({ total: count() }).from(departamentos).get()?.total ?? 0,
    especialidades: db.select({ total: count() }).from(especialidades).get()?.total ?? 0,
    profesoresActivos:
      db.select({ total: count() }).from(profesores).where(eq(profesores.activo, true)).get()
        ?.total ?? 0,
    repartos: db.select({ total: count() }).from(repartos).get()?.total ?? 0
  };

  return { user, resumen };
};
