import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  aplicarEvento,
  desviacionHoras,
  ejecutarRonda,
  horasCubiertas,
  horasRestantes,
  reactivarPendientesEnVentana,
  reconstruirEstado,
  type EstadoMotor,
  type EventoMotor,
  type FotoListas,
  type GrupoMotor,
  type ParticipanteMotor
} from './index';

function crearEstadoBase(params: {
  participantes: ParticipanteMotor[];
  grupos: GrupoMotor[];
  excepciones?: EstadoMotor['excepciones'];
  restringirPorTurno?: boolean;
}): EstadoMotor {
  return {
    fase: 'ListasCerradas',
    rondaActual: 0,
    restringirPorTurno: params.restringirPorTurno ?? false,
    participantes: params.participantes,
    grupos: params.grupos,
    excepciones: params.excepciones ?? [],
    asignaciones: [],
    bloqueo: null,
    historialManual: [],
    historialRondas: []
  };
}

describe('Motor de rondas — casos unitarios', () => {
  it('ronda sencilla: cada uno se lleva su primera opción disponible en orden', () => {
    const estado = crearEstadoBase({
      participantes: [
        {
          id: 1,
          orden: 1,
          horasACubrir: 18,
          esVacante: false,
          especialidadesIds: [1],
          pendienteDeCuadrar: false
        },
        {
          id: 2,
          orden: 2,
          horasACubrir: 18,
          esVacante: false,
          especialidadesIds: [1],
          pendienteDeCuadrar: false
        },
        {
          id: 3,
          orden: 3,
          horasACubrir: 18,
          esVacante: false,
          especialidadesIds: [1],
          pendienteDeCuadrar: false
        }
      ],
      grupos: [
        { id: 10, horasSemanales: 4, tipo: 'normal', especialidadesIds: [1] },
        { id: 11, horasSemanales: 4, tipo: 'normal', especialidadesIds: [1] },
        { id: 12, horasSemanales: 4, tipo: 'normal', especialidadesIds: [1] },
        { id: 13, horasSemanales: 4, tipo: 'normal', especialidadesIds: [1] }
      ]
    });

    const foto: FotoListas = {
      1: [10, 11, 12],
      2: [10, 11, 12],
      3: [10, 11, 12]
    };

    const res = ejecutarRonda(estado, foto);
    expect(res.tipo).toBe('RONDA_COMPLETADA');
    expect(res.numeroRonda).toBe(1);
    expect(res.estado.fase).toBe('Ventana');
    expect(res.nuevasAsignaciones.map((a) => [a.participanteId, a.grupoId])).toEqual([
      [1, 10],
      [2, 11],
      [3, 12]
    ]);
  });

  it('elegibilidad: respeta especialidad, excepciones y grupos sin especialidad (abiertos a todos)', () => {
    const estado = crearEstadoBase({
      participantes: [
        {
          id: 1,
          orden: 1,
          horasACubrir: 10,
          esVacante: false,
          especialidadesIds: [1],
          pendienteDeCuadrar: false
        },
        {
          id: 2,
          orden: 2,
          horasACubrir: 10,
          esVacante: false,
          especialidadesIds: [2],
          pendienteDeCuadrar: false
        }
      ],
      grupos: [
        { id: 10, horasSemanales: 4, tipo: 'normal', especialidadesIds: [2] }, // No elegible para 1 sin excepción
        { id: 11, horasSemanales: 4, tipo: 'normal', especialidadesIds: [2] }, // Con excepción para 1
        { id: 12, horasSemanales: 4, tipo: 'normal', especialidadesIds: [] } // Sin especialidad -> cualquiera
      ],
      excepciones: [{ participanteId: 1, grupoId: 11, motivo: 'Experiencia previa 92.g' }]
    });

    const foto: FotoListas = {
      1: [10, 11, 12],
      2: [12, 10]
    };

    const res = ejecutarRonda(estado, foto);
    expect(res.tipo).toBe('RONDA_COMPLETADA');
    expect(res.nuevasAsignaciones.map((a) => [a.participanteId, a.grupoId])).toEqual([
      [1, 11],
      [2, 12]
    ]);
  });

  it('horas: salta grupo que no cabe; si ninguno cabe pasa a pendienteDeCuadrar sin bloquear', () => {
    const estado = crearEstadoBase({
      participantes: [
        {
          id: 1,
          orden: 1,
          horasACubrir: 3,
          esVacante: false,
          especialidadesIds: [1],
          pendienteDeCuadrar: false
        },
        {
          id: 2,
          orden: 2,
          horasACubrir: 6,
          esVacante: false,
          especialidadesIds: [1],
          pendienteDeCuadrar: false
        }
      ],
      grupos: [
        { id: 10, horasSemanales: 5, tipo: 'normal', especialidadesIds: [1] },
        { id: 11, horasSemanales: 4, tipo: 'normal', especialidadesIds: [1] },
        { id: 12, horasSemanales: 2, tipo: 'normal', especialidadesIds: [1] }
      ]
    });

    const foto: FotoListas = {
      1: [10, 11], // Ninguno cabe en 3 h -> pendienteDeCuadrar (sin bloquear)
      2: [10, 11, 12] // 10 cabe en 6 h -> asignado
    };

    const res = ejecutarRonda(estado, foto);
    expect(res.tipo).toBe('RONDA_COMPLETADA');
    expect(res.pendientesMarcadosIds).toEqual([1]);
    expect(res.estado.participantes.find((p) => p.id === 1)?.pendienteDeCuadrar).toBe(true);
    expect(res.nuevasAsignaciones.map((a) => [a.participanteId, a.grupoId])).toEqual([[2, 10]]);

    // Si en ventana de ajuste el participante 1 añade el grupo 12 (2 h <= 3 h), se reactiva
    const fotoVentana: FotoListas = {
      1: [10, 11, 12],
      2: [11, 12]
    };
    const react = reactivarPendientesEnVentana(res.estado, fotoVentana);
    expect(react.reactivadosIds).toEqual([1]);
    expect(react.estado.participantes.find((p) => p.id === 1)?.pendienteDeCuadrar).toBe(false);
  });

  it('lista agotada o vacía -> bloqueo en ese turno manteniendo firmes asignaciones previas', () => {
    const estado = crearEstadoBase({
      participantes: [
        {
          id: 1,
          orden: 1,
          horasACubrir: 10,
          esVacante: false,
          especialidadesIds: [1],
          pendienteDeCuadrar: false
        },
        {
          id: 2,
          orden: 2,
          horasACubrir: 10,
          esVacante: false,
          especialidadesIds: [1],
          pendienteDeCuadrar: false
        },
        {
          id: 3,
          orden: 3,
          horasACubrir: 10,
          esVacante: false,
          especialidadesIds: [1],
          pendienteDeCuadrar: false
        }
      ],
      grupos: [
        { id: 10, horasSemanales: 4, tipo: 'normal', especialidadesIds: [1] },
        { id: 11, horasSemanales: 4, tipo: 'normal', especialidadesIds: [1] },
        { id: 12, horasSemanales: 4, tipo: 'normal', especialidadesIds: [1] }
      ]
    });

    const foto: FotoListas = {
      1: [10],
      2: [10], // Se queda sin opciones porque 1 se llevó el 10
      3: [11, 12]
    };

    const res = ejecutarRonda(estado, foto);
    expect(res.tipo).toBe('BLOQUEO');
    if (res.tipo !== 'BLOQUEO') return;
    expect(res.participanteId).toBe(2);
    expect(res.indiceSiguiente).toBe(2);
    expect(res.estado.asignaciones).toHaveLength(1);
    expect(res.estado.asignaciones[0]).toMatchObject({ participanteId: 1, grupoId: 10 });

    // Resolver el bloqueo eligiendo en directo el grupo 12 y continuar con el turno 3
    const trasResolucion = aplicarEvento(res.estado, {
      tipo: 'BLOQUEO_RESUELTO_ELECCION',
      participanteId: 2,
      grupoId: 12,
      fotoListas: foto
    });

    expect(trasResolucion.fase).toBe('FaseManual'); // Ya no quedan grupos libres (10, 12, 11 asignados)
    expect(trasResolucion.asignaciones.map((a) => [a.participanteId, a.grupoId])).toEqual([
      [1, 10],
      [2, 12],
      [3, 11]
    ]);
  });

  it('vacantes y grupos de relleno o fuera del reparto nunca entran en rondas automáticas', () => {
    const estado = crearEstadoBase({
      participantes: [
        {
          id: 1,
          orden: 1,
          horasACubrir: 10,
          esVacante: true,
          especialidadesIds: [1],
          pendienteDeCuadrar: false
        },
        {
          id: 2,
          orden: 2,
          horasACubrir: 10,
          esVacante: false,
          especialidadesIds: [1],
          pendienteDeCuadrar: false
        }
      ],
      grupos: [
        { id: 10, horasSemanales: 1, tipo: 'relleno', especialidadesIds: [1] },
        { id: 11, horasSemanales: 4, tipo: 'fuera_del_reparto', especialidadesIds: [1] },
        { id: 12, horasSemanales: 4, tipo: 'normal', especialidadesIds: [1] }
      ]
    });

    const foto: FotoListas = {
      1: [12],
      2: [10, 11, 12]
    };

    const res = ejecutarRonda(estado, foto);
    expect(res.tipo).toBe('FIN_AUTOMATICO');
    expect(res.nuevasAsignaciones).toHaveLength(1);
    expect(res.nuevasAsignaciones[0]).toMatchObject({ participanteId: 2, grupoId: 12 });
  });

  it('determinismo y reconstrucción completa incluyendo fase manual, deshacer acción y deshacer última ronda', () => {
    const estadoInicial = crearEstadoBase({
      participantes: [
        {
          id: 1,
          orden: 1,
          horasACubrir: 6,
          esVacante: false,
          especialidadesIds: [1],
          pendienteDeCuadrar: false
        },
        {
          id: 2,
          orden: 2,
          horasACubrir: 6,
          esVacante: false,
          especialidadesIds: [1],
          pendienteDeCuadrar: false
        }
      ],
      grupos: [
        { id: 10, horasSemanales: 3, tipo: 'normal', especialidadesIds: [1] },
        { id: 11, horasSemanales: 3, tipo: 'normal', especialidadesIds: [1] },
        { id: 12, horasSemanales: 4, tipo: 'normal', especialidadesIds: [1] },
        { id: 13, horasSemanales: 3, tipo: 'normal', especialidadesIds: [1] }
      ]
    });

    const foto: FotoListas = {
      1: [10, 11, 13],
      2: [11, 10, 13]
    };

    // Determinismo
    const rA = ejecutarRonda(estadoInicial, foto);
    const rB = ejecutarRonda(estadoInicial, foto);
    expect(rA).toEqual(rB);

    const eventos: EventoMotor[] = [
      { tipo: 'RONDA_EJECUTADA', fotoListas: foto, desdeIndice: 0 }, // R1: 1->10, 2->11
      { tipo: 'VENTANA_CERRADA', fotoListas: foto },
      { tipo: 'RONDA_EJECUTADA', fotoListas: foto, desdeIndice: 0 }, // R2: 1->13, 2 bloquea? no, 2 tiene [11,10,13] agotada -> bloqueo
      { tipo: 'PASE_A_MANUAL', motivo: 'Ajustar a mano' },
      { tipo: 'MANUAL_ASIGNAR', grupoId: 12, participanteId: 2, nota: 'Cierra en 7h (+1h)' },
      { tipo: 'DESHACER_ULTIMA_ACCION', nota: 'Rehacemos' },
      {
        tipo: 'MANUAL_TRUEQUE',
        movimientos: [
          { grupoId: 10, haciaParticipanteId: 2 },
          { grupoId: 11, haciaParticipanteId: 1 }
        ],
        nota: 'Acuerdo entre 1 y 2'
      },
      { tipo: 'MANUAL_ASIGNAR', grupoId: 12, participanteId: 2, nota: 'Acepta +1h' }
    ];

    const final = reconstruirEstado(estadoInicial, eventos);
    expect(final.fase).toBe('FaseManual');
    expect(horasCubiertas(final, 1)).toBe(6);
    expect(desviacionHoras(final, 1)).toBe(0);
    expect(horasCubiertas(final, 2)).toBe(7);
    expect(desviacionHoras(final, 2)).toBe(1);

    // Deshacer última ronda (R2, que asignó 13 a participante 1)
    const trasDeshacerRonda = aplicarEvento(final, { tipo: 'DESHACER_ULTIMA_RONDA' });
    expect(trasDeshacerRonda.rondaActual).toBe(1);
    expect(trasDeshacerRonda.asignaciones.some((a) => a.grupoId === 13)).toBe(false);
    expect(horasCubiertas(trasDeshacerRonda, 1)).toBe(3);
    expect(desviacionHoras(trasDeshacerRonda, 1)).toBe(-3);
  });

  it('restricción por turno: quien elige Mañana no puede recibir Tarde y viceversa; si se desactiva sí puede mezclar', () => {
    const estadoConRestriccion = crearEstadoBase({
      restringirPorTurno: true,
      participantes: [
        {
          id: 1,
          orden: 1,
          horasACubrir: 8,
          esVacante: false,
          especialidadesIds: [1],
          pendienteDeCuadrar: false,
          turno: 'Mañana'
        },
        {
          id: 2,
          orden: 2,
          horasACubrir: 8,
          esVacante: false,
          especialidadesIds: [1],
          pendienteDeCuadrar: false,
          turno: null // Sin turno inicial -> se fija con su primera elección
        }
      ],
      grupos: [
        { id: 10, horasSemanales: 4, tipo: 'normal', especialidadesIds: [1], turno: 'Tarde' },
        { id: 11, horasSemanales: 4, tipo: 'normal', especialidadesIds: [1], turno: 'Mañana' },
        { id: 12, horasSemanales: 4, tipo: 'normal', especialidadesIds: [1], turno: 'Tarde' },
        { id: 13, horasSemanales: 4, tipo: 'normal', especialidadesIds: [1], turno: 'Mañana' }
      ]
    });

    const foto: FotoListas = {
      1: [10, 11, 12], // 10 y 12 son Tarde -> deben ignorarse para 1 (Mañana)
      2: [10, 13, 12] // 10 es Tarde -> 2 queda fijado en Tarde; en R2 debe ignorar 13 (Mañana) y coger 12 (Tarde)
    };

    const r1 = ejecutarRonda(estadoConRestriccion, foto);
    expect(r1.tipo).toBe('RONDA_COMPLETADA');
    expect(r1.nuevasAsignaciones.map((a) => [a.participanteId, a.grupoId])).toEqual([
      [1, 11],
      [2, 10]
    ]);
    expect(r1.estado.participantes.find((p) => p.id === 2)?.turno).toBe('Tarde');

    // En R2: participante 1 solo tiene [10, 12] (Tarde) en su lista -> se bloquea en lugar de coger Tarde
    const r2 = ejecutarRonda(r1.estado, foto);
    expect(r2.tipo).toBe('BLOQUEO');
    if (r2.tipo === 'BLOQUEO') {
      expect(r2.participanteId).toBe(1);
    }

    // Si en R2 participante 1 añade 13 (Mañana), ambos cogen solo de su turno
    const r2Ok = ejecutarRonda(r1.estado, { 1: [10, 13], 2: [13, 12] });
    expect(r2Ok.tipo).toBe('FIN_AUTOMATICO');
    expect(r2Ok.nuevasAsignaciones.map((a) => [a.participanteId, a.grupoId])).toEqual([
      [1, 13],
      [2, 12]
    ]);

    // Con restricción desactivada, participante 1 puede coger el grupo 10 (Tarde) aunque tenga turno Mañana
    const sinRestriccion = crearEstadoBase({
      restringirPorTurno: false,
      participantes: estadoConRestriccion.participantes,
      grupos: estadoConRestriccion.grupos
    });
    const rLibre = ejecutarRonda(sinRestriccion, foto);
    expect(rLibre.nuevasAsignaciones[0]).toMatchObject({ participanteId: 1, grupoId: 10 });
  });
});

