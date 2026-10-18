"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/actions/auth";

const initial: LoginState = { error: null };

export default function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initial);

  return (
    <form action={action} className="w-full space-y-4">
      <div>
        <label htmlFor="username" className="block text-sm font-medium text-gray-700">
          Username
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          required
          placeholder="Masukkan username"
          className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3.5 py-3 text-sm text-gray-900 shadow-xs outline-none placeholder:text-gray-400 focus:border-bpn-navy focus:ring-2 focus:ring-bpn-gold/50 transition"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="Masukkan password"
          className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3.5 py-3 text-sm text-gray-900 shadow-xs outline-none placeholder:text-gray-400 focus:border-bpn-navy focus:ring-2 focus:ring-bpn-gold/50 transition"
        />
      </div>
      {state.error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700 font-medium leading-relaxed"
        >
          {state.error}
        </div>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-bpn-navy py-3.5 font-semibold text-white transition hover:bg-bpn-navy-light disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Masuk..." : "Masuk"}
      </button>
    </form>
  );
}
