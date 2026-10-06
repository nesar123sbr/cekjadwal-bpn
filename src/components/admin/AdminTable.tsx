"use client";

import { useState, useTransition, type FormEvent } from "react";
import { createSchedule } from "@/actions/schedule";

export type AdminRow = {
  id: string;
  fileNumber: string;
  applicantName: string;
  address: string;
  status: string;
  inspectionDate: string | null;
  inspectionTime: string | null;
  officerNames: string[];
};

export type OfficerOption = { id: string; name: string; position: string };

const STATUS_STYLE: Record<string, string> = {
  BELUM_DIJADWALKAN: "bg-amber-100 text-amber-800",
  DIJADWALKAN: "bg-green-100 text-green-800",
  SELESAI: "bg-gray-200 text-gray-700",
};

export default function AdminTable({
  rows,
  officers,
}: {
  rows: AdminRow[];
  officers: OfficerOption[];
}) {
  const [target, setTarget] = useState<AdminRow | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [notes, setNotes] = useState("Harap patok batas terpasang");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function open(row: AdminRow) {
    setTarget(row);
    setDate("");
    setTime("09:00");
    setNotes("Harap patok batas terpasang");
    setSelected([]);
    setError(null);
  }

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!target) return;
    if (!date) return setError("Tanggal pemeriksaan wajib diisi.");
    if (!time) return setError("Jam pemeriksaan wajib diisi.");
    if (selected.length === 0) return setError("Pilih minimal satu petugas.");
    setError(null);
    startTransition(async () => {
      const res = await createSchedule({
        applicationId: target.id,
        inspectionDate: date,
        inspectionTime: time,
        notes,
        officerIds: selected,
      });
      if (res.ok) setTarget(null);
      else setError(res.error);
    });
  }

  return (
    <>
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
                  {r.status === "BELUM_DIJADWALKAN" ? (
                    <button
                      onClick={() => open(r)}
                      className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800"
                    >
                      Atur Jadwal
                    </button>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {target && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="schedule-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
        >
          <form
            onSubmit={submit}
            className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl"
          >
            <h2 id="schedule-title" className="text-lg font-bold text-gray-900">
              Atur Jadwal - {target.fileNumber}
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
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
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
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
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
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
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

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTarget(null)}
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
                {pending ? "Menyimpan..." : "Simpan Jadwal"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
