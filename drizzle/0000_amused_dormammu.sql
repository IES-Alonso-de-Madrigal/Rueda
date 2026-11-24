CREATE TABLE `accesos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profesor_id` integer NOT NULL,
	`curso_id` integer,
	`token_hash` text NOT NULL,
	`codigo_corto_hash` text,
	`caduca_en` text NOT NULL,
	`revocado` integer DEFAULT false NOT NULL,
	`creado_en` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`profesor_id`) REFERENCES `profesores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`curso_id`) REFERENCES `cursos_academicos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accesos_token_hash_unique` ON `accesos` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `accesos_codigo_corto_hash_unique` ON `accesos` (`codigo_corto_hash`);--> statement-breakpoint
CREATE INDEX `accesos_profesor_idx` ON `accesos` (`profesor_id`);--> statement-breakpoint
CREATE TABLE `asignaciones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reparto_id` integer NOT NULL,
	`grupo_id` integer NOT NULL,
	`participante_id` integer NOT NULL,
	`origen` text NOT NULL,
	`numero_ronda` integer,
	`nota` text,
	`registrado_por_id` integer,
	`creado_en` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`reparto_id`) REFERENCES `repartos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`grupo_id`) REFERENCES `grupos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participante_id`) REFERENCES `participantes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`registrado_por_id`) REFERENCES `profesores`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asignaciones_grupo_id_unique` ON `asignaciones` (`grupo_id`);--> statement-breakpoint
CREATE INDEX `asignaciones_reparto_idx` ON `asignaciones` (`reparto_id`);--> statement-breakpoint
CREATE INDEX `asignaciones_participante_idx` ON `asignaciones` (`participante_id`);--> statement-breakpoint
CREATE TABLE `centros` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`codigo` text DEFAULT '' NOT NULL,
	`localidad` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cursos_academicos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`estado` text DEFAULT 'activo' NOT NULL,
	`creado_en` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cursos_academicos_nombre_unique` ON `cursos_academicos` (`nombre`);--> statement-breakpoint
CREATE TABLE `departamentos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `departamentos_nombre_unique` ON `departamentos` (`nombre`);--> statement-breakpoint
CREATE TABLE `especialidades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`codigo` text NOT NULL,
	`nombre` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `especialidades_codigo_unique` ON `especialidades` (`codigo`);--> statement-breakpoint
CREATE TABLE `eventos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reparto_id` integer NOT NULL,
	`tipo` text NOT NULL,
	`datos_json` text NOT NULL,
	`actor_id` integer,
	`creado_en` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`reparto_id`) REFERENCES `repartos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `profesores`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `eventos_reparto_idx` ON `eventos` (`reparto_id`,`id`);--> statement-breakpoint
CREATE TABLE `excepciones_elegibilidad` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reparto_id` integer NOT NULL,
	`participante_id` integer NOT NULL,
	`grupo_id` integer NOT NULL,
	`motivo` text NOT NULL,
	`creado_por_id` integer,
	`creado_en` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`reparto_id`) REFERENCES `repartos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participante_id`) REFERENCES `participantes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`grupo_id`) REFERENCES `grupos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`creado_por_id`) REFERENCES `profesores`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `excepciones_part_grupo_uidx` ON `excepciones_elegibilidad` (`participante_id`,`grupo_id`);--> statement-breakpoint
CREATE TABLE `grupo_especialidades` (
	`grupo_id` integer NOT NULL,
	`especialidad_id` integer NOT NULL,
	PRIMARY KEY(`grupo_id`, `especialidad_id`),
	FOREIGN KEY (`grupo_id`) REFERENCES `grupos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`especialidad_id`) REFERENCES `especialidades`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `grupos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reparto_id` integer NOT NULL,
	`ensenanza` text DEFAULT '' NOT NULL,
	`curso` text DEFAULT '' NOT NULL,
	`nombre_grupo` text DEFAULT '' NOT NULL,
	`turno` text DEFAULT 'Diurno' NOT NULL,
	`materia` text NOT NULL,
	`horas_semanales` integer NOT NULL,
	`tipo` text DEFAULT 'normal' NOT NULL,
	`profesor_externo` text,
	`notas` text,
	FOREIGN KEY (`reparto_id`) REFERENCES `repartos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `grupos_reparto_idx` ON `grupos` (`reparto_id`);--> statement-breakpoint
CREATE TABLE `items_lista` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lista_id` integer NOT NULL,
	`grupo_id` integer NOT NULL,
	`posicion` integer NOT NULL,
	FOREIGN KEY (`lista_id`) REFERENCES `listas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`grupo_id`) REFERENCES `grupos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `items_lista_lista_grupo_uidx` ON `items_lista` (`lista_id`,`grupo_id`);--> statement-breakpoint
