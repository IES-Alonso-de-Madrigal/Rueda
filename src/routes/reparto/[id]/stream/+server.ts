import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/auth/guards';
import { getDb } from '$lib/server/db';
import { participantes, repartos } from '$lib/server/db/schema';
import { subscribeReparto } from '$lib/server/sse';

export const GET: RequestHandler = async ({ locals, params }) => {
  const user = requireUser(locals);
  const repartoId = Number(params.id);
  if (!Number.isInteger(repartoId) || repartoId <= 0) {
    throw error(400, 'ID de reparto no válido');
  }

  const db = getDb();
  const rep = db.select().from(repartos).where(eq(repartos.id, repartoId)).get();
  if (!rep) throw error(404, 'Reparto no encontrado');

  if (!user.esJefatura && rep.jefeId !== user.id) {
    const part = db
      .select({ id: participantes.id })
      .from(participantes)
      .where(and(eq(participantes.repartoId, repartoId), eq(participantes.profesorId, user.id)))
      .get();
    if (!part) throw error(403, 'Sin acceso a este reparto');
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Stream closed
        }
      };

      send(`event: ready\ndata: ${JSON.stringify({ version: rep.version })}\n\n`);

      unsubscribe = subscribeReparto(repartoId, (payload) => {
        send(`event: update\ndata: ${JSON.stringify(payload)}\n\n`);
      });

      heartbeat = setInterval(() => {
        send(`: ping\n\n`);
      }, 20_000);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (unsubscribe) unsubscribe();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    }
  });
};
