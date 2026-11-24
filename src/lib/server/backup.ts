import fs from 'node:fs';
import path from 'node:path';
import { closeDb, getDatabasePath, getSqlite, initDb } from './db';

const MAX_BACKUPS = 20;

export function getBackupsDir(): string {
  const dbPath = getDatabasePath();
  if (dbPath === ':memory:') {
    return path.resolve(process.cwd(), 'data/backups');
  }
  return path.join(path.dirname(dbPath), 'backups');
}

export async function crearCopiaSeguridad(etiqueta = 'cierre'): Promise<string | null> {
  const dbPath = getDatabasePath();
  if (dbPath === ':memory:') return null;

  const dir = getBackupsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeLabel = etiqueta.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
  const filename = `backup-${stamp}-${safeLabel}.db`;
  const dest = path.join(dir, filename);

  const sqlite = getSqlite();
  await sqlite.backup(dest);

  // Retener solo las últimas MAX_BACKUPS copias
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.db'))
    .map((f) => ({
      name: f,
      full: path.join(dir, f),
      mtime: fs.statSync(path.join(dir, f)).mtimeMs
    }))
    .sort((a, b) => b.mtime - a.mtime);

  for (const old of files.slice(MAX_BACKUPS)) {
    try {
      fs.unlinkSync(old.full);
    } catch {
      // Ignore
    }
  }

  return filename;
}

export function listarCopiasSeguridad(): Array<{
  filename: string;
  sizeBytes: number;
  creadoEn: string;
}> {
  const dir = getBackupsDir();
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.db'))
    .map((f) => {
      const st = fs.statSync(path.join(dir, f));
      return {
        filename: f,
        sizeBytes: st.size,
        creadoEn: st.mtime.toISOString()
      };
    })
    .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
}

export function resolverRutaCopia(filename: string): string | null {
  const safe = path.basename(filename);
  if (!safe.endsWith('.db')) return null;
  const full = path.join(getBackupsDir(), safe);
  if (!fs.existsSync(full)) return null;
  return full;
}

export function restaurarCopiaDesdeBuffer(buffer: Buffer): void {
  const dbPath = getDatabasePath();
  if (dbPath === ':memory:') {
    throw new Error('No se puede restaurar en una base de datos en memoria.');
  }

  // Validación básica de cabecera SQLite
  const header = buffer.subarray(0, 16).toString('utf8');
  if (!header.startsWith('SQLite format 3')) {
    throw new Error('El archivo no es una base de datos SQLite válida.');
  }

  closeDb();

  for (const suffix of ['-wal', '-shm']) {
    const sidecar = `${dbPath}${suffix}`;
    if (fs.existsSync(sidecar)) {
      fs.unlinkSync(sidecar);
    }
  }

  fs.writeFileSync(dbPath, buffer);
  initDb();
}
