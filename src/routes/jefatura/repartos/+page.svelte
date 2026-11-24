<script lang="ts">
  import { enhance } from '$app/forms';
  import ToastBanner from '$lib/components/ToastBanner.svelte';
  import { estadoBadgeClass, estadoLabel } from '$lib/ui';

  let { data, form } = $props();

  let filtroCurso = $state('');
  let filtroEstado = $state('');

  const repartosFiltrados = $derived(
    data.repartos.filter((r) => {
      if (filtroCurso && String(r.cursoId) !== filtroCurso) return false;
      if (filtroEstado && r.estado !== filtroEstado) return false;
      return true;
    })
  );
</script>

<ToastBanner ok={form?.ok} error={form?.error} />

<section class="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
  <h2 class="text-lg font-semibold text-slate-900">Crear nuevo reparto</h2>
  <p class="mt-0.5 text-xs text-slate-500">
    Asigna un jefe de departamento para que gestione los grupos, listas y rondas de su departamento.
  </p>
  <form method="POST" action="?/crear" use:enhance class="mt-4 space-y-3">
    <div class="grid gap-3 sm:grid-cols-4">
      <select
        name="cursoId"
        required
        aria-label="Curso académico"
        class="rounded-lg border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="">Curso activo…</option>
        {#each data.cursosActivos as c}
          <option value={c.id}>{c.nombre}</option>
        {/each}
      </select>

      <select
        name="departamentoId"
        required
        aria-label="Departamento"
        class="rounded-lg border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="">Departamento…</option>
        {#each data.departamentos as d}
          <option value={d.id}>{d.nombre}</option>
        {/each}
      </select>

      <select
        name="jefeId"
        aria-label="Jefe de departamento"
        class="rounded-lg border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="">Jefe de dpto. (opcional)…</option>
        {#each data.profesores as p}
          <option value={p.id}>{p.apellidos}, {p.nombre}</option>
        {/each}
      </select>

      <button
        type="submit"
        class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
      >
        Crear reparto
      </button>
    </div>

    <label class="flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" name="restringirPorTurno" class="h-4 w-4 rounded border-slate-300" />
      <span>
        <strong>Restringir elección por turno</strong> (quien elige Mañana no puede escoger asignaturas
        de Tarde y viceversa)
      </span>
    </label>
  </form>
</section>

<section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <h2 class="text-lg font-semibold text-slate-900">
      Repartos ({repartosFiltrados.length})
    </h2>

    <div class="flex flex-wrap gap-2">
      <select
        bind:value={filtroCurso}
        aria-label="Filtrar por curso"
        class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
      >
        <option value="">Todos los cursos</option>
        {#each data.cursosTodos as c}
          <option value={String(c.id)}>{c.nombre}</option>
        {/each}
      </select>
      <select
        bind:value={filtroEstado}
        aria-label="Filtrar por estado"
        class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
      >
        <option value="">Todos los estados</option>
        <option value="Borrador">En preparación</option>
        <option value="ListasAbiertas">Listas abiertas</option>
        <option value="ListasCerradas">Listas cerradas</option>
        <option value="Ventana">Ventana de ajuste</option>
        <option value="Bloqueo">Bloqueo en turno</option>
        <option value="FaseManual">Fase manual</option>
        <option value="Cerrado">Cerrado</option>
        <option value="Archivado">Archivado</option>
      </select>
    </div>
  </div>

  <div class="mt-4 overflow-x-auto">
    <table class="w-full text-left text-sm">
      <thead class="border-b border-slate-200 text-xs text-slate-600 uppercase">
        <tr>
          <th class="py-2 pr-3">Curso</th>
          <th class="py-2 pr-3">Departamento</th>
          <th class="py-2 pr-3">Jefe</th>
          <th class="py-2 pr-3">Estado</th>
          <th class="py-2 text-right">Acciones</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100">
        {#each repartosFiltrados as r}
          <tr>
            <td class="py-3 pr-3 font-semibold text-slate-900">{r.cursoNombre}</td>
            <td class="py-3 pr-3 font-medium text-slate-800">
              {r.departamentoNombre}
              {#if r.restringirPorTurno}
                <span
                  class="ml-1.5 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-900"
                >
                  Turno único
                </span>
              {/if}
            </td>
            <td class="py-3 pr-3 text-slate-600">{r.jefeNombre}</td>
            <td class="py-3 pr-3">
              <span
                class="inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium {estadoBadgeClass(
                  r.estado
                )}"
              >
                {estadoLabel(r.estado)}
              </span>
            </td>
            <td class="py-3 text-right">
              <div class="flex flex-wrap justify-end gap-2">
                <a
                  href="/jefe/{r.id}"
                  class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                >
                  Gestionar →
                </a>

                {#if r.estado === 'Borrador'}
                  <form
                    method="POST"
                    action="?/eliminar"
                    use:enhance={({ cancel }) => {
                      if (
                        !confirm(
                          `¿Eliminar el reparto de ${r.departamentoNombre} (${r.cursoNombre})?`
                        )
                      ) {
                        cancel();
                      }
                    }}
                  >
                    <input type="hidden" name="id" value={r.id} />
                    <button
                      type="submit"
                      class="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                    >
                      Eliminar
                    </button>
                  </form>
                {/if}

                {#if r.estado === 'Cerrado'}
                  <form
                    method="POST"
                    action="?/reabrir"
                    use:enhance={({ formData, cancel }) => {
                      const motivo = prompt(
                        `Motivo de la reapertura de ${r.departamentoNombre} (aparecerá en el acta):`,
                        'Corrección acordada por Jefatura'
                      );
                      if (!motivo || !motivo.trim()) {
                        cancel();
                        return;
                      }
                      formData.set('motivo', motivo.trim());
                    }}
                  >
                    <input type="hidden" name="id" value={r.id} />
                    <button
                      type="submit"
                      class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                    >
                      Reabrir
                    </button>
                  </form>
                {/if}
              </div>
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="5" class="py-8 text-center text-slate-500">
              No hay repartos con esos filtros.
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>
