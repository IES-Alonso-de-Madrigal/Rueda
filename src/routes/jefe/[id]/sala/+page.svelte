<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';
  import ToastBanner from '$lib/components/ToastBanner.svelte';
  import { desviacionTextClass, estadoLabel, formatDesviacion } from '$lib/ui';

  let { data, form } = $props();

  let minutosVentana = $state(3);
  let modoProyector = $state(false);
  let lanzando = $state(false);
  let ahora = $state(Date.now());

  const segundosRestantes = $derived.by(() => {
    if (!data.ventanaHasta || data.reparto.estado !== 'Ventana') return null;
    return Math.max(0, Math.floor((new Date(data.ventanaHasta).getTime() - ahora) / 1000));
  });

  onMount(() => {
    const es = new EventSource(`/reparto/${data.reparto.id}/stream`);
    es.addEventListener('update', () => invalidateAll());
    es.onopen = () => invalidateAll();

    const timer = setInterval(() => {
      ahora = Date.now();
    }, 1000);

    return () => {
      es.close();
      clearInterval(timer);
    };
  });

  function formatTiempo(seg: number) {
    const m = Math.floor(seg / 60);
    const s = seg % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
</script>

<ToastBanner ok={form?.ok} error={form?.error} />

{#if data.reparto.estado === 'Borrador' || data.reparto.estado === 'ListasAbiertas'}
  <div
    class="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-5 text-sm text-indigo-950"
  >
    <div>
      <strong>Antes de lanzar rondas:</strong>
      {#if data.reparto.estado === 'Borrador'}
        abre las listas en «Listas e invitaciones» para que el departamento ordene sus preferencias.
      {:else}
        las listas siguen abiertas. Ciérralas manualmente cuando todos estén listos para tomar la
        foto inicial.
      {/if}
    </div>
    <a
      href="/jefe/{data.reparto.id}/listas"
      class="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
    >
      Ir a Listas e invitaciones →
    </a>
  </div>
{/if}

<div
  class={modoProyector ? 'fixed inset-0 z-50 overflow-y-auto bg-slate-950 p-6 text-slate-100' : ''}
>
  <!-- Barra de control -->
  <section
    class="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5 shadow-xs {modoProyector
      ? 'border-slate-700 bg-slate-900 text-white'
      : 'border-slate-200 bg-white'}"
  >
    <div>
      <div class="flex flex-wrap items-center gap-3">
        <h2 class="font-bold {modoProyector ? 'text-3xl text-white' : 'text-xl text-slate-900'}">
          {data.reparto.departamentoNombre} · Ronda {data.reparto.rondaActual}
        </h2>

        {#if data.reparto.estado === 'Ventana'}
          {#if segundosRestantes !== null && segundosRestantes > 0}
            <span
              class="rounded-full bg-violet-100 px-3 py-1 font-mono text-sm font-bold text-violet-900"
            >
              Ventana abierta: {formatTiempo(segundosRestantes)}
            </span>
          {:else if segundosRestantes === 0}
            <span class="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-950">
              Tiempo de ventana cumplido — listo para siguiente ronda
            </span>
          {:else}
            <span class="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-900">
              Ventana de ajuste abierta
            </span>
          {/if}
        {/if}
      </div>

      <p class="mt-1 text-sm {modoProyector ? 'text-slate-300' : 'text-slate-600'}">
        Grupos normales libres: <strong>{data.gruposLibresNormales.length}</strong> · Estado:
        <strong>{estadoLabel(data.reparto.estado)}</strong>
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onclick={() => (modoProyector = !modoProyector)}
        class="rounded-xl border px-3.5 py-2 text-xs font-semibold {modoProyector
          ? 'border-slate-600 bg-slate-800 text-white hover:bg-slate-700'
          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}"
      >
        {modoProyector ? '✕ Salir de proyector' : '⛶ Modo proyector'}
      </button>

      {#if data.reparto.estado === 'ListasCerradas' || data.reparto.estado === 'Ventana'}
        <form
          method="POST"
          action="?/lanzarRonda"
          use:enhance={() => {
            lanzando = true;
            return async ({ update }) => {
              lanzando = false;
              await update();
            };
          }}
          class="flex items-center gap-2"
        >
          <label
            class="flex items-center gap-1.5 text-xs {modoProyector
              ? 'text-slate-300'
              : 'text-slate-600'}"
          >
            Ventana (min):
            <input
              type="number"
              name="minutosVentana"
              min="0"
              max="30"
              bind:value={minutosVentana}
              class="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
            />
          </label>
          <button
            type="submit"
            disabled={lanzando}
            class="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50"
          >
            {lanzando ? 'Ejecutando…' : `Lanzar ronda ${data.reparto.rondaActual + 1}`}
          </button>
        </form>
      {/if}

      {#if data.reparto.estado === 'ListasCerradas' || data.reparto.estado === 'Ventana' || data.reparto.estado === 'Bloqueo'}
        <form
          method="POST"
          action="?/pasarAManual"
          use:enhance={({ cancel }) => {
            if (
              !confirm(
                '¿Pasar a Fase manual ahora? Una vez iniciada la fase manual no se vuelve a rondas automáticas.'
              )
            ) {
              cancel();
            }
          }}
        >
          <button
            type="submit"
            class="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Pasar a fase manual
          </button>
        </form>
      {/if}

      {#if data.reparto.estado === 'FaseManual'}
        <a
          href="/jefe/{data.reparto.id}/manual"
          class="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
        >
          Ir al tablero de fase manual →
        </a>
      {/if}
    </div>
  </section>

  <!-- Bloqueo activo -->
  {#if data.reparto.estado === 'Bloqueo' && data.bloqueoParticipanteId}
    <section class="mb-6 rounded-2xl border-2 border-amber-400 bg-amber-50 p-5 text-slate-900">
      <h3 class="text-lg font-bold text-amber-950">
        Bloqueo en el turno de {data.bloqueadoNombre}
      </h3>
      <p class="mt-1 text-sm text-amber-900">
        Su lista se ha agotado o está vacía. Puede elegir en directo desde su móvil o puedes
        asignarle aquí una opción válida y continuar la ronda.
      </p>

      <div class="mt-4 flex flex-wrap items-center gap-3">
        {#if data.opcionesBloqueo.length > 0}
          <form
            method="POST"
            action="?/resolverEleccion"
            use:enhance
            class="flex flex-wrap items-center gap-2"
          >
            <input type="hidden" name="participanteId" value={data.bloqueoParticipanteId} />
            <select
              name="grupoId"
              required
              aria-label="Grupo para resolver bloqueo"
              class="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm"
            >
              {#each data.opcionesBloqueo as g}
                <option value={g.id}>
                  {g.materia} ({g.curso}
                  {g.nombreGrupo} · {g.turno}) — {g.horasSemanales} h
                </option>
              {/each}
            </select>
            <button
              type="submit"
              class="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
            >
              Asignar y continuar ronda
            </button>
          </form>
        {:else}
          <span class="text-sm font-medium text-amber-900">
            No queda ningún grupo elegible que quepa en sus horas restantes.
          </span>
        {/if}

        <form method="POST" action="?/resolverSaltar" use:enhance>
          <input type="hidden" name="participanteId" value={data.bloqueoParticipanteId} />
          <button
            type="submit"
            class="rounded-lg border border-amber-400 bg-white px-4 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100"
          >
            Saltar turno (pendiente de cuadrar)
          </button>
        </form>
      </div>
    </section>
  {/if}

  <!-- Cuadro de mando proyectable (sin listas ajenas) -->
  <section
    class="grid gap-4 {modoProyector
      ? 'md:grid-cols-2 xl:grid-cols-3'
      : 'md:grid-cols-2 lg:grid-cols-3'}"
  >
    {#each data.tablero as p}
      <article
        class="rounded-2xl border p-4 shadow-xs {modoProyector
          ? data.bloqueoParticipanteId === p.id
            ? 'border-amber-400 bg-slate-900 ring-2 ring-amber-400'
            : 'border-slate-700 bg-slate-900'
          : data.bloqueoParticipanteId === p.id
            ? 'border-amber-400 bg-white ring-2 ring-amber-200'
            : 'border-slate-200 bg-white'}"
      >
        <div class="flex items-start justify-between gap-2">
          <div>
            <span class="font-mono text-xs {modoProyector ? 'text-slate-400' : 'text-slate-500'}">
              #{p.orden}
            </span>
            <h3
              class="font-bold {modoProyector ? 'text-xl text-white' : 'text-base text-slate-900'}"
            >
              {p.apellidos}, {p.nombre}
            </h3>
            {#if p.esVacante}
              <span
                class="mt-0.5 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900"
              >
                Vacante
              </span>
            {:else if p.pendienteDeCuadrar}
              <span
                class="mt-0.5 inline-block rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700"
              >
                Pendiente de cuadrar
              </span>
            {/if}
          </div>

          <div class="text-right">
            <div
              class="font-bold {modoProyector ? 'text-xl text-white' : 'text-base text-slate-900'}"
            >
              {p.horasCubiertas} / {p.horasACubrir} h
            </div>
            <div
              class="font-mono text-xs font-bold {modoProyector
                ? p.desviacion === 0
                  ? 'text-emerald-400'
                  : p.desviacion > 0
                    ? 'text-amber-300'
                    : 'text-slate-400'
                : desviacionTextClass(p.desviacion)}"
            >
              {formatDesviacion(p.desviacion)}
            </div>
          </div>
        </div>

        <ul class="mt-3 space-y-1.5 {modoProyector ? 'text-base' : 'text-sm'}">
          {#each p.asignaciones as a}
            {#if a.grupo}
              <li
                class="flex items-center justify-between rounded-xl px-3 py-2 {modoProyector
                  ? 'bg-slate-800 text-slate-100'
                  : 'bg-slate-50 text-slate-900'}"
              >
                <span>
                  <span class="font-semibold">{a.grupo.materia}</span>
                  <span class="text-xs {modoProyector ? 'text-slate-300' : 'text-slate-600'}">
                    ({a.grupo.curso}
                    {a.grupo.nombreGrupo})
                  </span>
                </span>
                <span class="shrink-0 text-xs font-bold">
                  {a.grupo.horasSemanales} h
                  {#if a.numeroRonda}
                    <span class={modoProyector ? 'text-slate-400' : 'text-slate-500'}>
                      · R{a.numeroRonda}
                    </span>
                  {/if}
                </span>
              </li>
            {/if}
          {:else}
            <li class="text-xs {modoProyector ? 'text-slate-400' : 'text-slate-500'}">
              Sin asignaciones todavía.
            </li>
          {/each}
        </ul>
      </article>
    {/each}
  </section>
</div>
