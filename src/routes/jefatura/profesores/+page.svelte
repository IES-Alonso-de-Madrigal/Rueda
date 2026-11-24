<script lang="ts">
  import { enhance } from '$app/forms';
  import CopyButton from '$lib/components/CopyButton.svelte';
  import CsvImporter from '$lib/components/CsvImporter.svelte';
  import ToastBanner from '$lib/components/ToastBanner.svelte';

  let { data, form } = $props();

  let editId = $state<number | null>(null);
  let nombre = $state('');
  let apellidos = $state('');
  let email = $state('');
  let esJefatura = $state(false);
  let seleccionEsps = $state<number[]>([]);
  let guardando = $state(false);

  // Filtros del claustro
  let busqueda = $state('');
  let filtroEstado = $state<'activos' | 'todos' | 'baja'>('activos');
  let filtroEsp = $state<string>('');

  function editar(p: (typeof data.profesores)[number]) {
    editId = p.id;
    nombre = p.nombre;
    apellidos = p.apellidos;
    email = p.email;
    esJefatura = p.esJefatura;
    seleccionEsps = [...p.especialidadesIds];
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function limpiarFormulario() {
    editId = null;
    nombre = '';
    apellidos = '';
    email = '';
    esJefatura = false;
    seleccionEsps = [];
  }

  function toggleEsp(id: number) {
    if (seleccionEsps.includes(id)) {
      seleccionEsps = seleccionEsps.filter((x) => x !== id);
    } else {
      seleccionEsps = [...seleccionEsps, id];
    }
  }

  const espMap = $derived(new Map(data.especialidades.map((e) => [e.id, e])));

  const profesoresFiltrados = $derived(
    data.profesores.filter((p) => {
      if (filtroEstado === 'activos' && !p.activo) return false;
      if (filtroEstado === 'baja' && p.activo) return false;
      if (filtroEsp && !p.especialidadesIds.includes(Number(filtroEsp))) return false;
      if (busqueda.trim()) {
        const q = busqueda.trim().toLowerCase();
        const hay = `${p.nombre} ${p.apellidos} ${p.email}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
  );

  const textoAccesosMasivos = $derived(
    (form?.accesosEmitidos ?? [])
      .map((a) => `${a.profesor} (${a.email}) | Enlace: ${a.enlace} | Código: ${a.codigoCorto}`)
      .join('\n')
  );

  function validarFilaProfesor(row: Record<string, string>, line: number) {
    const n = row['nombre']?.trim();
    const ap = row['apellidos']?.trim();
    const em = (row['email'] ?? row['correo'] ?? '').trim();
    const esps = row['especialidades']?.trim();
    if (!n || !ap) return { line, summary: '', error: 'Falta nombre o apellidos' };
    if (!em || !em.includes('@'))
      return { line, summary: '', error: `Correo inválido (${em || 'vacío'})` };
    return {
      line,
      summary: `${ap}, ${n} · ${em}${esps ? ` · Esp: ${esps}` : ''}`
    };
  }
</script>

<ToastBanner ok={form?.ok} error={form?.error} />

{#if form?.accesosEmitidos && form.accesosEmitidos.length > 0}
  <section class="mb-6 rounded-2xl border border-indigo-200 bg-indigo-50/90 p-5 text-sm shadow-xs">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 class="font-bold text-indigo-950">
          Credenciales de acceso generadas ({form.accesosEmitidos.length})
        </h2>
        <p class="text-xs text-indigo-800">
          Por seguridad, los enlaces y códigos no se muestran de nuevo al recargar la página.
          Cópialos ahora si no usas SMTP.
        </p>
      </div>
      {#if form.accesosEmitidos.length > 1}
        <CopyButton value={textoAccesosMasivos} label="Copiar listado completo" size="sm" />
      {/if}
    </div>

    <div class="mt-3 max-h-72 overflow-y-auto rounded-xl border border-indigo-100 bg-white">
      <table class="w-full text-left text-xs">
        <thead class="border-b border-slate-200 bg-slate-50 text-slate-600 uppercase">
          <tr>
            <th class="px-3 py-2">Profesor</th>
            <th class="px-3 py-2">Enlace personal</th>
            <th class="px-3 py-2">Código móvil</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          {#each form.accesosEmitidos as acc}
            <tr>
              <td class="px-3 py-2">
                <div class="font-semibold text-slate-900">{acc.profesor}</div>
                <div class="text-slate-500">{acc.email}</div>
              </td>
              <td class="px-3 py-2">
                <div class="flex items-center gap-2">
                  <code class="max-w-[260px] truncate rounded bg-slate-100 px-2 py-1 text-[11px]">
                    {acc.enlace}
                  </code>
                  <CopyButton value={acc.enlace} label="Copiar enlace" />
                </div>
              </td>
              <td class="px-3 py-2">
                <div class="flex items-center gap-2">
                  <code
                    class="rounded bg-slate-100 px-2 py-1 font-mono text-sm font-bold tracking-widest"
                  >
                    {acc.codigoCorto}
                  </code>
                  <CopyButton value={acc.codigoCorto} label="Copiar" />
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
{/if}

<div class="grid gap-6 lg:grid-cols-3">
  <!-- Panel izquierdo: alta manual + CSV -->
  <div class="space-y-6">
    <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-slate-900">
          {editId ? 'Editar profesor' : 'Añadir profesor'}
        </h2>
        {#if editId}
          <button
            type="button"
            onclick={limpiarFormulario}
            class="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancelar edición
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
            if (result.type === 'success') {
              limpiarFormulario();
            }
          };
        }}
        class="mt-4 space-y-3"
      >
        {#if editId}
          <input type="hidden" name="id" value={editId} />
        {/if}
        <div>
          <label for="p-nombre" class="block text-sm font-medium text-slate-700">Nombre</label>
          <input
            id="p-nombre"
            name="nombre"
            required
            bind:value={nombre}
            class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label for="p-apellidos" class="block text-sm font-medium text-slate-700">
            Apellidos
          </label>
          <input
            id="p-apellidos"
            name="apellidos"
            required
            bind:value={apellidos}
            class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label for="p-email" class="block text-sm font-medium text-slate-700">
            Correo electrónico
          </label>
          <input
            id="p-email"
            name="email"
            type="email"
            required
            bind:value={email}
            class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <span class="block text-sm font-medium text-slate-700">Especialidades</span>
          <div class="mt-1.5 flex flex-wrap gap-1.5">
            {#each data.especialidades as e}
              {@const checked = seleccionEsps.includes(e.id)}
              <label
                class="cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-within:ring-2 focus-within:ring-indigo-500 {checked
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
                {e.codigo} · {e.nombre}
              </label>
            {:else}
              <p class="text-xs text-slate-500">
                Opcional: puedes crear especialidades en «Centro y cursos».
              </p>
            {/each}
          </div>
        </div>

        <label class="flex items-center gap-2 pt-1 text-sm text-slate-700">
          <input
            type="checkbox"
            name="esJefatura"
            bind:checked={esJefatura}
            class="h-4 w-4 rounded border-slate-300"
          />
          Pertenece a Jefatura de estudios
        </label>

        <button
          type="submit"
          disabled={guardando}
          class="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : editId ? 'Guardar cambios' : 'Añadir profesor'}
        </button>
      </form>
    </section>

    <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <CsvImporter
        action="?/importarCsv"
        title="Carga masiva de profesores (CSV)"
        templateFilename="plantilla-profesores.csv"
        templateContent={'nombre;apellidos;email;especialidades\nAna;López García;ana.lopez@centro.es;107\nLuis;Pérez Ruiz;luis.perez@centro.es;107|227'}
        helpText="Columnas: nombre;apellidos;email;especialidades (códigos o nombres separados por |). Si un correo ya existe, se actualiza."
        validateRow={validarFilaProfesor}
      />
    </section>
  </div>

  <!-- Listado del claustro -->
  <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-2">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-slate-900">
          Claustro ({profesoresFiltrados.length} de {data.profesores.length})
        </h2>
        <p class="text-xs text-slate-500">
          Genera enlaces personales y códigos cortos para profesores y otros usuarios de Jefatura.
        </p>
      </div>

      <div class="flex flex-wrap gap-2">
        <form
          method="POST"
          action="?/emitirAccesosMasivos"
          use:enhance={({ cancel }) => {
            if (
              !confirm(
                '¿Generar nuevos enlaces y códigos para TODOS los profesores activos? Los enlaces anteriores quedarán revocados.'
              )
            ) {
              cancel();
            }
          }}
        >
          <input type="hidden" name="enviarEmail" value="false" />
          <button
            type="submit"
            class="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100"
          >
            Generar todos los accesos
          </button>
        </form>

        {#if data.smtpConfigurado}
          <form
            method="POST"
            action="?/emitirAccesosMasivos"
            use:enhance={({ cancel }) => {
              if (
                !confirm('¿Generar y enviar por correo los enlaces a TODOS los profesores activos?')
              ) {
                cancel();
              }
            }}
          >
            <input type="hidden" name="enviarEmail" value="true" />
            <button
              type="submit"
              class="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              Enviar accesos por correo
            </button>
          </form>
        {/if}
      </div>
    </div>

    <!-- Buscador y filtros -->
    <div class="mt-4 grid gap-2 sm:grid-cols-3">
      <input
        type="search"
        bind:value={busqueda}
        aria-label="Buscar profesor"
        placeholder="Buscar por nombre o correo…"
        class="rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      <select
        bind:value={filtroEstado}
        aria-label="Filtrar por estado"
        class="rounded-lg border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="activos">Solo activos</option>
        <option value="todos">Todos</option>
        <option value="baja">Solo bajas / anonimizados</option>
      </select>
      <select
        bind:value={filtroEsp}
        aria-label="Filtrar por especialidad"
        class="rounded-lg border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="">Todas las especialidades</option>
        {#each data.especialidades as e}
          <option value={String(e.id)}>{e.codigo} — {e.nombre}</option>
        {/each}
      </select>
    </div>

    <div class="mt-4 overflow-x-auto">
      <table class="w-full text-left text-sm">
        <thead class="border-b border-slate-200 text-xs text-slate-600 uppercase">
          <tr>
            <th class="py-2 pr-3">Profesor</th>
            <th class="py-2 pr-3">Especialidades</th>
            <th class="py-2 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          {#each profesoresFiltrados as p}
            <tr class={p.activo ? '' : 'bg-slate-50/70 opacity-70'}>
              <td class="py-3 pr-3">
                <div class="font-semibold text-slate-900">
                  {p.apellidos}, {p.nombre}
                  {#if p.esJefatura}
                    <span
                      class="ml-1 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800"
                    >
                      Jefatura
                    </span>
                  {/if}
                  {#if !p.activo}
                    <span
                      class="ml-1 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700"
                    >
                      {p.esAnonimizado ? 'Anonimizado' : 'Baja'}
                    </span>
                  {/if}
                </div>
                <div class="text-xs text-slate-600">{p.email}</div>
              </td>
              <td class="py-3 pr-3">
                <div class="flex flex-wrap gap-1">
                  {#each p.especialidadesIds as eid}
                    {@const e = espMap.get(eid)}
                    {#if e}
                      <span
                        class="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
                      >
                        {e.codigo}
                      </span>
                    {/if}
                  {:else}
                    <span class="text-xs text-slate-500">—</span>
                  {/each}
                </div>
              </td>
              <td class="py-3 text-right">
                <div class="flex flex-wrap justify-end gap-1.5">
                  {#if !p.esAnonimizado}
                    <button
                      type="button"
                      onclick={() => editar(p)}
                      class="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Editar
                    </button>
                  {/if}
                  {#if p.activo}
                    <form method="POST" action="?/emitirAcceso" use:enhance>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="enviarEmail" value="false" />
                      <button
                        type="submit"
                        class="rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-800 hover:bg-indigo-100"
                      >
                        Enlace/código
                      </button>
                    </form>
                    {#if data.smtpConfigurado}
                      <form method="POST" action="?/emitirAcceso" use:enhance>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="enviarEmail" value="true" />
                        <button
                          type="submit"
                          class="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
                        >
                          Enviar email
                        </button>
                      </form>
                    {/if}
                  {/if}
                  {#if !p.esAnonimizado}
                    <form
                      method="POST"
                      action="?/toggleActivo"
                      use:enhance={({ cancel }) => {
                        if (
                          p.activo &&
                          !confirm(
                            `¿Dar de baja lógica a ${p.nombre} ${p.apellidos}? Dejará de poder iniciar sesión.`
                          )
                        ) {
                          cancel();
                        }
                      }}
                    >
                      <input type="hidden" name="id" value={p.id} />
                      <button
                        type="submit"
                        class="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        {p.activo ? 'Baja' : 'Reactivar'}
                      </button>
                    </form>
                    <form
                      method="POST"
                      action="?/anonimizar"
                      use:enhance={({ cancel }) => {
                        if (
                          !confirm(
                            `ATENCIÓN: ¿Anonimizar permanentemente a ${p.nombre} ${p.apellidos}? Se borrarán su nombre y correo conservando las actas históricas. Esta acción no se puede deshacer.`
                          )
                        ) {
                          cancel();
                        }
                      }}
                    >
                      <input type="hidden" name="id" value={p.id} />
                      <button
                        type="submit"
                        class="rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                      >
                        Anonimizar
                      </button>
                    </form>
                  {/if}
                </div>
              </td>
            </tr>
          {:else}
            <tr>
              <td colspan="3" class="py-8 text-center text-sm text-slate-500">
                No hay profesores que coincidan con el filtro.
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
</div>
