import {
  esDisponible,
  esElegible,
  esParticipanteActivo,
  horasRestantes,
  quedanGruposDisponibles,
  quedanParticipantesActivos
} from './reglas';
import type { AsignacionMotor, EstadoMotor, FotoListas, ResultadoRonda } from './types';

export function clonarEstado(estado: EstadoMotor): EstadoMotor {
  return {
    fase: estado.fase,
    rondaActual: estado.rondaActual,
    restringirPorTurno: Boolean(estado.restringirPorTurno),
    participantes: estado.participantes.map((p) => ({
      ...p,
      especialidadesIds: [...p.especialidadesIds]
    })),
    grupos: estado.grupos.map((g) => ({
      ...g,
      especialidadesIds: [...g.especialidadesIds]
    })),
    excepciones: estado.excepciones.map((e) => ({ ...e })),
    asignaciones: estado.asignaciones.map((a) => ({ ...a })),
    bloqueo: estado.bloqueo ? { ...estado.bloqueo } : null,
    historialManual: estado.historialManual.map((h) => ({
      tipo: h.tipo,
      asignacionesPrevias: h.asignacionesPrevias.map((ap) => ({
        grupoId: ap.grupoId,
        previa: ap.previa ? { ...ap.previa } : null
      }))
    })),
    historialRondas: estado.historialRondas.map((r) => ({
      numeroRonda: r.numeroRonda,
      gruposAsignadosIds: [...r.gruposAsignadosIds],
      pendientesMarcadosIds: [...r.pendientesMarcadosIds],
      turnosFijados: r.turnosFijados ? r.turnosFijados.map((t) => ({ ...t })) : []
    }))
  };
}

/**
 * Si un participante marcado como `pendienteDeCuadrar` añade en una ventana de ajuste
 * al menos un grupo disponible, elegible y que cabe en sus horas restantes, vuelve a `activo`.
 */
export function reactivarPendientesEnVentana(
  estado: EstadoMotor,
  fotoListas: FotoListas
): { estado: EstadoMotor; reactivadosIds: number[] } {
  const next = clonarEstado(estado);
  const restringir = Boolean(next.restringirPorTurno);
  const grupoById = new Map(next.grupos.map((g) => [g.id, g]));
  const reactivadosIds: number[] = [];

  for (const p of next.participantes) {
    if (!p.pendienteDeCuadrar || p.esVacante) continue;
    const restantes = horasRestantes(next, p.id);
    if (restantes <= 0) continue;

    const lista = fotoListas[p.id] ?? [];
    const tieneOpcionQueCabe = lista.some((gid) => {
      const g = grupoById.get(gid);
      if (!g) return false;
      return (
        esDisponible(g, next.asignaciones) &&
        esElegible(g, p, next.excepciones, restringir) &&
        g.horasSemanales <= restantes
      );
    });

    if (tieneOpcionQueCabe) {
      p.pendienteDeCuadrar = false;
      reactivadosIds.push(p.id);
    }
  }

  return { estado: next, reactivadosIds };
}

/**
 * Ejecuta una ronda (o la reanuda desde `desdeIndice` tras resolver un bloqueo).
 * Función pura y determinista: no muta el estado de entrada.
 */
