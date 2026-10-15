"use server";

import { randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq, gte, lt } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { audit_logs } from "@/db/schema";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
} from "@/lib/session";
import { getNowWibIso } from "@/lib/utils";

export type LoginState = { error: string | null };

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const h = await headers();
  const rawXff = h.get("x-forwarded-for");
  const ip =
    (rawXff ? rawXff.split(",")[0].trim().slice(0, 45) : null) ||
    h.get("x-real-ip")?.trim().slice(0, 45) ||
    "unknown";

  const isProd = process.env.NODE_ENV === "production";
  const envAdminUsername = process.env.ADMIN_USERNAME;
  const envAdminPassword = process.env.ADMIN_PASSWORD;
  const envSessionSecret = process.env.SESSION_SECRET;

  if (isProd) {
    if (!envAdminUsername || !envAdminPassword || !envSessionSecret) {
      console.error(
        "Konfigurasi kredensial server belum lengkap di environment production.",
      );
      return { error: "Konfigurasi kredensial server belum lengkap." };
    }
  }

  // Rate-limiting check sebelum verifikasi username/password
  try {
    const fiveMinutesAgo = getNowWibIso(new Date(Date.now() - 5 * 60 * 1000));
    const recentFails = await db
      .select({ ip: audit_logs.ip })
      .from(audit_logs)
      .where(
        and(
          eq(audit_logs.action, "LOGIN_FAILED"),
          gte(audit_logs.created_at, fiveMinutesAgo),
        ),
      );

    const ipFailCount = recentFails.filter((r) => r.ip === ip).length;
    const totalFailCount = recentFails.length;

    if (ipFailCount >= 5 || totalFailCount >= 30) {
      return {
        error:
          "Terlalu banyak percobaan login gagal. Silakan tunggu 5 menit lalu coba lagi.",
      };
    }
  } catch (rlErr) {
    console.error("Gagal memeriksa batas percobaan login:", rlErr);
    // fail-open
  }

  const expectedUsername = envAdminUsername || "admin";
  const expectedPassword = envAdminPassword || "adminbpn123";

  const envAdminUsername2 = process.env.ADMIN_USERNAME_2;
  const envAdminPassword2 = process.env.ADMIN_PASSWORD_2;
  const hasAccount2 = Boolean(envAdminUsername2 && envAdminPassword2);

  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return { error: "Username dan password wajib diisi." };
  }

  // Periksa Akun 1
  const okUser1 = safeEqual(username, expectedUsername);
  const okPass1 = safeEqual(password, expectedPassword);
  const match1 = okUser1 && okPass1;

  // Periksa Akun 2 tanpa early return
  let match2 = false;
  if (hasAccount2) {
    const okUser2 = safeEqual(username, envAdminUsername2!);
    const okPass2 = safeEqual(password, envAdminPassword2!);
    match2 = okUser2 && okPass2;
  }

  const matchedUsername = match1
    ? expectedUsername
    : match2
      ? envAdminUsername2!
      : null;

  if (!matchedUsername) {
    try {
      await db.insert(audit_logs).values({
        id: randomUUID(),
        action: "LOGIN_FAILED",
        ip,
        created_at: getNowWibIso(),
      });
    } catch (logErr) {
      console.error("Gagal mencatat percobaan login gagal:", logErr);
    }
    return { error: "Username atau password salah." };
  }

  // Bersihkan log login gagal jika berhasil
  try {
    await db
      .delete(audit_logs)
      .where(
        and(eq(audit_logs.action, "LOGIN_FAILED"), eq(audit_logs.ip, ip)),
      );

    const thirtyDaysAgo = getNowWibIso(
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    );
    await db
      .delete(audit_logs)
      .where(
        and(
          eq(audit_logs.action, "LOGIN_FAILED"),
          lt(audit_logs.created_at, thirtyDaysAgo),
        ),
      );
  } catch (cleanupErr) {
    console.error("Gagal membersihkan log login gagal:", cleanupErr);
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(matchedUsername), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/admin/login");
}

