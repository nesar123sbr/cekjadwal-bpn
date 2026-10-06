"use client";

import { useState, useTransition, type FormEvent } from "react";
import { createApplication } from "@/actions/application";
import {
  createSchedule,
  markApplicationComplete,
  updateSchedule,
} from "@/actions/schedule";

export type AdminRow = {
  id: string;
  fileNumber: string;
  applicantName: string;
  address: string;
  status: string;
  inspectionDate: string | null;
  inspectionTime: string | null;
  notes: string | null;
  officerIds: string[];
  officerNames: string[];
};

export type OfficerOption = { id: string; name: string; position: string };

const STATUS_STYLE: Record<string, string> = {
  BELUM_DIJADWALKAN: "bg-amber-100 text-amber-800",
  DIJADWALKAN: "bg-green-100 text-green-800",
  SELESAI: "bg-emerald-100 text-emerald-800",
};

const DEFAULT_NOTES = "Harap patok batas terpasang";
const inputCls =
  "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900";

export default function AdminTable({
  rows,
  officers,
}: {
  rows: AdminRow[];
  officers: OfficerOption[];
}) {
  // Modal jadwal (buat / ubah)
  const [target, setTarget] = useState<AdminRow | null>(null);
  const [isEdit, setIsEdit] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [notes, setNotes] = useState(DEFAULT_NOTES);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Modal berkas baru
  const [showNew, setShowNew] = useState(false);
  const [fileNumber, setFileNumber] = useState("");
  const [applicantName, setApplicantName] = useState("");
  const [objectAddress, setObjectAddress] = useState("");
  const [newError, setNewError] = useState<string | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openSchedule(row: AdminRow, edit: boolean) {
    setTarget(row);
    setIsEdit(edit);
    setDate(edit ? (row.inspectionDate ?? "") : "");
    setTime(edit ? (row.inspectionTime ?? "09:00") : "09:00");
    setNotes(edit ? (row.notes ?? "") : DEFAULT_NOTES);
    setSelected(edit ? row.officerIds : []);
    setError(null);
  }

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function submitSchedule(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!target) return;
    if (!date) return setError("Tanggal pemeriksaan wajib diisi.");
    if (!time) return setError("Jam pemeriksaan wajib diisi.");
    if (selected.length === 0) return setError("Pilih minimal satu petugas.");
    setError(null);
    startTransition(async () => {
      const payload = {
        applicationId: target.id,
        inspectionDate: date,
        inspectionTime: time,
        notes,
        officerIds: selected,
      };
      const res = isEdit
        ? await updateSchedule(payload)
        : await createSchedule(payload);
      if (res.ok) setTarget(null);
      else setError(res.error);
    });
  }

  function openNew() {
    setFileNumber("");
    setApplicantName("");
    setObjectAddress("");
    setNewError(null);
    setShowNew(true);
  }

  function submitNew(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!fileNumber.trim() || !applicantName.trim() || !objectAddress.trim()) {
      return setNewError("Semua kolom wajib diisi.");
    }
    setNewError(null);
    startTransition(async () => {
      const res = await createApplication({
        fileNumber,
        applicantName,
        objectAddress,
      });
      if (res.ok) setShowNew(false);
      else setNewError(res.error);
    });
  }

  function complete(row: AdminRow) {
    if (!window.confirm(`Tandai berkas ${row.fileNumber} sebagai selesai?`)) return;
    setActionError(null);
    startTransition(async () => {
      const res = await markApplicationComplete(row.id);
      if (!res.ok) setActionError(res.error);
    });
  }

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

      {actionError && (
        <p role="alert" className="mb-3 text-sm text-red-600">
          {actionError}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-100 text-xs uppercase text-gray-600">
            <tr>
              <th className="px-4 py-3">No. Berkas</th>
              <th className="px-4 py-3">Nama Pemohon</th>
              <th className="px-4 py-3">Alamat</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Tanggal Jadwal</th>
              <th className="px-4 py-3">Petugas</th>
              <th className="px-4 py-3">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-gray-900">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                  Belum ada berkas.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-3 font-medium">{r.fileNumber}</td>
                <td className="px-4 py-3">{r.applicantName}</td>
                <td className="px-4 py-3">{r.address}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                      STATUS_STYLE[r.status] ?? "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {r.status.replace("_", " ")}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {r.inspectionDate ? `${r.inspectionDate} ${r.inspectionTime ?? ""} WIB` : "-"}
                </td>
                <td className="px-4 py-3">
                  {r.officerNames.length ? r.officerNames.join(", ") : "-"}
                </td>
                <td className="px-4 py-3">
                  {r.status === "BELUM_DIJADWALKAN" && (
                    <button
                      onClick={() => openSchedule(r, false)}
                      className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800"
                    >
                      Atur Jadwal
                    </button>
                  )}
                  {r.status === "DIJADWALKAN" && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => complete(r)}
                        disabled={pending}
                        className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                      >
                        Selesai
                      </button>
                      <button
                        onClick={() => openSchedule(r, true)}
                        disabled={pending}
                        className="rounded-lg bg-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-300 disabled:opacity-60"
                      >
                        Ubah Jadwal
                      </button>
                    </div>
                  )}
                  {r.status === "SELESAI" && <span className="text-gray-400">-</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {target && (
        <Modal titleId="schedule-title">
          <form onSubmit={submitSchedule} className="space-y-4">
            <h2 id="schedule-title" className="text-lg font-bold text-gray-900">
              {isEdit ? "Ubah Jadwal" : "Atur Jadwal"} - {target.fileNumber}
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

            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}

            <ModalButtons
              pending={pending}
              submitLabel={isEdit ? "Simpan Perubahan" : "Simpan Jadwal"}
              onCancel={() => setTarget(null)}
            />
          </form>
        </Modal>
      )}

      {showNew && (
        <Modal titleId="new-title">
          <form onSubmit={submitNew} className="space-y-4">
            <h2 id="new-title" className="text-lg font-bold text-gray-900">
              Tambah Berkas Baru
            </h2>
            <div>
              <label htmlFor="fn" className="block text-sm font-medium text-gray-700">
                No. Berkas
              </label>
              <input
                id="fn"
                type="text"
                placeholder="Contoh: 1204/2026"
                value={fileNumber}
                onChange={(e) => setFileNumber(e.target.value)}
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
            {newError && (
              <p role="alert" className="text-sm text-red-600">
                {newError}
              </p>
            )}
            <ModalButtons
              pending={pending}
              submitLabel="Simpan Berkas"
              onCancel={() => setShowNew(false)}
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

function ModalButtons({
  pending,
  submitLabel,
  onCancel,
}: {
  pending: boolean;
  submitLabel: string;
  onCancel: () => void;
}) {
  return (
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
  );
}
