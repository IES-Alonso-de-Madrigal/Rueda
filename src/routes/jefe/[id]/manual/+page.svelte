<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';
  import ToastBanner from '$lib/components/ToastBanner.svelte';
  import { desviacionTextClass, estadoLabel, formatDesviacion, tipoGrupoLabel } from '$lib/ui';

  let { data, form } = $props();

  let modoProyector = $state(false);
  let grupoEditandoId = $state<number | null>(null);
  let truequeGrupoA = $state<string>('');
  let truequeGrupoB = $state<string>('');

  const duenoGrupoA = $derived(
    data.asignacionesPlanas.find((a) => String(a.grupoId) === truequeGrupoA)?.participanteId ?? null
  );

  const opcionesGrupoB = $derived(
    duenoGrupoA === null
      ? data.asignacionesPlanas
      : data.asignacionesPlanas.filter((a) => a.participanteId !== duenoGrupoA)
  );

  $effect(() => {
    if (truequeGrupoB && !opcionesGrupoB.some((a) => String(a.grupoId) === truequeGrupoB)) {
      truequeGrupoB = '';
    }
  });

  onMount(() => {
    const es = new EventSource(`/reparto/${data.reparto.id}/stream`);
    es.addEventListener('update', () => invalidateAll());
    es.onopen = () => invalidateAll();
    return () => es.close();
  });
</script>

<ToastBanner ok={form?.ok} error={form?.error} />