CREATE INDEX `items_lista_lista_pos_idx` ON `items_lista` (`lista_id`,`posicion`);--> statement-breakpoint
CREATE TABLE `listas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`participante_id` integer NOT NULL,
	`actualizada_en` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`participante_id`) REFERENCES `participantes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `listas_participante_id_unique` ON `listas` (`participante_id`);--> statement-breakpoint
CREATE TABLE `participantes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reparto_id` integer NOT NULL,
	`profesor_id` integer NOT NULL,
	`orden` integer NOT NULL,
	`horas_a_cubrir` integer DEFAULT 18 NOT NULL,
	`situacion` text DEFAULT 'definitivo' NOT NULL,
	`es_vacante` integer DEFAULT false NOT NULL,
	`motivo_reduccion` text,
	`pendiente_de_cuadrar` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`reparto_id`) REFERENCES `repartos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`profesor_id`) REFERENCES `profesores`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `participantes_reparto_profesor_uidx` ON `participantes` (`reparto_id`,`profesor_id`);--> statement-breakpoint
CREATE INDEX `participantes_reparto_orden_idx` ON `participantes` (`reparto_id`,`orden`);--> statement-breakpoint
CREATE TABLE `profesor_especialidades` (
	`profesor_id` integer NOT NULL,
	`especialidad_id` integer NOT NULL,
	PRIMARY KEY(`profesor_id`, `especialidad_id`),
	FOREIGN KEY (`profesor_id`) REFERENCES `profesores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`especialidad_id`) REFERENCES `especialidades`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `profesores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`apellidos` text NOT NULL,
	`email` text NOT NULL,
	`es_jefatura` integer DEFAULT false NOT NULL,
	`activo` integer DEFAULT true NOT NULL,
	`creado_en` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profesores_email_unique` ON `profesores` (`email`);--> statement-breakpoint
CREATE TABLE `repartos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`curso_id` integer NOT NULL,
	`departamento_id` integer NOT NULL,
	`jefe_id` integer,
	`estado` text DEFAULT 'Borrador' NOT NULL,
	`ronda_actual` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`ventana_hasta` text,
	`bloqueo_participante_id` integer,
	`bloqueo_siguiente_indice` integer,
	`justificacion_cierre` text,
	`asistentes_json` text,
	`foto_inicial_json` text,
	`iniciado_en` text,
	`cerrado_en` text,
	`creado_en` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`curso_id`) REFERENCES `cursos_academicos`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`departamento_id`) REFERENCES `departamentos`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`jefe_id`) REFERENCES `profesores`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repartos_curso_departamento_uidx` ON `repartos` (`curso_id`,`departamento_id`);--> statement-breakpoint
CREATE TABLE `sesiones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profesor_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`caduca_en` text NOT NULL,
	`creado_en` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`profesor_id`) REFERENCES `profesores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sesiones_token_hash_unique` ON `sesiones` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sesiones_profesor_idx` ON `sesiones` (`profesor_id`);--> statement-breakpoint
CREATE TABLE `setup_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token_hash` text NOT NULL,
	`usado` integer DEFAULT false NOT NULL,
	`caduca_en` text NOT NULL,
	`creado_en` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `setup_tokens_token_hash_unique` ON `setup_tokens` (`token_hash`);