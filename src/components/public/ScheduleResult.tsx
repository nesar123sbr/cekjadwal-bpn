import type { SearchResult } from "@/actions/search";

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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-base font-medium text-gray-900">{children}</dd>
    </div>
  );
}

export default function ScheduleResult({ result }: { result: SearchResult }) {
  if (result.status === "TIDAK_DITEMUKAN") {
    return (
      <section role="status" className="w-full rounded-2xl border border-red-200 bg-red-50 p-5">
        <h2 className="text-lg font-semibold text-red-800">Berkas tidak ditemukan</h2>
        <p className="mt-1 text-sm text-red-700">
          Nomor berkas tersebut tidak terdaftar. Periksa kembali penulisan nomor
          berkas Anda, atau hubungi loket pelayanan.
        </p>
      </section>
    );
  }

  if (result.status === "SELESAI") {
    return (
      <section role="status" className="w-full rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <h2 className="text-lg font-semibold text-emerald-800">
          Pemeriksaan Lapangan Telah Selesai
        </h2>
        <p className="mt-1 text-sm text-emerald-700">
          Berkas Anda sedang masuk tahap pengolahan data yuridis/teknis di kantor
          pertanahan.
        </p>
        <dl className="mt-4 space-y-3">
          <Row label="Nomor Berkas">{result.fileNumber}</Row>
          <Row label="Pemohon">{result.applicantName}</Row>
        </dl>
      </section>
    );
  }

  if (result.status === "BELUM_DIJADWALKAN") {
    return (
      <section role="status" className="w-full rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <h2 className="text-lg font-semibold text-amber-800">Belum dijadwalkan</h2>
        <p className="mt-1 text-sm text-amber-700">
          Berkas sedang dalam antrean verifikasi teknis. Jadwal pengukuran akan
          tampil di sini setelah ditetapkan.
        </p>
        <dl className="mt-4 space-y-3">
          <Row label="Nomor Berkas">{result.fileNumber}</Row>
          <Row label="Pemohon">{result.applicantName}</Row>
          <Row label="Lokasi">{result.objectAddress}</Row>
        </dl>
      </section>
    );
  }

  return (
    <section role="status" className="w-full rounded-2xl border border-green-200 bg-green-50 p-5">
      <h2 className="text-lg font-semibold text-green-800">Jadwal pengukuran ditetapkan</h2>
      <dl className="mt-4 space-y-3">
        <Row label="Nomor Berkas">{result.fileNumber}</Row>
        <Row label="Pemohon">{result.applicantName}</Row>
        <Row label="Tanggal">{formatDate(result.inspectionDate)}</Row>
        <Row label="Jam">{result.inspectionTime} WIB</Row>
        <Row label="Lokasi">{result.objectAddress}</Row>
        <Row label="Petugas">
          <ul className="space-y-1">
            {result.officers.map((o) => (
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
          Pastikan patok tanda batas tanah sudah terpasang sebelum petugas tiba,
          dan pemohon atau kuasa hadir di lokasi.
        </p>
        {result.notes && <p className="mt-2 italic">Catatan: {result.notes}</p>}
      </div>
    </section>
  );
}
