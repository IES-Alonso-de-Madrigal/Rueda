<script lang="ts">
  import { page } from '$app/state';

  let { data, children } = $props();

  const paso1Ok = $derived(data.resumen.cursosActivos > 0 && data.resumen.departamentos > 0);
  const paso2Ok = $derived(data.resumen.profesoresActivos > 1);
  const paso3Ok = $derived(data.resumen.repartos > 0);

  const tabs = $derived([
    { href: '/jefatura', paso: '1', label: 'Centro y cursos', done: paso1Ok },
    {
      href: '/jefatura/profesores',
      paso: '2',
      label: `Profesores (${data.resumen.profesoresActivos})`,
      done: paso2Ok
    },
    {
      href: '/jefatura/repartos',
      paso: '3',
      label: `Repartos (${data.resumen.repartos})`,
      done: paso3Ok
    },
    { href: '/jefatura/historico', paso: '4', label: 'Histórico y copias', done: false }
  ]);
</script>

<div class="mx-auto max-w-6xl px-4 py-6">
  <div
    class="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4"
  >
    <div>
      <h1 class="text-2xl font-bold text-slate-900">Jefatura de estudios</h1>
      <p class="mt-0.5 text-sm text-slate-600">
        Sigue los pasos en orden para preparar el curso y dar acceso al claustro.
      </p>
    </div>

    <nav aria-label="Secciones de Jefatura" class="flex flex-wrap gap-2">
      {#each tabs as tab}
        {@const active = page.url.pathname === tab.href}
        <a
          href={tab.href}
          class="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors {active
            ? 'bg-indigo-600 text-white shadow-xs'
            : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}"
        >
          <span
            class="flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold {active
              ? 'bg-white/20 text-white'
              : tab.done
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-slate-100 text-slate-600'}"
          >
            {tab.done && !active ? '✓' : tab.paso}
          </span>
          <span>{tab.label}</span>
        </a>
      {/each}
    </nav>
  </div>

  {@render children()}
</div>
