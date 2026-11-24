type Listener = (payload: { version: number; tipo: string }) => void;

const channels = new Map<number, Set<Listener>>();

export function subscribeReparto(repartoId: number, listener: Listener): () => void {
  let set = channels.get(repartoId);
  if (!set) {
    set = new Set();
    channels.set(repartoId, set);
  }
  set.add(listener);

  return () => {
    const current = channels.get(repartoId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      channels.delete(repartoId);
    }
  };
}

export function publishRepartoUpdate(repartoId: number, version: number, tipo: string): void {
  const set = channels.get(repartoId);
  if (!set) return;
  for (const listener of set) {
    try {
      listener({ version, tipo });
    } catch {
      // Ignore closed streams
    }
  }
}
