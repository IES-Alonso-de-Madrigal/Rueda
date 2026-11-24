<script lang="ts">
  import { enhance } from '$app/forms';
  import CsvImporter from '$lib/components/CsvImporter.svelte';
  import ToastBanner from '$lib/components/ToastBanner.svelte';

  let { data, form } = $props();

  let editId = $state<number | null>(null);
  let profesorId = $state<string>('');
  let horasACubrir = $state<number>(18);
  let situacion = $state<'definitivo' | 'provisional' | 'interino'>('definitivo');
  let esVacante = $state(false);
  let turno = $state('');
  let motivoReduccion = $state('');
  let guardando = $state(false);

  const totalHoras = $derived(data.participantes.reduce((s, p) => s + p.horasACubrir, 0));
  const editable = $derived(
    data.reparto.estado === 'Borrador' || data.reparto.estado === 'ListasAbiertas'
  );
  const yaParticipanIds = $derived(new Set(data.participantes.map((p) => p.profesorId)));
  const profesoresDisponibles = $derived(
    editId !== null
      ? data.profesoresActivos
      : data.profesoresActivos.filter((p) => !yaParticipanIds.has(p.id))
  );

  function editar(p: (typeof data.participantes)[number]) {
    editId = p.id;
    profesorId = String(p.profesorId);
    horasACubrir = p.horasACubrir;
    situacion = p.situacion;
    esVacante = p.esVacante;
    turno = p.turno ?? '';
    motivoReduccion = p.motivoReduccion ?? '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function limpiar() {
    editId = null;
    profesorId = '';
    horasACubrir = 18;
    situacion = 'definitivo';
    esVacante = false;
    turno = '';
    motivoReduccion = '';
  }

  function validarFilaParticipante(row: Record<string, string>, line: number) {
    const email = (row['email'] ?? row['correo'] ?? '').trim();
    const horas = (row['horas a cubrir'] ?? row['horas'] ?? '18').trim();
    const sit = (row['situacion'] ?? 'definitivo').trim();
    if (!email || !email.includes('@')) {
      return { line, summary: '', error: `Correo inválido (${email || 'vacío'})` };
    }
    return {
      line,
      summary: `${email} · ${horas} h · ${sit}`
    };
  }
</script>

<ToastBanner ok={form?.ok} error={form?.error} />

