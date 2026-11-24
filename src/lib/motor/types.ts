export type TipoGrupoMotor = 'normal' | 'relleno' | 'fuera_del_reparto';
export type OrigenAsignacionMotor = 'ronda' | 'manual' | 'trueque' | 'externo';
export type FaseMotor =
  'ListasCerradas' | 'Ronda' | 'Ventana' | 'Bloqueo' | 'FaseManual' | 'Cerrado';

export interface GrupoMotor {
  id: number;
  horasSemanales: number;
  tipo: TipoGrupoMotor;
  especialidadesIds: number[];
  turno?: string;
}

export interface ParticipanteMotor {
  id: number;
  orden: number;
  horasACubrir: number;
  esVacante: boolean;
  especialidadesIds: number[];
  pendienteDeCuadrar: boolean;
  turno?: string | null;
}

export interface ExcepcionMotor {
  participanteId: number;
  grupoId: number;
  motivo: string;
}

export interface AsignacionMotor {
  grupoId: number;
  participanteId: number;
  origen: OrigenAsignacionMotor;
  numeroRonda: number | null;
  nota?: string;
}

/** Mapa participanteId -> lista ordenada de grupoId */
export type FotoListas = Record<number, number[]>;

export interface BloqueoActivo {
  participanteId: number;
  indiceSiguiente: number;
  numeroRonda: number;
}

export interface RegistroAccionManual {
  tipo: 'MANUAL_ASIGNAR' | 'MANUAL_MOVER' | 'MANUAL_DESASIGNAR' | 'MANUAL_TRUEQUE';
  /** Estado previo de las asignaciones de los grupos afectados para deshacer exactamente */
  asignacionesPrevias: Array<{
    grupoId: number;
    previa: AsignacionMotor | null;
  }>;
}

export interface RegistroRonda {
  numeroRonda: number;
  gruposAsignadosIds: number[];
  pendientesMarcadosIds: number[];
  turnosFijados?: Array<{ participanteId: number; turnoPrevio: string | null }>;
}

export interface EstadoMotor {
  fase: FaseMotor;
  rondaActual: number;
  restringirPorTurno?: boolean;
  participantes: ParticipanteMotor[];
  grupos: GrupoMotor[];
  excepciones: ExcepcionMotor[];
  asignaciones: AsignacionMotor[];
  bloqueo: BloqueoActivo | null;
  historialManual: RegistroAccionManual[];
  historialRondas: RegistroRonda[];
}

export type MotivoFinAutomatico = 'sin_grupos' | 'sin_activos';

export type ResultadoRonda =
  | {
      tipo: 'RONDA_COMPLETADA';
      numeroRonda: number;
      nuevasAsignaciones: AsignacionMotor[];
      pendientesMarcadosIds: number[];
      estado: EstadoMotor;
    }
  | {
      tipo: 'BLOQUEO';
      numeroRonda: number;
      participanteId: number;
      indiceSiguiente: number;
      nuevasAsignaciones: AsignacionMotor[];
      pendientesMarcadosIds: number[];
      estado: EstadoMotor;
    }
  | {
      tipo: 'FIN_AUTOMATICO';
      numeroRonda: number;
      motivo: MotivoFinAutomatico;
      nuevasAsignaciones: AsignacionMotor[];
      pendientesMarcadosIds: number[];
      estado: EstadoMotor;
    };

export type EventoMotor =
  | {
      tipo: 'RONDA_EJECUTADA';
      fotoListas: FotoListas;
      desdeIndice: number;
    }
  | {
      tipo: 'VENTANA_CERRADA';
      fotoListas: FotoListas;
    }
  | {
      tipo: 'BLOQUEO_RESUELTO_ELECCION';
      participanteId: number;
      grupoId: number;
      fotoListas: FotoListas;
    }
  | {
      tipo: 'BLOQUEO_RESUELTO_SALTAR';
      participanteId: number;
      fotoListas: FotoListas;
    }
  | {
      tipo: 'PASE_A_MANUAL';
      motivo?: string;
    }
  | {
      tipo: 'MANUAL_ASIGNAR';
      grupoId: number;
      participanteId: number;
      nota?: string;
    }
  | {
      tipo: 'MANUAL_MOVER';
      grupoId: number;
      haciaParticipanteId: number;
      nota?: string;
    }
  | {
      tipo: 'MANUAL_DESASIGNAR';
      grupoId: number;
      nota?: string;
    }
  | {
      tipo: 'MANUAL_TRUEQUE';
      movimientos: Array<{ grupoId: number; haciaParticipanteId: number }>;
      nota?: string;
    }
  | {
      tipo: 'EXCEPCION_CREADA';
      participanteId: number;
      grupoId: number;
      motivo: string;
    }
  | {
      tipo: 'DESHACER_ULTIMA_ACCION';
      nota?: string;
    }
  | {
      tipo: 'DESHACER_ULTIMA_RONDA';
      nota?: string;
    }
  | {
      tipo: 'REPARTO_CERRADO';
      justificacion?: string;
    }
  | {
      tipo: 'REPARTO_REABIERTO';
      motivo?: string;
    };
