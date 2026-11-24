import type {
  AsignacionMotor,
  EstadoMotor,
  ExcepcionMotor,
  GrupoMotor,
  ParticipanteMotor
} from './types';

export function normalizarTurno(turno: string | null | undefined): string {
  if (!turno) return '';
  return turno
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function cumpleTurno(
  grupo: Pick<GrupoMotor, 'turno'>,
  participante: Pick<ParticipanteMotor, 'turno'>,
  restringirPorTurno = false
): boolean {
  if (!restringirPorTurno) return true;
  const turnoPart = normalizarTurno(participante.turno);
  if (!turnoPart) return true;
  const turnoGrupo = normalizarTurno(grupo.turno);
  if (!turnoGrupo) return true;
  return turnoPart === turnoGrupo;
}

export function horasCubiertas(estado: EstadoMotor, participanteId: number): number {
  const grupoById = new Map(estado.grupos.map((g) => [g.id, g]));
  let total = 0;
  for (const a of estado.asignaciones) {
    if (a.participanteId === participanteId) {
      total += grupoById.get(a.grupoId)?.horasSemanales ?? 0;
    }
  }
  return total;
}

export function horasRestantes(estado: EstadoMotor, participanteId: number): number {
  const p = estado.participantes.find((x) => x.id === participanteId);
  if (!p) return 0;
  return p.horasACubrir - horasCubiertas(estado, participanteId);
}

/** Desviación respecto a horas a cubrir: +1 si supera en 1h, -1 si le falta 1h, 0 si cuadra. */
export function desviacionHoras(estado: EstadoMotor, participanteId: number): number {
  const p = estado.participantes.find((x) => x.id === participanteId);
  if (!p) return 0;
  return horasCubiertas(estado, participanteId) - p.horasACubrir;
}

/**
 * Un grupo es elegible si:
 * - Existe una ExcepcionElegibilidad para (participante, grupo), o bien
 * - Cumple la restricción de turno (si está activada en el reparto) Y
 *   el grupo no tiene especialidades asignadas o comparte al menos una con el participante.
 */
export function esElegible(
  grupo: GrupoMotor,
  participante: ParticipanteMotor,
  excepciones: ExcepcionMotor[],
  restringirPorTurno = false
): boolean {
  const tieneExcepcion = excepciones.some(
    (ex) => ex.participanteId === participante.id && ex.grupoId === grupo.id
  );
  if (tieneExcepcion) return true;

  if (!cumpleTurno(grupo, participante, restringirPorTurno)) {
    return false;
  }

  if (grupo.especialidadesIds.length === 0) return true;

  for (const espId of grupo.especialidadesIds) {
    if (participante.especialidadesIds.includes(espId)) {
      return true;
    }
  }

  return false;
}

export function esGrupoAsignado(grupoId: number, asignaciones: AsignacionMotor[]): boolean {
  return asignaciones.some((a) => a.grupoId === grupoId);
}

/** Disponible para rondas automáticas: tipo === 'normal' y sin asignación vigente. */
export function esDisponible(grupo: GrupoMotor, asignaciones: AsignacionMotor[]): boolean {
  return grupo.tipo === 'normal' && !esGrupoAsignado(grupo.id, asignaciones);
}

export function quedanGruposDisponibles(estado: EstadoMotor): boolean {
  return estado.grupos.some((g) => esDisponible(g, estado.asignaciones));
}

export function esParticipanteActivo(
  participante: ParticipanteMotor,
  estado: EstadoMotor
): boolean {
  if (participante.esVacante) return false;
  if (participante.pendienteDeCuadrar) return false;
  return horasRestantes(estado, participante.id) > 0;
}

export function quedanParticipantesActivos(estado: EstadoMotor): boolean {
  return estado.participantes.some((p) => esParticipanteActivo(p, estado));
}

export function opcionesValidasEnDirecto(
  estado: EstadoMotor,
  participanteId: number
): GrupoMotor[] {
  const participante = estado.participantes.find((p) => p.id === participanteId);
  if (!participante || participante.esVacante) return [];

  const restantes = horasRestantes(estado, participanteId);
  if (restantes <= 0) return [];

  const restringir = Boolean(estado.restringirPorTurno);

  return estado.grupos.filter(
    (g) =>
      esDisponible(g, estado.asignaciones) &&
      esElegible(g, participante, estado.excepciones, restringir) &&
      g.horasSemanales <= restantes
  );
}
