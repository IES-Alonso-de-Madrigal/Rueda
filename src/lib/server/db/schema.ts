import {
  sqliteTable,
  integer,
  text,
  primaryKey,
  uniqueIndex,
  index
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const ESTADOS_CURSO = ['activo', 'archivado'] as const;
export type EstadoCurso = (typeof ESTADOS_CURSO)[number];

export const ESTADOS_REPARTO = [
  'Borrador',
  'ListasAbiertas',
  'ListasCerradas',
  'Ronda',
  'Ventana',
  'Bloqueo',
  'FaseManual',
  'Cerrado',
  'Archivado'
] as const;
export type EstadoReparto = (typeof ESTADOS_REPARTO)[number];

export const SITUACIONES_PARTICIPANTE = ['definitivo', 'provisional', 'interino'] as const;
export type SituacionParticipante = (typeof SITUACIONES_PARTICIPANTE)[number];

export const TIPOS_GRUPO = ['normal', 'relleno', 'fuera_del_reparto'] as const;
export type TipoGrupo = (typeof TIPOS_GRUPO)[number];

export const ORIGENES_ASIGNACION = ['ronda', 'manual', 'trueque', 'externo'] as const;
export type OrigenAsignacion = (typeof ORIGENES_ASIGNACION)[number];

export const centros = sqliteTable('centros', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nombre: text('nombre').notNull(),
  codigo: text('codigo').notNull().default(''),
  localidad: text('localidad').notNull().default('')
});

export const cursosAcademicos = sqliteTable('cursos_academicos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nombre: text('nombre').notNull().unique(),
  estado: text('estado').$type<EstadoCurso>().notNull().default('activo'),
  creadoEn: text('creado_en')
    .notNull()
    .default(sql`(datetime('now'))`)
});

export const departamentos = sqliteTable('departamentos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nombre: text('nombre').notNull().unique()
});

export const especialidades = sqliteTable('especialidades', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  codigo: text('codigo').notNull().unique(),
  nombre: text('nombre').notNull()
});

export const profesores = sqliteTable('profesores', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nombre: text('nombre').notNull(),
  apellidos: text('apellidos').notNull(),
  email: text('email').notNull().unique(),
  esJefatura: integer('es_jefatura', { mode: 'boolean' }).notNull().default(false),
  activo: integer('activo', { mode: 'boolean' }).notNull().default(true),
  creadoEn: text('creado_en')
    .notNull()
    .default(sql`(datetime('now'))`)
});

export const profesorEspecialidades = sqliteTable(
  'profesor_especialidades',
  {
    profesorId: integer('profesor_id')
      .notNull()
      .references(() => profesores.id, { onDelete: 'cascade' }),
    especialidadId: integer('especialidad_id')
      .notNull()
      .references(() => especialidades.id, { onDelete: 'cascade' })
  },
  (t) => [primaryKey({ columns: [t.profesorId, t.especialidadId] })]
);

export const repartos = sqliteTable(
  'repartos',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    cursoId: integer('curso_id')
      .notNull()
      .references(() => cursosAcademicos.id, { onDelete: 'restrict' }),
    departamentoId: integer('departamento_id')
      .notNull()
      .references(() => departamentos.id, { onDelete: 'restrict' }),
    jefeId: integer('jefe_id').references(() => profesores.id, { onDelete: 'set null' }),
    estado: text('estado').$type<EstadoReparto>().notNull().default('Borrador'),
    restringirPorTurno: integer('restringir_por_turno', { mode: 'boolean' })
      .notNull()
      .default(false),
    rondaActual: integer('ronda_actual').notNull().default(0),
    version: integer('version').notNull().default(0),
    ventanaHasta: text('ventana_hasta'),
    bloqueoParticipanteId: integer('bloqueo_participante_id'),
    bloqueoSiguienteIndice: integer('bloqueo_siguiente_indice'),
    justificacionCierre: text('justificacion_cierre'),
    asistentesJson: text('asistentes_json'),
    fotoInicialJson: text('foto_inicial_json'),
    iniciadoEn: text('iniciado_en'),
    cerradoEn: text('cerrado_en'),
    creadoEn: text('creado_en')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (t) => [uniqueIndex('repartos_curso_departamento_uidx').on(t.cursoId, t.departamentoId)]
);

export const participantes = sqliteTable(
  'participantes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    repartoId: integer('reparto_id')
      .notNull()
      .references(() => repartos.id, { onDelete: 'cascade' }),
    profesorId: integer('profesor_id')
      .notNull()
      .references(() => profesores.id, { onDelete: 'restrict' }),
    orden: integer('orden').notNull(),
    horasACubrir: integer('horas_a_cubrir').notNull().default(18),
    situacion: text('situacion').$type<SituacionParticipante>().notNull().default('definitivo'),
    esVacante: integer('es_vacante', { mode: 'boolean' }).notNull().default(false),
    turno: text('turno'),
    turnoFijadoPorJefe: integer('turno_fijado_por_jefe', { mode: 'boolean' })
      .notNull()
      .default(false),
    motivoReduccion: text('motivo_reduccion'),
    pendienteDeCuadrar: integer('pendiente_de_cuadrar', { mode: 'boolean' })
      .notNull()
      .default(false)
  },
  (t) => [
    uniqueIndex('participantes_reparto_profesor_uidx').on(t.repartoId, t.profesorId),
    index('participantes_reparto_orden_idx').on(t.repartoId, t.orden)
  ]
);

