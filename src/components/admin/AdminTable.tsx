"use client";

import { useEffect, useMemo, useState, useTransition, type FormEvent } from "react";
import {
  addVisitLog,
  createApplication,
  deleteApplication,
  getVisitLogs,
  updateApplication,
  updateMissingDocs,
  type ReceiptData,
  type VisitLogItem,
} from "@/actions/application";
import {
  createSchedule,
  markApplicationComplete,
  updateSchedule,
} from "@/actions/schedule";
import type { ApplicationStatus } from "@/db/schema";
import ReceiptModal from "./ReceiptModal";

export type AdminRow = {
  id: string;
  ticketNumber: string;
  firstVisitDate: string;
  createdAt: string;
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
  MENUNGGU_DOKUMEN: "bg-red-50 text-red-700 border border-red-200",
  VERIFIKASI_PETUGAS: "bg-amber-50 text-amber-700 border border-amber-200",
  DIJADWALKAN: "bg-blue-50 text-blue-700 border border-blue-200",
  SELESAI: "bg-emerald-50 text-emerald-700 border border-emerald-200",
};

const DEFAULT_NOTES = "Harap patok batas terpasang";
const inputCls =
  "mt-1 w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 shadow-xs focus:border-[#002B49] focus:ring-2 focus:ring-[#002B49]/20 outline-none transition";

type StatusTab = "SEMUA" | ApplicationStatus;

type Dialog =
  | { kind: "schedule"; row: AdminRow; edit: boolean }
  | { kind: "docs"; row: AdminRow }
  | { kind: "complete"; row: AdminRow }
  | { kind: "new" }
  | { kind: "edit"; row: AdminRow }
  | { kind: "delete"; row: AdminRow }
  | { kind: "history"; row: AdminRow }
  | { kind: "receipt"; receipt: ReceiptData }
  | null;

