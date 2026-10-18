"use client";

import { useEffect } from "react";
import Link from "next/link";
import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global unhandled error:", error);
  }, [error]);

  return (
    <html lang="id">
      <body className="min-h-screen bg-slate-50 flex flex-col justify-center items-center px-4 py-12 font-sans antialiased text-gray-900">
        <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-6 sm:p-8 text-center shadow-lg">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-700 text-2xl shadow-inner">
            ⚠️
          </div>
          <h1 className="text-xl font-bold tracking-tight text-bpn-navy sm:text-2xl">
            Kesalahan Sistem Kritis
          </h1>
          <p className="mt-2 text-xs sm:text-sm text-gray-600 leading-relaxed">
            Terjadi kendala pada antarmuka aplikasi. Silakan muat ulang halaman untuk memulihkan sesi.
          </p>

          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => reset()}
              className="w-full sm:w-auto rounded-xl bg-bpn-navy px-5 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-bpn-navy-light transition cursor-pointer"
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
      </body>
    </html>
  );
}

