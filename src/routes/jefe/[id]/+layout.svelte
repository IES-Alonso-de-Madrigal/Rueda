<script lang="ts">
  import { page } from '$app/state';
  import { estadoBadgeClass, estadoLabel } from '$lib/ui';

  let { data, children } = $props();

  const base = $derived(`/jefe/${data.reparto.id}`);

  const pasoActual = $derived.by(() => {
    const e = data.reparto.estado;
    if (e === 'Borrador') {
      if (data.numParticipantes === 0) return base;
      if (data.numGrupos === 0) return `${base}/grupos`;
      return `${base}/listas`;
    }
    if (e === 'ListasAbiertas') return `${base}/listas`;
    if (e === 'ListasCerradas' || e === 'Ronda' || e === 'Ventana' || e === 'Bloqueo') {
      return `${base}/sala`;
    }
    if (e === 'FaseManual') return `${base}/manual`;
    return `${base}/acta`;
  });

  const tabs = $derived([
    { href: base, num: '1', label: `Participantes (${data.numParticipantes})` },
    { href: `${base}/grupos`, num: '2', label: `Grupos (${data.numGrupos})` },
    { href: `${base}/listas`, num: '3', label: 'Listas e invitaciones' },
    { href: `${base}/sala`, num: '4', label: 'Sala del reparto' },
    { href: `${base}/manual`, num: '5', label: 'Fase manual' },
    { href: `${base}/acta`, num: '6', label: 'Cierre y acta' }
  ]);
</script>

<div class="mx-auto max-w-6xl px-4 py-6">
  <div class="no-print mb-6 border-b border-slate-200 pb-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="text-2xl font-bold text-slate-900">
            {data.reparto.departamentoNombre}
          </h1>
          <span
            class="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-800"
          >
            {data.reparto.cursoNombre}
          </span>
          <span
            class="rounded-full border px-2.5 py-0.5 text-xs font-semibold {estadoBadgeClass(
              data.reparto.estado
            )}"
          >
            {estadoLabel(data.reparto.estado)}
          </span>
          {#if data.reparto.restringirPorTurno}
            <span class="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-900">
              Restricción por turno activa
            </span>
          {/if}
          {#if data.reparto.rondaActual > 0}
            <span
              class="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700"
            >
              Ronda {data.reparto.rondaActual}
            </span>
          {/if}
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        {#if page.url.pathname !== pasoActual}
          <a
            href={pasoActual}
            class="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100"
          >
            Ir al paso actual →
          </a>
        {/if}

        {#if data.esParticipante}
          <a
            href="/p/{data.reparto.id}"
            class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Mi lista de profesor
          </a>
        {/if}
      </div>
    </div>

    <nav aria-label="Pasos del reparto" class="mt-4 flex flex-wrap gap-2">
      {#each tabs as tab}
        {@const active = page.url.pathname === tab.href}
        {@const recommended = tab.href === pasoActual && !active}
        <a
          href={tab.href}
          class="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors {active
            ? 'bg-indigo-600 text-white shadow-xs'
            : recommended
              ? 'border-2 border-indigo-400 bg-indigo-50/70 text-indigo-900 hover:bg-indigo-100'
              : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}"
        >
          <span
            class="flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold {active
              ? 'bg-white/20 text-white'
              : recommended
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-600'}"
          >
            {tab.num}
          </span>
          <span>{tab.label}</span>
        </a>
      {/each}
    </nav>
  </div>

  {@render children()}
</div>