export const grupos = sqliteTable(
  'grupos',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    repartoId: integer('reparto_id')
      .notNull()
      .references(() => repartos.id, { onDelete: 'cascade' }),
    ensenanza: text('ensenanza').notNull().default(''),
    curso: text('curso').notNull().default(''),
    nombreGrupo: text('nombre_grupo').notNull().default(''),
    turno: text('turno').notNull().default('Diurno'),
    materia: text('materia').notNull(),
    horasSemanales: integer('horas_semanales').notNull(),
    tipo: text('tipo').$type<TipoGrupo>().notNull().default('normal'),
    profesorExterno: text('profesor_externo'),
    notas: text('notas')
  },
  (t) => [index('grupos_reparto_idx').on(t.repartoId)]
);

export const grupoEspecialidades = sqliteTable(
  'grupo_especialidades',
  {
    grupoId: integer('grupo_id')
      .notNull()
      .references(() => grupos.id, { onDelete: 'cascade' }),
    especialidadId: integer('especialidad_id')
      .notNull()
      .references(() => especialidades.id, { onDelete: 'cascade' })
  },
  (t) => [primaryKey({ columns: [t.grupoId, t.especialidadId] })]
);

export const excepcionesElegibilidad = sqliteTable(
  'excepciones_elegibilidad',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    repartoId: integer('reparto_id')
      .notNull()
      .references(() => repartos.id, { onDelete: 'cascade' }),
    participanteId: integer('participante_id')
      .notNull()
      .references(() => participantes.id, { onDelete: 'cascade' }),
    grupoId: integer('grupo_id')
      .notNull()
      .references(() => grupos.id, { onDelete: 'cascade' }),
    motivo: text('motivo').notNull(),
    creadoPorId: integer('creado_por_id').references(() => profesores.id, {
      onDelete: 'set null'
    }),
    creadoEn: text('creado_en')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (t) => [uniqueIndex('excepciones_part_grupo_uidx').on(t.participanteId, t.grupoId)]
);

export const listas = sqliteTable('listas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  participanteId: integer('participante_id')
    .notNull()
    .unique()
    .references(() => participantes.id, { onDelete: 'cascade' }),
  actualizadaEn: text('actualizada_en')
    .notNull()
    .default(sql`(datetime('now'))`)
});

export const itemsLista = sqliteTable(
  'items_lista',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    listaId: integer('lista_id')
      .notNull()
      .references(() => listas.id, { onDelete: 'cascade' }),
    grupoId: integer('grupo_id')
      .notNull()
      .references(() => grupos.id, { onDelete: 'cascade' }),
    posicion: integer('posicion').notNull()
  },
  (t) => [
    uniqueIndex('items_lista_lista_grupo_uidx').on(t.listaId, t.grupoId),
    index('items_lista_lista_pos_idx').on(t.listaId, t.posicion)
  ]
);

export const asignaciones = sqliteTable(
  'asignaciones',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    repartoId: integer('reparto_id')
      .notNull()
      .references(() => repartos.id, { onDelete: 'cascade' }),
    grupoId: integer('grupo_id')
      .notNull()
      .unique()
      .references(() => grupos.id, { onDelete: 'cascade' }),
    participanteId: integer('participante_id')
      .notNull()
      .references(() => participantes.id, { onDelete: 'cascade' }),
    origen: text('origen').$type<OrigenAsignacion>().notNull(),
    numeroRonda: integer('numero_ronda'),
    nota: text('nota'),
    registradoPorId: integer('registrado_por_id').references(() => profesores.id, {
      onDelete: 'set null'
    }),
    creadoEn: text('creado_en')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (t) => [
    index('asignaciones_reparto_idx').on(t.repartoId),
    index('asignaciones_participante_idx').on(t.participanteId)
  ]
);

export const eventos = sqliteTable(
  'eventos',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    repartoId: integer('reparto_id')
      .notNull()
      .references(() => repartos.id, { onDelete: 'cascade' }),
    tipo: text('tipo').notNull(),
    datosJson: text('datos_json').notNull(),
    actorId: integer('actor_id').references(() => profesores.id, { onDelete: 'set null' }),
    creadoEn: text('creado_en')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (t) => [index('eventos_reparto_idx').on(t.repartoId, t.id)]
);

export const accesos = sqliteTable(
  'accesos',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    profesorId: integer('profesor_id')
      .notNull()
      .references(() => profesores.id, { onDelete: 'cascade' }),
    cursoId: integer('curso_id').references(() => cursosAcademicos.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    codigoCortoHash: text('codigo_corto_hash').unique(),
    caducaEn: text('caduca_en').notNull(),
    revocado: integer('revocado', { mode: 'boolean' }).notNull().default(false),
    creadoEn: text('creado_en')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (t) => [index('accesos_profesor_idx').on(t.profesorId)]
);

export const sesiones = sqliteTable(
  'sesiones',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    profesorId: integer('profesor_id')
      .notNull()
      .references(() => profesores.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    caducaEn: text('caduca_en').notNull(),
    creadoEn: text('creado_en')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (t) => [index('sesiones_profesor_idx').on(t.profesorId)]
);

export const setupTokens = sqliteTable('setup_tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tokenHash: text('token_hash').notNull().unique(),
  usado: integer('usado', { mode: 'boolean' }).notNull().default(false),
  caducaEn: text('caduca_en').notNull(),
  creadoEn: text('creado_en')
    .notNull()
    .default(sql`(datetime('now'))`)
});
