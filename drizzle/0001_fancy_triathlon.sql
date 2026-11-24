ALTER TABLE `participantes` ADD `turno` text;--> statement-breakpoint
ALTER TABLE `participantes` ADD `turno_fijado_por_jefe` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `repartos` ADD `restringir_por_turno` integer DEFAULT false NOT NULL;