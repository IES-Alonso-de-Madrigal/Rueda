import { error, json } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/auth/guards';
import { getDb, getSqlite } from '$lib/server/db';
import {
  asignaciones,
  eventos,
  excepcionesElegibilidad,
  grupoEspecialidades,
  grupos,
  itemsLista,
  listas,
  participantes,
  profesorEspecialidades,
  repartos
} from '$lib/server/db/schema';
import { esDisponible, esElegible } from '$lib/motor';

const payloadSchema = z.object({
  grupoIds: z.array(z.number().int().positive())
});

export const PUT: RequestHandler = async ({ locals, params, request }) => {
  const user = requireUser(locals);
  const repartoId = Number(params.id);
  if (!Number.isInteger(repartoId) || repartoId <= 0) {
    throw error(400, 'Reparto no válido');
  }

  const body = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    throw error(400, 'Formato de lista no válido');
  }

  const db = getDb();
  const sqlite = getSqlite();

  const rep = db.select().from(repartos).where(eq(repartos.id, repartoId)).get();
  if (!rep) throw error(404, 'Reparto no encontrado');

  if (rep.estado !== 'ListasAbiertas' && rep.estado !== 'Ventana') {
    throw error(
      409,
      'La lista solo puede editarse con las listas abiertas o durante una ventana de ajuste.'
    );
  }

  const part = db
    .select()
    .from(participantes)
    .where(and(eq(participantes.repartoId, repartoId), eq(participantes.profesorId, user.id)))
    .get();

  if (!part || part.esVacante) {
    throw error(403, 'No participas en este reparto.');
  }

  if (rep.restringirPorTurno && !part.turno) {
    throw error(400, 'Elige primero tu turno antes de añadir asignaturas a tu lista.');
  }

  const allGrupos = db.select().from(grupos).where(eq(grupos.repartoId, repartoId)).all();
  const allAsigs = db
    .select()
    .from(asignaciones)
    .where(eq(asignaciones.repartoId, repartoId))
    .all();
  const profEsps = db
    .select({ especialidadId: profesorEspecialidades.especialidadId })
    .from(profesorEspecialidades)
    .where(eq(profesorEspecialidades.profesorId, user.id))
    .all()
    .map((x) => x.especialidadId);

  const grpEsps = db.select().from(grupoEspecialidades).all();
  const grpEspMap = new Map<number, number[]>();
  for (const ge of grpEsps) {
    const arr = grpEspMap.get(ge.grupoId) ?? [];
    arr.push(ge.especialidadId);
    grpEspMap.set(ge.grupoId, arr);
  }

  const excs = db
    .select()
    .from(excepcionesElegibilidad)
    .where(eq(excepcionesElegibilidad.participanteId, part.id))
    .all();

  const partMotor = {
    id: part.id,
    orden: part.orden,
    horasACubrir: part.horasACubrir,
    esVacante: part.esVacante,
    especialidadesIds: profEsps,
    pendienteDeCuadrar: part.pendienteDeCuadrar,
    turno: part.turno ?? null
  };

  const asigsMotor = allAsigs.map((a) => ({
    grupoId: a.grupoId,
    participanteId: a.participanteId,
    origen: a.origen,
    numeroRonda: a.numeroRonda
  }));

  const grupoMap = new Map(
    allGrupos.map((g) => [
      g.id,
      {
        id: g.id,
        horasSemanales: g.horasSemanales,
        tipo: g.tipo,
        especialidadesIds: grpEspMap.get(g.id) ?? [],
        turno: g.turno
      }
    ])
  );

  const uniqueIds = Array.from(new Set(parsed.data.grupoIds));
  const validIds = uniqueIds.filter((gid) => {
    const g = grupoMap.get(gid);
    if (!g) return false;
    return esDisponible(g, asigsMotor) && esElegible(g, partMotor, excs, rep.restringirPorTurno);
  });

  const nowIso = new Date().toISOString();

  sqlite.transaction(() => {
    let lista = db.select().from(listas).where(eq(listas.participanteId, part.id)).get();
    if (!lista) {
      lista = db
        .insert(listas)
        .values({ participanteId: part.id, actualizadaEn: nowIso })
        .returning()
        .get();
    } else {
      db.update(listas).set({ actualizadaEn: nowIso }).where(eq(listas.id, lista.id)).run();
    }

    db.delete(itemsLista).where(eq(itemsLista.listaId, lista.id)).run();

    validIds.forEach((gid, idx) => {
      db.insert(itemsLista)
        .values({ listaId: lista.id, grupoId: gid, posicion: idx + 1 })
        .run();
    });

    // Auditoría: si el jefe modifica su propia lista en ventana, agrupar ráfagas de <60 s en la misma ronda
    if (rep.estado === 'Ventana' && rep.jefeId === user.id) {
      const ultimoAjuste = db
        .select()
        .from(eventos)
        .where(
          and(
            eq(eventos.repartoId, repartoId),
            eq(eventos.tipo, 'AJUSTE_LISTA_JEFE'),
            eq(eventos.actorId, user.id)
          )
        )
        .orderBy(desc(eventos.id))
        .get();

      let registrarNuevo = true;
      if (ultimoAjuste) {
        const prevMs = new Date(
          ultimoAjuste.creadoEn.includes('T')
            ? ultimoAjuste.creadoEn
            : ultimoAjuste.creadoEn.replace(' ', 'T') + 'Z'
        ).getTime();
        const prevData = JSON.parse(ultimoAjuste.datosJson) as { rondaActual?: number };
        if (prevData.rondaActual === rep.rondaActual && Date.now() - prevMs < 60_000) {
          registrarNuevo = false;
        }
      }

      if (registrarNuevo) {
        db.insert(eventos)
          .values({
            repartoId,
            tipo: 'AJUSTE_LISTA_JEFE',
            datosJson: JSON.stringify({
              rondaActual: rep.rondaActual,
              participanteId: part.id
            }),
            actorId: user.id
          })
          .run();
      }
    }
  })();

  return json({ ok: true, actualizadaEn: nowIso, grupoIds: validIds });
};
