<script lang="ts">
  import { enhance } from '$app/forms';
  import CopyButton from '$lib/components/CopyButton.svelte';
  import ToastBanner from '$lib/components/ToastBanner.svelte';
  import { estadoLabel, formatFechaHora } from '$lib/ui';

  let { data, form } = $props();

  const participantesNoVacantes = $derived(data.participantes.filter((p) => !p.esVacante));
  const vaciosCount = $derived(
    participantesNoVacantes.filter((p) => p.numGruposEnLista === 0).length
  );
  const textoAccesosTodos = $derived(
    (form?.accesosEmitidos ?? [])
      .map((a) => `${a.profesor} (${a.email}) | Enlace: ${a.enlace} | Código: ${a.codigoCorto}`)
      .join('\n')
  );
</script>

<ToastBanner ok={form?.ok} error={form?.error} />

{#if form?.accesosEmitidos && form.accesosEmitidos.length > 0}
  <section class="mb-6 rounded-2xl border border-indigo-200 bg-indigo-50/90 p-5 text-sm shadow-xs">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 class="font-bold text-indigo-950">
          Invitaciones generadas ({form.accesosEmitidos.length})
        </h2>
        <p class="text-xs text-indigo-800">
          Comparte el enlace personal o el código corto para móvil.
        </p>
      </div>
      {#if form.accesosEmitidos.length > 1}
        <CopyButton value={textoAccesosTodos} label="Copiar todas" size="sm" />
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
              <td class="px-3 py-2 font-semibold text-slate-900">{acc.profesor}</td>
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

<!-- Controles de fase de listas -->
<section
  class="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
>
  <div>
    <h2 class="text-lg font-semibold text-slate-900">Control de listas</h2>
    <p class="mt-0.5 text-sm text-slate-600">
      Cada profesor guarda su lista al instante (sin borrador). El cierre es siempre manual.
    </p>
    {#if data.reparto.estado === 'ListasAbiertas' && vaciosCount > 0}
      <p class="mt-1.5 text-xs font-medium text-amber-800">
        ⚠ Todavía hay {vaciosCount} profesor(es) con la lista vacía.
      </p>
    {/if}
  </div>

  <div class="flex flex-wrap gap-2">
    {#if data.reparto.estado === 'Borrador'}
      <form method="POST" action="?/abrirListas" use:enhance>
        <button
          type="submit"
          class="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Abrir listas a los profesores
        </button>
      </form>
    {:else if data.reparto.estado === 'ListasAbiertas'}
      <form
        method="POST"
        action="?/cerrarListas"
        use:enhance={({ cancel }) => {
          const aviso =
            vaciosCount > 0
              ? `Hay ${vaciosCount} profesor(es) con la lista vacía (se bloqueará su turno al llegarles). ¿Cerrar listas y tomar foto ahora?`
              : '¿Cerrar listas y tomar foto inicial para lanzar la primera ronda?';
          if (!confirm(aviso)) cancel();
        }}
      >
        <button
          type="submit"
          class="rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-700"
        >
          Cerrar listas ahora (tomar foto)
        </button>
      </form>
    {:else}
      <div class="flex items-center gap-2">
        <span class="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
          Listas cerradas ({estadoLabel(data.reparto.estado)})
        </span>
        <a
          href="/jefe/{data.reparto.id}/sala"
          class="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
        >
          Ir a Sala del reparto →
        </a>
      </div>
    {/if}
  </div>
</section>

<!-- Panel de lista consultada -->
{#if form?.listaConsultada}
  <section class="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-5 shadow-xs">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="font-bold text-amber-950">
        Lista de {form.listaConsultada.profesorNombre}
      </h3>
      {#if !form.listaConsultada.esPropia}
        <span class="rounded-full bg-amber-200 px-2.5 py-0.5 text-xs font-semibold text-amber-950">
          Consulta registrada en el acta
        </span>
      {/if}
    </div>
    {#if form.listaConsultada.items.length > 0}
      <ol class="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-800">
        {#each form.listaConsultada.items as item}
          <li>
            <strong>{item.materia}</strong> ({item.curso}
            {item.nombreGrupo} · {item.turno}) — {item.horasSemanales} h
          </li>
        {/each}
      </ol>
    {:else}
      <p class="mt-2 text-sm text-slate-600">Lista vacía.</p>
    {/if}
  </section>
{/if}

<!-- Tabla de participantes -->
<section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h2 class="text-lg font-semibold text-slate-900">Estado de listas e invitaciones</h2>
      <p class="mt-0.5 text-xs text-slate-600">
        Por privacidad, aquí solo se muestra el resumen. Pulsar «Ver lista» queda registrado en el
        acta.
      </p>
    </div>

    <div class="flex flex-wrap gap-2">
      <form
        method="POST"
        action="?/emitirAccesosTodos"
        use:enhance={({ cancel }) => {
          if (
            !confirm(
              '¿Generar nuevos enlaces y códigos para todos los participantes del departamento?'
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
          Generar enlaces para todos
        </button>
      </form>
      {#if data.smtpConfigurado}
        <form
          method="POST"
          action="?/emitirAccesosTodos"
          use:enhance={({ cancel }) => {
            if (!confirm('¿Enviar invitaciones por correo a todo el departamento?')) cancel();
          }}
        >
          <input type="hidden" name="enviarEmail" value="true" />
          <button
            type="submit"
            class="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            Enviar invitaciones por email
          </button>
        </form>
      {/if}
    </div>
  </div>

  <div class="mt-4 overflow-x-auto">
    <table class="w-full text-left text-sm">
      <thead class="border-b border-slate-200 text-xs text-slate-600 uppercase">
        <tr>
          <th class="py-2 pr-2">#</th>
          <th class="py-2 pr-3">Profesor</th>
          <th class="py-2 pr-3">Resumen lista</th>
          <th class="py-2 text-right">Acciones</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100">
        {#each data.participantes as p}
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
              </div>
              <div class="text-xs text-slate-600">{p.email}</div>
            </td>
            <td class="py-3 pr-3 text-xs text-slate-700">
              {#if p.esVacante}
                No hace lista
              {:else if p.numGruposEnLista > 0}
                <span class="font-semibold text-emerald-800">{p.numGruposEnLista} grupos</span>
                {#if p.actualizadaEn}
                  <span class="text-slate-500"> · act. {formatFechaHora(p.actualizadaEn)}</span>
                {/if}
              {:else}
                <span class="font-medium text-amber-700">Lista vacía</span>
              {/if}
            </td>
            <td class="py-3 text-right">
              <div class="flex flex-wrap justify-end gap-1.5">
                {#if !p.esVacante}
                  <form method="POST" action="?/verLista" use:enhance>
                    <input type="hidden" name="participanteId" value={p.id} />
                    <button
                      type="submit"
                      class="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-950 hover:bg-amber-100"
                    >
                      Ver lista
                    </button>
                  </form>
                  <form method="POST" action="?/emitirAcceso" use:enhance>
                    <input type="hidden" name="profesorId" value={p.profesorId} />
                    <input type="hidden" name="enviarEmail" value="false" />
                    <button
                      type="submit"
                      class="rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-800 hover:bg-indigo-100"
                    >
                      Enlace / código
                    </button>
                  </form>
                  {#if data.smtpConfigurado}
                    <form method="POST" action="?/emitirAcceso" use:enhance>
                      <input type="hidden" name="profesorId" value={p.profesorId} />
                      <input type="hidden" name="enviarEmail" value="true" />
                      <button
                        type="submit"
                        class="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
                      >
                        Email
                      </button>
                    </form>
                  {/if}
                {/if}
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>
