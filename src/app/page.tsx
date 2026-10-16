import Link from "next/link";
import BrandHeader from "@/components/BrandHeader";
import PublicSearch from "@/components/public/PublicSearch";
import TopographicBackground from "@/components/TopographicBackground";

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const ticket = first(params.ticket);
  const name = first(params.name);

  return (
    <div className="relative min-h-screen bg-slate-50 flex flex-col justify-between">
      {/* Background Kontur Topografi Halus */}
      <TopographicBackground />

      {/* Header Instansi */}
      <div className="relative z-10">
        <BrandHeader />
      </div>

      {/* Konten Utama: Card Formulir Mengambang */}
      <main className="relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-8 sm:py-12">
        {/* Card Container Utama */}
        <div className="rounded-2xl border border-gray-200/90 bg-white/95 p-6 sm:p-8 shadow-sm backdrop-blur-xs">
          <div className="text-center mb-6">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 border border-emerald-200/80">
              Layanan Pra-Berkas Mandiri
            </span>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-[#002B49] sm:text-3xl">
              Cek Jadwal Pemeriksaan Tanah Anda
            </h1>
            <p className="mt-2 text-xs sm:text-sm text-gray-600 leading-relaxed">
              Pantau progres verifikasi berkas dan jadwal pengukuran lapangan sebelum Nomor Berkas terbit di aplikasi Sentuh Tanahku.
            </p>
          </div>

          {/* Form Pencarian & Hasil Tiket */}
          <PublicSearch
            key={`${ticket ?? ""}|${name ?? ""}`}
            initialTicket={ticket}
            initialName={name}
          />
        </div>

        {/* Footer Tautan Internal */}
        <footer className="mt-6 text-center">
          <Link
            className="text-xs text-gray-400 hover:text-gray-600 transition underline-offset-4 hover:underline"
            href="/admin"
          >
            Akses Internal Petugas Loket / TU
          </Link>
        </footer>
      </main>
    </div>
  );
}
