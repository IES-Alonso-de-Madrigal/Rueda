import { clonarEstado, ejecutarRonda, reactivarPendientesEnVentana } from './ronda';
import { esDisponible, esElegible, horasRestantes } from './reglas';
import type { AsignacionMotor, EstadoMotor, EventoMotor } from './types';

function setAsignacion(
  asignaciones: AsignacionMotor[],
  grupoId: number,
  nueva: AsignacionMotor | null
): AsignacionMotor[] {
  const sinGrupo = asignaciones.filter((a) => a.grupoId !== grupoId);
  return nueva ? [...sinGrupo, nueva] : sinGrupo;
}

export function aplicarEvento(estadoEntrada: EstadoMotor, evento: EventoMotor): EstadoMotor {
  switch (evento.tipo) {
    case 'RONDA_EJECUTADA': {
      const res = ejecutarRonda(estadoEntrada, evento.fotoListas, evento.desdeIndice);
      return res.estado;
    }

    case 'VENTANA_CERRADA': {
      const { estado } = reactivarPendientesEnVentana(estadoEntrada, evento.fotoListas);
      return estado;
    }

    case 'BLOQUEO_RESUELTO_ELECCION': {
      const estado = clonarEstado(estadoEntrada);
      if (!estado.bloqueo || estado.bloqueo.participanteId !== evento.participanteId) {
        throw new Error('No hay un bloqueo activo para este participante');
      }

      const participante = estado.participantes.find((p) => p.id === evento.participanteId);
      const grupo = estado.grupos.find((g) => g.id === evento.grupoId);
      if (!participante || !grupo) {
        throw new Error('Participante o grupo no encontrado');
      }
      if (!esDisponible(grupo, estado.asignaciones)) {
        throw new Error('El grupo no está disponible');
      }
      if (
        !esElegible(grupo, participante, estado.excepciones, Boolean(estado.restringirPorTurno))
      ) {
        throw new Error('El grupo no es elegible para este participante (especialidad o turno)');
      }
      if (grupo.horasSemanales > horasRestantes(estado, participante.id)) {
        throw new Error('El grupo supera las horas restantes del participante');
      }

      const numeroRonda = estado.bloqueo.numeroRonda;
      const indiceSiguiente = estado.bloqueo.indiceSiguiente;

      estado.asignaciones.push({
        grupoId: grupo.id,
        participanteId: participante.id,
        origen: 'ronda',
        numeroRonda
      });

      const registroRonda = estado.historialRondas.find((r) => r.numeroRonda === numeroRonda);
      if (registroRonda) {
        registroRonda.gruposAsignadosIds.push(grupo.id);
      } else {
        estado.historialRondas.push({
          numeroRonda,
          gruposAsignadosIds: [grupo.id],
          pendientesMarcadosIds: [],
          turnosFijados: []
        });
      }

      if (estado.restringirPorTurno && !participante.turno && grupo.turno?.trim()) {
        const reg = estado.historialRondas.find((r) => r.numeroRonda === numeroRonda);
        if (reg) {
          reg.turnosFijados = [
            ...(reg.turnosFijados ?? []),
            { participanteId: participante.id, turnoPrevio: participante.turno ?? null }
          ];
        }
        participante.turno = grupo.turno;
      }

      const res = ejecutarRonda(estado, evento.fotoListas, indiceSiguiente);
      return res.estado;
    }

    case 'BLOQUEO_RESUELTO_SALTAR': {
      const estado = clonarEstado(estadoEntrada);
      if (!estado.bloqueo || estado.bloqueo.participanteId !== evento.participanteId) {
        throw new Error('No hay un bloqueo activo para este participante');
      }

      const participante = estado.participantes.find((p) => p.id === evento.participanteId);
      if (!participante) throw new Error('Participante no encontrado');

      const numeroRonda = estado.bloqueo.numeroRonda;
      const indiceSiguiente = estado.bloqueo.indiceSiguiente;
      participante.pendienteDeCuadrar = true;

      const registroRonda = estado.historialRondas.find((r) => r.numeroRonda === numeroRonda);
      if (registroRonda) {
        registroRonda.pendientesMarcadosIds.push(participante.id);
      }

      const res = ejecutarRonda(estado, evento.fotoListas, indiceSiguiente);
      return res.estado;
    }

    case 'PASE_A_MANUAL': {
      const estado = clonarEstado(estadoEntrada);
      estado.fase = 'FaseManual';
      estado.bloqueo = null;
      return estado;
    }

    case 'MANUAL_ASIGNAR': {
      const estado = clonarEstado(estadoEntrada);
      const previa = estado.asignaciones.find((a) => a.grupoId === evento.grupoId) ?? null;
      estado.historialManual.push({
        tipo: 'MANUAL_ASIGNAR',
        asignacionesPrevias: [{ grupoId: evento.grupoId, previa: previa ? { ...previa } : null }]
      });
      estado.asignaciones = setAsignacion(estado.asignaciones, evento.grupoId, {
        grupoId: evento.grupoId,
        participanteId: evento.participanteId,
        origen: 'manual',
        numeroRonda: null,
        nota: evento.nota
      });
      return estado;
    }

    case 'MANUAL_MOVER': {
      const estado = clonarEstado(estadoEntrada);
      const previa = estado.asignaciones.find((a) => a.grupoId === evento.grupoId) ?? null;
      estado.historialManual.push({
        tipo: 'MANUAL_MOVER',
        asignacionesPrevias: [{ grupoId: evento.grupoId, previa: previa ? { ...previa } : null }]
      });
      estado.asignaciones = setAsignacion(estado.asignaciones, evento.grupoId, {
        grupoId: evento.grupoId,
        participanteId: evento.haciaParticipanteId,
        origen: 'manual',
        numeroRonda: null,
        nota: evento.nota
      });
      return estado;
    }

    case 'MANUAL_DESASIGNAR': {
      const estado = clonarEstado(estadoEntrada);
      const previa = estado.asignaciones.find((a) => a.grupoId === evento.grupoId) ?? null;
      estado.historialManual.push({
        tipo: 'MANUAL_DESASIGNAR',
        asignacionesPrevias: [{ grupoId: evento.grupoId, previa: previa ? { ...previa } : null }]
      });
      estado.asignaciones = setAsignacion(estado.asignaciones, evento.grupoId, null);
      return estado;
    }

    case 'MANUAL_TRUEQUE': {
      const estado = clonarEstado(estadoEntrada);
      const asignacionesPrevias = evento.movimientos.map((m) => {
        const previa = estado.asignaciones.find((a) => a.grupoId === m.grupoId) ?? null;
        return { grupoId: m.grupoId, previa: previa ? { ...previa } : null };
      });
      estado.historialManual.push({
        tipo: 'MANUAL_TRUEQUE',
        asignacionesPrevias
      });
      for (const m of evento.movimientos) {
        estado.asignaciones = setAsignacion(estado.asignaciones, m.grupoId, {
          grupoId: m.grupoId,
          participanteId: m.haciaParticipanteId,
          origen: 'trueque',
          numeroRonda: null,
          nota: evento.nota
        });
      }
      return estado;
    }

    case 'EXCEPCION_CREADA': {
      const estado = clonarEstado(estadoEntrada);
      const existe = estado.excepciones.some(
        (e) => e.participanteId === evento.participanteId && e.grupoId === evento.grupoId
      );
      if (!existe) {
        estado.excepciones.push({
          participanteId: evento.participanteId,
          grupoId: evento.grupoId,
          motivo: evento.motivo
        });
      }
      return estado;
    }

    case 'DESHACER_ULTIMA_ACCION': {
      const estado = clonarEstado(estadoEntrada);
      const ultima = estado.historialManual.pop();
      if (!ultima) return estado;

      for (const item of ultima.asignacionesPrevias) {
        estado.asignaciones = setAsignacion(estado.asignaciones, item.grupoId, item.previa);
      }
      return estado;
    }

    case 'DESHACER_ULTIMA_RONDA': {
      const estado = clonarEstado(estadoEntrada);
      const ultimaRonda = estado.historialRondas.pop();
      if (!ultimaRonda) return estado;

      const gruposSet = new Set(ultimaRonda.gruposAsignadosIds);
      estado.asignaciones = estado.asignaciones.filter(
        (a) =>
          !(
            a.origen === 'ronda' &&
            a.numeroRonda === ultimaRonda.numeroRonda &&
            gruposSet.has(a.grupoId)
          )
      );

      for (const pid of ultimaRonda.pendientesMarcadosIds) {
        const p = estado.participantes.find((x) => x.id === pid);
        if (p) p.pendienteDeCuadrar = false;
      }

      for (const tf of ultimaRonda.turnosFijados ?? []) {
        const p = estado.participantes.find((x) => x.id === tf.participanteId);
        if (p) p.turno = tf.turnoPrevio;
      }

      estado.rondaActual = Math.max(0, ultimaRonda.numeroRonda - 1);
      estado.bloqueo = null;
      return estado;
    }

    case 'REPARTO_CERRADO': {
      const estado = clonarEstado(estadoEntrada);
      estado.fase = 'Cerrado';
      estado.bloqueo = null;
      return estado;
    }

    case 'REPARTO_REABIERTO': {
      const estado = clonarEstado(estadoEntrada);
      estado.fase = 'FaseManual';
      return estado;
    }
  }
}

export function reconstruirEstado(
  estadoInicial: EstadoMotor,
  listaEventos: EventoMotor[]
): EstadoMotor {
  return listaEventos.reduce(aplicarEvento, clonarEstado(estadoInicial));
}
