"use server";

import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
} from "@/lib/session";

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

  const expectedUsername = envAdminUsername || "admin";
  const expectedPassword = envAdminPassword || "adminbpn123";

  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return { error: "Username dan password wajib diisi." };
  }

  const okUser = safeEqual(username, expectedUsername);
  const okPass = safeEqual(password, expectedPassword);
  if (!okUser || !okPass) {
    return { error: "Username atau password salah." };
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(username), {
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
