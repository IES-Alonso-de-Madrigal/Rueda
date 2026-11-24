<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';
  import ToastBanner from '$lib/components/ToastBanner.svelte';
  import {
    ESTADO_REPARTO_META,
    desviacionTextClass,
    estadoBadgeClass,
    estadoLabel,
    formatDesviacion,
    formatFechaHora
  } from '$lib/ui';

  let { data, form } = $props();

  type GrupoItem = (typeof data.gruposElegiblesDisponibles)[number];

  const grupoById = $derived(new Map(data.gruposElegiblesDisponibles.map((g) => [g.id, g])));

  let listaIds = $state<number[]>([]);
  let guardandoEnVuelo = $state(false);
  let ultimaActualizacion = $state<string | null>(null);
  let vistaActiva = $state<'mio' | 'departamento'>('mio');

  let filtroTexto = $state('');
  let filtroEnsenanza = $state('');
  let filtroTurno = $state('');
  let estadoGuardado = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
  let errorMsg = $state('');
  let ahora = $state(Date.now());
  let dragFromIdx = $state<number | null>(null);
  let dragOverIdx = $state<number | null>(null);

  $effect(() => {
    // No pisar cambios locales mientras hay un PUT en vuelo
    if (!guardandoEnVuelo) {
      listaIds = data.miListaGrupoIds.filter((id) => grupoById.has(id));
      ultimaActualizacion = data.actualizadaEn;
    }
  });

  const segundosVentana = $derived.by(() => {
    if (!data.reparto.ventanaHasta || data.reparto.estado !== 'Ventana') return null;
    return Math.max(0, Math.floor((new Date(data.reparto.ventanaHasta).getTime() - ahora) / 1000));
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

  const puedeEditar = $derived(
    (data.reparto.estado === 'ListasAbiertas' || data.reparto.estado === 'Ventana') &&
      !data.participante.esVacante
  );

  const repartoIniciado = $derived(
    data.reparto.estado !== 'Borrador' && data.reparto.estado !== 'ListasAbiertas'
  );

  const descripcionFase = $derived(
    ESTADO_REPARTO_META[data.reparto.estado]?.descripcionProfesor ?? ''
  );

  const itemsOrdenados = $derived(
    listaIds.map((id) => grupoById.get(id)).filter((g): g is GrupoItem => g != null)
  );

  const disponiblesSinElegir = $derived(
    data.gruposElegiblesDisponibles.filter((g) => {
      if (listaIds.includes(g.id)) return false;
      if (filtroEnsenanza && g.ensenanza !== filtroEnsenanza) return false;
      if (filtroTurno && g.turno !== filtroTurno) return false;
      if (filtroTexto.trim()) {
        const q = filtroTexto.trim().toLowerCase();
        const hay =
          `${g.materia} ${g.curso} ${g.nombreGrupo} ${g.ensenanza} ${g.turno}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
  );

  const ensenanzasUnicas = $derived(
    Array.from(new Set(data.gruposElegiblesDisponibles.map((g) => g.ensenanza).filter(Boolean)))
  );
  const turnosUnicos = $derived(
    Array.from(new Set(data.gruposElegiblesDisponibles.map((g) => g.turno).filter(Boolean)))
  );

  const horasRestantes = $derived(
    Math.max(0, data.participante.horasACubrir - data.horasCubiertas)
  );

  const sumaPrimeros = $derived.by(() => {
    let acc = 0;
    let count = 0;
    for (const g of itemsOrdenados) {
      if (acc + g.horasSemanales <= horasRestantes) {
        acc += g.horasSemanales;
        count++;
      } else {
        break;
      }
    }
    return { acc, count };
  });

  async function persistir(nuevosIds: number[]) {
    listaIds = nuevosIds;
    if (!puedeEditar) return;
    guardandoEnVuelo = true;
    estadoGuardado = 'saving';
    errorMsg = '';
    try {
      const res = await fetch(`/p/${data.reparto.id}/lista`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grupoIds: nuevosIds })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? 'No se pudo guardar');
      }
      const out = (await res.json()) as { actualizadaEn?: string };
      if (out.actualizadaEn) ultimaActualizacion = out.actualizadaEn;
      estadoGuardado = 'saved';
    } catch (e) {
      estadoGuardado = 'error';
      errorMsg = e instanceof Error ? e.message : 'Error de red';
    } finally {
      guardandoEnVuelo = false;
    }
  }

  function anadir(grupoId: number) {
    if (listaIds.includes(grupoId)) return;
    persistir([...listaIds, grupoId]);
  }

  function quitar(grupoId: number) {
    persistir(listaIds.filter((id) => id !== grupoId));
  }

  function mover(idx: number, delta: -1 | 1) {
    const target = idx + delta;
    if (target < 0 || target >= listaIds.length) return;
    const copy = [...listaIds];
    [copy[idx], copy[target]] = [copy[target], copy[idx]];
    persistir(copy);
  }

  function moverAlPrincipio(idx: number) {
    if (idx <= 0) return;
    const copy = [...listaIds];
    const [item] = copy.splice(idx, 1);
    copy.unshift(item);
    persistir(copy);
  }

  function onDragStart(idx: number) {
    if (!puedeEditar) return;
    dragFromIdx = idx;
  }

  function onDragOver(e: DragEvent, idx: number) {
    if (!puedeEditar || dragFromIdx === null) return;
    e.preventDefault();
    dragOverIdx = idx;
  }

  function onDrop(e: DragEvent, targetIdx: number) {
    e.preventDefault();
    if (!puedeEditar || dragFromIdx === null || dragFromIdx === targetIdx) {
      dragFromIdx = null;
      dragOverIdx = null;
      return;
    }
    const copy = [...listaIds];
    const [moved] = copy.splice(dragFromIdx, 1);
    copy.splice(targetIdx, 0, moved);
    dragFromIdx = null;
    dragOverIdx = null;
    persistir(copy);
  }

  function onDragEnd() {
    dragFromIdx = null;
    dragOverIdx = null;
  }
</script>

<main class="mx-auto max-w-2xl space-y-5 px-4 py-5 pb-16">
  <ToastBanner ok={form?.ok} error={form?.error} />

  {#if data.puedeGestionar}
    <div>
      <a
        href="/jefe/{data.reparto.id}"
        class="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        ← Volver a gestión del departamento
      </a>
    </div>
  {/if}

  <!-- Cabecera y estado del reparto -->
  <section class="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="text-xl font-bold text-slate-900">
            {data.reparto.departamentoNombre}
          </h1>
          <span
            class="rounded-full border px-2.5 py-0.5 text-xs font-semibold {estadoBadgeClass(
              data.reparto.estado
            )}"
          >
            {estadoLabel(data.reparto.estado)}
          </span>
        </div>
        <p class="mt-1 text-xs text-slate-600">
          Curso {data.reparto.cursoNombre} · Tu orden: <strong>#{data.participante.orden}</strong>
          {#if data.reparto.rondaActual > 0}
            · Ronda {data.reparto.rondaActual}
          {/if}
        </p>
      </div>

      <div class="rounded-xl bg-slate-50 px-3 py-2 text-right">
        <div class="text-sm font-bold text-slate-900">
          Cierre: {data.horasCubiertas} / {data.participante.horasACubrir} h
        </div>
        <div class="font-mono text-xs font-bold {desviacionTextClass(data.desviacion)}">
          Desviación: {formatDesviacion(data.desviacion)}
        </div>
      </div>
    </div>

    {#if descripcionFase}
      <p class="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700">
        {descripcionFase}
        {#if data.reparto.estado === 'Bloqueo' && data.bloqueadoNombre && data.reparto.bloqueoParticipanteId !== data.participante.id}
          <strong> Turno actual: {data.bloqueadoNombre}.</strong>
        {/if}
      </p>
    {/if}

    {#if data.participante.motivoReduccion}
      <p
        class="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600"
      >
        Tu reducción registrada (privada): {data.participante.motivoReduccion}
      </p>
    {/if}

    {#if data.reparto.estado === 'Ventana'}
      <div class="mt-2.5 rounded-xl bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-900">
        {#if segundosVentana !== null && segundosVentana > 0}
          Ventana de ajuste abierta · tiempo orientativo restante:
          <span class="font-mono">
            {Math.floor(segundosVentana / 60)}:{String(segundosVentana % 60).padStart(2, '0')}
          </span>
        {:else}
          Ventana de ajuste abierta: puedes reordenar o añadir grupos hasta que el jefe lance la
          siguiente ronda.
        {/if}
      </div>
    {/if}

    {#if data.reparto.estado === 'Cerrado' || data.reparto.estado === 'Archivado'}
      <div class="mt-3 flex flex-wrap gap-2">
        <a
          href="/reparto/{data.reparto.id}/acta"
          target="_blank"
          class="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
        >
          Ver acta imprimible (A4)
        </a>
        <a
          href="/reparto/{data.reparto.id}/csv"
          class="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Descargar CSV
        </a>
      </div>
    {/if}
  </section>

  <!-- Selector de vista en móvil cuando ya empezó el reparto -->
  {#if repartoIniciado}
    <div class="grid grid-cols-2 gap-2 rounded-2xl bg-slate-200/70 p-1">
      <button
        type="button"
        onclick={() => (vistaActiva = 'mio')}
        class="rounded-xl py-2.5 text-xs font-bold transition-colors {vistaActiva === 'mio'
          ? 'bg-white text-slate-900 shadow-xs'
          : 'text-slate-700 hover:text-slate-900'}"
      >
        Mis grupos y lista
      </button>
      <button
        type="button"
        onclick={() => (vistaActiva = 'departamento')}
        class="rounded-xl py-2.5 text-xs font-bold transition-colors {vistaActiva === 'departamento'
          ? 'bg-white text-slate-900 shadow-xs'
          : 'text-slate-700 hover:text-slate-900'}"
      >
        Reparto en directo ({data.tableroDepartamento.length})
      </button>
    </div>
  {/if}

  <!-- Aviso de bloqueo: te toca elegir en directo -->
  {#if data.reparto.estado === 'Bloqueo' && data.reparto.bloqueoParticipanteId === data.participante.id}
    <section class="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 shadow-sm">
      <h2 class="text-base font-bold text-amber-950">¡Te toca elegir en directo!</h2>
      <p class="mt-1 text-xs text-amber-900">
        Tu lista se ha agotado. Elige uno de los grupos disponibles que caben en tus horas
        restantes:
      </p>
      {#if data.opcionesBloqueo.length > 0}
        <div class="mt-3 space-y-2">
          {#each data.opcionesBloqueo as g}
            <form
              method="POST"
              action="?/elegirEnDirecto"
              use:enhance
              class="flex items-center justify-between gap-2 rounded-xl bg-white p-3 shadow-xs"
            >
              <input type="hidden" name="grupoId" value={g.id} />
              <div>
                <div class="text-sm font-semibold text-slate-900">
                  {g.materia} ({g.curso}
                  {g.nombreGrupo})
                </div>
                <div class="text-xs text-slate-600">
                  {g.ensenanza} · {g.turno} · <strong>{g.horasSemanales} h</strong>
                </div>
              </div>
              <button
                type="submit"
                class="min-h-[44px] rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700"
              >
                Elegir
              </button>
            </form>
          {/each}
        </div>
      {:else}
        <p class="mt-2 text-xs font-medium text-amber-950">
          No queda ningún grupo elegible que quepa en tus horas restantes. El jefe puede saltar tu
          turno o pasar a fase manual.
        </p>
      {/if}
    </section>
  {/if}

  {#if !repartoIniciado || vistaActiva === 'mio'}
    <!-- Mis grupos ya asignados -->
    {#if data.misAsignaciones.length > 0}
      <section class="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-bold text-emerald-950">
            Tus grupos asignados ({data.horasCubiertas} h)
          </h2>
          <span class="font-mono text-xs font-bold {desviacionTextClass(data.desviacion)}">
            {formatDesviacion(data.desviacion)}
          </span>
        </div>
        <ul class="mt-2.5 space-y-2 text-sm">
          {#each data.misAsignaciones as a}
            {#if a.grupo}
              <li
                class="flex items-center justify-between rounded-xl bg-white px-3.5 py-2.5 shadow-xs"
              >
                <div>
                  <div class="font-semibold text-slate-900">{a.grupo.materia}</div>
                  <div class="text-xs text-slate-600">
                    {a.grupo.curso}
                    {a.grupo.nombreGrupo} · {a.grupo.turno}
                    {#if a.numeroRonda}· Ronda {a.numeroRonda}{:else}· {a.origen}{/if}
                  </div>
                </div>
                <span class="shrink-0 font-bold text-emerald-800">{a.grupo.horasSemanales} h</span>
              </li>
            {/if}
          {/each}
        </ul>
      </section>
    {/if}

    {#if data.participante.esVacante}
      <section class="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
        Esta plaza está marcada como <strong>vacante</strong>: no confecciona lista ni participa en
        rondas automáticas; recibirá los grupos sobrantes en la fase manual.
      </section>
    {:else}
      <!-- Selector / información de turno cuando el reparto restringe por turno -->
      {#if data.reparto.restringirPorTurno}
        <section
          class="rounded-2xl border p-4 shadow-xs {!data.participante.turno
            ? 'border-sky-400 bg-sky-50'
            : 'border-sky-200 bg-white'}"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 class="text-sm font-bold text-slate-900">
                {#if data.participante.turno}
                  Tu turno: <span class="text-sky-800">{data.participante.turno}</span>
                {:else}
                  Paso 1: Elige tu turno
                {/if}
              </h2>
              <p class="mt-0.5 text-xs text-slate-600">
                {#if data.participante.turnoFijadoPorJefe}
                  Turno asignado por el departamento. Solo puedes elegir asignaturas de este turno.
                {:else if data.participante.turno}
                  Este reparto tiene restricción por turno: solo ves y puedes elegir asignaturas de <strong>
                    {data.participante.turno}
                  </strong>.
                {:else}
                  Este reparto tiene restricción por turno. Selecciona primero tu turno para ver las
                  asignaturas disponibles.
                {/if}
              </p>
            </div>
          </div>

          {#if data.puedeCambiarTurno && data.turnosDisponibles.length > 0}
            <div class="mt-3 flex flex-wrap gap-2">
              {#each data.turnosDisponibles as t}
                {@const seleccionado =
                  data.participante.turno?.trim().toLowerCase() === t.trim().toLowerCase()}
                <form
                  method="POST"
                  action="?/elegirTurno"
                  use:enhance={({ cancel }) => {
                    if (
                      !seleccionado &&
                      data.participante.turno &&
                      itemsOrdenados.length > 0 &&
                      !confirm(
                        `Si cambias al turno "${t}", se quitarán de tu lista los grupos del turno "${data.participante.turno}". ¿Continuar?`
                      )
                    ) {
                      cancel();
                    }
                  }}
                >
                  <input type="hidden" name="turno" value={t} />
                  <button
                    type="submit"
                    disabled={seleccionado}
                    class="min-h-[44px] rounded-xl px-4 py-2 text-sm font-semibold transition-colors {seleccionado
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'border border-sky-300 bg-white text-sky-900 hover:bg-sky-100'}"
                  >
                    {seleccionado ? `✓ ${t}` : t}
                  </button>
                </form>
              {/each}
            </div>
          {/if}
        </section>
      {/if}

      {#if !data.reparto.restringirPorTurno || data.participante.turno}
        <!-- Mi lista ordenada -->
        <section class="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 class="text-base font-bold text-slate-900">
                Mi lista de preferencias ({itemsOrdenados.length})
              </h2>
              <div aria-live="polite" class="mt-0.5 text-xs">
                {#if estadoGuardado === 'saving'}
                  <span class="font-medium text-amber-700">Guardando cambios…</span>
                {:else if estadoGuardado === 'saved'}
                  <span class="font-medium text-emerald-700">
                    ✓ Guardado automáticamente ({formatFechaHora(ultimaActualizacion)})
                  </span>
                {:else if estadoGuardado === 'error'}
                  <span class="font-semibold text-red-700">⚠ {errorMsg}</span>
                {:else if ultimaActualizacion}
                  <span class="text-slate-500">
                    Último cambio guardado: {formatFechaHora(ultimaActualizacion)}
                  </span>
                {:else if puedeEditar}
                  <span class="text-slate-500">Se guarda automáticamente con cada cambio.</span>
                {/if}
              </div>
            </div>

            {#if itemsOrdenados.length > 0 && puedeEditar}
              <span
                class="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800"
              >
                {sumaPrimeros.count} primeras = {sumaPrimeros.acc} / {horasRestantes} h restantes
              </span>
            {/if}
          </div>

          {#if itemsOrdenados.length === 0}
            <p
              class="mt-3 rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-600"
            >
              {#if puedeEditar}
                Tu lista está vacía. Toca <strong>«+ Añadir»</strong> en los grupos disponibles de abajo
                por orden de preferencia.
              {:else}
                No hay grupos pendientes en tu lista.
              {/if}
            </p>
          {:else}
            <ol class="mt-3 space-y-2.5">
              {#each itemsOrdenados as g, idx (g.id)}
                <li
                  draggable={puedeEditar}
                  ondragstart={() => onDragStart(idx)}
                  ondragover={(e) => onDragOver(e, idx)}
                  ondrop={(e) => onDrop(e, idx)}
                  ondragend={onDragEnd}
                  class="flex items-center justify-between gap-2 rounded-xl border p-3 transition-colors {dragOverIdx ===
                    idx && dragFromIdx !== idx
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-slate-200 bg-slate-50'} {puedeEditar
                    ? 'cursor-grab active:cursor-grabbing'
                    : ''}"
                >
                  <div class="flex min-w-0 items-start gap-2.5">
                    <span
                      class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white"
                    >
                      {idx + 1}
                    </span>
                    <div class="min-w-0">
                      <div class="truncate text-sm font-semibold text-slate-900">
                        {g.materia}
                        {#if g.curso || g.nombreGrupo}
                          <span class="font-normal text-slate-600">
                            ({g.curso}
                            {g.nombreGrupo})
                          </span>
                        {/if}
                      </div>
                      <div class="text-xs text-slate-600">
                        {g.ensenanza} · {g.turno} · <strong>{g.horasSemanales} h</strong>
                      </div>
                    </div>
                  </div>

                  {#if puedeEditar}
                    <div class="flex shrink-0 items-center gap-1">
                      {#if idx > 1}
                        <button
                          type="button"
                          onclick={() => moverAlPrincipio(idx)}
                          aria-label="Subir {g.materia} al primer puesto"
                          title="Subir al #1"
                          class="flex h-11 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-100"
                        >
                          ⤒
                        </button>
                      {/if}
                      <button
                        type="button"
                        onclick={() => mover(idx, -1)}
                        disabled={idx === 0}
                        aria-label="Subir {g.materia}"
                        class="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-300 bg-white text-base font-bold text-slate-800 hover:bg-slate-100 disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onclick={() => mover(idx, 1)}
                        disabled={idx === itemsOrdenados.length - 1}
                        aria-label="Bajar {g.materia}"
                        class="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-300 bg-white text-base font-bold text-slate-800 hover:bg-slate-100 disabled:opacity-30"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onclick={() => quitar(g.id)}
                        aria-label="Quitar {g.materia} de mi lista"
                        class="flex h-11 w-11 items-center justify-center rounded-xl border border-red-200 bg-white text-sm font-bold text-red-600 hover:bg-red-50"
                      >
                        ✕
                      </button>
                    </div>
                  {/if}
                </li>
              {/each}
            </ol>
          {/if}
        </section>

        <!-- Catálogo de grupos disponibles y elegibles -->
        {#if puedeEditar}
          <section class="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <h2 class="text-base font-bold text-slate-900">
              Grupos disponibles ({disponiblesSinElegir.length})
            </h2>

            <div class="mt-3 space-y-2">
              <input
                type="search"
                bind:value={filtroTexto}
                aria-label="Buscar grupo o materia"
                placeholder="Buscar materia, curso o grupo…"
                class="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
              />
              <div
                class="grid gap-2 {data.reparto.restringirPorTurno ? 'grid-cols-1' : 'grid-cols-2'}"
              >
                <select
                  bind:value={filtroEnsenanza}
                  aria-label="Filtrar por enseñanza"
                  class="rounded-xl border border-slate-300 px-2.5 py-2 text-sm"
                >
                  <option value="">Todas las enseñanzas</option>
                  {#each ensenanzasUnicas as ens}
                    <option value={ens}>{ens}</option>
                  {/each}
                </select>

                {#if !data.reparto.restringirPorTurno}
                  <select
                    bind:value={filtroTurno}
                    aria-label="Filtrar por turno"
                    class="rounded-xl border border-slate-300 px-2.5 py-2 text-sm"
                  >
                    <option value="">Todos los turnos</option>
                    {#each turnosUnicos as t}
                      <option value={t}>{t}</option>
                    {/each}
                  </select>
                {/if}
              </div>
            </div>

            <div class="mt-3 space-y-2">
              {#each disponiblesSinElegir as g (g.id)}
                <div
                  class="flex items-center justify-between gap-2 rounded-xl border border-slate-200 p-3"
                >
                  <div class="min-w-0">
                    <div class="text-sm font-semibold text-slate-900">
                      {g.materia}
                      {#if g.curso || g.nombreGrupo}
                        <span class="font-normal text-slate-600">({g.curso} {g.nombreGrupo})</span>
                      {/if}
                    </div>
                    <div class="text-xs text-slate-600">
                      {g.ensenanza} · {g.turno} · <strong>{g.horasSemanales} h</strong>
                    </div>
                  </div>

                  <button
                    type="button"
                    onclick={() => anadir(g.id)}
                    class="min-h-[44px] shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
                  >
                    + Añadir
                  </button>
                </div>
              {:else}
                <p class="py-5 text-center text-sm text-slate-500">
                  No quedan más grupos elegibles con esos filtros.
                </p>
              {/each}
            </div>
          </section>
        {/if}
      {/if}
    {/if}
  {:else}
    <!-- Tablero en directo del departamento (sin listas privadas) -->
    <section class="space-y-3">
      {#each data.tableroDepartamento as p}
        <article
          class="rounded-2xl border p-4 shadow-xs {p.esMio
            ? 'border-indigo-300 bg-indigo-50/40'
            : data.reparto.bloqueoParticipanteId === p.id
              ? 'border-amber-400 bg-amber-50/60'
              : 'border-slate-200 bg-white'}"
        >
          <div class="flex items-start justify-between gap-2">
            <div>
              <span class="font-mono text-xs text-slate-500">#{p.orden}</span>
              <h3 class="font-bold text-slate-900">
                {p.apellidos}, {p.nombre}
                {#if p.esMio}
                  <span
                    class="ml-1 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800"
                  >
                    Tú
                  </span>
                {/if}
                {#if p.esVacante}
                  <span
                    class="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900"
                  >
                    Vacante
                  </span>
                {:else if p.pendienteDeCuadrar}
                  <span
                    class="ml-1 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700"
                  >
                    Pendiente
                  </span>
                {/if}
              </h3>
            </div>

            <div class="text-right">
              <div class="text-sm font-bold text-slate-900">
                {p.horasCubiertas} / {p.horasACubrir} h
              </div>
              <div class="font-mono text-xs font-bold {desviacionTextClass(p.desviacion)}">
                {formatDesviacion(p.desviacion)}
              </div>
            </div>
          </div>

          <ul class="mt-2.5 space-y-1.5 text-xs">
            {#each p.asignaciones as a}
              <li
                class="flex items-center justify-between rounded-lg bg-white/90 px-3 py-1.5 border border-slate-100"
              >
                <span>
                  <strong class="text-slate-900">{a.materia}</strong>
                  <span class="text-slate-600"> ({a.curso} {a.nombreGrupo} · {a.turno})</span>
                </span>
                <span class="shrink-0 font-semibold text-slate-800">
                  {a.horasSemanales} h
                  {#if a.numeroRonda}<span class="text-slate-500">· R{a.numeroRonda}</span>{/if}
                </span>
              </li>
            {:else}
              <li class="text-slate-500">Sin asignaciones todavía.</li>
            {/each}
          </ul>
        </article>
      {/each}
    </section>
  {/if}
</main>
