import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "admin_session";
export const SESSION_MAX_AGE = 60 * 60 * 8; // 8 jam

function secret(): string {
  const isProd = process.env.NODE_ENV === "production";
  const s = process.env.SESSION_SECRET;
  if (isProd && !s) {
    throw new Error("SESSION_SECRET wajib diatur di environment production.");
  }
  return s || "dev-only-insecure-secret-change-me";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

/** Token format: `<username>.<expiryEpochSec>.<hmac>` */
export function createSessionToken(username: string): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  const payload = `${username}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const lastDotIndex = token.lastIndexOf(".");
    if (lastDotIndex === -1) return null;

    const secondLastDotIndex = token.lastIndexOf(".", lastDotIndex - 1);
    if (secondLastDotIndex === -1) return null;

    const username = token.slice(0, secondLastDotIndex);
    const expStr = token.slice(secondLastDotIndex + 1, lastDotIndex);
    const sig = token.slice(lastDotIndex + 1);

    if (!username || !expStr || !sig) return null;

    const expected = sign(`${username}.${expStr}`);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    if (Number(expStr) < Math.floor(Date.now() / 1000)) return null;
    return username;
  } catch {
    return null;
  }
}

/** Mengembalikan username jika sesi valid, selain itu null. */
export async function getSession(): Promise<string | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}
