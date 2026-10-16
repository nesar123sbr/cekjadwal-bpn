import Link from "next/link";
import { redirect } from "next/navigation";
import BrandHeader from "@/components/BrandHeader";
import LoginForm from "@/components/admin/LoginForm";
import TopographicBackground from "@/components/TopographicBackground";
import { getSession } from "@/lib/session";

export const metadata = {
  title: "Login TU - CekJadwal BPN Kabupaten Dairi",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage() {
  if (await getSession()) redirect("/admin");

  return (
    <div className="relative min-h-screen bg-slate-50 flex flex-col justify-between">
      {/* Background Kontur Topografi Halus */}
      <TopographicBackground />

      {/* Header Instansi */}
      <div className="relative z-10">
        <BrandHeader />
      </div>

      {/* Area Tengah: Card Login Mengambang */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm flex flex-col items-center">
          <div className="w-full rounded-2xl border border-gray-200/90 bg-white/95 p-6 sm:p-8 shadow-sm backdrop-blur-xs">
            <div className="text-center mb-6">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 border border-emerald-200/80">
                Akses Internal Petugas Loket / TU
              </span>
              <h1 className="mt-3 text-2xl font-bold tracking-tight text-[#002B49]">
                Login Staf TU
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-gray-600">
                ATR/BPN Kabupaten Dairi
              </p>
            </div>
            <LoginForm />
          </div>

          <div className="mt-4 text-center">
            <Link
              href="/"
              className="text-xs text-gray-500 hover:text-[#002B49] transition underline-offset-4 hover:underline"
            >
              ← Kembali ke halaman cek jadwal
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
