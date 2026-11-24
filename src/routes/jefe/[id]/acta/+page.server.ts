import { fail } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { requireJefeOrJefatura } from '$lib/server/auth/guards';
import { getDb } from '$lib/server/db';
import {
  asignaciones,
  excepcionesElegibilidad,
  grupoEspecialidades,
  grupos,
  participantes,
  profesorEspecialidades,
  profesores,
  repartos
} from '$lib/server/db/schema';
import { esElegible } from '$lib/motor';
import { aplicarEventosYPersistir } from '$lib/server/reparto-service';

export const load: PageServerLoad = async ({ locals, params }) => {
  const repartoId = Number(params.id);
  requireJefeOrJefatura(locals, repartoId);
  const db = getDb();

  const rep = db.select().from(repartos).where(eq(repartos.id, repartoId)).get()!;
  const parts = db
    .select({
      id: participantes.id,
      profesorId: participantes.profesorId,
      orden: participantes.orden,
      horasACubrir: participantes.horasACubrir,
      esVacante: participantes.esVacante,
      turno: participantes.turno,
      nombre: profesores.nombre,
      apellidos: profesores.apellidos
    })
    .from(participantes)
    .innerJoin(profesores, eq(participantes.profesorId, profesores.id))
    .where(eq(participantes.repartoId, repartoId))
    .orderBy(asc(participantes.orden))
    .all();

  const allGrupos = db.select().from(grupos).where(eq(grupos.repartoId, repartoId)).all();
  const grupoById = new Map(allGrupos.map((g) => [g.id, g]));
  const allAsigs = db
    .select()
    .from(asignaciones)
    .where(eq(asignaciones.repartoId, repartoId))
    .all();
  const asigGrupoIds = new Set(allAsigs.map((a) => a.grupoId));

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

  const excs = db
    .select()
    .from(excepcionesElegibilidad)
    .where(eq(excepcionesElegibilidad.repartoId, repartoId))
    .all();

  const gruposSinAsignar = allGrupos.filter(
    (g) => g.tipo !== 'fuera_del_reparto' && !asigGrupoIds.has(g.id)
  );

  const desviaciones: Array<{ nombre: string; cubiertas: number; objetivo: number; diff: number }> =
    [];
  const sinExcepcion: Array<{ profesor: string; grupo: string }> = [];

  for (const p of parts) {
    const suyas = allAsigs.filter((a) => a.participanteId === p.id);
    const cubiertas = suyas.reduce(
      (s, a) => s + (grupoById.get(a.grupoId)?.horasSemanales ?? 0),
      0
    );
    const diff = cubiertas - p.horasACubrir;
    if (!p.esVacante && diff !== 0) {
      desviaciones.push({
        nombre: `${p.apellidos}, ${p.nombre}`,
        cubiertas,
        objetivo: p.horasACubrir,
        diff
      });
    }

    const partMotor = {
      id: p.id,
      orden: p.orden,
      horasACubrir: p.horasACubrir,
      esVacante: p.esVacante,
      especialidadesIds: profEspMap.get(p.profesorId) ?? [],
      pendienteDeCuadrar: false,
      turno: p.turno ?? null
    };

    for (const a of suyas) {
      const g = grupoById.get(a.grupoId);
      if (!g) continue;
      const ok = esElegible(
        {
          id: g.id,
          horasSemanales: g.horasSemanales,
          tipo: g.tipo,
          especialidadesIds: grpEspMap.get(g.id) ?? [],
          turno: g.turno
        },
        partMotor,
        excs,
        rep.restringirPorTurno
      );
      if (!ok) {
        sinExcepcion.push({
          profesor: `${p.apellidos}, ${p.nombre}`,
          grupo: `${g.materia} (${g.curso} ${g.nombreGrupo})`
        });
      }
    }
  }

  const asistentesGuardados: string[] = rep.asistentesJson
    ? (JSON.parse(rep.asistentesJson) as string[])
    : parts.filter((p) => !p.esVacante).map((p) => `${p.apellidos}, ${p.nombre}`);

  return {
    participantes: parts,
    gruposSinAsignar,
    desviaciones,
    sinExcepcion,
    asistentesGuardados,
    justificacionCierre: rep.justificacionCierre ?? '',
    cerradoEn: rep.cerradoEn
  };
};

export const actions: Actions = {
  cerrar: async ({ locals, params, request }) => {
    const repartoId = Number(params.id);
    const user = requireJefeOrJefatura(locals, repartoId);
    const db = getDb();

    const rep = db.select().from(repartos).where(eq(repartos.id, repartoId)).get();
    if (!rep || rep.estado !== 'FaseManual') {
      return fail(400, { error: 'Solo se puede cerrar un reparto que esté en Fase manual.' });
    }

    const fd = await request.formData();
    const justificacion = fd.get('justificacion')?.toString().trim() ?? '';
    const asistentes = fd
      .getAll('asistentes')
      .map((v) => v.toString().trim())
      .filter(Boolean);

    // Comprobar grupos sin asignar
    const allGrupos = db.select().from(grupos).where(eq(grupos.repartoId, repartoId)).all();
    const allAsigs = db
      .select()
      .from(asignaciones)
      .where(eq(asignaciones.repartoId, repartoId))
      .all();
    const asigGrupoIds = new Set(allAsigs.map((a) => a.grupoId));
    const libres = allGrupos.filter(
      (g) => g.tipo !== 'fuera_del_reparto' && !asigGrupoIds.has(g.id)
    );

    if (libres.length > 0 && justificacion.length < 5) {
      return fail(400, {
        error: 'Quedan grupos sin asignar: escribe una justificación para el acta antes de cerrar.'
      });
    }

    // Comprobar excepciones de especialidad sin motivo
    const parts = db
      .select()
      .from(participantes)
      .where(eq(participantes.repartoId, repartoId))
      .all();
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
    const excs = db
      .select()
      .from(excepcionesElegibilidad)
      .where(eq(excepcionesElegibilidad.repartoId, repartoId))
      .all();

    const grupoById = new Map(allGrupos.map((g) => [g.id, g]));
    for (const a of allAsigs) {
      const p = parts.find((x) => x.id === a.participanteId);
      const g = grupoById.get(a.grupoId);
      if (!p || !g) continue;
      const elegible = esElegible(
        {
          id: g.id,
          horasSemanales: g.horasSemanales,
          tipo: g.tipo,
          especialidadesIds: grpEspMap.get(g.id) ?? [],
          turno: g.turno
        },
        {
          id: p.id,
          orden: p.orden,
          horasACubrir: p.horasACubrir,
          esVacante: p.esVacante,
          especialidadesIds: profEspMap.get(p.profesorId) ?? [],
          pendienteDeCuadrar: false,
          turno: p.turno ?? null
        },
        excs,
        rep.restringirPorTurno
      );
      if (!elegible) {
        return fail(400, {
          error:
            'Hay asignaciones fuera de especialidad o de turno sin motivo registrado. Justifícalas en la Fase manual antes de cerrar.'
        });
      }
    }

    aplicarEventosYPersistir({
      repartoId,
      actorId: user.id,
      eventosNuevos: [{ tipo: 'REPARTO_CERRADO', justificacion: justificacion || undefined }],
      justificacionCierre: justificacion || null,
      asistentes
    });

    return { ok: 'Reparto cerrado en solo lectura. Copia de seguridad creada y acta disponible.' };
  }
};
