"use client";

import { useState, useTransition, type FormEvent } from "react";
import { createApplication, updateMissingDocs } from "@/actions/application";
import {
  createSchedule,
  markApplicationComplete,
  updateSchedule,
} from "@/actions/schedule";
import type { ApplicationStatus } from "@/db/schema";

export type AdminRow = {
  id: string;
  ticketNumber: string;
  applicantName: string;
  address: string;
  status: ApplicationStatus;
  missingDocuments: string | null;
  officialFileNumber: string | null;
  daysInProcess: number;
  daysInStage: number;
  inspectionDate: string | null;
  inspectionTime: string | null;
  notes: string | null;
  officerIds: string[];
  officerNames: string[];
};

export type OfficerOption = { id: string; name: string; position: string };

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  MENUNGGU_DOKUMEN: "Menunggu Dokumen",
  VERIFIKASI_PETUGAS: "Verifikasi Petugas",
  DIJADWALKAN: "Dijadwalkan",
  SELESAI: "Selesai",
};

const STATUS_STYLE: Record<ApplicationStatus, string> = {
  MENUNGGU_DOKUMEN: "bg-red-100 text-red-800",
  VERIFIKASI_PETUGAS: "bg-amber-100 text-amber-800",
  DIJADWALKAN: "bg-green-100 text-green-800",
  SELESAI: "bg-emerald-100 text-emerald-800",
};

const DEFAULT_NOTES = "Harap patok batas terpasang";
const inputCls =
  "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900";

type Dialog =
  | { kind: "schedule"; row: AdminRow; edit: boolean }
  | { kind: "docs"; row: AdminRow }
  | { kind: "complete"; row: AdminRow }
  | { kind: "new" }
  | null;

function Blocker({ row }: { row: AdminRow }) {
  if (row.status === "MENUNGGU_DOKUMEN") {
    return <span className="text-red-700">Menunggu pemohon · {row.daysInStage} hari</span>;
  }
  if (row.status === "VERIFIKASI_PETUGAS") {
    return <span className="text-amber-700">Antrean petugas · {row.daysInStage} hari</span>;
  }
  return <span className="text-gray-400">-</span>;
}

