import type { Metadata } from "next";
import Link from "next/link";
import BrandHeader from "@/components/BrandHeader";
import TopographicBackground from "@/components/TopographicBackground";

export const metadata: Metadata = {
  title: "Halaman Tidak Ditemukan - CekJadwal BPN Kabupaten Dairi",
};

export default function NotFound() {
  return (
    <div className="relative min-h-screen bg-slate-50 flex flex-col justify-between">
      {/* Background Kontur Topografi Halus */}
      <TopographicBackground />

      {/* Header Instansi */}
      <div className="relative z-10">
        <BrandHeader />
      </div>

      {/* Area Tengah: Card Not Found Mengambang */}
      <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10 sm:py-12">
        <div className="w-full rounded-2xl border border-gray-200/90 bg-white/95 p-6 sm:p-8 text-center shadow-sm backdrop-blur-xs">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 text-2xl border border-amber-200/80 shadow-xs">
            🔍
          </div>
          <h1 className="text-xl font-bold tracking-tight text-bpn-navy sm:text-2xl">
            Halaman Tidak Ditemukan
          </h1>
          <p className="mt-2 text-xs sm:text-sm text-gray-600 leading-relaxed">
            Halaman yang Anda tuju tidak ditemukan atau alamat tautan telah berpindah.
          </p>

          <div className="mt-6 flex justify-center">
            <Link
              href="/"
              className="w-full sm:w-auto rounded-xl bg-bpn-navy px-5 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-bpn-navy-light transition text-center"
            >
              Kembali ke Beranda
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