export function ejecutarRonda(
  estadoEntrada: EstadoMotor,
  fotoListas: FotoListas,
  desdeIndice = 0
): ResultadoRonda {
  const estado = clonarEstado(estadoEntrada);
  estado.participantes.sort((a, b) => a.orden - b.orden);

  const restringir = Boolean(estado.restringirPorTurno);
  const esReanudacion = desdeIndice > 0;
  const numeroRonda = esReanudacion ? estado.rondaActual : estado.rondaActual + 1;
  estado.rondaActual = numeroRonda;
  estado.bloqueo = null;

  const grupoById = new Map(estado.grupos.map((g) => [g.id, g]));
  const nuevasAsignaciones: AsignacionMotor[] = [];
  const pendientesMarcadosIds: number[] = [];
  const turnosFijados: Array<{ participanteId: number; turnoPrevio: string | null }> = [];

  const registrarEnHistorialRonda = () => {
    const existente = estado.historialRondas.find((r) => r.numeroRonda === numeroRonda);
    if (existente) {
      existente.gruposAsignadosIds.push(...nuevasAsignaciones.map((a) => a.grupoId));
      existente.pendientesMarcadosIds.push(...pendientesMarcadosIds);
      existente.turnosFijados = [...(existente.turnosFijados ?? []), ...turnosFijados];
    } else {
      estado.historialRondas.push({
        numeroRonda,
        gruposAsignadosIds: nuevasAsignaciones.map((a) => a.grupoId),
        pendientesMarcadosIds: [...pendientesMarcadosIds],
        turnosFijados: [...turnosFijados]
      });
    }
  };

  for (let i = desdeIndice; i < estado.participantes.length; i++) {
    const p = estado.participantes[i];
    if (!esParticipanteActivo(p, estado)) continue;

    if (!quedanGruposDisponibles(estado)) {
      estado.fase = 'FaseManual';
      registrarEnHistorialRonda();
      return {
        tipo: 'FIN_AUTOMATICO',
        numeroRonda,
        motivo: 'sin_grupos',
        nuevasAsignaciones,
        pendientesMarcadosIds,
        estado
      };
    }

    const restantes = horasRestantes(estado, p.id);
    const lista = fotoListas[p.id] ?? [];

    const disponiblesYElegibles = lista
      .map((gid) => grupoById.get(gid))
      .filter(
        (g): g is NonNullable<typeof g> =>
          g != null &&
          esDisponible(g, estado.asignaciones) &&
          esElegible(g, p, estado.excepciones, restringir)
      );

    const opcionesValidas = disponiblesYElegibles.filter((g) => g.horasSemanales <= restantes);

    if (opcionesValidas.length > 0) {
      const elegido = opcionesValidas[0];
      const asignacion: AsignacionMotor = {
        grupoId: elegido.id,
        participanteId: p.id,
        origen: 'ronda',
        numeroRonda
      };
      estado.asignaciones.push(asignacion);
      nuevasAsignaciones.push(asignacion);

      // Si el reparto restringe por turno y el participante aún no tenía turno fijado,
      // queda vinculado al turno de su primera elección para el resto de rondas.
      if (restringir && !p.turno && elegido.turno?.trim()) {
        turnosFijados.push({ participanteId: p.id, turnoPrevio: p.turno ?? null });
        p.turno = elegido.turno;
      }
    } else if (disponiblesYElegibles.length > 0) {
      p.pendienteDeCuadrar = true;
      pendientesMarcadosIds.push(p.id);
    } else {
      estado.fase = 'Bloqueo';
      estado.bloqueo = {
        participanteId: p.id,
        indiceSiguiente: i + 1,
        numeroRonda
      };
      registrarEnHistorialRonda();
      return {
        tipo: 'BLOQUEO',
        numeroRonda,
        participanteId: p.id,
        indiceSiguiente: i + 1,
        nuevasAsignaciones,
        pendientesMarcadosIds,
        estado
      };
    }
  }

  registrarEnHistorialRonda();

  if (!quedanGruposDisponibles(estado)) {
    estado.fase = 'FaseManual';
    return {
      tipo: 'FIN_AUTOMATICO',
      numeroRonda,
      motivo: 'sin_grupos',
      nuevasAsignaciones,
      pendientesMarcadosIds,
      estado
    };
  }

  if (!quedanParticipantesActivos(estado)) {
    estado.fase = 'FaseManual';
    return {
      tipo: 'FIN_AUTOMATICO',
      numeroRonda,
      motivo: 'sin_activos',
      nuevasAsignaciones,
      pendientesMarcadosIds,
      estado
    };
  }

  estado.fase = 'Ventana';
  return {
    tipo: 'RONDA_COMPLETADA',
    numeroRonda,
    nuevasAsignaciones,
    pendientesMarcadosIds,
    estado
  };
}
