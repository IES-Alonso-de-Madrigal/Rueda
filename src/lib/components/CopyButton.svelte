<script lang="ts">
  interface Props {
    value: string;
    label?: string;
    size?: 'xs' | 'sm';
  }

  let { value, label = 'Copiar', size = 'xs' }: Props = $props();
  let copied = $state(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(value);
      copied = true;
      setTimeout(() => (copied = false), 1800);
    } catch {
      // Fallback para contextos sin clipboard API
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      copied = true;
      setTimeout(() => (copied = false), 1800);
    }
  }
</script>

<button
  type="button"
  onclick={copiar}
  class="inline-flex items-center gap-1 rounded-md border font-medium transition-colors {size ===
  'xs'
    ? 'px-2 py-1 text-xs'
    : 'px-3 py-1.5 text-sm'} {copied
    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}"
>
  {copied ? '✓ Copiado' : label}
</button>