export default function AdminTable({
  rows,
  officers,
}: {
  rows: AdminRow[];
  officers: OfficerOption[];
}) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Form schedule
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [notes, setNotes] = useState(DEFAULT_NOTES);
  const [selected, setSelected] = useState<string[]>([]);

  // Form berkas baru
  const [ticketNumber, setTicketNumber] = useState("");
  const [applicantName, setApplicantName] = useState("");
  const [objectAddress, setObjectAddress] = useState("");

  // Form dokumen kurang / nomor resmi
  const [docs, setDocs] = useState("");
  const [officialNumber, setOfficialNumber] = useState("");

  function close() {
    setDialog(null);
    setError(null);
  }

  function openSchedule(row: AdminRow, edit: boolean) {
    setDate(edit ? (row.inspectionDate ?? "") : "");
    setTime(edit ? (row.inspectionTime ?? "09:00") : "09:00");
    setNotes(edit ? (row.notes ?? "") : DEFAULT_NOTES);
    setSelected(edit ? row.officerIds : []);
    setError(null);
    setDialog({ kind: "schedule", row, edit });
  }

  function openDocs(row: AdminRow) {
    setDocs(row.missingDocuments ?? "");
    setError(null);
    setDialog({ kind: "docs", row });
  }

  function openComplete(row: AdminRow) {
    setOfficialNumber("");
    setError(null);
    setDialog({ kind: "complete", row });
  }

  function openNew() {
    setTicketNumber("");
    setApplicantName("");
    setObjectAddress("");
    setError(null);
    setDialog({ kind: "new" });
  }

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) close();
      else setError(res.error);
    });
  }

  function submitSchedule(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (dialog?.kind !== "schedule") return;
    if (!date) return setError("Tanggal pemeriksaan wajib diisi.");
    if (!time) return setError("Jam pemeriksaan wajib diisi.");
    if (selected.length === 0) return setError("Pilih minimal satu petugas.");
    setError(null);
    const payload = {
      applicationId: dialog.row.id,
      inspectionDate: date,
      inspectionTime: time,
      notes,
      officerIds: selected,
    };
    run(() => (dialog.edit ? updateSchedule(payload) : createSchedule(payload)));
  }

  function submitNew(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ticketNumber.trim() || !applicantName.trim() || !objectAddress.trim()) {
      return setError("Semua kolom wajib diisi.");
    }
    setError(null);
    run(() => createApplication({ ticketNumber, applicantName, objectAddress }));
  }

  function submitDocs(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (dialog?.kind !== "docs") return;
    setError(null);
    run(() => updateMissingDocs(dialog.row.id, docs));
  }

  function submitComplete(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (dialog?.kind !== "complete") return;
    if (!officialNumber.trim()) {
      return setError("Nomor Berkas Resmi BPN wajib diisi.");
    }
    setError(null);
    run(() => markApplicationComplete(dialog.row.id, officialNumber));
  }

  const btn = "rounded-lg px-3 py-1.5 text-xs font-semibold";

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Daftar Berkas</h2>
        <button
          onClick={openNew}
          className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800"
        >
          + Tambah Berkas Baru
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-100 text-xs uppercase text-gray-600">
            <tr>
              <th className="px-4 py-3">No. Tiket</th>
              <th className="px-4 py-3">Nama Pemohon</th>
              <th className="px-4 py-3">Alamat</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Lama Proses</th>
              <th className="px-4 py-3">Hambatan</th>
              <th className="px-4 py-3">Tanggal Jadwal</th>
              <th className="px-4 py-3">Petugas</th>
              <th className="px-4 py-3">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-gray-900">
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-gray-500">
                  Belum ada berkas.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-3 font-medium">{r.ticketNumber}</td>
                <td className="px-4 py-3">{r.applicantName}</td>
                <td className="px-4 py-3">{r.address}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS_STYLE[r.status]}`}
                  >
                    {STATUS_LABEL[r.status]}
                  </span>
                  {r.status === "MENUNGGU_DOKUMEN" && r.missingDocuments && (
                    <p className="mt-1 max-w-xs whitespace-pre-line text-xs text-red-700">
                      {r.missingDocuments}
                    </p>
                  )}
                  {r.status === "SELESAI" && r.officialFileNumber && (
                    <p className="mt-1 text-xs text-gray-600">
                      No. Resmi: <strong>{r.officialFileNumber}</strong>
                    </p>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3">{r.daysInProcess} hari</td>
                <td className="whitespace-nowrap px-4 py-3 text-xs">
                  <Blocker row={r} />
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {r.inspectionDate ? `${r.inspectionDate} ${r.inspectionTime ?? ""} WIB` : "-"}
                </td>
                <td className="px-4 py-3">
                  {r.officerNames.length ? r.officerNames.join(", ") : "-"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {(r.status === "MENUNGGU_DOKUMEN" ||
                      r.status === "VERIFIKASI_PETUGAS") && (
                      <button
                        onClick={() => openDocs(r)}
                        className={`${btn} bg-red-100 text-red-800 hover:bg-red-200`}
                      >
                        Catat Dokumen Kurang
                      </button>
                    )}
                    {r.status === "VERIFIKASI_PETUGAS" && (
                      <button
                        onClick={() => openSchedule(r, false)}
                        className={`${btn} bg-blue-700 text-white hover:bg-blue-800`}
                      >
                        Atur Jadwal
                      </button>
                    )}
                    {r.status === "DIJADWALKAN" && (
                      <>
                        <button
                          onClick={() => openComplete(r)}
                          className={`${btn} bg-green-600 text-white hover:bg-green-700`}
                        >
                          Selesai
                        </button>
                        <button
                          onClick={() => openSchedule(r, true)}
                          className={`${btn} bg-gray-200 text-gray-800 hover:bg-gray-300`}
                        >
                          Ubah Jadwal
                        </button>
                      </>
                    )}
                    {r.status === "SELESAI" && <span className="text-gray-400">-</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dialog?.kind === "schedule" && (
        <Modal titleId="schedule-title">
          <form onSubmit={submitSchedule} className="space-y-4">
            <h2 id="schedule-title" className="text-lg font-bold text-gray-900">
              {dialog.edit ? "Ubah Jadwal" : "Atur Jadwal"} - {dialog.row.ticketNumber}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="date" className="block text-sm font-medium text-gray-700">
                  Tanggal
                </label>
                <input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label htmlFor="time" className="block text-sm font-medium text-gray-700">
                  Jam (WIB)
                </label>
                <input
                  id="time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
                Catatan untuk Pemohon
              </label>
              <textarea
                id="notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={inputCls}
              />
            </div>
            <fieldset>
              <legend className="text-sm font-medium text-gray-700">Petugas Lapangan</legend>
              <div className="mt-1 space-y-2">
                {officers.map((o) => (
                  <label key={o.id} className="flex items-center gap-2 text-sm text-gray-900">
                    <input
                      type="checkbox"
                      checked={selected.includes(o.id)}
                      onChange={() => toggle(o.id)}
                      className="h-4 w-4"
                    />
                    {o.name} <span className="text-gray-500">({o.position})</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <FormFooter
              error={error}
              pending={pending}
              submitLabel={dialog.edit ? "Simpan Perubahan" : "Simpan Jadwal"}
              onCancel={close}
            />
          </form>
        </Modal>
      )}

      {dialog?.kind === "new" && (
        <Modal titleId="new-title">
          <form onSubmit={submitNew} className="space-y-4">
            <h2 id="new-title" className="text-lg font-bold text-gray-900">
              Tambah Berkas Baru
            </h2>
            <div>
              <label htmlFor="tn" className="block text-sm font-medium text-gray-700">
                No. Tiket / Registrasi
              </label>
              <input
                id="tn"
                type="text"
                placeholder="Contoh: REG-1204/2026"
                value={ticketNumber}
                onChange={(e) => setTicketNumber(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="an" className="block text-sm font-medium text-gray-700">
                Nama Pemohon
              </label>
              <input
                id="an"
                type="text"
                value={applicantName}
                onChange={(e) => setApplicantName(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="oa" className="block text-sm font-medium text-gray-700">
                Alamat Bidang Tanah
              </label>
              <textarea
                id="oa"
                rows={3}
                placeholder="Jl. ..., Kel. ..., Kec. ..."
                value={objectAddress}
                onChange={(e) => setObjectAddress(e.target.value)}
                className={inputCls}
              />
            </div>
            <FormFooter
              error={error}
              pending={pending}
              submitLabel="Simpan Berkas"
              onCancel={close}
            />
          </form>
        </Modal>
      )}

      {dialog?.kind === "docs" && (
        <Modal titleId="docs-title">
          <form onSubmit={submitDocs} className="space-y-4">
            <h2 id="docs-title" className="text-lg font-bold text-gray-900">
              Catat Dokumen Kurang - {dialog.row.ticketNumber}
            </h2>
            <div>
              <label htmlFor="docs" className="block text-sm font-medium text-gray-700">
                Dokumen yang kurang (satu per baris)
              </label>
              <textarea
                id="docs"
                rows={5}
                placeholder={"FC KTP batas tanah sebelah utara\nSurat sporadik belum ttd kades"}
                value={docs}
                onChange={(e) => setDocs(e.target.value)}
                className={inputCls}
              />
              <p className="mt-1 text-xs text-gray-500">
                Kosongkan jika dokumen sudah lengkap; berkas akan masuk antrean verifikasi petugas.
              </p>
            </div>
            <FormFooter
              error={error}
              pending={pending}
              submitLabel="Simpan Catatan"
              onCancel={close}
            />
          </form>
        </Modal>
      )}

      {dialog?.kind === "complete" && (
        <Modal titleId="complete-title">
          <form onSubmit={submitComplete} className="space-y-4">
            <h2 id="complete-title" className="text-lg font-bold text-gray-900">
              Tandai Selesai - {dialog.row.ticketNumber}
            </h2>
            <div>
              <label htmlFor="official" className="block text-sm font-medium text-gray-700">
                Nomor Berkas Resmi BPN
              </label>
              <input
                id="official"
                type="text"
                placeholder="Contoh: 1201/2026"
                value={officialNumber}
                onChange={(e) => setOfficialNumber(e.target.value)}
                className={inputCls}
              />
              <p className="mt-1 text-xs text-gray-500">
                Nomor dari aplikasi Sentuh Tanahku. Akan ditampilkan kepada pemohon.
              </p>
            </div>
            <FormFooter
              error={error}
              pending={pending}
              submitLabel="Tandai Selesai"
              onCancel={close}
            />
          </form>
        </Modal>
      )}
    </>
  );
}

function Modal({
  titleId,
  children,
}: {
  titleId: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl">
        {children}
      </div>
    </div>
  );
}

function FormFooter({
  error,
  pending,
  submitLabel,
  onCancel,
}: {
  error: string | null;
  pending: boolean;
  submitLabel: string;
  onCancel: () => void;
}) {
  return (
    <>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700"
        >
          Batal
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
        >
          {pending ? "Menyimpan..." : submitLabel}
        </button>
      </div>
    </>
  );
}
