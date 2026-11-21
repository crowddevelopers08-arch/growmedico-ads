/**
 * Guard against a leftover local URL in hosted environments.
 *
 * NextAuth rewrites every request's origin to AUTH_URL / NEXTAUTH_URL. If that
 * still says http://localhost:3000 on Vercel (e.g. copied from a local .env),
 * every visitor is redirected to their own computer. On Vercel we drop such a
 * value so NextAuth uses the real request host instead (trustHost is on).
 *
 * Import this module before NextAuth is initialised (middleware + lib/auth).
 */

const LOCAL = /\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?/i;

if (process.env.VERCEL) {
  for (const key of ["AUTH_URL", "NEXTAUTH_URL"] as const) {
    const value = process.env[key];
    if (value && LOCAL.test(value)) {
      console.warn(`[auth] Ignoring ${key}=${value} on Vercel — set it to the live URL or remove it.`);
      delete process.env[key];
    }
  }
}

/** Public base URL of the app, for links in messages (never localhost on Vercel). */
export function appBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured && !(process.env.VERCEL && LOCAL.test(configured))) return configured.replace(/\/$/, "");
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  return vercelHost ? `https://${vercelHost}` : "http://localhost:3000";
}

export {};
