import { describe, expect, it } from 'vitest';
import { initDb } from '../db';
import { profesores } from '../db/schema';
import {
  consumeSetupToken,
  createSession,
  deleteSession,
  emitAcceso,
  ensureInitialSetupToken,
  getSessionUser,
  verifyAccesoShortCode,
  verifyAccesoToken,
  verifySetupToken
} from './index';
import { checkRateLimit, resetRateLimit } from './rate-limit';

describe('BD SQLite + Autenticación sin contraseñas', () => {
  it('aplica migraciones en memoria y completa flujo de setup, acceso por enlace/código y sesión', () => {
    const { db, sqlite } = initDb(':memory:');
    try {
      const setupUrl = ensureInitialSetupToken(db);
      expect(setupUrl).toContain('/setup/');
      const rawSetupToken = setupUrl!.split('/setup/')[1];
      const tokenId = verifySetupToken(rawSetupToken, db);
      expect(tokenId).not.toBeNull();
      consumeSetupToken(tokenId!, db);
      expect(verifySetupToken(rawSetupToken, db)).toBeNull();

      const prof = db
        .insert(profesores)
        .values({
          nombre: 'Ana',
          apellidos: 'García',
          email: 'ana@centro.es',
          esJefatura: true,
          activo: true
        })
        .returning({ id: profesores.id })
        .get();

      const acceso = emitAcceso({ profesorId: prof.id }, db);
      expect(acceso.codigoCorto).toHaveLength(6);
      expect(verifyAccesoToken(acceso.rawToken, db)).toBe(prof.id);
      expect(verifyAccesoShortCode(acceso.codigoCorto.toLowerCase(), db)).toBe(prof.id);

      // Regenerar acceso revoca el anterior
      const acceso2 = emitAcceso({ profesorId: prof.id }, db);
      expect(verifyAccesoToken(acceso.rawToken, db)).toBeNull();
      expect(verifyAccesoShortCode(acceso.codigoCorto, db)).toBeNull();
      expect(verifyAccesoToken(acceso2.rawToken, db)).toBe(prof.id);
      expect(verifyAccesoShortCode(acceso2.codigoCorto, db)).toBe(prof.id);

      // Sesión
      const sesion = createSession(prof.id, db);
      const loaded = getSessionUser(sesion.rawToken, db);
      expect(loaded?.user.email).toBe('ana@centro.es');
      expect(loaded?.user.esJefatura).toBe(true);

      deleteSession(sesion.sessionId, db);
      expect(getSessionUser(sesion.rawToken, db)).toBeNull();
    } finally {
      sqlite.close();
    }
  });

  it('aplica rate limit a intentos repetidos', () => {
    const key = 'test:ip';
    resetRateLimit(key);
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit(key, 3, 60_000).allowed).toBe(true);
    }
    const blocked = checkRateLimit(key, 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    resetRateLimit(key);
  });
});
