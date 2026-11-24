import type { LayoutServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { centros } from '$lib/server/db/schema';

export const load: LayoutServerLoad = async ({ locals }) => {
  const centro = getDb().select().from(centros).get() ?? null;
  return {
    user: locals.user,
    centro
  };
};
