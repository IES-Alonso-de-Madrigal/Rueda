<script lang="ts">
  import { enhance } from '$app/forms';
  import ToastBanner from '$lib/components/ToastBanner.svelte';

  let { data, form } = $props();

  const listoPaso1 = $derived(
    data.cursos.some((c) => c.estado === 'activo') && data.departamentos.length > 0
  );
</script>

<ToastBanner ok={form?.ok} error={form?.error} />

{#if !listoPaso1}
  <div
    class="mb-6 rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 text-sm text-indigo-950"
  >
    <strong>Primer paso para arrancar el curso:</strong> crea el <strong>curso académico</strong>
    activo (o cópialo del año pasado), añade los <strong>departamentos</strong> y las
    <strong>especialidades</strong>. Después podrás cargar el claustro en el paso 2.
  </div>
{:else}
  <div
    class="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-950"
  >
    <span> ✓ Centro, curso activo y departamentos listos. </span>
    <a
      href="/jefatura/profesores"
      class="rounded-lg bg-emerald-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
    >
      Ir al paso 2: Cargar profesores →
    </a>
  </div>
{/if}

<div class="grid gap-6 lg:grid-cols-2">
  <!-- Centro -->
  <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
    <h2 class="text-lg font-semibold text-slate-900">Datos del centro</h2>
    <p class="mt-0.5 text-xs text-slate-500">Aparecen en el encabezado de todas las actas.</p>
    <form method="POST" action="?/guardarCentro" use:enhance class="mt-4 space-y-3">
      <div>
        <label for="c-nombre" class="block text-sm font-medium text-slate-700">Nombre</label>
        <input
          id="c-nombre"
          name="nombre"
          required
          value={data.centro?.nombre ?? ''}
          class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label for="c-codigo" class="block text-sm font-medium text-slate-700">Código</label>
          <input
            id="c-codigo"
            name="codigo"
            value={data.centro?.codigo ?? ''}
            class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label for="c-loc" class="block text-sm font-medium text-slate-700">Localidad</label>
          <input
            id="c-loc"
            name="localidad"
            value={data.centro?.localidad ?? ''}
            class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>
      <button
        type="submit"
        class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
      >
        Guardar centro
      </button>
    </form>
  </section>

  <!-- Cursos -->
  <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
    <h2 class="text-lg font-semibold text-slate-900">Cursos académicos</h2>
    <p class="mt-0.5 text-xs text-slate-500">
      Puedes copiar los repartos, jefes y grupos de un curso anterior para empezar rápido.
    </p>
    <form method="POST" action="?/crearCurso" use:enhance class="mt-4 space-y-3">
      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <label for="curso-nombre" class="block text-sm font-medium text-slate-700">
            Nuevo curso
          </label>
          <input
            id="curso-nombre"
            name="nombre"
            required
            placeholder="Ej. 2026-27"
            class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label for="curso-copiar" class="block text-sm font-medium text-slate-700">
            Copiar del anterior (opcional)
          </label>
          <select
            id="curso-copiar"
            name="copiarDeCursoId"
            class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">— Empezar vacío —</option>
            {#each data.cursos as c}
              <option value={c.id}>{c.nombre} ({c.estado})</option>
            {/each}
          </select>
        </div>
      </div>
      <button
        type="submit"
        class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
      >
        Crear curso
      </button>
    </form>

    <ul class="mt-4 divide-y divide-slate-100">
      {#each data.cursos as c}
        <li class="flex items-center justify-between py-2.5 text-sm">
          <div>
            <span class="font-semibold text-slate-900">{c.nombre}</span>
            <span
              class="ml-2 rounded-full px-2.5 py-0.5 text-xs font-medium {c.estado === 'activo'
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-slate-200 text-slate-700'}"
            >
              {c.estado === 'activo' ? 'Activo' : 'Archivado'}
            </span>
          </div>
          {#if c.estado === 'activo'}
            <form
              method="POST"
              action="?/archivarCurso"
              use:enhance={({ cancel }) => {
                if (
                  !confirm(
                    `¿Archivar el curso ${c.nombre}? Todos sus repartos pasarán a solo lectura.`
                  )
                ) {
                  cancel();
                }
              }}
            >
              <input type="hidden" name="id" value={c.id} />
              <button
                type="submit"
                class="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Archivar
              </button>
            </form>
          {/if}
        </li>
      {:else}
        <li class="py-3 text-sm text-slate-500">Todavía no hay cursos creados.</li>
      {/each}
    </ul>
  </section>

  <!-- Departamentos -->
  <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
    <h2 class="text-lg font-semibold text-slate-900">Departamentos</h2>
    <p class="mt-0.5 text-xs text-slate-500">Persisten entre cursos.</p>
    <form method="POST" action="?/crearDepartamento" use:enhance class="mt-4 flex gap-2">
      <input
        name="nombre"
        required
        aria-label="Nombre del departamento"
        placeholder="Ej. Informática, Matemáticas…"
        class="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      <button
        type="submit"
        class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
      >
        Añadir
      </button>
    </form>
    <ul class="mt-4 divide-y divide-slate-100">
      {#each data.departamentos as d}
        <li class="flex items-center justify-between py-2 text-sm">
          <span class="font-medium text-slate-800">{d.nombre}</span>
          <form
            method="POST"
            action="?/eliminarDepartamento"
            use:enhance={({ cancel }) => {
              if (!confirm(`¿Eliminar el departamento "${d.nombre}"?`)) cancel();
            }}
          >
            <input type="hidden" name="id" value={d.id} />
            <button type="submit" class="text-xs font-medium text-red-600 hover:underline">
              Eliminar
            </button>
          </form>
        </li>
      {:else}
        <li class="py-3 text-sm text-slate-500">Sin departamentos todavía.</li>
      {/each}
    </ul>
  </section>

  <!-- Especialidades -->
  <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
    <h2 class="text-lg font-semibold text-slate-900">Especialidades</h2>
    <p class="mt-0.5 text-xs text-slate-500">
      Opcional: sirven para restringir qué profesores pueden elegir cada grupo.
    </p>
    <form method="POST" action="?/crearEspecialidad" use:enhance class="mt-4 flex gap-2">
      <input
        name="codigo"
        required
        aria-label="Código de especialidad"
        placeholder="Código (107)"
        class="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      <input
        name="nombre"
        required
        aria-label="Nombre de especialidad"
        placeholder="Nombre (Informática)"
        class="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      <button
        type="submit"
        class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
      >
        Añadir
      </button>
    </form>
    <ul class="mt-4 divide-y divide-slate-100">
      {#each data.especialidades as e}
        <li class="flex items-center justify-between py-2 text-sm">
          <span>
            <strong class="font-mono text-slate-700">{e.codigo}</strong> — {e.nombre}
          </span>
          <form
            method="POST"
            action="?/eliminarEspecialidad"
            use:enhance={({ cancel }) => {
              if (!confirm(`¿Eliminar la especialidad "${e.codigo} - ${e.nombre}"?`)) cancel();
            }}
          >
            <input type="hidden" name="id" value={e.id} />
            <button type="submit" class="text-xs font-medium text-red-600 hover:underline">
              Eliminar
            </button>
          </form>
        </li>
      {:else}
        <li class="py-3 text-sm text-slate-500">Sin especialidades todavía.</li>
      {/each}
    </ul>
  </section>
</div>
