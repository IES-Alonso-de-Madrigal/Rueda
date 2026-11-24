<script lang="ts">
  import { enhance } from '$app/forms';
  import CsvImporter from '$lib/components/CsvImporter.svelte';
  import ToastBanner from '$lib/components/ToastBanner.svelte';
  import { formatDesviacion, tipoGrupoBadgeClass, tipoGrupoLabel } from '$lib/ui';

  let { data, form } = $props();

  let editId = $state<number | null>(null);
  let ensenanza = $state('ESO');
  let curso = $state('');
  let nombreGrupo = $state('');
  let turno = $state('Diurno');
  let materia = $state('');
  let horasSemanales = $state<number>(4);
  let tipo = $state<'normal' | 'relleno' | 'fuera_del_reparto'>('normal');
  let profesorExterno = $state('');
  let notas = $state('');
  let seleccionEsps = $state<number[]>([]);
  let guardando = $state(false);

  const editable = $derived(
    data.reparto.estado === 'Borrador' || data.reparto.estado === 'ListasAbiertas'
  );
  const diferenciaHoras = $derived(data.horasGruposReparto - data.horasParticipantes);
  const espMap = $derived(new Map(data.especialidades.map((e) => [e.id, e])));

  function onHorasChange() {
    if (editId === null) {
      tipo = horasSemanales === 1 ? 'relleno' : 'normal';
    }
  }

  function editar(g: (typeof data.grupos)[number]) {
    editId = g.id;
    ensenanza = g.ensenanza;
    curso = g.curso;
    nombreGrupo = g.nombreGrupo;
    turno = g.turno;
    materia = g.materia;
    horasSemanales = g.horasSemanales;
    tipo = g.tipo;
    profesorExterno = g.profesorExterno ?? '';
    notas = g.notas ?? '';
    seleccionEsps = [...g.especialidadesIds];
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function limpiar() {
    editId = null;
    ensenanza = 'ESO';
    curso = '';
    nombreGrupo = '';
    turno = 'Diurno';
    materia = '';
    horasSemanales = 4;
    tipo = 'normal';
    profesorExterno = '';
    notas = '';
    seleccionEsps = [];
  }

  function toggleEsp(id: number) {
    if (seleccionEsps.includes(id)) {
      seleccionEsps = seleccionEsps.filter((x) => x !== id);
    } else {
      seleccionEsps = [...seleccionEsps, id];
    }
  }

  function validarFilaGrupo(row: Record<string, string>, line: number) {
    const mat = (row['materia'] ?? row['materia o modulo'] ?? '').trim();
    const h = Number(row['horas'] ?? row['horas semanales'] ?? 0);
    if (!mat) return { line, summary: '', error: 'Falta materia o módulo' };
    if (!Number.isInteger(h) || h < 1 || h > 30) {
      return { line, summary: '', error: `Horas inválidas (${row['horas'] ?? 'vacío'})` };
    }
    const c = `${row['curso'] ?? ''} ${row['grupo'] ?? ''}`.trim();
    return { line, summary: `${mat}${c ? ` (${c})` : ''} · ${h} h` };
  }
</script>

<ToastBanner ok={form?.ok} error={form?.error} />

{#if !editable}
  <div
    class="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-700"
  >
    <span>Las listas ya se cerraron: el catálogo de grupos queda en solo lectura.</span>
    <a
      href="/jefe/{data.reparto.id}/sala"
      class="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
    >
      Ir a Sala del reparto →
    </a>
  </div>
{/if}

<!-- Balance previo de horas -->
<div
  class="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 text-sm {diferenciaHoras ===
  0
    ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
    : 'border-amber-200 bg-amber-50 text-amber-950'}"
>
  <div>
    <strong>Balance de horas del departamento:</strong>
    {data.horasGruposReparto} h en grupos (normal + relleno) frente a {data.horasParticipantes} h a cubrir
    por participantes.
  </div>
  <span class="rounded-full bg-white px-3 py-1 font-mono text-xs font-bold shadow-xs">
    Desviación prevista: {formatDesviacion(diferenciaHoras)}
  </span>
</div>

<div class="grid gap-6 lg:grid-cols-3">
  {#if editable}
    <div class="space-y-6">
      <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold text-slate-900">
            {editId ? 'Editar grupo' : 'Nuevo grupo'}
          </h2>
          {#if editId}
            <button
              type="button"
              onclick={limpiar}
              class="rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancelar
            </button>
          {/if}
        </div>

        <form
          method="POST"
          action="?/guardar"
          use:enhance={() => {
            guardando = true;
            return async ({ result, update }) => {
              guardando = false;
              await update({ reset: false });
              if (result.type === 'success') limpiar();
            };
          }}
          class="mt-4 space-y-3"
        >
          {#if editId}
            <input type="hidden" name="id" value={editId} />
          {/if}

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label for="g-ens" class="block text-xs font-medium text-slate-700">Enseñanza</label>
              <input
                id="g-ens"
                name="ensenanza"
                list="sugerencias-ensenanza"
                bind:value={ensenanza}
                class="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
              />
              <datalist id="sugerencias-ensenanza">
                <option value="ESO"></option>
                <option value="Bachillerato"></option>
                <option value="FP Básica"></option>
                <option value="FP Grado Medio"></option>
                <option value="FP Grado Superior"></option>
              </datalist>
            </div>
            <div>
              <label for="g-turno" class="block text-xs font-medium text-slate-700">Turno</label>
              <input
                id="g-turno"
                name="turno"
                list="sugerencias-turno"
                bind:value={turno}
                class="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
              />
              <datalist id="sugerencias-turno">
                <option value="Mañana"></option>
                <option value="Tarde"></option>
                <option value="Diurno"></option>
                <option value="Vespertino"></option>
                <option value="Nocturno"></option>
              </datalist>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label for="g-curso" class="block text-xs font-medium text-slate-700">Curso</label>
              <input
                id="g-curso"
                name="curso"
                placeholder="Ej. 1º, 2º"
                bind:value={curso}
                class="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
              />
            </div>
            <div>
              <label for="g-grupo" class="block text-xs font-medium text-slate-700">Grupo</label>
              <input
                id="g-grupo"
                name="nombreGrupo"
                placeholder="Ej. A, DAW1"
                bind:value={nombreGrupo}
                class="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
              />
            </div>
          </div>

          <div>
            <label for="g-mat" class="block text-xs font-medium text-slate-700">
              Materia o módulo
            </label>
            <input
              id="g-mat"
              name="materia"
              required
              bind:value={materia}
              class="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
            />
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label for="g-horas" class="block text-xs font-medium text-slate-700">
                Horas/semana
              </label>
              <input
                id="g-horas"
                name="horasSemanales"
                type="number"
                min="1"
                max="30"
                required
                bind:value={horasSemanales}
                oninput={onHorasChange}
                class="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
              />
            </div>
            <div>
              <label for="g-tipo" class="block text-xs font-medium text-slate-700">Tipo</label>
              <select
                id="g-tipo"
                name="tipo"
                bind:value={tipo}
                class="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
              >
                <option value="normal">Normal</option>
                <option value="relleno">Relleno</option>
                <option value="fuera_del_reparto">Fuera del reparto</option>
              </select>
            </div>
          </div>

          {#if tipo === 'fuera_del_reparto'}
            <div>
              <label for="g-ext" class="block text-xs font-medium text-slate-700">
                Profesor externo / motivo (92.d)
              </label>
              <input
                id="g-ext"
                name="profesorExterno"
                bind:value={profesorExterno}
                class="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
              />
            </div>
          {/if}

          <div>
            <span class="block text-xs font-medium text-slate-700">
              Especialidades elegibles (vacío = cualquiera)
            </span>
            <div class="mt-1.5 flex flex-wrap gap-1.5">
              {#each data.especialidades as e}
                {@const checked = seleccionEsps.includes(e.id)}
                <label
                  class="cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium focus-within:ring-2 focus-within:ring-indigo-500 {checked
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-800'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-50'}"
                >
                  <input
                    type="checkbox"
                    name="especialidades"
                    value={e.id}
                    {checked}
                    onchange={() => toggleEsp(e.id)}
                    class="sr-only"
                  />
                  {e.codigo}
                </label>
              {/each}
            </div>
          </div>

          <div>
            <label for="g-notas" class="block text-xs font-medium text-slate-700">Notas</label>
            <input
              id="g-notas"
              name="notas"
              bind:value={notas}
              class="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={guardando}
            class="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {guardando ? 'Guardando…' : editId ? 'Guardar cambios' : 'Añadir grupo'}
          </button>
        </form>
      </section>

      <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <CsvImporter
          action="?/importarCsv"
          title="Importar grupos (CSV)"
          templateFilename="plantilla-grupos.csv"
          templateContent={'ensenanza;curso;grupo;turno;materia;horas;especialidades;tipo\nESO;1º;A;Diurno;Matemáticas;4;107;normal\nESO;1º;A;Diurno;Refuerzo;1;;relleno'}
          helpText="Si tipo está vacío, los grupos de 1 h se marcan como relleno automáticamente. Especialidades opcionales separadas por |."
          validateRow={validarFilaGrupo}
        />
      </section>
    </div>
  {/if}

  <section
    class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs {editable
      ? 'lg:col-span-2'
      : 'lg:col-span-3'}"
  >
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-lg font-semibold text-slate-900">Grupos ({data.grupos.length})</h2>
      {#if editable && data.grupos.length > 0}
        <a
          href="/jefe/{data.reparto.id}/listas"
          class="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100"
        >
          Siguiente: Listas e invitaciones →
        </a>
      {/if}
    </div>

    <div class="mt-4 overflow-x-auto">
      <table class="w-full text-left text-sm">
        <thead class="border-b border-slate-200 text-xs text-slate-600 uppercase">
          <tr>
            <th class="py-2 pr-2">Grupo / Materia</th>
            <th class="py-2 pr-2">Turno</th>
            <th class="py-2 pr-2">Horas</th>
            <th class="py-2 pr-2">Tipo</th>
            {#if editable}
              <th class="py-2 text-right">Acciones</th>
            {/if}
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          {#each data.grupos as g}
            <tr>
              <td class="py-3 pr-2">
                <div class="font-semibold text-slate-900">
                  {g.materia}
                  {#if g.curso || g.nombreGrupo}
                    <span class="font-normal text-slate-600">({g.curso} {g.nombreGrupo})</span>
                  {/if}
                </div>
                <div class="text-xs text-slate-600">
                  {g.ensenanza}
                  {#if g.especialidadesIds.length > 0}
                    · Esp: {g.especialidadesIds
                      .map((id) => espMap.get(id)?.codigo ?? id)
                      .join(', ')}
                  {:else}
                    · Cualquier especialidad
                  {/if}
                </div>
              </td>
              <td class="py-3 pr-2 text-slate-700">{g.turno}</td>
              <td class="py-3 pr-2 font-semibold">{g.horasSemanales} h</td>
              <td class="py-3 pr-2">
                <span
                  class="rounded-full px-2.5 py-0.5 text-xs font-medium {tipoGrupoBadgeClass(
                    g.tipo
                  )}"
                >
                  {tipoGrupoLabel(g.tipo)}
                </span>
              </td>
              {#if editable}
                <td class="py-3 text-right">
                  <div class="flex justify-end gap-1.5">
                    <button
                      type="button"
                      onclick={() => editar(g)}
                      class="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
                    >
                      Editar
                    </button>
                    <form
                      method="POST"
                      action="?/eliminar"
                      use:enhance={({ cancel }) => {
                        if (
                          !confirm(
                            `¿Eliminar el grupo "${g.materia} (${g.curso} ${g.nombreGrupo})"?`
                          )
                        ) {
                          cancel();
                        }
                      }}
                    >
                      <input type="hidden" name="id" value={g.id} />
                      <button
                        type="submit"
                        class="rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                      >
                        Quitar
                      </button>
                    </form>
                  </div>
                </td>
              {/if}
            </tr>
          {:else}
            <tr>
              <td colspan="5" class="py-8 text-center text-slate-500">
                Todavía no hay grupos en este reparto.
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
</div>
