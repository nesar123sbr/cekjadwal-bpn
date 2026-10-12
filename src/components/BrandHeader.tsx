import Image from "next/image";

export default function BrandHeader({
  children,
}: {
  children?: React.ReactNode;
}) {
  return (
    <header className="relative bg-[#002B49] text-white overflow-hidden">
      {/* Ornamen Latar Belakang Kontur Topografi Halus (Topographic Contour Pattern) */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-10 overflow-hidden mix-blend-overlay"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 1200 160"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M-50,20 C180,90 320,-30 600,50 C880,130 1020,10 1250,70"
          fill="none"
          stroke="#D4AF37"
          strokeWidth="1.5"
        />
        <path
          d="M-50,55 C160,125 340,5 620,85 C900,165 1040,45 1250,105"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="1.2"
        />
        <path
          d="M-50,90 C140,160 360,40 640,120 C920,200 1060,80 1250,140"
          fill="none"
          stroke="#D4AF37"
          strokeWidth="1.5"
        />
        <path
          d="M-50,125 C120,195 380,75 660,155 C940,235 1080,115 1250,175"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="1"
        />
        <path
          d="M100,-20 C350,60 500,140 850,20 C1050,-40 1150,80 1250,30"
          fill="none"
          stroke="#D4AF37"
          strokeWidth="1.2"
        />
      </svg>

      <div className="relative z-10 mx-auto flex max-w-[1536px] items-center gap-3.5 px-3 sm:px-6 lg:px-8 py-4">
        <Image
          src="/logo-bpn.svg"
          alt="Logo Kementerian ATR/BPN"
          width={44}
          height={44}
          priority
          className="h-11 w-11 shrink-0 object-contain drop-shadow-sm"
        />
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
      <div className="relative z-10 h-1 bg-gradient-to-r from-[#D4AF37] via-[#F1D77A] to-[#D4AF37]" />
    </header>
  );
}