function formatIndoDate(dateStr: string): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr.includes("T") ? dateStr : `${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTimeWib(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return (
    d.toLocaleString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }) + " WIB"
  );
}

function escapeCsv(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

function extractDistrict(address: string): string | null {
  const match = address.match(/Kec\.?\s+([^,]+)/i);
  return match ? match[1].trim() : null;
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

  // Toolbar filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTab, setSelectedTab] = useState<StatusTab>("SEMUA");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("SEMUA");

  // State menu aksi dropdown
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);

  // Form schedule
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [notes, setNotes] = useState(DEFAULT_NOTES);
  const [selectedOfficers, setSelectedOfficers] = useState<string[]>([]);

  // Form berkas baru / edit
  const [ticketNumber, setTicketNumber] = useState("");
  const [applicantName, setApplicantName] = useState("");
  const [objectAddress, setObjectAddress] = useState("");

  // Form dokumen kurang / nomor resmi
  const [docs, setDocs] = useState("");
  const [officialNumber, setOfficialNumber] = useState("");

  // Modal riwayat kunjungan
  const [visitLogs, setVisitLogs] = useState<VisitLogItem[]>([]);
  const [loadingVisits, setLoadingVisits] = useState(false);
  const [visitDateInput, setVisitDateInput] = useState("");
  const [visitNotesInput, setVisitNotesInput] = useState("");

  // Ekstrak daftar unik kecamatan dari data alamat
  const availableDistricts = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      const d = extractDistrict(r.address);
      if (d) set.add(d);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "id"));
  }, [rows]);

  // Tutup dropdown saat klik di luar atau tekan tombol Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenActionMenuId(null);
    }
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target?.closest("[data-action-menu]")) {
        setOpenActionMenuId(null);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  function close() {
    setDialog(null);
    setError(null);
  }

  function openSchedule(row: AdminRow, edit: boolean) {
    setDate(edit ? (row.inspectionDate ?? "") : "");
    setTime(edit ? (row.inspectionTime ?? "09:00") : "09:00");
    setNotes(edit ? (row.notes ?? "") : DEFAULT_NOTES);
    setSelectedOfficers(edit ? row.officerIds : []);
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

  function openReceipt(row: AdminRow) {
    setError(null);
    setDialog({
      kind: "receipt",
      receipt: {
        ticketNumber: row.ticketNumber,
        applicantName: row.applicantName,
        objectAddress: row.address,
        receivedAt: row.createdAt,
      },
    });
  }

  function openNew() {
    setTicketNumber("");
    setApplicantName("");
    setObjectAddress("");
    setError(null);
    setDialog({ kind: "new" });
  }

  function openEdit(row: AdminRow) {
    setTicketNumber(row.ticketNumber);
    setApplicantName(row.applicantName);
    setObjectAddress(row.address);
    setError(null);
    setDialog({ kind: "edit", row });
  }

  function openDelete(row: AdminRow) {
    setError(null);
    setDialog({ kind: "delete", row });
  }

  async function openHistory(row: AdminRow) {
    setError(null);
    setVisitDateInput(new Date().toISOString().slice(0, 10));
    setVisitNotesInput("");
    setLoadingVisits(true);
    setVisitLogs([]);
    setDialog({ kind: "history", row });
    const res = await getVisitLogs(row.id);
    if (res.ok) {
      setVisitLogs(res.visits);
    } else {
      setError(res.error);
    }
    setLoadingVisits(false);
  }

  function toggleOfficer(id: string) {
    setSelectedOfficers((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
    );
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
    if (selectedOfficers.length === 0) return setError("Pilih minimal satu petugas.");
    setError(null);
    const payload = {
      applicationId: dialog.row.id,
      inspectionDate: date,
      inspectionTime: time,
      notes,
      officerIds: selectedOfficers,
    };
    run(() => (dialog.edit ? updateSchedule(payload) : createSchedule(payload)));
  }

  function submitNew(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ticketNumber.trim() || !applicantName.trim() || !objectAddress.trim()) {
      return setError("Semua kolom wajib diisi.");
    }
    setError(null);
    startTransition(async () => {
      const res = await createApplication({ ticketNumber, applicantName, objectAddress });
      if (res.ok) {
        setError(null);
        setDialog({ kind: "receipt", receipt: res.receipt });
      } else {
        setError(res.error);
      }
    });
  }

  function submitEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (dialog?.kind !== "edit") return;
    if (!ticketNumber.trim() || !applicantName.trim() || !objectAddress.trim()) {
      return setError("Semua kolom wajib diisi.");
    }
    setError(null);
    run(() =>
      updateApplication(dialog.row.id, {
        ticketNumber,
        applicantName,
        objectAddress,
      }),
    );
  }

  function submitDelete() {
    if (dialog?.kind !== "delete") return;
    setError(null);
    run(() => deleteApplication(dialog.row.id));
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

  async function submitAddVisit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (dialog?.kind !== "history") return;
    if (!visitDateInput.trim()) {
      return setError("Tanggal kedatangan wajib diisi.");
    }
    setError(null);
    setLoadingVisits(true);
    const res = await addVisitLog(dialog.row.id, visitDateInput, visitNotesInput);
    if (!res.ok) {
      setLoadingVisits(false);
      setError(res.error);
      return;
    }
    // Refresh visit list
    const updated = await getVisitLogs(dialog.row.id);
    setLoadingVisits(false);
    if (updated.ok) {
      setVisitLogs(updated.visits);
      setVisitNotesInput("");
    }
  }

  function handleResetFilters() {
    setSearchQuery("");
    setStartDate("");
    setEndDate("");
    setSelectedDistrict("SEMUA");
    setSelectedTab("SEMUA");
  }

  const hasActiveFilter =
    searchQuery.trim() !== "" ||
    startDate !== "" ||
    endDate !== "" ||
    selectedDistrict !== "SEMUA" ||
    selectedTab !== "SEMUA";

  // Filtered rows dengan kombinasi Status, Kecamatan, Rentang Tanggal, & Search Query
  const filteredRows = rows.filter((r) => {
    // 1. Filter Status Tab
    if (selectedTab !== "SEMUA" && r.status !== selectedTab) {
      return false;
    }

    // 2. Filter Kecamatan
    if (selectedDistrict !== "SEMUA") {
      const dist = extractDistrict(r.address);
      const matchDistrict =
        (dist && dist.toLowerCase() === selectedDistrict.toLowerCase()) ||
        r.address.toLowerCase().includes(selectedDistrict.toLowerCase());
      if (!matchDistrict) return false;
    }

    // 3. Filter Rentang Tanggal (berdasarkan tanggal masuk/kunjungan awal)
    const entryDate = r.firstVisitDate || r.createdAt.slice(0, 10);
    if (startDate && entryDate < startDate) {
      return false;
    }
    if (endDate && entryDate > endDate) {
      return false;
    }

    // 4. Filter Kata Kunci Pencarian
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const matchTicket = r.ticketNumber.toLowerCase().includes(q);
      const matchName = r.applicantName.toLowerCase().includes(q);
      const matchAddress = r.address.toLowerCase().includes(q);
      const matchFirstVisit = r.firstVisitDate.toLowerCase().includes(q);
      const matchDate =
        r.createdAt.toLowerCase().includes(q) ||
        (r.inspectionDate && r.inspectionDate.toLowerCase().includes(q));
      if (!matchTicket && !matchName && !matchAddress && !matchFirstVisit && !matchDate) {
        return false;
      }
    }
    return true;
  });

  // Tab counts
  const countAll = rows.length;
  const countDocs = rows.filter((r) => r.status === "MENUNGGU_DOKUMEN").length;
  const countVerify = rows.filter((r) => r.status === "VERIFIKASI_PETUGAS").length;
  const countScheduled = rows.filter((r) => r.status === "DIJADWALKAN").length;
  const countDone = rows.filter((r) => r.status === "SELESAI").length;

  // Export CSV with UTF-8 BOM
  function handleExportCsv() {
    const headers = [
      "No. Tiket",
      "Tgl Masuk",
      "Nama Pemohon",
      "Alamat Bidang Tanah",
      "Status",
      "Lama Proses (Hari)",
      "Lama di Tahap (Hari)",
      "Tanggal Jadwal",
      "Petugas Ukur",
      "Dokumen Kurang",
      "No. Berkas Resmi",
    ];

    const csvRows = filteredRows.map((r) => [
      escapeCsv(r.ticketNumber),
      escapeCsv(r.firstVisitDate),
      escapeCsv(r.applicantName),
      escapeCsv(r.address),
      escapeCsv(STATUS_LABEL[r.status]),
      escapeCsv(r.daysInProcess),
      escapeCsv(r.daysInStage),
      escapeCsv(r.inspectionDate ? `${r.inspectionDate} ${r.inspectionTime ?? ""}`.trim() : "-"),
      escapeCsv(r.officerNames.length ? r.officerNames.join(", ") : "-"),
      escapeCsv(r.missingDocuments ?? "-"),
      escapeCsv(r.officialFileNumber ?? "-"),
    ]);

    const csvContent =
      "\uFEFF" +
      [headers.map((h) => `"${h}"`).join(","), ...csvRows.map((row) => row.join(","))].join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rekap-berkas-bpn-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <>
      {/* Top Action Row */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#002B49]">
            Pemantauan Berkas Permohonan
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Total {rows.length} berkas terdaftar · Real-time status &amp; pemeriksaan lapangan ATR/BPN
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleExportCsv}
            type="button"
            className="flex items-center gap-1.5 rounded-xl border border-emerald-600/30 bg-emerald-50/50 px-3.5 py-2 text-sm font-semibold text-emerald-800 shadow-xs hover:bg-emerald-100/70 hover:border-emerald-600/50 transition"
          >
            <svg
              className="h-4 w-4 text-emerald-700"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Export Excel (CSV)
          </button>
          <button
            onClick={openNew}
            type="button"
            className="rounded-xl bg-[#002B49] px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-[#003d66] transition"
          >
            + Tambah Berkas Baru
          </button>
        </div>
      </div>

      {/* Toolbar: Multi-Dimensional Filter (Search, Date Range, District, Status) */}
      <div className="mb-4 space-y-3 rounded-2xl border border-gray-200 bg-white p-3.5 sm:p-4 shadow-xs">
        {/* Baris 1: Search Bar & Info Count */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1 max-w-md">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Cari No. Tiket, Pemohon, Alamat, atau Tanggal..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-gray-300 py-2 pl-9 pr-9 text-sm text-gray-900 placeholder-gray-400 focus:border-[#002B49] focus:ring-2 focus:ring-[#002B49]/20 outline-none transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>

          <div className="text-xs text-gray-500 font-medium">
            Menampilkan <strong className="text-gray-900">{filteredRows.length}</strong> dari{" "}
            <strong className="text-gray-900">{rows.length}</strong> berkas
          </div>
        </div>

        {/* Baris 2: Filter Multi-Dimensi (Grid Responsive) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-2.5 border-t border-gray-100">
          {/* Dari Tanggal */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
              Dari Tgl
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 shadow-xs focus:border-[#002B49] focus:ring-1 focus:ring-[#002B49] outline-none"
            />
          </div>

          {/* Sampai Tanggal */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
              Sampai Tgl
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 shadow-xs focus:border-[#002B49] focus:ring-1 focus:ring-[#002B49] outline-none"
            />
          </div>

          {/* Dropdown Kecamatan */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
              Kecamatan / Wilayah
            </label>
            <select
              value={selectedDistrict}
              onChange={(e) => setSelectedDistrict(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 shadow-xs focus:border-[#002B49] focus:ring-1 focus:ring-[#002B49] outline-none"
            >
              <option value="SEMUA">Semua Kecamatan</option>
              {availableDistricts.map((d) => (
                <option key={d} value={d}>
                  Kec. {d}
                </option>
              ))}
            </select>
          </div>

          {/* Tombol Reset Filter */}
          <div className="flex items-end">
            {hasActiveFilter ? (
              <button
                type="button"
                onClick={handleResetFilters}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50/70 hover:bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-700 transition"
              >
                <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                <span>Reset Filter</span>
              </button>
            ) : (
              <div className="text-[11px] text-gray-400 py-1.5 italic">
                Filter aktif: Semua data
              </div>
            )}
          </div>
        </div>

        {/* Baris 3: Status Filter Tabs (Pill Style) */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-2.5">
          <button
            type="button"
            onClick={() => setSelectedTab("SEMUA")}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              selectedTab === "SEMUA"
                ? "bg-[#002B49] text-white shadow-xs"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            <span>Semua</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                selectedTab === "SEMUA" ? "bg-white/20 text-white" : "bg-gray-200 text-gray-700"
              }`}
            >
              {countAll}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedTab("MENUNGGU_DOKUMEN")}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              selectedTab === "MENUNGGU_DOKUMEN"
                ? "bg-[#002B49] text-white shadow-xs"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            <span>Menunggu Dokumen</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                selectedTab === "MENUNGGU_DOKUMEN" ? "bg-white/20 text-white" : "bg-red-100 text-red-800"
              }`}
            >
              {countDocs}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedTab("VERIFIKASI_PETUGAS")}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              selectedTab === "VERIFIKASI_PETUGAS"
                ? "bg-[#002B49] text-white shadow-xs"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            <span>Verifikasi Petugas</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                selectedTab === "VERIFIKASI_PETUGAS" ? "bg-white/20 text-white" : "bg-amber-100 text-amber-800"
              }`}
            >
              {countVerify}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedTab("DIJADWALKAN")}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              selectedTab === "DIJADWALKAN"
                ? "bg-[#002B49] text-white shadow-xs"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            <span>Dijadwalkan</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                selectedTab === "DIJADWALKAN" ? "bg-white/20 text-white" : "bg-blue-100 text-blue-800"
              }`}
            >
              {countScheduled}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedTab("SELESAI")}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              selectedTab === "SELESAI"
                ? "bg-[#002B49] text-white shadow-xs"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            <span>Selesai</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                selectedTab === "SELESAI" ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-800"
              }`}
            >
              {countDone}
            </span>
          </button>
        </div>
      </div>

      {/* Main Table: 7 Kolom Bersih, Responsif, & Tombol Aksi Selalu Sejajar Vertikal */}
      <div className="w-full overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-xs">
        <table className="w-full text-left text-sm divide-y divide-gray-200">
          <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wider text-gray-600">
            <tr>
              <th className="px-4 py-3.5">No. Tiket &amp; Tgl Masuk</th>
              <th className="px-4 py-3.5">Pemohon</th>
              <th className="px-4 py-3.5">Lokasi Tanah</th>
              <th className="px-4 py-3.5">Status &amp; Proses</th>
              <th className="px-4 py-3.5">Jadwal Pemeriksaan</th>
              <th className="px-4 py-3.5">Petugas</th>
              <th className="whitespace-nowrap px-3 py-3 text-right w-[230px] min-w-[230px]">
                Aksi
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-gray-900">
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                  {hasActiveFilter
                    ? "Tidak ada berkas yang sesuai dengan filter pencarian."
                    : "Belum ada berkas terdaftar."}
                </td>
              </tr>
            )}
            {filteredRows.map((r) => (
              <tr key={r.id} className="align-top hover:bg-slate-50/60 transition-colors">
                {/* 1. NO. TIKET & TGL MASUK */}
                <td className="px-4 py-3.5 whitespace-nowrap">
                  <div className="font-bold text-[#002B49] text-sm leading-tight">
                    {r.ticketNumber}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Masuk: {formatIndoDate(r.firstVisitDate)}
                  </div>
                </td>

                {/* 2. PEMOHON */}
                <td className="px-4 py-3.5 whitespace-nowrap">
                  <div className="font-semibold text-gray-900 text-sm">
                    {r.applicantName}
                  </div>
                </td>

                {/* 3. LOKASI TANAH */}
                <td className="px-4 py-3.5">
                  <p
                    title={r.address}
                    className="max-w-[200px] line-clamp-2 text-xs text-gray-600 leading-relaxed"
                  >
                    {r.address}
                  </p>
                </td>

                {/* 4. STATUS & PROSES */}
                <td className="px-4 py-3.5">
                  <div>
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status]}`}
                    >
                      {STATUS_LABEL[r.status]}
                    </span>
                    <div className="mt-1 text-xs text-gray-500">
                      <span>{r.daysInProcess} hari proses</span>
                      {r.status === "MENUNGGU_DOKUMEN" && (
                        <p className="text-[11px] font-medium text-red-600">
                          Menunggu pemohon · {r.daysInStage} hari
                        </p>
                      )}
                      {r.status === "VERIFIKASI_PETUGAS" && (
                        <p className="text-[11px] font-medium text-amber-600">
                          Antrean petugas · {r.daysInStage} hari
                        </p>
                      )}
                      {r.status === "SELESAI" && r.officialFileNumber && (
                        <p className="text-[11px] font-medium text-emerald-700">
                          No. Resmi: {r.officialFileNumber}
                        </p>
                      )}
                    </div>
                  </div>
                </td>

                {/* 5. JADWAL PEMERIKSAAN */}
                <td className="px-4 py-3.5 whitespace-nowrap">
                  {r.inspectionDate ? (
                    <div>
                      <div className="font-medium text-gray-900 text-xs">
                        {formatIndoDate(r.inspectionDate)}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        {r.inspectionTime ? `${r.inspectionTime} WIB` : ""}
                      </div>
                    </div>
                  ) : (
                    <span className="text-gray-400 text-xs">-</span>
                  )}
                </td>

                {/* 6. PETUGAS */}
                <td className="px-4 py-3.5">
                  {r.officerNames.length > 0 ? (
                    <div className="flex flex-wrap gap-1 max-w-[190px]">
                      {r.officerNames.map((name) => (
                        <span
                          key={name}
                          className="inline-block rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700 border border-slate-200"
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-gray-400 text-xs">-</span>
                  )}
                </td>

                {/* 7. AKSI: Penyelarasan Terkunci (Fixed Widths, 100% lurus ke bawah) */}
                <td className="whitespace-nowrap px-3 py-3 text-right w-[230px] min-w-[230px]">
                  <div className="flex items-center justify-end gap-1.5 w-full">
                    {/* Tombol Status Utama (Lebar tetap w-28) */}
                    {r.status === "VERIFIKASI_PETUGAS" && (
                      <button
                        type="button"
                        onClick={() => openSchedule(r, false)}
                        title="Atur jadwal pemeriksaan lapangan"
                        className="w-28 shrink-0 text-center text-xs py-1.5 font-semibold rounded-lg truncate bg-blue-700 hover:bg-blue-800 text-white shadow-xs transition"
                      >
                        Atur Jadwal
                      </button>
                    )}
                    {r.status === "DIJADWALKAN" && (
                      <button
                        type="button"
                        onClick={() => openComplete(r)}
                        title="Tandai proses pemeriksaan selesai"
                        className="w-28 shrink-0 text-center text-xs py-1.5 font-semibold rounded-lg truncate bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition"
                      >
                        Selesai
                      </button>
                    )}
                    {r.status === "MENUNGGU_DOKUMEN" && (
                      <button
                        type="button"
                        onClick={() => openDocs(r)}
                        title="Catat atau perbarui dokumen kurang"
                        className="w-28 shrink-0 text-center text-xs py-1.5 font-semibold rounded-lg truncate border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 transition"
                      >
                        Catat Dokumen
                      </button>
                    )}
                    {r.status === "SELESAI" && (
                      <span className="w-28 shrink-0 inline-flex items-center justify-center gap-1 text-center text-xs py-1.5 font-semibold rounded-lg truncate border border-emerald-200 bg-emerald-50 text-emerald-800">
                        <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        Tuntas
                      </span>
                    )}

                    {/* Tombol Riwayat (Lebar tetap w-16) */}
                    <button
                      type="button"
                      onClick={() => openHistory(r)}
                      title="Lihat riwayat kedatangan & konsultasi pemohon"
                      className="w-16 shrink-0 text-center text-xs py-1.5 font-medium rounded-lg border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700 transition"
                    >
                      Riwayat
                    </button>

                    {/* Tombol Titik Tiga (Lebar tetap w-8 h-8) */}
                    <div className="relative shrink-0" data-action-menu="true">
                      <button
                        type="button"
                        onClick={() => setOpenActionMenuId(openActionMenuId === r.id ? null : r.id)}
                        className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-slate-100 text-gray-600 transition"
                        title="Menu Aksi Lainnya"
                        aria-expanded={openActionMenuId === r.id}
                      >
                        <span className="text-base font-bold leading-none">⋮</span>
                      </button>

                      {/* Dropdown Menu Mengambang Berkelompok */}
                      {openActionMenuId === r.id && (
                        <div className="absolute right-0 mt-1.5 w-56 rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl z-30 text-xs text-left divide-y divide-gray-100">
                          {/* Bagian Cetak */}
                          <div className="py-1">
                            <div className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                              Cetak
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenActionMenuId(null);
                                openReceipt(r);
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-gray-700 hover:bg-slate-100 transition"
                            >
                              <svg className="h-3.5 w-3.5 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                              </svg>
                              <span>Cetak Tanda Terima</span>
                            </button>
                          </div>

                          {/* Bagian Pengelolaan */}
                          <div className="py-1">
                            <div className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                              Pengelolaan
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenActionMenuId(null);
                                openEdit(r);
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-gray-700 hover:bg-slate-100 transition"
                            >
                              <svg className="h-3.5 w-3.5 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              <span>Edit Identitas Berkas</span>
                            </button>

                            {(r.status === "MENUNGGU_DOKUMEN" || r.status === "VERIFIKASI_PETUGAS") && (
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenActionMenuId(null);
                                  openDocs(r);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-amber-700 hover:bg-amber-50 transition"
                              >
                                <svg className="h-3.5 w-3.5 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                                <span>Catat / Lengkapi Dokumen</span>
                              </button>
                            )}

                            {r.status === "DIJADWALKAN" && (
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenActionMenuId(null);
                                  openSchedule(r, true);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-blue-700 hover:bg-blue-50 transition"
                              >
                                <svg className="h-3.5 w-3.5 text-blue-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <span>Ubah Jadwal Pemeriksaan</span>
                              </button>
                            )}
                          </div>

                          {/* Bagian Tindakan Bahaya */}
                          <div className="py-1">
                            <div className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-400">
                              Tindakan Bahaya
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenActionMenuId(null);
                                openDelete(r);
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-red-600 hover:bg-red-50 transition"
                            >
                              <svg className="h-3.5 w-3.5 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              <span>Hapus Berkas (Arsip)</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal: Riwayat Kunjungan (Visit Logs) */}
      {dialog?.kind === "history" && (
        <Modal titleId="history-title" maxWidth="max-w-xl">
          <div className="space-y-4">
            <div className="border-b border-gray-200 pb-3">
              <h2 id="history-title" className="text-lg font-bold text-gray-900">
                Riwayat Kedatangan Pemohon
              </h2>
              <p className="mt-0.5 text-xs text-gray-600">
                No. Tiket: <strong className="text-[#002B49]">{dialog.row.ticketNumber}</strong> · Pemohon:{" "}
                <strong>{dialog.row.applicantName}</strong>
              </p>
            </div>

            {/* Form Catat Kedatangan Baru */}
            <form onSubmit={submitAddVisit} className="rounded-xl border border-gray-200 bg-slate-50 p-3 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-700">
                + Catat Kedatangan / Konsultasi Baru
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label htmlFor="visitDate" className="block text-xs font-medium text-gray-600">
                    Tanggal Datang
                  </label>
                  <input
                    id="visitDate"
                    type="date"
                    required
                    value={visitDateInput}
                    onChange={(e) => setVisitDateInput(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 shadow-xs"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="visitNotes" className="block text-xs font-medium text-gray-600">
                    Keterangan / Keperluan
                  </label>
                  <input
                    id="visitNotes"
                    type="text"
                    placeholder="Contoh: Konsultasi kelengkapan berkas, serahkan KTP batas..."
                    value={visitNotesInput}
                    onChange={(e) => setVisitNotesInput(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 shadow-xs"
                  />
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={loadingVisits}
                  className="rounded-lg bg-[#002B49] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#003d66] disabled:opacity-60 transition"
                >
                  {loadingVisits ? "Menyimpan..." : "Tambah Catatan"}
                </button>
              </div>
            </form>

            {/* Timeline Kedatangan */}
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-700">
                Linimasa Kunjungan ({visitLogs.length})
              </p>
              {loadingVisits && visitLogs.length === 0 ? (
                <p className="py-4 text-center text-xs text-gray-500">Memuat riwayat...</p>
              ) : visitLogs.length === 0 ? (
                <p className="py-4 text-center text-xs text-gray-500">
                  Belum ada riwayat kunjungan pemohon.
                </p>
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                  {visitLogs.map((v, idx) => (
                    <div
                      key={v.id}
                      className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3 text-xs shadow-xs"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 font-bold text-[#002B49]">
                        {visitLogs.length - idx}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-gray-900">
                            {formatIndoDate(v.visitDate)}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {formatDateTimeWib(v.createdAt)}
                          </span>
                        </div>
                        <p className="mt-1 text-gray-700 font-medium whitespace-pre-wrap">
                          {v.notes ?? "Kunjungan tanpa catatan."}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end border-t border-gray-200 pt-3">
              <button
                type="button"
                onClick={close}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Edit Berkas */}
      {dialog?.kind === "edit" && (
        <Modal titleId="edit-title">
          <form onSubmit={submitEdit} className="space-y-4">
            <h2 id="edit-title" className="text-lg font-bold text-gray-900">
              Edit Identitas Berkas
            </h2>
            <div>
              <label htmlFor="edit-tn" className="block text-sm font-medium text-gray-700">
                No. Tiket / Registrasi
              </label>
              <input
                id="edit-tn"
                type="text"
                value={ticketNumber}
                onChange={(e) => setTicketNumber(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="edit-an" className="block text-sm font-medium text-gray-700">
                Nama Pemohon
              </label>
              <input
                id="edit-an"
                type="text"
                value={applicantName}
                onChange={(e) => setApplicantName(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="edit-oa" className="block text-sm font-medium text-gray-700">
                Alamat Bidang Tanah
              </label>
              <textarea
                id="edit-oa"
                rows={3}
                value={objectAddress}
                onChange={(e) => setObjectAddress(e.target.value)}
                className={inputCls}
              />
            </div>
            <FormFooter
              error={error}
              pending={pending}
              submitLabel="Simpan Perubahan"
              onCancel={close}
            />
          </form>
        </Modal>
      )}

      {/* Modal: Hapus Berkas (Soft Delete) */}
      {dialog?.kind === "delete" && (
        <Modal titleId="delete-title">
          <div className="space-y-4">
            <h2 id="delete-title" className="text-lg font-bold text-red-700">
              Hapus Berkas Permohonan
            </h2>
            <p className="text-sm text-gray-700">
              Apakah Anda yakin ingin menghapus berkas nomor{" "}
              <strong>{dialog.row.ticketNumber}</strong> atas nama{" "}
              <strong>{dialog.row.applicantName}</strong>?
            </p>
            <div className="rounded-lg bg-red-50 p-3 text-xs text-red-800 border border-red-200">
              Berkas akan diarsipkan (soft-delete). Berkas ini tidak akan muncul lagi di pencarian publik
              maupun daftar aktif petugas.
            </div>
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={close}
                disabled={pending}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={submitDelete}
                disabled={pending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60 transition"
              >
                {pending ? "Menghapus..." : "Ya, Hapus Berkas"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Atur / Ubah Jadwal */}
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
                  <label key={o.id} className="flex items-center gap-2 text-sm text-gray-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedOfficers.includes(o.id)}
                      onChange={() => toggleOfficer(o.id)}
                      className="h-4 w-4 rounded border-gray-300 text-[#002B49] focus:ring-[#002B49]"
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

      {/* Modal: Tambah Berkas Baru */}
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

      {/* Modal: Catat Dokumen Kurang */}
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
                Kosongkan jika dokumen sudah lengkap; berkas akan kembali ke status verifikasi petugas.
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

      {/* Modal: Cetak Tanda Terima */}
      {dialog?.kind === "receipt" && (
        <ReceiptModal receipt={dialog.receipt} onClose={close} />
      )}

      {/* Modal: Tandai Selesai */}
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
  maxWidth = "max-w-md",
  children,
}: {
  titleId: string;
  maxWidth?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
    >
      <div
        className={`max-h-[90vh] w-full ${maxWidth} overflow-y-auto rounded-2xl bg-white p-5 sm:p-6 shadow-2xl`}
      >
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
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
        >
          Batal
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-[#002B49] px-4 py-2 text-sm font-semibold text-white hover:bg-[#003d66] disabled:opacity-60 transition shadow-xs"
        >
          {pending ? "Menyimpan..." : submitLabel}
        </button>
      </div>
    </>
  );
}
