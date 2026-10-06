"use client";

import { useState, type FormEvent } from "react";
import { searchFileNumber, type SearchResult } from "@/actions/search";

type Props = {
  onResult: (result: SearchResult | null) => void;
};

export default function SearchForm({ onResult }: Props) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!value.trim()) {
      setError("Nomor berkas tidak boleh kosong.");
      return;
    }
    setError(null);
    setLoading(true);
    onResult(null);
    try {
      onResult(await searchFileNumber(value));
    } catch {
      setError("Terjadi kesalahan. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-3" noValidate>
      <label htmlFor="file-number" className="block text-sm font-medium text-gray-700">
        Nomor Berkas
      </label>
      <input
        id="file-number"
        type="text"
        inputMode="text"
        autoComplete="off"
        placeholder="Contoh: 1201/2026"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if (error) setError(null);
        }}
        aria-invalid={!!error}
        aria-describedby={error ? "file-number-error" : undefined}
        className="w-full rounded-xl border border-gray-300 bg-white px-4 py-4 text-lg text-gray-900 shadow-sm outline-none placeholder:text-gray-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
      />
      {error && (
        <p id="file-number-error" role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-blue-700 px-4 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Mencari..." : "Cek Jadwal"}
      </button>
    </form>
  );
}
