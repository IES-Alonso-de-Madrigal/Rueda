<script lang="ts">
  import { estadoBadgeClass, estadoLabel } from '$lib/ui';

  let { data } = $props();

  const sinEspacios = $derived(
    !data.user.esJefatura &&
      data.repartosComoJefe.length === 0 &&
      data.repartosComoProfesor.length === 0
  );
</script>

<main class="mx-auto max-w-4xl space-y-6 px-4 py-8">
  <div>
    <h1 class="text-2xl font-bold text-slate-900">
      Hola, {data.user.nombre}
    </h1>
    <p class="mt-1 text-sm text-slate-600">Elige el espacio o reparto al que quieres entrar.</p>
  </div>

  {#if data.user.esJefatura}
    <section
      class="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-6 shadow-xs"
    >
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span
            class="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-800"
          >
            Administración del centro
          </span>
          <h2 class="mt-2 text-lg font-bold text-slate-900">Jefatura de estudios</h2>
          <p class="mt-1 text-sm text-slate-600">
            Carga inicial del claustro, cursos, departamentos, repartos, histórico y copias de
            seguridad.
          </p>
        </div>
        <a
          href="/jefatura"
          class="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-indigo-700"
        >
          Abrir panel de Jefatura →
        </a>
      </div>
    </section>
  {/if}

  {#if data.repartosComoJefe.length > 0}
    <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <h2 class="text-base font-bold text-slate-900">
        Repartos que diriges (Jefatura de departamento)
      </h2>
      <ul class="mt-3 divide-y divide-slate-100">
        {#each data.repartosComoJefe as rep}
          <li class="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p class="font-semibold text-slate-900">
                {rep.departamento}
                <span class="ml-1 text-xs font-normal text-slate-500">({rep.curso})</span>
              </p>
              <span
                class="mt-1 inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium {estadoBadgeClass(
                  rep.estado
                )}"
              >
                {estadoLabel(rep.estado)}
              </span>
            </div>
            <a
              href="/jefe/{rep.id}"
              class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Gestionar reparto →
            </a>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if data.repartosComoProfesor.length > 0}
    <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <h2 class="text-base font-bold text-slate-900">Mis repartos como profesor</h2>
      <ul class="mt-3 divide-y divide-slate-100">
        {#each data.repartosComoProfesor as rep}
          <li class="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p class="font-semibold text-slate-900">
                {rep.departamento}
                <span class="ml-1 text-xs font-normal text-slate-500">({rep.curso})</span>
              </p>
              <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span
                  class="rounded-full border px-2.5 py-0.5 font-medium {estadoBadgeClass(
                    rep.estado
                  )}"
                >
                  {estadoLabel(rep.estado)}
                </span>
                <span>Orden #{rep.orden} · {rep.horasACubrir} h a cubrir</span>
              </div>
            </div>
            <a
              href="/p/{rep.id}"
              class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Entrar →
            </a>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if sinEspacios}
    <section class="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xs">
      <h2 class="text-lg font-bold text-slate-900">Todavía no figuras en ningún reparto activo</h2>
      <p class="mx-auto mt-2 max-w-md text-sm text-slate-600">
        Tu cuenta está activa, pero Jefatura o tu jefe de departamento aún no te han añadido a
        ningún reparto de este curso.
      </p>
    </section>
  {/if}
</main>
