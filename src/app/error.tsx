"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled error caught by boundary:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-6 sm:p-8 text-center shadow-lg">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-700 text-2xl shadow-inner">
          ⚠️
        </div>
        <h1 className="text-xl font-bold tracking-tight text-[#002B49] sm:text-2xl">
          Terjadi Kendala Sistem
        </h1>
        <p className="mt-2 text-xs sm:text-sm text-gray-600 leading-relaxed">
          Mohon maaf, sistem mengalami kendala saat memproses permintaan Anda. Silakan coba muat ulang atau kembali ke beranda.
        </p>

        {error.digest && (
          <div className="mt-3 rounded-lg bg-slate-50 p-2 text-[11px] font-mono text-gray-400">
            ID Referensi: {error.digest}
          </div>
        )}

        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="w-full sm:w-auto rounded-xl bg-[#002B49] px-5 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-[#003d66] transition cursor-pointer"
          >
            Muat Ulang Halaman
          </button>
          <Link
            href="/"
            className="w-full sm:w-auto rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-xs sm:text-sm font-semibold text-gray-700 shadow-xs hover:bg-gray-50 transition text-center"
          >
            Kembali ke Beranda
          </Link>
        </div>
      </div>
    </div>
  );
}

