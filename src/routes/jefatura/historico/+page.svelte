<script lang="ts">
  import { enhance } from '$app/forms';
  import ToastBanner from '$lib/components/ToastBanner.svelte';
  import { estadoBadgeClass, estadoLabel, formatFechaHora } from '$lib/ui';

  let { data, form } = $props();
  let mostrarEnCurso = $state(false);

  const repartosMostrados = $derived(
    mostrarEnCurso
      ? data.todosRepartos
      : data.todosRepartos.filter((r) => r.estado === 'Cerrado' || r.estado === 'Archivado')
  );
</script>

<ToastBanner ok={form?.ok} error={form?.error} />

<div class="grid gap-6 lg:grid-cols-2">
  <!-- Consulta histórica 92.g -->
  <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
    <h2 class="text-lg font-semibold text-slate-900">Histórico por profesor (punto 92.g)</h2>
    <p class="mt-1 text-xs text-slate-600">
      Consulta qué materias y grupos ha impartido una persona en cursos anteriores.
    </p>

    <form method="GET" class="mt-4 flex gap-2">
      <select
        name="profesorId"
        aria-label="Seleccionar profesor"
        value={data.profesorQueryId ?? ''}
        class="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="">Selecciona profesor…</option>
        {#each data.profesores as p}
          <option value={p.id}>{p.apellidos}, {p.nombre}</option>
        {/each}
      </select>
      <button
        type="submit"
        class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
      >
        Consultar
      </button>
    </form>

    {#if data.profesorQueryId}
      <div class="mt-4">
        {#if data.historialProfesor.length > 0}
          <ul class="divide-y divide-slate-100 text-sm">
            {#each data.historialProfesor as item}
              <li class="py-2">
                <span class="font-semibold text-indigo-700">{item.cursoNombre}</span>
                · {item.departamentoNombre}: <strong>{item.materia}</strong>
                ({item.curso}
                {item.nombreGrupo}, {item.turno}, {item.horasSemanales} h)
              </li>
            {/each}
          </ul>
        {:else}
          <p class="text-sm text-slate-500">No hay asignaciones registradas para este profesor.</p>
        {/if}
      </div>
    {/if}
  </section>

  <!-- Copias de seguridad -->
  <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 class="text-lg font-semibold text-slate-900">Copias de seguridad (SQLite)</h2>
        <p class="text-xs text-slate-600">
          Se crea una copia automática al cerrar cada reparto (se conservan las 20 últimas).
        </p>
      </div>
      <form method="POST" action="?/crearBackup" use:enhance>
        <button
          type="submit"
          class="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
        >
          Crear copia ahora
        </button>
      </form>
    </div>

    <ul class="mt-4 max-h-56 divide-y divide-slate-100 overflow-y-auto text-xs">
      {#each data.backups as b}
        <li class="flex items-center justify-between gap-2 py-2">
          <div class="min-w-0">
            <div class="truncate font-mono font-medium text-slate-800">{b.filename}</div>
            <div class="text-slate-500">
              {Math.max(1, Math.round(b.sizeBytes / 1024))} KB · {formatFechaHora(b.creadoEn)}
            </div>
          </div>
          <a
            href="/jefatura/backups/{encodeURIComponent(b.filename)}"
            class="shrink-0 rounded-md border border-slate-300 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50"
          >
            Descargar
          </a>
        </li>
      {:else}
        <li class="py-3 text-slate-500">Todavía no hay copias en disco.</li>
      {/each}
    </ul>

    <div class="mt-5 border-t border-slate-200 pt-4">
      <h3 class="text-sm font-semibold text-slate-900">Restaurar copia (.db)</h3>
      <p class="mt-0.5 text-xs text-slate-500">
        Sustituye todos los datos actuales por los de la copia seleccionada.
      </p>
      <form
        method="POST"
        action="?/restaurarBackup"
        enctype="multipart/form-data"
        use:enhance={({ cancel }) => {
          if (
            !confirm(
              'ATENCIÓN: ¿Restaurar la base de datos con este archivo? Se sobrescribirán TODOS los datos actuales.'
            )
          ) {
            cancel();
          }
        }}
        class="mt-2.5 flex flex-wrap items-center gap-2"
      >
        <input
          type="file"
          name="archivo"
          accept=".db"
          required
          aria-label="Archivo de copia de seguridad SQLite"
          class="text-xs"
        />
        <button
          type="submit"
          class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100"
        >
          Restaurar BD
        </button>
      </form>
    </div>
  </section>
</div>

<!-- Actas y exportaciones -->
<section class="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <h2 class="text-lg font-semibold text-slate-900">Actas y exportaciones</h2>
    <label class="flex items-center gap-2 text-xs text-slate-600">
      <input type="checkbox" bind:checked={mostrarEnCurso} />
      Incluir repartos aún en curso
    </label>
  </div>

  <div class="mt-4 overflow-x-auto">
    <table class="w-full text-left text-sm">
      <thead class="border-b border-slate-200 text-xs text-slate-600 uppercase">
        <tr>
          <th class="py-2 pr-3">Curso</th>
          <th class="py-2 pr-3">Departamento</th>
          <th class="py-2 pr-3">Estado</th>
          <th class="py-2 pr-3">Cerrado</th>
          <th class="py-2 text-right">Documentos</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100">
        {#each repartosMostrados as r}
          <tr>
            <td class="py-2.5 pr-3 font-semibold">{r.cursoNombre}</td>
            <td class="py-2.5 pr-3">{r.departamentoNombre}</td>
            <td class="py-2.5 pr-3">
              <span
                class="inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium {estadoBadgeClass(
                  r.estado
                )}"
              >
                {estadoLabel(r.estado)}
              </span>
            </td>
            <td class="py-2.5 pr-3 text-xs text-slate-600">{formatFechaHora(r.cerradoEn)}</td>
            <td class="py-2.5 text-right">
              <div class="flex justify-end gap-2">
                <a
                  href="/reparto/{r.id}/acta"
                  target="_blank"
                  class="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Acta A4
                </a>
                <a
                  href="/reparto/{r.id}/csv"
                  class="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  CSV
                </a>
              </div>
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="5" class="py-8 text-center text-sm text-slate-500">
              No hay repartos cerrados o archivados todavía.
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>
