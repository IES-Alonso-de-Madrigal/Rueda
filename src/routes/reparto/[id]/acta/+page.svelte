<script lang="ts">
  import { formatDesviacion } from '$lib/ui';

  let { data } = $props();

  const firmantes = $derived(data.participantes.filter((p) => !p.esVacante));
</script>

<main class="mx-auto max-w-4xl bg-white px-6 py-8 text-slate-900 print:p-0">
  <div class="no-print mb-6 flex items-center justify-between border-b border-slate-200 pb-4">
    <button
      type="button"
      onclick={() => history.back()}
      class="text-sm font-medium text-indigo-600 hover:underline"
    >
      ← Volver
    </button>
    <button
      type="button"
      onclick={() => window.print()}
      class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
    >
      Imprimir / Guardar PDF (A4)
    </button>
  </div>

  <!-- 1. Encabezado -->
  <section class="border-b-2 border-slate-900 pb-4">
    <h1 class="text-2xl font-bold uppercase">Acta de reparto de grupos y materias</h1>
    <div class="mt-3 grid grid-cols-2 gap-2 text-sm">
      <p>
        <strong>Centro:</strong>
        {data.centro?.nombre ?? '—'}
        {data.centro?.codigo ? `(${data.centro.codigo})` : ''}
      </p>
      <p><strong>Localidad:</strong> {data.centro?.localidad || '—'}</p>
      <p><strong>Curso académico:</strong> {data.reparto.cursoNombre}</p>
      <p><strong>Departamento:</strong> {data.reparto.departamentoNombre}</p>
      <p><strong>Inicio:</strong> {data.reparto.iniciadoFormateado}</p>
      <p><strong>Cierre:</strong> {data.reparto.cerradoFormateado}</p>
      <p>
        <strong>Restricción por turno:</strong>
        {data.reparto.restringirPorTurno ? 'Sí (turno único por profesor)' : 'No'}
      </p>
    </div>
    <p class="mt-2 text-sm">
      <strong>Asistentes:</strong>
      {data.asistentes.length > 0 ? data.asistentes.join('; ') : 'Sin registrar'}
    </p>
  </section>

  <!-- 2. Orden de elección -->
  <section class="mt-6">
    <h2 class="border-b border-slate-300 pb-1 text-base font-bold uppercase">
      2. Orden de elección y situación
    </h2>
    <table class="mt-2 w-full text-left text-xs">
      <thead>
        <tr class="border-b border-slate-300">
          <th class="py-1.5">Orden</th>
          <th class="py-1.5">Profesor</th>
          <th class="py-1.5">Situación</th>
          {#if data.reparto.restringirPorTurno}
            <th class="py-1.5">Turno</th>
          {/if}
          <th class="py-1.5 text-right">Horas a cubrir</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-200">
        {#each data.participantes as p}
          <tr>
            <td class="py-1.5 font-mono">{p.orden}</td>
            <td class="py-1.5">{p.apellidos}, {p.nombre} {p.esVacante ? '(Vacante)' : ''}</td>
            <td class="py-1.5 capitalize">{p.situacion}</td>
            {#if data.reparto.restringirPorTurno}
              <td class="py-1.5">{p.turno || '—'}</td>
            {/if}
            <td class="py-1.5 text-right">{p.horasACubrir} h</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>

  <!-- 3. Fuera del reparto (92.d) -->
  <section class="mt-6">
    <h2 class="border-b border-slate-300 pb-1 text-base font-bold uppercase">
      3. Grupos fuera del reparto (punto 92.d)
    </h2>
    {#if data.gruposFuera.length > 0}
      <ul class="mt-2 list-disc space-y-1 pl-5 text-xs">
        {#each data.gruposFuera as g}
          <li>
            <strong>{g.materia}</strong> ({g.curso}
            {g.nombreGrupo}, {g.turno}, {g.horasSemanales} h)
            {#if g.profesorExterno}
              — {g.profesorExterno}{/if}
          </li>
        {/each}
      </ul>
    {:else}
      <p class="mt-2 text-xs text-slate-600">Ninguno.</p>
    {/if}
  </section>

  <!-- 4. Elecciones ronda a ronda -->
  <section class="mt-6">
    <h2 class="border-b border-slate-300 pb-1 text-base font-bold uppercase">
      4. Elecciones ronda a ronda
    </h2>
    {#if data.rondasAsignaciones.length > 0}
      <table class="mt-2 w-full text-left text-xs">
        <thead>
          <tr class="border-b border-slate-300">
            <th class="py-1.5">Ronda</th>
            <th class="py-1.5">Turno</th>
            <th class="py-1.5">Profesor</th>
            <th class="py-1.5">Grupo elegido</th>
            <th class="py-1.5">Jornada</th>
            <th class="py-1.5 text-right">Horas</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200">
          {#each data.rondasAsignaciones as r}
            <tr>
              <td class="py-1.5">Ronda {r.ronda}</td>
              <td class="py-1.5 font-mono">#{r.orden}</td>
              <td class="py-1.5">{r.profesor}</td>
              <td class="py-1.5">{r.grupo}</td>
              <td class="py-1.5">{r.turno}</td>
              <td class="py-1.5 text-right">{r.horas} h</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p class="mt-2 text-xs text-slate-600">Sin asignaciones en rondas automáticas.</p>
    {/if}
  </section>

  <!-- 5. Bloqueos y resolución -->
  <section class="mt-6">
    <h2 class="border-b border-slate-300 pb-1 text-base font-bold uppercase">
      5. Bloqueos y resolución
    </h2>
    {#if data.bloqueosLegibles.length > 0}
      <ul class="mt-2 list-disc space-y-1 pl-5 text-xs">
        {#each data.bloqueosLegibles as item}
          <li>
            <span class="font-mono text-slate-600">[{item.fecha}]</span>
            {item.descripcion}
          </li>
        {/each}
      </ul>
    {:else}
      <p class="mt-2 text-xs text-slate-600">No se produjeron bloqueos.</p>
    {/if}
  </section>

  <!-- 6. Cambios en fase manual -->
  <section class="mt-6">
    <h2 class="border-b border-slate-300 pb-1 text-base font-bold uppercase">
      6. Cambios en fase manual y anulaciones
    </h2>
    {#if data.manualesLegibles.length > 0}
      <ul class="mt-2 list-disc space-y-1 pl-5 text-xs">
        {#each data.manualesLegibles as item}
          <li>
            <span class="font-mono text-slate-600">[{item.fecha}]</span>
            {item.descripcion}
            {#if item.actor}<span class="text-slate-600"> ({item.actor})</span>{/if}
          </li>
        {/each}
      </ul>
    {:else}
      <p class="mt-2 text-xs text-slate-600">Sin cambios en fase manual.</p>
    {/if}
  </section>

  <!-- 7. Auditoría del jefe -->
  <section class="mt-6">
    <h2 class="border-b border-slate-300 pb-1 text-base font-bold uppercase">
      7. Consultas del jefe a listas ajenas y cambios propios en ventanas
    </h2>
    {#if data.auditoriaLegible.length > 0}
      <ul class="mt-2 list-disc space-y-1 pl-5 text-xs">
        {#each data.auditoriaLegible as item}
          <li>
            <span class="font-mono text-slate-600">[{item.fecha}]</span>
            {#if item.actor}<strong>{item.actor}:</strong>
            {/if}{item.descripcion}
          </li>
        {/each}
      </ul>
    {:else}
      <p class="mt-2 text-xs text-slate-600">Ninguna consulta ni ajuste registrado.</p>
    {/if}
  </section>

  <!-- 8. Desviaciones, excepciones y justificaciones -->
  <section class="mt-6">
    <h2 class="border-b border-slate-300 pb-1 text-base font-bold uppercase">
      8. Desviaciones de horas, excepciones y justificaciones del cierre
    </h2>
    <div class="mt-2 space-y-2 text-xs">
      <div>
        <strong>Excepciones de especialidad:</strong>
        {#if data.excepcionesDetalle.length > 0}
          <ul class="list-disc pl-5">
            {#each data.excepcionesDetalle as ex}
              <li>{ex.profesor} — {ex.grupo}: {ex.motivo}</li>
            {/each}
          </ul>
        {:else}
          Ninguna.
        {/if}
      </div>
      <div>
        <strong>Desviaciones de horas:</strong>
        {#if data.resultadoFinal.some((r) => !r.esVacante && r.desviacion !== 0)}
          <ul class="list-disc pl-5">
            {#each data.resultadoFinal.filter((r) => !r.esVacante && r.desviacion !== 0) as r}
              <li>
                {r.apellidos}, {r.nombre}: cierra con {r.totalHoras} h frente a {r.horasACubrir} h ({formatDesviacion(
                  r.desviacion
                )})
              </li>
            {/each}
          </ul>
        {:else}
          Ninguna.
        {/if}
      </div>
      {#if data.reparto.justificacionCierre}
        <p><strong>Justificación de cierre:</strong> {data.reparto.justificacionCierre}</p>
      {/if}
    </div>
  </section>

  <!-- 9. Resultado final por profesor -->
  <section class="mt-6">
    <h2 class="border-b border-slate-300 pb-1 text-base font-bold uppercase">
      9. Resultado final por profesor
    </h2>
    <table class="mt-2 w-full text-left text-xs">
      <thead>
        <tr class="border-b border-slate-300">
          <th class="py-1.5">Profesor</th>
          <th class="py-1.5">Grupos asignados</th>
          <th class="py-1.5 text-right">Cierre / Obj.</th>
          <th class="py-1.5 text-right">Desv.</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-200">
        {#each data.resultadoFinal as r}
          <tr>
            <td class="py-1.5 font-medium">
              {r.apellidos}, {r.nombre}
              {r.esVacante ? '(Vacante)' : ''}
            </td>
            <td class="py-1.5">
              {r.grupos
                .map(
                  (g) =>
                    `${g.materia} (${[g.curso, g.nombreGrupo].filter(Boolean).join(' ')}, ${g.horasSemanales}h)`
                )
                .join('; ') || '—'}
            </td>
            <td class="py-1.5 text-right font-semibold">{r.totalHoras} / {r.horasACubrir} h</td>
            <td class="py-1.5 text-right font-mono">{formatDesviacion(r.desviacion)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>

  <!-- 10. Espacio de firmas (Jefe, Jefatura y miembros del departamento - punto 93) -->
  <section class="mt-10 break-inside-avoid">
    <h2 class="border-b border-slate-300 pb-1 text-base font-bold uppercase">10. Firmas</h2>
    <div class="mt-10 grid grid-cols-2 gap-12 text-center text-xs">
      <div class="border-t border-slate-500 pt-2 font-medium">El/La Jefe/a de Departamento</div>
      <div class="border-t border-slate-500 pt-2 font-medium">Vº Bº Jefatura de Estudios</div>
    </div>

    {#if firmantes.length > 0}
      <p class="mt-8 text-xs font-semibold text-slate-700 uppercase">
        Conformidad de los miembros del departamento
      </p>
      <div class="mt-8 grid grid-cols-2 gap-x-10 gap-y-10 text-center text-xs sm:grid-cols-3">
        {#each firmantes as f}
          <div class="border-t border-slate-400 pt-1.5">
            {f.apellidos}, {f.nombre}
          </div>
        {/each}
      </div>
    {/if}
  </section>
</main>
