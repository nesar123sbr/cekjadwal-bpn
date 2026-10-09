import type { SearchResult, SearchResultItem } from "@/actions/search";

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-base font-medium text-gray-900">{children}</dd>
    </div>
  );
}

function Duration({ days, label }: { days: number; label: string }) {
  return (
    <p className="mt-3 text-xs text-gray-600">
      Sudah diproses <strong>{days} hari</strong> sejak diterima. {label}
    </p>
  );
}

function ResultCard({ item }: { item: SearchResultItem }) {
  const header = (
    <dl className="mt-4 space-y-3">
      <Row label="Nomor Tiket">{item.ticketNumber}</Row>
      <Row label="Pemohon">{item.applicantName}</Row>
      <Row label="Lokasi">{item.objectAddress}</Row>
      <Row label="Kunjungan Terakhir">
        {item.lastVisitDate ? formatShortDate(item.lastVisitDate) : "-"}
      </Row>
    </dl>
  );

  if (item.status === "DOKUMEN_KURANG") {
    return (
      <section role="status" className="w-full rounded-2xl border border-red-200 bg-red-50 p-5">
        <h2 className="text-lg font-semibold text-red-800">Dokumen Belum Lengkap</h2>
        <p className="mt-1 text-sm text-red-700">
          Berkas Anda belum dapat diproses. Mohon segera lengkapi dokumen berikut
          dan serahkan ke loket pelayanan.
        </p>
        {header}
        <div className="mt-4 rounded-xl border border-red-300 bg-white p-4 text-sm text-red-900">
          <p className="font-semibold">Dokumen yang perlu dilengkapi:</p>
          {item.missingDocuments.length > 0 ? (
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {item.missingDocuments.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1">Silakan hubungi loket untuk rincian dokumen.</p>
          )}
        </div>
        <Duration
          days={item.daysInProcess}
          label={`Saat ini menunggu kelengkapan dokumen dari pemohon selama ${item.daysWaiting} hari.`}
        />
      </section>
    );
  }

  if (item.status === "MENUNGGU_JADWAL") {
    return (
      <section role="status" className="w-full rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <h2 className="text-lg font-semibold text-amber-800">Menunggu Jadwal Pemeriksaan</h2>
        <p className="mt-1 text-sm text-amber-700">
          Dokumen Anda lengkap. Berkas sedang antre verifikasi dan penjadwalan
          oleh petugas. Anda tidak perlu melakukan apa pun.
        </p>
        {header}
        <Duration
          days={item.daysInProcess}
          label={`Saat ini menunggu jadwal dari petugas selama ${item.daysWaiting} hari.`}
        />
      </section>
    );
  }

  if (item.status === "DIJADWALKAN") {
    return (
      <section role="status" className="w-full rounded-2xl border border-green-200 bg-green-50 p-5">
        <h2 className="text-lg font-semibold text-green-800">Jadwal pemeriksaan ditetapkan</h2>
        <dl className="mt-4 space-y-3">
          <Row label="Nomor Tiket">{item.ticketNumber}</Row>
          <Row label="Pemohon">{item.applicantName}</Row>
          <Row label="Tanggal">{formatDate(item.inspectionDate)}</Row>
          <Row label="Jam">{item.inspectionTime} WIB</Row>
          <Row label="Lokasi">{item.objectAddress}</Row>
          <Row label="Kunjungan Terakhir">
            {item.lastVisitDate ? formatShortDate(item.lastVisitDate) : "-"}
          </Row>
          <Row label="Petugas">
            <ul className="space-y-1">
              {item.officers.map((o) => (
                <li key={`${o.name}-${o.position}`}>
                  {o.name}
                  <span className="block text-sm font-normal text-gray-600">
                    {o.position}
                    {o.role ? ` · ${o.role}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Row>
        </dl>
        <div className="mt-5 rounded-xl border border-green-300 bg-white p-4 text-sm text-green-900">
          <p className="font-semibold">Wajib memasang patok tanda batas</p>
          <p className="mt-1">
            Pastikan patok tanda batas tanah sudah terpasang sebelum petugas
            tiba, dan pemohon atau kuasa hadir di lokasi.
          </p>
          {item.notes && <p className="mt-2 italic">Catatan: {item.notes}</p>}
        </div>
        <Duration days={item.daysInProcess} label="" />
      </section>
    );
  }

  // SELESAI
  return (
    <section role="status" className="w-full rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
      <h2 className="text-lg font-semibold text-emerald-800">Pemeriksaan Selesai</h2>
      <p className="mt-1 text-sm text-emerald-700">
        Verifikasi dan pemeriksaan lapangan atas berkas Anda telah tuntas.
      </p>
      {header}
      <div className="mt-4 rounded-xl border-2 border-blue-300 bg-white p-4 text-blue-900">
        <p className="text-sm font-semibold">Lanjutkan Cek di Aplikasi Sentuh Tanahku</p>
        <p className="mt-2 text-xs uppercase tracking-wide text-blue-700">
          Nomor Berkas Resmi
        </p>
        <p className="text-2xl font-bold">{item.officialFileNumber}</p>
        <p className="mt-2 text-sm">
          Silakan pantau kelanjutan berkas Anda di aplikasi Sentuh Tanahku
          menggunakan nomor berkas di atas.
        </p>
      </div>
      <Duration days={item.daysInProcess} label="" />
    </section>
  );
}

type Props = { result: SearchResult };

export default function ScheduleResult({ result }: Props) {
  if (result.status === "TIDAK_DITEMUKAN" || result.items.length === 0) {
    return (
      <section role="status" className="w-full rounded-2xl border border-gray-300 bg-gray-100 p-5">
        <h2 className="text-lg font-semibold text-gray-800">Data tidak ditemukan</h2>
        <p className="mt-1 text-sm text-gray-700">
          Nomor tiket dan nama pemohon tidak cocok dengan data kami. Periksa
          kembali penulisannya, atau hubungi loket pelayanan.
        </p>
      </section>
    );
  }

  return (
    <div className="w-full space-y-4">
      {result.items.length > 1 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-center text-sm font-medium text-blue-900">
          Ditemukan {result.items.length} bidang tanah terdaftar untuk tiket dan nama ini:
        </div>
      )}
      {result.items.map((item) => (
        <ResultCard key={item.id} item={item} />
      ))}
    </div>
  );
}
