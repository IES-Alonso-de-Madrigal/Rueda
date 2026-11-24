import { fail } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { requireJefeOrJefatura } from '$lib/server/auth/guards';
import { emitAcceso } from '$lib/server/auth';
import { getDb, getSqlite } from '$lib/server/db';
import {
  cursosAcademicos,
  eventos,
  grupoEspecialidades,
  grupos,
  itemsLista,
  listas,
  participantes,
  profesorEspecialidades,
  profesores,
  repartos
} from '$lib/server/db/schema';
import { enviarCorreoAcceso, isMailConfigured } from '$lib/server/mail';
import { publishRepartoUpdate } from '$lib/server/sse';
import type { EstadoMotor, FotoListas } from '$lib/motor';

export const load: PageServerLoad = async ({ locals, params }) => {
  const repartoId = Number(params.id);
  requireJefeOrJefatura(locals, repartoId);
  const db = getDb();

  const parts = db
    .select({
      id: participantes.id,
      profesorId: participantes.profesorId,
      orden: participantes.orden,
      horasACubrir: participantes.horasACubrir,
      esVacante: participantes.esVacante,
      nombre: profesores.nombre,
      apellidos: profesores.apellidos,
      email: profesores.email
    })
    .from(participantes)
    .innerJoin(profesores, eq(participantes.profesorId, profesores.id))
    .where(eq(participantes.repartoId, repartoId))
    .orderBy(asc(participantes.orden))
    .all();

  const allListas = db.select().from(listas).all();
  const listaByPart = new Map(allListas.map((l) => [l.participanteId, l]));

  const allItems = db.select().from(itemsLista).all();
  const countByLista = new Map<number, number>();
  for (const it of allItems) {
    countByLista.set(it.listaId, (countByLista.get(it.listaId) ?? 0) + 1);
  }

  return {
    participantes: parts.map((p) => {
      const l = listaByPart.get(p.id);
      return {
        ...p,
        numGruposEnLista: l ? (countByLista.get(l.id) ?? 0) : 0,
        actualizadaEn: l?.actualizadaEn ?? null
      };
    }),
    smtpConfigurado: isMailConfigured()
  };
};

