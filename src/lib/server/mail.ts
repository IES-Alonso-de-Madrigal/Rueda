import nodemailer from 'nodemailer';

export interface MailConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

export function getMailConfig(): MailConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return null;

  const port = Number(process.env.SMTP_PORT ?? '587');
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const user = process.env.SMTP_USER?.trim() || undefined;
  const pass = process.env.SMTP_PASS?.trim() || undefined;
  const from = process.env.SMTP_FROM?.trim() || 'Reparto de Grupos <no-reply@centro.local>';

  return { host, port, secure, user, pass, from };
}

export function isMailConfigured(): boolean {
  return getMailConfig() !== null;
}

export async function enviarCorreoAcceso(params: {
  to: string;
  nombre: string;
  enlace: string;
  codigoCorto: string;
  cursoNombre?: string;
}): Promise<{ enviado: boolean; motivo?: string }> {
  const config = getMailConfig();
  if (!config) {
    return { enviado: false, motivo: 'SMTP no configurado' };
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined
  });

  const asunto = params.cursoNombre
    ? `Acceso al reparto de grupos (${params.cursoNombre})`
    : 'Acceso al reparto de grupos';

  const texto = [
    `Hola ${params.nombre},`,
    '',
    'Aquí tienes tu enlace personal para entrar en la aplicación de reparto de grupos:',
    params.enlace,
    '',
    `Si entras desde el móvil también puedes usar el código corto: ${params.codigoCorto}`,
    '',
    'Este acceso es personal; no lo compartas con nadie.'
  ].join('\n');

  await transporter.sendMail({
    from: config.from,
    to: params.to,
    subject: asunto,
    text: texto
  });

  return { enviado: true };
}
