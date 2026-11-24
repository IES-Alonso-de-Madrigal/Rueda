<script lang="ts">
  import { enhance } from '$app/forms';

  let { form } = $props();
  let submitting = $state(false);
</script>

<main class="mx-auto flex min-h-[85vh] max-w-md flex-col justify-center px-4 py-10">
  <div class="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
    <div class="mb-4 inline-flex items-center gap-2">
      <span class="rounded-lg bg-indigo-600 px-2.5 py-1 text-sm font-bold text-white">Rueda</span>
      <span class="text-xs font-medium text-slate-500">Reparto de grupos</span>
    </div>

    <h1 class="text-2xl font-bold text-slate-900">Entrar al reparto</h1>
    <p class="mt-2 text-sm text-slate-600">
      Si recibiste un <strong>enlace personal</strong> por correo, ábrelo directamente. También
      puedes entrar desde el móvil con tu <strong>código corto de 6 caracteres</strong>.
    </p>

    {#if form?.error}
      <div
        role="alert"
        class="mt-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800"
      >
        {form.error}
      </div>
    {/if}

    <form
      method="POST"
      use:enhance={() => {
        submitting = true;
        return async ({ update }) => {
          submitting = false;
          await update();
        };
      }}
      class="mt-5 space-y-4"
    >
      <div>
        <label for="codigo" class="block text-sm font-medium text-slate-700">Código corto</label>
        <input
          id="codigo"
          name="codigo"
          type="text"
          autocomplete="one-time-code"
          placeholder="Ej. A7K9P2"
          required
          maxlength="12"
          class="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 text-center font-mono text-xl font-bold tracking-[0.25em] uppercase focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        class="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50"
      >
        {submitting ? 'Comprobando…' : 'Entrar'}
      </button>
    </form>
  </div>
</main>
