import Link from "next/link";
import BrandHeader from "@/components/BrandHeader";
import PublicSearch from "@/components/public/PublicSearch";

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
    <div className="min-h-screen bg-slate-50">
      <BrandHeader />
      <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-8 sm:py-12">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[#002B49] sm:text-3xl">CekJadwal BPN</h1>
          <p className="mt-2 text-sm text-gray-600">
            Masukkan nomor tiket dan nama pemohon untuk melihat status berkas
            sebelum nomor berkas resmi terbit.
          </p>
        </div>
        {/* key memastikan form terisi ulang jika query berubah */}
        <PublicSearch
          key={`${ticket ?? ""}|${name ?? ""}`}
          initialTicket={ticket}
          initialName={name}
        />
        <footer className="mt-8 text-center">
          <Link href="/admin" className="text-xs text-gray-400 hover:text-gray-600">
            Akses Internal Petugas TU
          </Link>
        </footer>
      </main>
    </div>
  );
}
