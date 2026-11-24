import { error } from '@sveltejs/kit';
import fs from 'node:fs';
import type { RequestHandler } from './$types';
import { requireJefatura } from '$lib/server/auth/guards';
import { resolverRutaCopia } from '$lib/server/backup';

export const GET: RequestHandler = async ({ locals, params }) => {
  requireJefatura(locals);
  const fullPath = resolverRutaCopia(params.filename);
  if (!fullPath) throw error(404, 'Copia no encontrada');

  const data = fs.readFileSync(fullPath);
  return new Response(data, {
    headers: {
      'Content-Type': 'application/x-sqlite3',
      'Content-Disposition': `attachment; filename="${params.filename}"`
    }
  });
};
