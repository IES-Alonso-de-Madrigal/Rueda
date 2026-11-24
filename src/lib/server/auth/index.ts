import crypto from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import type { Cookies } from '@sveltejs/kit';
import { getDb, type AppDb } from '../db';
import { accesos, profesores, sesiones, setupTokens } from '../db/schema';

export const SESSION_COOKIE_NAME = 'rueda_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días
const ACCESO_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 días (curso anual)
const SETUP_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas
const SHORT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function hashSecret(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function generateToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function generateShortCode(length = 6): string {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += SHORT_CODE_ALPHABET[bytes[i] % SHORT_CODE_ALPHABET.length];
  }
  return out;
}

export function normalizeShortCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function getOrigin(): string {
  return (process.env.ORIGIN ?? 'http://localhost:5173').replace(/\/+$/, '');
}

export function isSecureCookie(): boolean {
  return getOrigin().startsWith('https://');
}

export function setSessionCookie(cookies: Cookies, rawToken: string, expiresAt: Date): void {
  cookies.set(SESSION_COOKIE_NAME, rawToken, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureCookie(),
    expires: expiresAt
  });
}

export function clearSessionCookie(cookies: Cookies): void {
  cookies.delete(SESSION_COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureCookie()
  });
}

export function createSession(
  profesorId: number,
  db: AppDb = getDb()
): { rawToken: string; expiresAt: Date; sessionId: number } {
  const rawToken = generateToken(32);
  const tokenHash = hashSecret(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const inserted = db
    .insert(sesiones)
    .values({
      profesorId,
      tokenHash,
      caducaEn: expiresAt.toISOString()
    })
    .returning({ id: sesiones.id })
    .get();

  return { rawToken, expiresAt, sessionId: inserted.id };
}

export function getSessionUser(
  rawToken: string | undefined,
  db: AppDb = getDb()
): { user: App.UserSession; sessionId: number } | null {
  if (!rawToken) return null;
  const tokenHash = hashSecret(rawToken);
  const nowIso = new Date().toISOString();

  const row = db
    .select({
      sessionId: sesiones.id,
      id: profesores.id,
      nombre: profesores.nombre,
      apellidos: profesores.apellidos,
      email: profesores.email,
      esJefatura: profesores.esJefatura,
      activo: profesores.activo
    })
    .from(sesiones)
    .innerJoin(profesores, eq(sesiones.profesorId, profesores.id))
    .where(and(eq(sesiones.tokenHash, tokenHash), gt(sesiones.caducaEn, nowIso)))
    .get();

  if (!row || !row.activo) return null;

  return {
    sessionId: row.sessionId,
    user: {
      id: row.id,
      nombre: row.nombre,
      apellidos: row.apellidos,
      email: row.email,
      esJefatura: row.esJefatura,
      activo: row.activo
    }
  };
}

export function deleteSession(sessionId: number, db: AppDb = getDb()): void {
  db.delete(sesiones).where(eq(sesiones.id, sessionId)).run();
}

export function emitAcceso(
  params: { profesorId: number; cursoId?: number | null; revocarAnteriores?: boolean },
  db: AppDb = getDb()
): { rawToken: string; codigoCorto: string; enlace: string; caducaEn: string } {
  if (params.revocarAnteriores !== false) {
    db.update(accesos)
      .set({ revocado: true })
      .where(
        params.cursoId != null
          ? and(eq(accesos.profesorId, params.profesorId), eq(accesos.cursoId, params.cursoId))
          : eq(accesos.profesorId, params.profesorId)
      )
      .run();
  }

  const rawToken = generateToken(24);
  const codigoCorto = generateShortCode(6);
  const caducaEn = new Date(Date.now() + ACCESO_TTL_MS).toISOString();

  db.insert(accesos)
    .values({
      profesorId: params.profesorId,
      cursoId: params.cursoId ?? null,
      tokenHash: hashSecret(rawToken),
      codigoCortoHash: hashSecret(codigoCorto),
      caducaEn,
      revocado: false
    })
    .run();

  return {
    rawToken,
    codigoCorto,
    enlace: `${getOrigin()}/acceso/${rawToken}`,
    caducaEn
  };
}

export function verifyAccesoToken(rawToken: string, db: AppDb = getDb()): number | null {
  const tokenHash = hashSecret(rawToken);
  const nowIso = new Date().toISOString();

  const row = db
    .select({ profesorId: accesos.profesorId, activo: profesores.activo })
    .from(accesos)
    .innerJoin(profesores, eq(accesos.profesorId, profesores.id))
    .where(
      and(
        eq(accesos.tokenHash, tokenHash),
        eq(accesos.revocado, false),
        gt(accesos.caducaEn, nowIso)
      )
    )
    .get();

  if (!row || !row.activo) return null;
  return row.profesorId;
}

export function verifyAccesoShortCode(rawCode: string, db: AppDb = getDb()): number | null {
  const normalized = normalizeShortCode(rawCode);
  if (normalized.length !== 6) return null;

  const codeHash = hashSecret(normalized);
  const nowIso = new Date().toISOString();

  const row = db
    .select({ profesorId: accesos.profesorId, activo: profesores.activo })
    .from(accesos)
    .innerJoin(profesores, eq(accesos.profesorId, profesores.id))
    .where(
      and(
        eq(accesos.codigoCortoHash, codeHash),
        eq(accesos.revocado, false),
        gt(accesos.caducaEn, nowIso)
      )
    )
    .get();

  if (!row || !row.activo) return null;
  return row.profesorId;
}

let bootstrapChecked = false;

export function ensureInitialSetupToken(db: AppDb = getDb()): string | null {
  if (bootstrapChecked) return null;
  bootstrapChecked = true;

  const existingJefatura = db
    .select({ id: profesores.id })
    .from(profesores)
    .where(and(eq(profesores.esJefatura, true), eq(profesores.activo, true)))
    .get();

  if (existingJefatura) return null;

  const rawToken = generateToken(24);
  const caducaEn = new Date(Date.now() + SETUP_TTL_MS).toISOString();

  db.insert(setupTokens)
    .values({
      tokenHash: hashSecret(rawToken),
      usado: false,
      caducaEn
    })
    .run();

  const setupUrl = `${getOrigin()}/setup/${rawToken}`;
  console.log('\n============================================================');
  console.log('PRIMER ARRANQUE — No hay ningún usuario de Jefatura.');
  console.log(`Abre esta URL de un solo uso para crear el primero:\n  ${setupUrl}`);
  console.log('============================================================\n');
  return setupUrl;
}

export function verifySetupToken(rawToken: string, db: AppDb = getDb()): number | null {
  const tokenHash = hashSecret(rawToken);
  const nowIso = new Date().toISOString();

  const row = db
    .select({ id: setupTokens.id })
    .from(setupTokens)
    .where(
      and(
        eq(setupTokens.tokenHash, tokenHash),
        eq(setupTokens.usado, false),
        gt(setupTokens.caducaEn, nowIso)
      )
    )
    .get();

  return row?.id ?? null;
}

export function consumeSetupToken(tokenId: number, db: AppDb = getDb()): void {
  db.update(setupTokens).set({ usado: true }).where(eq(setupTokens.id, tokenId)).run();
}
