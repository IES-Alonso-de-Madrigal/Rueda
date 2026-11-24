<script lang="ts">
  import { page } from '$app/state';
</script>

<main class="mx-auto flex min-h-[75vh] max-w-lg flex-col justify-center px-4 py-12">
  <div class="rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm">
    <div
      class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-lg font-bold text-red-700"
    >
      {page.status}
    </div>
    <h1 class="mt-4 text-xl font-bold text-slate-900">
      {#if page.status === 403}
        Acceso no permitido
      {:else if page.status === 404}
        Página no encontrada
      {:else}
        No se pudo completar la operación
      {/if}
    </h1>
    <p class="mt-2 text-sm text-slate-600">
      {page.error?.message ?? 'Ha ocurrido un error inesperado.'}
    </p>
    <div class="mt-6 flex flex-wrap justify-center gap-3">
      <a
        href="/"
        class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
      >
        Ir al inicio
      </a>
      <a
        href="/acceso"
        class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        Entrar con código
      </a>
    </div>
  </div>
</main>