describe('Motor de rondas — propiedades (fast-check)', () => {
  it('en repartos aleatorios, ningún grupo se asigna dos veces y nadie supera sus horas en fase automática', () => {
    const participanteArb = fc.record({
      orden: fc.integer({ min: 1, max: 100 }),
      horasACubrir: fc.integer({ min: 4, max: 20 }),
      esVacante: fc.boolean(),
      especialidadesIds: fc.uniqueArray(fc.integer({ min: 1, max: 3 }), {
        minLength: 1,
        maxLength: 2
      }),
      turno: fc.constantFrom<string | null>('Mañana', 'Tarde', null)
    });

    const grupoArb = fc.record({
      horasSemanales: fc.integer({ min: 1, max: 6 }),
      tipo: fc.constantFrom<'normal' | 'relleno' | 'fuera_del_reparto'>(
        'normal',
        'normal',
        'normal',
        'relleno',
        'fuera_del_reparto'
      ),
      especialidadesIds: fc.uniqueArray(fc.integer({ min: 1, max: 3 }), {
        minLength: 0,
        maxLength: 2
      }),
      turno: fc.constantFrom('Mañana', 'Tarde')
    });

    fc.assert(
      fc.property(
        fc.boolean(),
        fc.array(participanteArb, { minLength: 1, maxLength: 12 }),
        fc.array(grupoArb, { minLength: 1, maxLength: 30 }),
        (restringirPorTurno, rawPart, rawGrupos) => {
          const participantes: ParticipanteMotor[] = rawPart.map((p, idx) => ({
            id: idx + 1,
            orden: idx + 1,
            horasACubrir: p.horasACubrir,
            esVacante: p.esVacante,
            especialidadesIds: p.especialidadesIds,
            pendienteDeCuadrar: false,
            turno: p.turno
          }));

          const grupos: GrupoMotor[] = rawGrupos.map((g, idx) => ({
            id: 100 + idx,
            horasSemanales: g.horasSemanales,
            tipo: g.tipo,
            especialidadesIds: g.especialidadesIds,
            turno: g.turno
          }));

          const foto: FotoListas = {};
          for (const p of participantes) {
            foto[p.id] = grupos.map((g) => g.id);
          }

          let estado = crearEstadoBase({ participantes, grupos, restringirPorTurno });
          let guard = 0;

          while ((estado.fase === 'ListasCerradas' || estado.fase === 'Ventana') && guard < 40) {
            guard++;
            const res = ejecutarRonda(estado, foto);
            estado = res.estado;
          }

          // Invariante 1: ningún grupo asignado dos veces
          const grupoIds = estado.asignaciones.map((a) => a.grupoId);
          expect(new Set(grupoIds).size).toBe(grupoIds.length);

          // Invariante 2: ningún participante supera sus horasACubrir ni es vacante
          const grupoById = new Map(estado.grupos.map((g) => [g.id, g]));
          for (const p of estado.participantes) {
            const cubiertas = horasCubiertas(estado, p.id);
            if (p.esVacante) {
              expect(cubiertas).toBe(0);
            } else {
              expect(cubiertas).toBeLessThanOrEqual(p.horasACubrir);
              expect(horasRestantes(estado, p.id)).toBeGreaterThanOrEqual(0);
            }

            // Invariante 4: con restricción por turno, nadie recibe grupos de más de 1 turno
            if (restringirPorTurno) {
              const turnosAsignados = new Set(
                estado.asignaciones
                  .filter((a) => a.participanteId === p.id)
                  .map((a) => grupoById.get(a.grupoId)?.turno)
                  .filter(Boolean)
              );
              expect(turnosAsignados.size).toBeLessThanOrEqual(1);
            }
          }

          // Invariante 3: ningún grupo de relleno o fuera_del_reparto asignado en fase automática
          for (const a of estado.asignaciones) {
            expect(grupoById.get(a.grupoId)?.tipo).toBe('normal');
          }
        }
      ),
      { numRuns: 150 }
    );
  });
});