{#if !data.puedeEditar}
  <div
    class="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
  >
    <span>
      El reparto está en estado <strong>{estadoLabel(data.reparto.estado)}</strong>. Para editar en
      este tablero, pasa primero a <strong>Fase manual</strong> desde la Sala del reparto.
    </span>
    <a
      href="/jefe/{data.reparto.id}/sala"
      class="rounded-lg bg-amber-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
    >
      Ir a Sala del reparto →
    </a>
  </div>
{/if}

<div
  class={modoProyector ? 'fixed inset-0 z-50 overflow-y-auto bg-slate-950 p-6 text-slate-100' : ''}
>
  <!-- Barra superior -->
  <section
    class="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 shadow-xs {modoProyector
      ? 'border-slate-700 bg-slate-900 text-white'
      : 'border-slate-200 bg-white'}"
  >
    <div>
      <h2 class="font-bold {modoProyector ? 'text-2xl text-white' : 'text-lg text-slate-900'}">
        {modoProyector ? `${data.reparto.departamentoNombre} — Fase manual` : 'Fase manual'}
      </h2>
      <p class="text-xs {modoProyector ? 'text-slate-300' : 'text-slate-600'}">
        Grupos libres restantes: <strong>{data.gruposLibres.length}</strong> · Todos los cambios quedan
        registrados en el acta.
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onclick={() => (modoProyector = !modoProyector)}
        class="rounded-lg border px-3 py-2 text-xs font-semibold {modoProyector
          ? 'border-slate-600 bg-slate-800 text-white hover:bg-slate-700'
          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}"
      >
        {modoProyector ? '✕ Salir de proyector' : '⛶ Modo proyector'}
      </button>

      {#if data.puedeEditar && !modoProyector}
        <form
          method="POST"
          action="?/deshacerAccion"
          use:enhance={({ cancel }) => {
            if (!confirm('¿Deshacer la última acción realizada en fase manual?')) cancel();
          }}
        >
          <button
            type="submit"
            disabled={!data.puedeDeshacerAccion}
            class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            ↶ Deshacer última acción
          </button>
        </form>

        <form
          method="POST"
          action="?/deshacerRonda"
          use:enhance={({ cancel }) => {
            if (
              !confirm(
                `¿Deshacer todas las asignaciones de la última ronda (R${data.ultimaRondaNumero ?? ''})? Quedará registrado en el acta.`
              )
            ) {
              cancel();
            }
          }}
        >
          <button
            type="submit"
            disabled={!data.puedeDeshacerRonda}
            class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-40"
          >
            ↶ Deshacer última ronda {data.ultimaRondaNumero ? `(R${data.ultimaRondaNumero})` : ''}
          </button>
        </form>

        <a
          href="/jefe/{data.reparto.id}/acta"
          class="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
        >
          Ir a cierre y acta →
        </a>
      {/if}
    </div>
  </section>

  <!-- Bandeja de libres + Trueque (oculto en modo proyector para no saturar) -->
  {#if data.puedeEditar && !modoProyector}
    <div class="mb-6 grid gap-4 lg:grid-cols-2">
      <section class="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <h3 class="text-sm font-bold text-slate-900">
          Bandeja de grupos libres ({data.gruposLibres.length})
        </h3>
        <div class="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
          {#each data.gruposLibres as g}
            <form
              method="POST"
              action="?/asignar"
              use:enhance
              class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"
            >
              <input type="hidden" name="grupoId" value={g.id} />
              <div>
                <span class="font-semibold text-slate-900">{g.materia}</span>
                <span class="text-slate-600">
                  ({g.curso}
                  {g.nombreGrupo} · {g.turno} · {g.horasSemanales} h · {tipoGrupoLabel(g.tipo)})
                </span>
              </div>
              <div class="flex flex-wrap items-center gap-1.5">
                <select
                  name="participanteId"
                  required
                  aria-label="Asignar {g.materia} a"
                  class="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs"
                >
                  <option value="">Asignar a…</option>
                  {#each data.columnas as p}
                    <option value={p.id}>
                      #{p.orden}
                      {p.apellidos}, {p.nombre} ({p.horasCubiertas}/{p.horasACubrir}h)
                    </option>
                  {/each}
                </select>
                <input
                  name="nota"
                  aria-label="Nota de asignación"
                  placeholder="Nota (opcional)"
                  class="w-28 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs"
                />
                <button
                  type="submit"
                  class="rounded-md bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700"
                >
                  Asignar
                </button>
              </div>
            </form>
          {:else}
            <p class="py-4 text-center text-xs text-slate-500">
              ✓ Todos los grupos normales y de relleno están asignados.
            </p>
          {/each}
        </div>
      </section>

      <section class="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <h3 class="text-sm font-bold text-slate-900">Trueque entre dos profesores</h3>
        <p class="mt-0.5 text-xs text-slate-600">
          Intercambia dos grupos asignados de distintos profesores en una sola acción.
        </p>
        <form
          method="POST"
          action="?/trueque"
          use:enhance={() => {
            return async ({ result, update }) => {
              await update({ reset: false });
              if (result.type === 'success') {
                truequeGrupoA = '';
                truequeGrupoB = '';
              }
            };
          }}
          class="mt-3 space-y-2.5 text-xs"
        >
          <select
            name="grupoA"
            required
            aria-label="Primer grupo del trueque"
            bind:value={truequeGrupoA}
            class="w-full rounded-lg border border-slate-300 px-2.5 py-2"
          >
            <option value="">Primer grupo asignado…</option>
            {#each data.asignacionesPlanas as a}
              <option value={String(a.grupoId)}>{a.label}</option>
            {/each}
          </select>
          <select
            name="grupoB"
            required
            aria-label="Segundo grupo del trueque"
            bind:value={truequeGrupoB}
            class="w-full rounded-lg border border-slate-300 px-2.5 py-2"
          >
            <option value="">Segundo grupo asignado (otro profesor)…</option>
            {#each opcionesGrupoB as a}
              <option value={String(a.grupoId)}>{a.label}</option>
            {/each}
          </select>
          <div class="flex gap-2">
            <input
              name="nota"
              aria-label="Nota del acuerdo"
              placeholder="Nota del acuerdo (ej. Acordado entre ambos)"
              class="flex-1 rounded-lg border border-slate-300 px-2.5 py-2"
            />
            <button
              type="submit"
              disabled={!truequeGrupoA || !truequeGrupoB}
              class="rounded-lg bg-slate-900 px-3.5 py-2 font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
            >
              Hacer trueque
            </button>
          </div>
        </form>
      </section>
    </div>
  {/if}

  <!-- Tablero por participante -->
  <section class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
    {#each data.columnas as p}
      <article
        class="rounded-2xl border p-4 shadow-xs {modoProyector
          ? 'border-slate-700 bg-slate-900'
          : 'border-slate-200 bg-white'}"
      >
        <div
          class="flex items-start justify-between gap-2 border-b pb-2.5 {modoProyector
            ? 'border-slate-800'
            : 'border-slate-100'}"
        >
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
            {/if}
          </div>
          <div class="text-right">
            <div
              class="font-bold {modoProyector ? 'text-xl text-white' : 'text-base text-slate-900'}"
            >
              Cierra: {p.horasCubiertas} h
            </div>
            <div
              class="font-mono text-xs font-bold {modoProyector
                ? p.desviacion === 0
                  ? 'text-emerald-400'
                  : p.desviacion > 0
                    ? 'text-amber-300'
                    : 'text-rose-400'
                : desviacionTextClass(p.desviacion)}"
            >
              Obj: {p.horasACubrir} h ({formatDesviacion(p.desviacion)})
            </div>
          </div>
        </div>

        <ul class="mt-3 space-y-2 {modoProyector ? 'text-base' : 'text-sm'}">
          {#each p.asignaciones as a}
            {#if a.grupo}
              {@const abierto = grupoEditandoId === a.grupo.id}
              <li
                class="rounded-xl border p-2.5 {modoProyector
                  ? 'border-slate-800 bg-slate-800 text-slate-100'
                  : a.fueraEspecialidad
                    ? 'border-amber-300 bg-amber-50'
                    : 'border-slate-100 bg-slate-50'}"
              >
                <div class="flex items-center justify-between gap-2">
                  <div>
                    <span class="font-semibold">{a.grupo.materia}</span>
                    <span class="text-xs {modoProyector ? 'text-slate-300' : 'text-slate-600'}">
                      ({a.grupo.curso}
                      {a.grupo.nombreGrupo})
                    </span>
                  </div>
                  <div class="flex shrink-0 items-center gap-2">
                    <span class="text-xs font-bold">{a.grupo.horasSemanales} h</span>
                    {#if data.puedeEditar && !modoProyector}
                      <button
                        type="button"
                        onclick={() => (grupoEditandoId = abierto ? null : a.grupo!.id)}
                        class="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        {abierto ? 'Cerrar' : 'Ajustar'}
                      </button>
                    {/if}
                  </div>
                </div>

                {#if a.fueraEspecialidad && data.puedeEditar && !modoProyector}
                  <form
                    method="POST"
                    action="?/crearExcepcion"
                    use:enhance
                    class="mt-2 flex gap-1.5"
                  >
                    <input type="hidden" name="participanteId" value={p.id} />
                    <input type="hidden" name="grupoId" value={a.grupo.id} />
                    <input
                      name="motivo"
                      required
                      aria-label="Motivo de excepción de especialidad o turno"
                      placeholder="Fuera de especialidad o turno: motivo…"
                      class="flex-1 rounded-md border border-amber-300 bg-white px-2 py-1 text-xs"
                    />
                    <button
                      type="submit"
                      class="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white"
                    >
                      Justificar
                    </button>
                  </form>
                {/if}

                {#if abierto && data.puedeEditar && !modoProyector}
                  <div
                    class="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2"
                  >
                    <form
                      method="POST"
                      action="?/mover"
                      use:enhance={() => {
                        return async ({ result, update }) => {
                          if (result.type === 'success') grupoEditandoId = null;
                          await update();
                        };
                      }}
                      class="flex items-center gap-1.5"
                    >
                      <input type="hidden" name="grupoId" value={a.grupo.id} />
                      <select
                        name="haciaParticipanteId"
                        required
                        aria-label="Mover {a.grupo.materia} a"
                        class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                      >
                        <option value="">Mover a…</option>
                        {#each data.columnas.filter((x) => x.id !== p.id) as dest}
                          <option value={dest.id}>#{dest.orden} {dest.apellidos}</option>
                        {/each}
                      </select>
                      <button
                        type="submit"
                        class="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-800"
                      >
                        Mover
                      </button>
                    </form>

                    <form
                      method="POST"
                      action="?/desasignar"
                      use:enhance={({ cancel }) => {
                        if (
                          !confirm(`¿Devolver "${a.grupo?.materia}" a la bandeja de grupos libres?`)
                        ) {
                          cancel();
                          return;
                        }
                        return async ({ result, update }) => {
                          if (result.type === 'success') grupoEditandoId = null;
                          await update();
                        };
                      }}
                    >
                      <input type="hidden" name="grupoId" value={a.grupo.id} />
                      <button
                        type="submit"
                        class="rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                      >
                        Liberar
                      </button>
                    </form>
                  </div>
                {/if}
              </li>
            {/if}
          {:else}
            <li class="text-xs {modoProyector ? 'text-slate-400' : 'text-slate-500'}">
              Sin grupos asignados.
            </li>
          {/each}
        </ul>
      </article>
    {/each}
  </section>
</div>
