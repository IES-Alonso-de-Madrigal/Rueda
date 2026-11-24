import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSqlite } from '$lib/server/db';

export const GET: RequestHandler = async () => {
  try {
    const sqlite = getSqlite();
    sqlite.prepare('SELECT 1').get();
    return json({ status: 'ok', db: 'ok' });
  } catch (err) {
    return json(
      { status: 'error', db: 'error', message: err instanceof Error ? err.message : 'unknown' },
      { status: 500 }
    );
  }
};
