import type { EstadoReparto, TipoGrupo } from './server/db/schema';

export const ESTADO_REPARTO_META: Record<
  EstadoReparto,
  { label: string; badgeClass: string; descripcionProfesor: string }
> = {
  Borrador: {
    label: 'En preparación',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    descripcionProfesor:
      'El departamento todavía está preparando los grupos. Cuando se abran las listas podrás ordenar tus preferencias.'
  },
  ListasAbiertas: {
    label: 'Listas abiertas',
    badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    descripcionProfesor:
      'Puedes preparar y modificar tu lista libremente. Se guarda al instante y entrarás al reparto con lo que tengas guardado al cerrar.'
  },
  ListasCerradas: {
    label: 'Listas cerradas',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-200',
    descripcionProfesor:
      'Las listas están cerradas. En breve el jefe de departamento lanzará la primera ronda.'
  },
  Ronda: {
    label: 'Ejecutando ronda',
    badgeClass: 'bg-sky-100 text-sky-900 border-sky-200',
    descripcionProfesor: 'Se está ejecutando una ronda automática de asignaciones.'
  },
  Ventana: {
    label: 'Ventana de ajuste',
    badgeClass: 'bg-violet-100 text-violet-900 border-violet-200',
    descripcionProfesor:
      'Ventana abierta entre rondas: puedes reordenar, añadir o quitar grupos libres antes de la siguiente ronda.'
  },
  Bloqueo: {
    label: 'Bloqueo en turno',
    badgeClass: 'bg-amber-200 text-amber-950 border-amber-300',
    descripcionProfesor:
      'La ronda está pausada mientras el compañero del turno actual elige en directo.'
  },
  FaseManual: {
    label: 'Fase manual',
    badgeClass: 'bg-teal-100 text-teal-900 border-teal-200',
    descripcionProfesor:
      'El reparto está en fase manual de ajuste y acuerdos. Puedes seguir aquí los cambios en directo.'
  },
  Cerrado: {
    label: 'Cerrado',
    badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-200',
    descripcionProfesor:
      'El reparto está cerrado en solo lectura. Puedes consultar tu resultado final y el acta.'
  },
  Archivado: {
    label: 'Archivado',
    badgeClass: 'bg-slate-200 text-slate-700 border-slate-300',
    descripcionProfesor: 'Reparto de un curso archivado (solo lectura).'
  }
};

export const TIPO_GRUPO_META: Record<TipoGrupo, { label: string; badgeClass: string }> = {
  normal: { label: 'Normal', badgeClass: 'bg-emerald-100 text-emerald-800' },
  relleno: { label: 'Relleno', badgeClass: 'bg-amber-100 text-amber-900' },
  fuera_del_reparto: { label: 'Fuera del reparto', badgeClass: 'bg-slate-200 text-slate-700' }
};

export function estadoLabel(estado: string): string {
  return ESTADO_REPARTO_META[estado as EstadoReparto]?.label ?? estado;
}

export function estadoBadgeClass(estado: string): string {
  return (
    ESTADO_REPARTO_META[estado as EstadoReparto]?.badgeClass ??
    'bg-slate-100 text-slate-700 border-slate-200'
  );
}

export function tipoGrupoLabel(tipo: string): string {
  return TIPO_GRUPO_META[tipo as TipoGrupo]?.label ?? tipo;
}

export function tipoGrupoBadgeClass(tipo: string): string {
  return TIPO_GRUPO_META[tipo as TipoGrupo]?.badgeClass ?? 'bg-slate-100 text-slate-700';
}

export function formatDesviacion(diff: number): string {
  if (diff > 0) return `+${diff} h`;
  if (diff < 0) return `${diff} h`;
  return '0 h';
}

export function desviacionTextClass(diff: number): string {
  if (diff === 0) return 'text-emerald-700';
  if (diff > 0) return 'text-amber-700';
  return 'text-rose-700';
}

export function formatFechaHora(iso: string | null | undefined): string {
  if (!iso) return '—';
  // SQLite datetime('now') produces 'YYYY-MM-DD HH:MM:SS' (UTC without Z)
  const normalized = iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z';
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Madrid'
  }).format(date);
}

export function formatHora(iso: string | null | undefined): string {
  if (!iso) return '—';
  const normalized = iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z';
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Europe/Madrid'
  }).format(date);
}
