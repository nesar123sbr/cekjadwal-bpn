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
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-3 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
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
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-3 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
        />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
      >
        {pending ? "Masuk..." : "Masuk"}
      </button>
    </form>
  );
}
