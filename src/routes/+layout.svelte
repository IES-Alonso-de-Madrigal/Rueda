<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';

  let { data, children } = $props();
  const enInicio = $derived(page.url.pathname === '/');
</script>

<div class="min-h-screen bg-slate-50 text-slate-900">
  {#if data.user}
    <header class="no-print sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div class="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <div class="flex min-w-0 items-center gap-3">
          <a href="/" class="flex shrink-0 items-center gap-2 font-bold text-slate-900">
            <span
              class="rounded-lg bg-indigo-600 px-2.5 py-1 text-sm font-bold tracking-tight text-white shadow-xs"
            >
              Rueda
            </span>
            {#if data.centro}
              <span
                class="hidden max-w-[240px] truncate text-sm font-medium text-slate-600 md:inline"
              >
                {data.centro.nombre}
              </span>
            {/if}
          </a>

          {#if !enInicio}
            <a
              href="/?inicio=1"
              class="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              ← Inicio
            </a>
          {/if}
        </div>

        <div class="flex min-w-0 items-center gap-2.5 text-sm">
          {#if data.user.esJefatura}
            <a
              href="/jefatura"
              class="hidden rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 sm:inline-block"
            >
              Jefatura
            </a>
          {/if}
          <span
            class="max-w-[130px] truncate text-xs font-medium text-slate-700 sm:max-w-[220px] sm:text-sm"
          >
            {data.user.nombre}
            {data.user.apellidos}
          </span>
          <form method="POST" action="/salir">
            <button
              type="submit"
              class="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              Salir
            </button>
          </form>
        </div>
      </div>
    </header>
  {/if}

  {@render children()}
</div>
