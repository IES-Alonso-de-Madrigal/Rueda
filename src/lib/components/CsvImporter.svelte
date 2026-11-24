<script lang="ts">
  import { enhance } from '$app/forms';

  interface PreviewRow {
    line: number;
    summary: string;
    error?: string;
  }

  interface Props {
    action: string;
    title: string;
    templateFilename: string;
    templateContent: string;
    helpText: string;
    validateRow: (row: Record<string, string>, line: number) => PreviewRow;
  }

  let { action, title, templateFilename, templateContent, helpText, validateRow }: Props = $props();

  let csvText = $state('');
  let submitting = $state(false);
  let fileName = $state('');

  function parseClientCsv(text: string): Record<string, string>[] {
    const clean = text.replace(/^\uFEFF/, '').trim();
    if (!clean) return [];
    const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return [];
    const sep = lines[0].includes(';') ? ';' : ',';

    const splitLine = (line: string): string[] => {
      const out: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === sep && !inQuotes) {
          out.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
      out.push(current.trim());
      return out;
    };

    const normalize = (h: string) =>
      h
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const headers = splitLine(lines[0]).map(normalize);
    return lines.slice(1).map((line) => {
      const cols = splitLine(line);
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = cols[idx] ?? '';
      });
      return row;
    });
  }

  const preview = $derived.by(() => {
    const rows = parseClientCsv(csvText);
    return rows.map((r, idx) => validateRow(r, idx + 2));
  });

  const validCount = $derived(preview.filter((p) => !p.error).length);
  const errorCount = $derived(preview.filter((p) => Boolean(p.error)).length);

  function descargarPlantilla() {
    const blob = new Blob(['\uFEFF' + templateContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = templateFilename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onFileSelected(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    fileName = file.name;
    csvText = await file.text();
  }
</script>

<div class="space-y-3">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <h3 class="text-sm font-semibold text-slate-900">{title}</h3>
    <button
      type="button"
      onclick={descargarPlantilla}
      class="rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-800 hover:bg-indigo-100"
    >
      ↓ Descargar plantilla CSV
    </button>
  </div>

  <p class="text-xs text-slate-600">{helpText}</p>

  <div class="flex flex-wrap items-center gap-2">
    <label
      class="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-within:ring-2 focus-within:ring-indigo-400"
    >
      Subir archivo .csv
      <input type="file" accept=".csv,text/csv" onchange={onFileSelected} class="sr-only" />
    </label>
    {#if fileName}
      <span class="text-xs text-slate-600">{fileName}</span>
    {/if}
  </div>

  <form
    method="POST"
    {action}
    use:enhance={() => {
      submitting = true;
      return async ({ result, update }) => {
        submitting = false;
        if (result.type === 'success') {
          csvText = '';
          fileName = '';
        }
        await update({ reset: false });
      };
    }}
    class="space-y-2.5"
  >
    <textarea
      name="csv"
      rows="4"
      aria-label={title}
      bind:value={csvText}
      placeholder={templateContent}
      class="w-full rounded-lg border border-slate-300 p-2.5 font-mono text-xs focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
    ></textarea>

    {#if preview.length > 0}
      <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
        <div class="flex flex-wrap items-center justify-between gap-2 font-semibold">
          <span class="text-emerald-800">✓ {validCount} filas válidas</span>
          {#if errorCount > 0}
            <span class="text-red-700">⚠ {errorCount} con error (se omitirán)</span>
          {/if}
        </div>
        <ul class="mt-2 max-h-36 space-y-1 overflow-y-auto">
          {#each preview.slice(0, 25) as item}
            <li class={item.error ? 'text-red-700' : 'text-slate-700'}>
              <span class="font-mono text-slate-500">L{item.line}:</span>
              {#if item.error}
                <strong>Error:</strong> {item.error}
              {:else}
                {item.summary}
              {/if}
            </li>
          {/each}
          {#if preview.length > 25}
            <li class="text-slate-500">… y {preview.length - 25} filas más.</li>
          {/if}
        </ul>
      </div>
    {/if}

    <button
      type="submit"
      disabled={submitting || validCount === 0}
      class="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
    >
      {submitting ? 'Importando…' : `Importar ${validCount > 0 ? `${validCount} filas` : 'CSV'}`}
    </button>
  </form>
</div>
