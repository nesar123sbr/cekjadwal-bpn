"use client";

import { useState, type FormEvent } from "react";
import { searchTicket, type SearchResult } from "@/actions/search";

type Props = {
  onResult: (result: SearchResult | null) => void;
};

const inputCls =
  "w-full rounded-xl border border-gray-300 bg-white px-4 py-4 text-lg text-gray-900 shadow-sm outline-none placeholder:text-gray-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-200";

export default function SearchForm({ onResult }: Props) {
  const [ticket, setTicket] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ticket.trim() || !name.trim()) {
      setError("Nomor tiket dan nama pemohon wajib diisi.");
      return;
    }
    if (name.trim().length < 3) {
      setError("Nama pemohon minimal 3 huruf.");
      return;
    }
    setError(null);
    setLoading(true);
    onResult(null);
    try {
      onResult(await searchTicket({ ticketNumber: ticket, applicantName: name }));
    } catch {
      setError("Terjadi kesalahan. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-4" noValidate>
      <div>
        <label htmlFor="ticket" className="block text-sm font-medium text-gray-700">
          Nomor Tiket / Registrasi
        </label>
        <input
          id="ticket"
          type="text"
          autoComplete="off"
          placeholder="Contoh: REG-1201/2026"
          value={ticket}
          onChange={(e) => {
            setTicket(e.target.value);
            if (error) setError(null);
          }}
          aria-invalid={!!error}
          className={`mt-1 ${inputCls}`}
        />
      </div>
      <div>
        <label htmlFor="applicant" className="block text-sm font-medium text-gray-700">
          Nama Pemohon
        </label>
        <input
          id="applicant"
          type="text"
          autoComplete="off"
          placeholder="Nama sesuai permohonan"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError(null);
          }}
          aria-invalid={!!error}
          aria-describedby={error ? "search-error" : undefined}
          className={`mt-1 ${inputCls}`}
        />
      </div>
      {error && (
        <p id="search-error" role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-blue-700 px-4 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Mencari..." : "Cek Status Berkas"}
      </button>
    </form>
  );
}