export const actions: Actions = {
  abrirListas: async ({ locals, params }) => {
    const repartoId = Number(params.id);
    const user = requireJefeOrJefatura(locals, repartoId);
    const db = getDb();

    const rep = db.select().from(repartos).where(eq(repartos.id, repartoId)).get();
    if (!rep || rep.estado !== 'Borrador') {
      return fail(400, { error: 'Solo se pueden abrir listas desde En preparación.' });
    }

    const nuevaVersion = rep.version + 1;
    db.update(repartos)
      .set({ estado: 'ListasAbiertas', version: nuevaVersion })
      .where(eq(repartos.id, repartoId))
      .run();

    db.insert(eventos)
      .values({
        repartoId,
        tipo: 'LISTAS_ABIERTAS',
        datosJson: JSON.stringify({ tipo: 'LISTAS_ABIERTAS' }),
        actorId: user.id
      })
      .run();

    publishRepartoUpdate(repartoId, nuevaVersion, 'LISTAS_ABIERTAS');
    return { ok: 'Listas abiertas. Los profesores ya pueden ordenar sus preferencias.' };
  },

  cerrarListas: async ({ locals, params }) => {
    const repartoId = Number(params.id);
    const user = requireJefeOrJefatura(locals, repartoId);
    const db = getDb();
    const sqlite = getSqlite();

    const rep = db.select().from(repartos).where(eq(repartos.id, repartoId)).get();
    if (!rep || rep.estado !== 'ListasAbiertas') {
      return fail(400, { error: 'Las listas no están abiertas.' });
    }

    const parts = db
      .select()
      .from(participantes)
      .where(eq(participantes.repartoId, repartoId))
      .orderBy(asc(participantes.orden))
      .all();

    const grps = db.select().from(grupos).where(eq(grupos.repartoId, repartoId)).all();
    const profEsps = db.select().from(profesorEspecialidades).all();
    const grpEsps = db.select().from(grupoEspecialidades).all();

    const profEspMap = new Map<number, number[]>();
    for (const pe of profEsps) {
      const arr = profEspMap.get(pe.profesorId) ?? [];
      arr.push(pe.especialidadId);
      profEspMap.set(pe.profesorId, arr);
    }

    const grpEspMap = new Map<number, number[]>();
    for (const ge of grpEsps) {
      const arr = grpEspMap.get(ge.grupoId) ?? [];
      arr.push(ge.especialidadId);
      grpEspMap.set(ge.grupoId, arr);
    }

    const fotoListas: FotoListas = {};
    for (const p of parts) {
      const lista = db.select().from(listas).where(eq(listas.participanteId, p.id)).get();
      if (!lista) {
        fotoListas[p.id] = [];
      } else {
        const items = db
          .select()
          .from(itemsLista)
          .where(eq(itemsLista.listaId, lista.id))
          .orderBy(asc(itemsLista.posicion))
          .all();
        fotoListas[p.id] = items.map((i) => i.grupoId);
      }
    }

    const estadoInicial: EstadoMotor = {
      fase: 'ListasCerradas',
      rondaActual: 0,
      restringirPorTurno: rep.restringirPorTurno,
      participantes: parts.map((p) => ({
        id: p.id,
        orden: p.orden,
        horasACubrir: p.horasACubrir,
        esVacante: p.esVacante,
        especialidadesIds: profEspMap.get(p.profesorId) ?? [],
        pendienteDeCuadrar: false,
        turno: p.turno ?? null
      })),
      grupos: grps.map((g) => ({
        id: g.id,
        horasSemanales: g.horasSemanales,
        tipo: g.tipo,
        especialidadesIds: grpEspMap.get(g.id) ?? [],
        turno: g.turno
      })),
      excepciones: [],
      asignaciones: [],
      bloqueo: null,
      historialManual: [],
      historialRondas: []
    };

    const fotoInicialJson = JSON.stringify({ estadoInicial, fotoListas });
    const nuevaVersion = rep.version + 1;

    sqlite.transaction(() => {
      db.update(repartos)
        .set({
          estado: 'ListasCerradas',
          version: nuevaVersion,
          fotoInicialJson,
          iniciadoEn: rep.iniciadoEn ?? new Date().toISOString()
        })
        .where(eq(repartos.id, repartoId))
        .run();

      db.insert(eventos)
        .values({
          repartoId,
          tipo: 'LISTAS_CERRADAS',
          datosJson: JSON.stringify({ tipo: 'LISTAS_CERRADAS', fotoListas }),
          actorId: user.id
        })
        .run();
    })();

    publishRepartoUpdate(repartoId, nuevaVersion, 'LISTAS_CERRADAS');
    return {
      ok: 'Listas cerradas y foto tomada. Ya puedes lanzar la primera ronda en la Sala del reparto.'
    };
  },

  verLista: async ({ locals, params, request }) => {
    const repartoId = Number(params.id);
    const user = requireJefeOrJefatura(locals, repartoId);
    const fd = await request.formData();
    const participanteId = Number(fd.get('participanteId'));

    const db = getDb();
    const part = db
      .select({
        id: participantes.id,
        profesorId: participantes.profesorId,
        nombre: profesores.nombre,
        apellidos: profesores.apellidos
      })
      .from(participantes)
      .innerJoin(profesores, eq(participantes.profesorId, profesores.id))
      .where(and(eq(participantes.id, participanteId), eq(participantes.repartoId, repartoId)))
      .get();

    if (!part) return fail(404, { error: 'Participante no encontrado en este reparto.' });

    if (part.profesorId !== user.id) {
      db.insert(eventos)
        .values({
          repartoId,
          tipo: 'CONSULTA_LISTA_AJENA',
          datosJson: JSON.stringify({
            participanteId: part.id,
            profesorNombre: `${part.apellidos}, ${part.nombre}`
          }),
          actorId: user.id
        })
        .run();
    }

    const lista = db.select().from(listas).where(eq(listas.participanteId, participanteId)).get();
    const items = lista
      ? db
          .select({
            posicion: itemsLista.posicion,
            materia: grupos.materia,
            curso: grupos.curso,
            nombreGrupo: grupos.nombreGrupo,
            turno: grupos.turno,
            horasSemanales: grupos.horasSemanales
          })
          .from(itemsLista)
          .innerJoin(grupos, eq(itemsLista.grupoId, grupos.id))
          .where(eq(itemsLista.listaId, lista.id))
          .orderBy(asc(itemsLista.posicion))
          .all()
      : [];

    return {
      listaConsultada: {
        profesorNombre: `${part.apellidos}, ${part.nombre}`,
        esPropia: part.profesorId === user.id,
        items
      }
    };
  },

  emitirAcceso: async ({ locals, params, request }) => {
    const repartoId = Number(params.id);
    requireJefeOrJefatura(locals, repartoId);
    const fd = await request.formData();
    const profesorId = Number(fd.get('profesorId'));
    const enviarEmail = fd.get('enviarEmail') === 'true';

    const db = getDb();
    const rep = db
      .select({ cursoId: repartos.cursoId, cursoNombre: cursosAcademicos.nombre })
      .from(repartos)
      .innerJoin(cursosAcademicos, eq(repartos.cursoId, cursosAcademicos.id))
      .where(eq(repartos.id, repartoId))
      .get();
    const prof = db.select().from(profesores).where(eq(profesores.id, profesorId)).get();
    if (!rep || !prof) return fail(404, { error: 'Profesor no encontrado' });

    const acceso = emitAcceso({ profesorId: prof.id, cursoId: rep.cursoId });
    let mailMsg = '';
    if (enviarEmail && isMailConfigured()) {
      try {
        await enviarCorreoAcceso({
          to: prof.email,
          nombre: prof.nombre,
          enlace: acceso.enlace,
          codigoCorto: acceso.codigoCorto,
          cursoNombre: rep.cursoNombre
        });
        mailMsg = ' y enviado por correo';
      } catch (err) {
        mailMsg = ` (error correo: ${err instanceof Error ? err.message : 'desconocido'})`;
      }
    }

    return {
      ok: `Acceso generado para ${prof.nombre} ${prof.apellidos}${mailMsg}.`,
      accesosEmitidos: [
        {
          profesor: `${prof.apellidos}, ${prof.nombre}`,
          email: prof.email,
          enlace: acceso.enlace,
          codigoCorto: acceso.codigoCorto
        }
      ]
    };
  },

  emitirAccesosTodos: async ({ locals, params, request }) => {
    const repartoId = Number(params.id);
    requireJefeOrJefatura(locals, repartoId);
    const fd = await request.formData();
    const enviarEmail = fd.get('enviarEmail') === 'true' && isMailConfigured();

    const db = getDb();
    const rep = db
      .select({ cursoId: repartos.cursoId, cursoNombre: cursosAcademicos.nombre })
      .from(repartos)
      .innerJoin(cursosAcademicos, eq(repartos.cursoId, cursosAcademicos.id))
      .where(eq(repartos.id, repartoId))
      .get();
    if (!rep) return fail(404, { error: 'Reparto no encontrado' });

    const parts = db
      .select({
        profesorId: profesores.id,
        nombre: profesores.nombre,
        apellidos: profesores.apellidos,
        email: profesores.email,
        esVacante: participantes.esVacante
      })
      .from(participantes)
      .innerJoin(profesores, eq(participantes.profesorId, profesores.id))
      .where(eq(participantes.repartoId, repartoId))
      .orderBy(asc(participantes.orden))
      .all()
      .filter((p) => !p.esVacante);

    if (parts.length === 0) return fail(400, { error: 'No hay participantes no vacantes.' });

    const accesosEmitidos: Array<{
      profesor: string;
      email: string;
      enlace: string;
      codigoCorto: string;
    }> = [];
    let enviados = 0;

    for (const p of parts) {
      const acceso = emitAcceso({ profesorId: p.profesorId, cursoId: rep.cursoId });
      accesosEmitidos.push({
        profesor: `${p.apellidos}, ${p.nombre}`,
        email: p.email,
        enlace: acceso.enlace,
        codigoCorto: acceso.codigoCorto
      });
      if (enviarEmail) {
        try {
          await enviarCorreoAcceso({
            to: p.email,
            nombre: p.nombre,
            enlace: acceso.enlace,
            codigoCorto: acceso.codigoCorto,
            cursoNombre: rep.cursoNombre
          });
          enviados++;
        } catch {
          // Seguir con el resto
        }
      }
    }

    return {
      ok: enviarEmail
        ? `Invitaciones generadas para ${accesosEmitidos.length} profesores (${enviados} correos enviados).`
        : `Enlaces y códigos cortos generados para ${accesosEmitidos.length} profesores.`,
      accesosEmitidos
    };
  }
};