{#if !editable}
  <div
    class="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-700"
  >
    <span>
      Las listas ya se cerraron: el listado y el orden de participantes quedan en solo lectura.
    </span>
    <a
      href="/jefe/{data.reparto.id}/sala"
      class="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
    >
      Ir a Sala del reparto →
    </a>
  </div>
{/if}

{#if editable}
  <section
    class="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-4 shadow-xs {data
      .reparto.restringirPorTurno
      ? 'border-sky-200 bg-sky-50/70'
      : 'border-slate-200 bg-white'}"
  >
    <div>
      <h2 class="text-sm font-bold text-slate-900">
        Restricción por turno: {data.reparto.restringirPorTurno ? 'Activada' : 'Desactivada'}
      </h2>
      <p class="mt-0.5 text-xs text-slate-600">
        {#if data.reparto.restringirPorTurno}
          Cada profesor solo podrá elegir asignaturas de su turno (p. ej. Mañana o Tarde). Puedes
          fijarle el turno aquí o dejar que lo elija al preparar su lista.
        {:else}
          Actualmente los profesores pueden mezclar asignaturas de distintos turnos. Actívalo si en
          este reparto cada profesor debe ceñirse a un único turno.
        {/if}
      </p>
    </div>

    <form method="POST" action="?/configurarTurno" use:enhance>
      <input
        type="hidden"
        name="restringirPorTurno"
        value={data.reparto.restringirPorTurno ? 'false' : 'true'}
      />
      <button
        type="submit"
        class="rounded-xl px-4 py-2 text-xs font-semibold transition-colors {data.reparto
          .restringirPorTurno
          ? 'border border-sky-300 bg-white text-sky-900 hover:bg-sky-100'
          : 'bg-sky-600 text-white hover:bg-sky-700'}"
      >
        {data.reparto.restringirPorTurno
          ? 'Desactivar restricción por turno'
          : 'Activar restricción por turno'}
      </button>
    </form>
  </section>
{/if}

{#if data.user.esJefatura}
  <section class="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
    <form
      method="POST"
      action="?/cambiarJefe"
      use:enhance
      class="flex flex-wrap items-center gap-3"
    >
      <label for="jefeId" class="text-sm font-semibold text-slate-800">Jefe/a del reparto:</label>
      <select
        id="jefeId"
        name="jefeId"
        value={data.reparto.jefeId ?? ''}
        class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
      >
        <option value="">Sin asignar</option>
        {#each data.profesoresActivos as p}
          <option value={p.id}>{p.apellidos}, {p.nombre}</option>
        {/each}
      </select>
      <button
        type="submit"
        class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        Guardar jefe
      </button>
    </form>
  </section>
{/if}

<div class="grid gap-6 lg:grid-cols-3">
  {#if editable}
    <div class="space-y-6">
      <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold text-slate-900">
            {editId ? 'Editar participante' : 'Añadir participante'}
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

          <div>
            <label for="part-prof" class="block text-sm font-medium text-slate-700">Profesor</label>
            <select
              id="part-prof"
              name="profesorId"
              required
              bind:value={profesorId}
              disabled={editId !== null}
              class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
            >
              <option value="">Selecciona profesor…</option>
              {#each profesoresDisponibles as p}
                <option value={String(p.id)}>{p.apellidos}, {p.nombre}</option>
              {/each}
            </select>
            {#if editId}
              <input type="hidden" name="profesorId" value={profesorId} />
            {/if}
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label for="part-horas" class="block text-sm font-medium text-slate-700">
                Horas a cubrir
              </label>
              <input
                id="part-horas"
                name="horasACubrir"
                type="number"
                min="0"
                max="40"
                required
                bind:value={horasACubrir}
                class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label for="part-sit" class="block text-sm font-medium text-slate-700">
                Situación
              </label>
              <select
                id="part-sit"
                name="situacion"
                bind:value={situacion}
                class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="definitivo">Definitivo</option>
                <option value="provisional">Provisional</option>
                <option value="interino">Interino</option>
              </select>
            </div>
          </div>

          {#if data.reparto.restringirPorTurno}
            <div>
              <label for="part-turno" class="block text-sm font-medium text-slate-700">
                Turno asignado (opcional)
              </label>
              <input
                id="part-turno"
                name="turno"
                list="sugerencias-turno-part"
                bind:value={turno}
                placeholder="Vacío = elige el profesor en su lista"
                class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <datalist id="sugerencias-turno-part">
                {#each data.turnosSugeridos as t}
                  <option value={t}></option>
                {/each}
              </datalist>
            </div>
          {/if}

          <div>
            <label for="part-red" class="block text-sm font-medium text-slate-700">
              Motivo de reducción (privado, opcional)
            </label>
            <input
              id="part-red"
              name="motivoReduccion"
              bind:value={motivoReduccion}
              placeholder="Ej. Reducción por cargo"
              class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <label class="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="esVacante"
              bind:checked={esVacante}
              class="h-4 w-4 rounded"
            />
            Es vacante (no entra en rondas automáticas)
          </label>

          <button
            type="submit"
            disabled={guardando}
            class="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {guardando ? 'Guardando…' : editId ? 'Guardar cambios' : 'Añadir al reparto'}
          </button>
        </form>
      </section>

      <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <CsvImporter
          action="?/importarCsv"
          title="Importar participantes (CSV)"
          templateFilename="plantilla-participantes.csv"
          templateContent={'email;orden;horas a cubrir;situacion;es vacante\nana.lopez@centro.es;1;18;definitivo;no\nluis.perez@centro.es;2;15;provisional;no'}
          helpText="Los correos deben corresponder a profesores ya dados de alta en Jefatura."
          validateRow={validarFilaParticipante}
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
      <div>
        <h2 class="text-lg font-semibold text-slate-900">
          Orden de elección ({data.participantes.length})
        </h2>
        <p class="text-xs text-slate-500">El orden #1 elige primero en cada ronda.</p>
      </div>
      <div class="flex items-center gap-2">
        <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800">
          Total a cubrir: {totalHoras} h
        </span>
        {#if editable && data.participantes.length > 0}
          <a
            href="/jefe/{data.reparto.id}/grupos"
            class="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100"
          >
            Siguiente: Grupos →
          </a>
        {/if}
      </div>
    </div>

    <div class="mt-4 overflow-x-auto">
      <table class="w-full text-left text-sm">
        <thead class="border-b border-slate-200 text-xs text-slate-600 uppercase">
          <tr>
            <th class="py-2 pr-2">#</th>
            <th class="py-2 pr-3">Profesor</th>
            <th class="py-2 pr-3">Horas</th>
            <th class="py-2 pr-3">Situación</th>
            {#if editable}
              <th class="py-2 text-right">Acciones</th>
            {/if}
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          {#each data.participantes as p, idx}
            <tr>
              <td class="py-3 pr-2 font-mono font-semibold text-slate-600">{p.orden}</td>
              <td class="py-3 pr-3">
                <div class="font-semibold text-slate-900">
                  {p.apellidos}, {p.nombre}
                  {#if p.esVacante}
                    <span
                      class="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900"
                    >
                      Vacante
                    </span>
                  {/if}
                  {#if data.reparto.restringirPorTurno && p.turno}
                    <span
                      class="ml-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-900"
                    >
                      {p.turno}{p.turnoFijadoPorJefe ? '' : ' (elegido)'}
                    </span>
                  {/if}
                </div>
                {#if p.motivoReduccion}
                  <div class="text-xs text-slate-600">Reducción: {p.motivoReduccion}</div>
                {/if}
              </td>
              <td class="py-3 pr-3 font-semibold text-slate-900">{p.horasACubrir} h</td>
              <td class="py-3 pr-3 capitalize text-slate-700">{p.situacion}</td>
              {#if editable}
                <td class="py-3 text-right">
                  <div class="flex justify-end gap-1">
                    <form method="POST" action="?/moverOrden" use:enhance>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="dir" value="up" />
                      <button
                        type="submit"
                        disabled={idx === 0}
                        aria-label="Subir a {p.nombre} {p.apellidos} en el orden"
                        class="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold hover:bg-slate-50 disabled:opacity-30"
                      >
                        ↑
                      </button>
                    </form>
                    <form method="POST" action="?/moverOrden" use:enhance>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="dir" value="down" />
                      <button
                        type="submit"
                        disabled={idx === data.participantes.length - 1}
                        aria-label="Bajar a {p.nombre} {p.apellidos} en el orden"
                        class="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold hover:bg-slate-50 disabled:opacity-30"
                      >
                        ↓
                      </button>
                    </form>
                    <button
                      type="button"
                      onclick={() => editar(p)}
                      class="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
                    >
                      Editar
                    </button>
                    <form
                      method="POST"
                      action="?/eliminar"
                      use:enhance={({ cancel }) => {
                        if (!confirm(`¿Quitar a ${p.nombre} ${p.apellidos} de este reparto?`)) {
                          cancel();
                        }
                      }}
                    >
                      <input type="hidden" name="id" value={p.id} />
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
                Añade profesores del departamento para configurar el orden de elección.
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
</div>
