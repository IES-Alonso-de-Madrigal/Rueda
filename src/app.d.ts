// See https://svelte.dev/docs/kit/types#app.d.ts

declare global {
  namespace App {
    interface UserSession {
      id: number;
      nombre: string;
      apellidos: string;
      email: string;
      esJefatura: boolean;
      activo: boolean;
    }

    interface Locals {
      user: UserSession | null;
      sessionId: number | null;
    }
  }
}

export {};
