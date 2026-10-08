export default function BrandHeader({
  children,
}: {
  children?: React.ReactNode;
}) {
  return (
    <header className="bg-[#002B49] text-white">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4">
        <div
          aria-hidden
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-[#D4AF37] text-lg text-[#D4AF37]"
        >
          ★
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase leading-tight tracking-wider text-[#D4AF37] sm:text-xs">
            Kementerian Agraria dan Tata Ruang /
            <br className="sm:hidden" /> Badan Pertanahan Nasional
          </p>
          <p className="mt-1 text-sm font-medium leading-tight text-slate-100 sm:text-base">
            Sistem Pemantauan Pra-Berkas &amp; Verifikasi Lapangan
          </p>
        </div>
        {children}
      </div>
      <div className="h-1 bg-gradient-to-r from-[#D4AF37] via-[#F1D77A] to-[#D4AF37]" />
    </header>
  );
}
