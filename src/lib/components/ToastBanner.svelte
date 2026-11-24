<script lang="ts">
  interface Props {
    ok?: string | null;
    error?: string | null;
  }

  let { ok = null, error = null }: Props = $props();
  let dismissedKey = $state<string | null>(null);

  const key = $derived(`${ok ?? ''}|${error ?? ''}`);
  const visible = $derived((Boolean(ok) || Boolean(error)) && dismissedKey !== key);
</script>

{#if visible}
  <div
    role={error ? 'alert' : 'status'}
    aria-live="polite"
    class="sticky top-3 z-30 mb-4 flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm shadow-md {error
      ? 'border-red-300 bg-red-50 text-red-900'
      : 'border-emerald-300 bg-emerald-50 text-emerald-900'}"
  >
    <div class="flex items-start gap-2">
      <span class="font-bold">{error ? '⚠' : '✓'}</span>
      <span>{error ?? ok}</span>
    </div>
    <button
      type="button"
      onclick={() => (dismissedKey = key)}
      aria-label="Cerrar aviso"
      class="shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold opacity-70 hover:opacity-100"
    >
      ✕
    </button>
  </div>
{/if}
