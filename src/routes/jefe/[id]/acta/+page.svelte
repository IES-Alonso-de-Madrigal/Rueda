<script lang="ts">
  import { enhance } from '$app/forms';
  import ToastBanner from '$lib/components/ToastBanner.svelte';
  import { estadoLabel, formatDesviacion, formatFechaHora } from '$lib/ui';

  let { data, form } = $props();

  let justificacion = $state('');
  let asistentesSel = $state<string[]>([]);
  let cerrando = $state(false);
  let inicializado = false;

  $effect(() => {
    if (!inicializado) {
      justificacion = data.justificacionCierre;
      asistentesSel = [...data.asistentesGuardados];
      inicializado = true;
    }
  });

  function toggleAsistente(nombre: string) {
    if (asistentesSel.includes(nombre)) {
      asistentesSel = asistentesSel.filter((n) => n !== nombre);
    } else {
      asistentesSel = [...asistentesSel, nombre];
    }
  }
</script>

<ToastBanner ok={form?.ok} error={form?.error} />

<div class="grid gap-6 lg:grid-cols-2">
  <!-- Comprobaciones -->
  <section class="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
    <h2 class="text-lg font-bold text-slate-900">Comprobaciones de cierre</h2>

    <div
      class="rounded-xl border p-3.5 text-sm {data.sinExcepcion.length > 0
        ? 'border-red-300 bg-red-50 text-red-900'
        : 'border-emerald-200 bg-emerald-50 text-emerald-900'}"
    >
      {#if data.sinExcepcion.length > 0}
        <strong>Error bloqueante:</strong>
        {data.sinExcepcion.length} asignación(es) fuera de especialidad o de turno sin motivo. Justifícalas
        en Fase manual antes de cerrar.
        <ul class="mt-1 list-disc pl-5 text-xs">
          {#each data.sinExcepcion as item}
            <li>{item.profesor} → {item.grupo}</li>
          {/each}
        </ul>
      {:else}
        ✓ Todas las asignaciones cumplen especialidad y turno (o tienen excepción motivada).
      {/if}
    </div>

    <div
      class="rounded-xl border p-3.5 text-sm {data.gruposSinAsignar.length > 0
        ? 'border-amber-300 bg-amber-50 text-amber-950'
        : 'border-emerald-200 bg-emerald-50 text-emerald-900'}"
    >
      {#if data.gruposSinAsignar.length > 0}
        <strong>Aviso ({data.gruposSinAsignar.length} grupos sin asignar):</strong> requiere escribir
        justificación para el acta.
      {:else}
        ✓ Todos los grupos normales y de relleno están asignados.
      {/if}
    </div>

    <div
      class="rounded-xl border p-3.5 text-sm {data.desviaciones.length > 0
        ? 'border-indigo-200 bg-indigo-50 text-indigo-950'
        : 'border-emerald-200 bg-emerald-50 text-emerald-900'}"
    >
      {#if data.desviaciones.length > 0}
        <strong>Desviaciones de horas (admitidas, constarán en el acta):</strong>
        <ul class="mt-1 space-y-0.5 text-xs">
          {#each data.desviaciones as d}
            <li>
              {d.nombre}: cierra con <strong>{d.cubiertas} h</strong> (objetivo {d.objetivo} h ·
              <strong>{formatDesviacion(d.diff)}</strong>)
            </li>
          {/each}
        </ul>
      {:else}
        ✓ Todos los participantes cuadran sus horas exactas.
      {/if}
    </div>

    <div class="flex flex-wrap gap-2 pt-2">
      <a
        href="/reparto/{data.reparto.id}/acta"
        target="_blank"
        class="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
      >
        Abrir acta imprimible (A4)
      </a>
      <a
        href="/reparto/{data.reparto.id}/csv"
        class="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        Exportar CSV
      </a>
    </div>
  </section>

  <!-- Formulario de cierre -->
  <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
    <h2 class="text-lg font-bold text-slate-900">Cerrar reparto</h2>

    {#if data.reparto.estado === 'Cerrado' || data.reparto.estado === 'Archivado'}
      <p class="mt-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">
        ✓ Este reparto está bloqueado en solo lectura
        {#if data.cerradoEn}(cerrado el {formatFechaHora(data.cerradoEn)}){/if}. Solo Jefatura puede
        reabrirlo.
      </p>
    {:else if data.reparto.estado !== 'FaseManual'}
      <p class="mt-3 text-sm text-slate-600">
        Estado actual: <strong>{estadoLabel(data.reparto.estado)}</strong>. El reparto debe estar en
        <strong>Fase manual</strong> para poder cerrarse.
      </p>
    {:else}
      <form
        method="POST"
        action="?/cerrar"
        use:enhance={({ cancel }) => {
          if (
            !confirm(
              '¿Cerrar definitivamente este reparto? Quedará bloqueado en solo lectura y se guardará una copia de seguridad automática.'
            )
          ) {
            cancel();
            return;
          }
          cerrando = true;
          return async ({ update }) => {
            cerrando = false;
            await update({ reset: false });
          };
        }}
        class="mt-4 space-y-4"
      >
        <div>
          <span class="block text-sm font-medium text-slate-700">Asistentes a la reunión</span>
          <div
            class="mt-2 max-h-48 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 p-3 text-sm"
          >
            {#each data.participantes.filter((p) => !p.esVacante) as p}
              {@const nombreCompleto = `${p.apellidos}, ${p.nombre}`}
              <label class="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="asistentes"
                  value={nombreCompleto}
                  checked={asistentesSel.includes(nombreCompleto)}
                  onchange={() => toggleAsistente(nombreCompleto)}
                  class="h-4 w-4 rounded"
                />
                {nombreCompleto}
              </label>
            {/each}
          </div>
        </div>

        <div>
          <label for="just" class="block text-sm font-medium text-slate-700">
            Justificación / observaciones del cierre (obligatoria si quedan grupos libres)
          </label>
          <textarea
            id="just"
            name="justificacion"
            rows="3"
            bind:value={justificacion}
            placeholder="Notas de cierre, acuerdos sobre desviaciones de horas, etc."
            class="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-sm"></textarea>
        </div>

        <button
          type="submit"
          disabled={data.sinExcepcion.length > 0 || cerrando}
          class="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
        >
          {cerrando ? 'Cerrando reparto…' : 'Cerrar reparto definitivamente y generar acta'}
        </button>
      </form>
    {/if}
  </section>
</div>
