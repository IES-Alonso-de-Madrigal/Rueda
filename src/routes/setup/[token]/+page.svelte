<script lang="ts">
  import { enhance } from '$app/forms';

  let { form } = $props();
</script>

<main class="mx-auto flex min-h-[85vh] max-w-lg flex-col justify-center px-4 py-10">
  <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <h1 class="text-2xl font-bold text-slate-900">Configuración inicial</h1>
    <p class="mt-1 text-sm text-slate-600">
      Crea el primer usuario de Jefatura de estudios y registra los datos del centro.
    </p>

    {#if form?.error}
      <div class="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {form.error}
      </div>
    {/if}

    <form method="POST" use:enhance class="mt-5 space-y-4">
      <fieldset class="space-y-3 rounded-xl border border-slate-200 p-4">
        <legend class="px-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Datos del centro
        </legend>
        <div>
          <label for="centroNombre" class="block text-sm font-medium text-slate-700">
            Nombre del centro
          </label>
          <input
            id="centroNombre"
            name="centroNombre"
            required
            placeholder="IES Ejemplo"
            class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label for="centroCodigo" class="block text-sm font-medium text-slate-700">
              Código
            </label>
            <input
              id="centroCodigo"
              name="centroCodigo"
              placeholder="47000000"
              class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label for="centroLocalidad" class="block text-sm font-medium text-slate-700">
              Localidad
            </label>
            <input
              id="centroLocalidad"
              name="centroLocalidad"
              placeholder="Valladolid"
              class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </fieldset>

      <fieldset class="space-y-3 rounded-xl border border-slate-200 p-4">
        <legend class="px-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Primer usuario de Jefatura
        </legend>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label for="nombre" class="block text-sm font-medium text-slate-700">Nombre</label>
            <input
              id="nombre"
              name="nombre"
              required
              class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label for="apellidos" class="block text-sm font-medium text-slate-700">
              Apellidos
            </label>
            <input
              id="apellidos"
              name="apellidos"
              required
              class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label for="email" class="block text-sm font-medium text-slate-700">Correo</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </fieldset>

      <button
        type="submit"
        class="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
      >
        Guardar y entrar
      </button>
    </form>
  </div>
</main>
