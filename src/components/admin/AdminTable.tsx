"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import {
  addVisitLog,
  createApplication,
  deleteApplication,
  getAuditLogs,
  getVisitLogs,
  updateApplication,
  updateMissingDocs,
  type AuditLogItem,
  type ReceiptData,
  type VisitLogItem,
} from "@/actions/application";
import {
  cancelSchedule,
  createSchedule,
  markApplicationComplete,
  reopenApplication,
  rescheduleApplication,
  updateOfficialFileNumber,
  updateSchedule,
} from "@/actions/schedule";
import { addOfficer, deleteOfficer, reactivateOfficer } from "@/actions/officer";
import type { ApplicationStatus } from "@/db/schema";
import {
  type CancelCategory,
  CANCEL_REASON_MIN,
  CANCEL_REASON_MAX,
  getTodayWib,
} from "@/lib/utils";
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
  lastCancelCategory: CancelCategory | null;
  lastCancelReason: string | null;
  rescheduleCount: number;
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

const AUDIT_ACTION_LABEL: Record<string, string> = {
  CREATE_APPLICATION: "Berkas didaftarkan",
  CREATE_SCHEDULE: "Jadwal ditetapkan",
  UPDATE_SCHEDULE: "Jadwal diubah",
  CANCEL_SCHEDULE: "Jadwal dibatalkan",
  RESCHEDULE_APPLICATION: "Jadwal diatur ulang",
  COMPLETE_APPLICATION: "Berkas diselesaikan",
  UPDATE_OFFICIAL_NUMBER: "Nomor Berkas dikoreksi",
  REOPEN_APPLICATION: "Berkas dibuka kembali",
  UPDATE_APPLICATION: "Data berkas diubah",
  DELETE_APPLICATION: "Berkas dihapus",
};

const DEFAULT_NOTES = "Harap patok batas terpasang";
const inputCls =
  "mt-1 w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 shadow-xs focus:border-[#002B49] focus:ring-2 focus:ring-[#002B49]/20 outline-none transition";

type StatusTab = "SEMUA" | ApplicationStatus | "OVERDUE" | "TODAY";

type ScheduleUrgency = "OVERDUE" | "TODAY" | "UPCOMING" | "NONE";

function checkScheduleUrgency(
  dateStr: string | null,
  timeStr: string | null,
): ScheduleUrgency {
  if (!dateStr) return "NONE";
  const todayStr = getTodayWib();

  // Cek apakah tanggal sudah lewat hari (WIB)
  if (dateStr < todayStr) return "OVERDUE";

  // Cek jika tanggal hari ini (WIB)
  if (dateStr === todayStr) {
    if (!timeStr) return "TODAY";
    const [hour, minute] = timeStr.split(":").map(Number);
    if (!Number.isNaN(hour) && !Number.isNaN(minute)) {
      const nowWib = new Date(
        new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }),
      );
      const schedDate = new Date(nowWib);
      schedDate.setHours(hour, minute, 0, 0);
      // Jika jam sudah lewat hari ini
      if (schedDate < nowWib) return "OVERDUE";
    }
    return "TODAY";
  }

  return "UPCOMING";
}

function formatShortDate(dateStr: string): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr.includes("T") ? dateStr : `${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

type Dialog =
  | { kind: "schedule"; row: AdminRow; edit: boolean }
  | { kind: "cancelSchedule"; row: AdminRow }
  | { kind: "docs"; row: AdminRow }
  | { kind: "complete"; row: AdminRow }
  | { kind: "correction"; row: AdminRow }
  | { kind: "reopen"; row: AdminRow }
  | { kind: "new" }
  | { kind: "edit"; row: AdminRow }
  | { kind: "delete"; row: AdminRow }
  | { kind: "history"; row: AdminRow }
  | { kind: "receipt"; receipt: ReceiptData }
  | { kind: "officers" }
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

function parseAddress(rawAddress: string): {
  district: string;
  village: string;
  streetDetail: string;
} {
  if (!rawAddress) {
    return { district: "", village: "", streetDetail: "" };
  }

  // Pola standar: [streetDetail, ](Desa/Kel.|Kel.|Desa) <village>, Kec. <district>
  const regex =
    /^(?:(.*),\s*)?(?:Desa\/Kel\.|Kel\.|Desa)\s+([^,]+),\s*Kec\.?\s+(.+)$/i;
  const match = rawAddress.trim().match(regex);

  if (match) {
    return {
      streetDetail: match[1]?.trim() ?? "",
      village: match[2]?.trim() ?? "",
      district: match[3]?.trim() ?? "",
    };
  }

  // Pola parsial jika format memiliki Kec. atau Desa/Kel. tersendiri
  const kecMatch = rawAddress.match(/Kec\.?\s+([^,]+)/i);
  const desMatch = rawAddress.match(/(?:Desa\/Kel\.|Kel\.|Desa)\s+([^,]+)/i);

  if (kecMatch || desMatch) {
    const district = kecMatch ? kecMatch[1].trim() : "";
    const village = desMatch ? desMatch[1].trim() : "";
    const remaining = rawAddress
      .replace(/(?:Desa\/Kel\.|Kel\.|Desa)\s+[^,]+/i, "")
      .replace(/Kec\.?\s+[^,]+/i, "")
      .replace(/,\s*,/g, ",")
      .replace(/^[\s,]+|[\s,]+$/g, "")
      .trim();

    return {
      district,
      village,
      streetDetail: remaining,
    };
  }

  // Format lama bebas: tempatkan seluruhnya pada detail jalan
  return {
    district: "",
    village: "",
    streetDetail: rawAddress.trim(),
  };
}

export default function AdminTable({
  rows,
  officers,
  inactiveOfficers = [],
}: {
  rows: AdminRow[];
  officers: OfficerOption[];
  inactiveOfficers?: OfficerOption[];
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

  // Form berkas baru / edit (Alamat Terstruktur)
  const [ticketNumber, setTicketNumber] = useState("");
  const [applicantName, setApplicantName] = useState("");
  const [district, setDistrict] = useState("");
  const [village, setVillage] = useState("");
  const [streetDetail, setStreetDetail] = useState("");

  // Form dokumen kurang / nomor berkas
  const [docs, setDocs] = useState("");
  const [officialNumber, setOfficialNumber] = useState("");

  // Form pembatalan jadwal / jadwal ulang / koreksi nomor berkas
  const [cancelCategory, setCancelCategory] = useState<CancelCategory | "">("");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelFollowUp, setCancelFollowUp] = useState<"CANCEL" | "RESCHEDULE">("CANCEL");
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("09:00");
  const [rescheduleNotes, setRescheduleNotes] = useState(DEFAULT_NOTES);
  const [rescheduleOfficers, setRescheduleOfficers] = useState<string[]>([]);
  const [correctionNumber, setCorrectionNumber] = useState("");

  // Modal riwayat kunjungan & riwayat perubahan (audit logs)
  const [visitLogs, setVisitLogs] = useState<VisitLogItem[]>([]);
  const [loadingVisits, setLoadingVisits] = useState(false);
  const [visitDateInput, setVisitDateInput] = useState("");
  const [visitNotesInput, setVisitNotesInput] = useState("");
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);

  // Kelola Petugas (Dinamis)
  const [officerList, setOfficerList] = useState<OfficerOption[]>(officers);
  const [inactiveOfficerList, setInactiveOfficerList] =
    useState<OfficerOption[]>(inactiveOfficers);
  const [officerNameInput, setOfficerNameInput] = useState("");
  const [officerPositionInput, setOfficerPositionInput] = useState("");
  const [officerError, setOfficerError] = useState<string | null>(null);
  const [officerPending, setOfficerPending] = useState(false);

  // Ekstrak daftar unik kecamatan dari data alamat
  const districtOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      const match = r.address.match(/Kec\.?\s*([^,]+)/i);
      if (match) set.add(match[1].trim());
    });
    return Array.from(set).sort();
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
    setOfficerError(null);
    setCancelCategory("");
    setCancelReason("");
    setCancelFollowUp("CANCEL");
    setRescheduleDate("");
    setRescheduleTime("09:00");
    setRescheduleNotes(DEFAULT_NOTES);
    setRescheduleOfficers([]);
  }

  function openOfficers() {
    setOfficerError(null);
    setOfficerNameInput("");
    setOfficerPositionInput("");
    setDialog({ kind: "officers" });
  }

  async function handleAddOfficer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!officerNameInput.trim() || !officerPositionInput.trim()) {
      setOfficerError("Nama dan jabatan petugas wajib diisi.");
      return;
    }
    setOfficerError(null);
    setOfficerPending(true);
    const res = await addOfficer(
      officerNameInput.trim(),
      officerPositionInput.trim(),
    );
    setOfficerPending(false);
    if (res.ok) {
      if (res.officer) {
        setOfficerList((prev) =>
          [...prev, res.officer!].sort((a, b) =>
            a.name.localeCompare(b.name, "id"),
          ),
        );
      }
      setOfficerNameInput("");
      setOfficerPositionInput("");
    } else {
      setOfficerError(res.error);
    }
  }

  async function handleDeleteOfficer(id: string) {
    setOfficerError(null);
    setOfficerPending(true);
    const deletedOfficer = officerList.find((o) => o.id === id);
    const res = await deleteOfficer(id);
    setOfficerPending(false);
    if (res.ok) {
      setOfficerList((prev) => prev.filter((o) => o.id !== id));
      setSelectedOfficers((prev) => prev.filter((oId) => oId !== id));
      if (deletedOfficer) {
        setInactiveOfficerList((prev) =>
          [...prev, deletedOfficer].sort((a, b) =>
            a.name.localeCompare(b.name, "id"),
          ),
        );
      }
    } else {
      setOfficerError(res.error);
    }
  }

  async function handleReactivateOfficer(id: string) {
    setOfficerError(null);
    setOfficerPending(true);
    const reactivated = inactiveOfficerList.find((o) => o.id === id);
    const res = await reactivateOfficer(id);
    setOfficerPending(false);
    if (res.ok) {
      setInactiveOfficerList((prev) => prev.filter((o) => o.id !== id));
      if (reactivated) {
        setOfficerList((prev) =>
          [...prev, reactivated].sort((a, b) =>
            a.name.localeCompare(b.name, "id"),
          ),
        );
      }
    } else {
      setOfficerError(res.error);
    }
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
    setDistrict("");
    setVillage("");
    setStreetDetail("");
    setError(null);
    setDialog({ kind: "new" });
  }

  function openEdit(row: AdminRow) {
    const parsed = parseAddress(row.address);
    setTicketNumber(row.ticketNumber);
    setApplicantName(row.applicantName);
    setDistrict(parsed.district);
    setVillage(parsed.village);
    setStreetDetail(parsed.streetDetail);
    setError(null);
    setDialog({ kind: "edit", row });
  }

  function openDelete(row: AdminRow) {
    setError(null);
    setDialog({ kind: "delete", row });
  }

  function openCancelSchedule(row: AdminRow) {
    setCancelCategory("");
    setCancelReason("");
    setCancelFollowUp("CANCEL");
    setRescheduleDate("");
    setRescheduleTime(row.inspectionTime ?? "09:00");
    setRescheduleNotes(row.notes ?? DEFAULT_NOTES);
    const activeOldOfficerIds = row.officerIds.filter((id) =>
      officerList.some((o) => o.id === id),
    );
    setRescheduleOfficers(activeOldOfficerIds);
    setError(null);
    setDialog({ kind: "cancelSchedule", row });
  }

  function toggleRescheduleOfficer(id: string) {
    setRescheduleOfficers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function openCorrection(row: AdminRow) {
    setCorrectionNumber(row.officialFileNumber ?? "");
    setError(null);
    setDialog({ kind: "correction", row });
  }

  function openReopen(row: AdminRow) {
    setError(null);
    setDialog({ kind: "reopen", row });
  }

  async function openHistory(row: AdminRow) {
    setError(null);
    setVisitDateInput(new Date().toISOString().slice(0, 10));
    setVisitNotesInput("");
    setLoadingVisits(true);
    setLoadingAuditLogs(true);
    setVisitLogs([]);
    setAuditLogs([]);
    setDialog({ kind: "history", row });
    const [visitRes, auditRes] = await Promise.all([
      getVisitLogs(row.id),
      getAuditLogs(row.id),
    ]);
    if (visitRes.ok) {
      setVisitLogs(visitRes.visits);
    } else {
      setError(visitRes.error);
    }
    setLoadingVisits(false);

    if (auditRes.ok) {
      setAuditLogs(auditRes.logs);
    }
    setLoadingAuditLogs(false);
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
    if (selectedOfficers.length === 0)
      return setError("Pilih minimal satu petugas.");
    setError(null);
    const payload = {
      applicationId: dialog.row.id,
      inspectionDate: date,
      inspectionTime: time,
      notes,
      officerIds: selectedOfficers,
    };
    run(() =>
      dialog.edit ? updateSchedule(payload) : createSchedule(payload),
    );
  }

  function submitNew(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ticketNumber.trim()) {
      return setError("No. Tiket / Registrasi wajib diisi.");
    }
    if (!applicantName.trim()) {
      return setError("Nama pemohon wajib diisi.");
    }
    if (!district.trim()) {
      return setError("Kecamatan bidang tanah wajib diisi.");
    }
    if (!village.trim()) {
      return setError("Desa/Kelurahan bidang tanah wajib diisi.");
    }

    const objectAddress = `${streetDetail.trim() ? streetDetail.trim() + ", " : ""}Desa/Kel. ${village.trim()}, Kec. ${district.trim()}`;

    setError(null);
    startTransition(async () => {
      const res = await createApplication({
        ticketNumber: ticketNumber.trim(),
        applicantName: applicantName.trim(),
        objectAddress,
      });
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
    if (!ticketNumber.trim()) {
      return setError("No. Tiket / Registrasi wajib diisi.");
    }
    if (!applicantName.trim()) {
      return setError("Nama pemohon wajib diisi.");
    }
    if (!district.trim()) {
      return setError("Kecamatan bidang tanah wajib diisi.");
    }
    if (!village.trim()) {
      return setError("Desa/Kelurahan bidang tanah wajib diisi.");
    }

    const objectAddress = `${streetDetail.trim() ? streetDetail.trim() + ", " : ""}Desa/Kel. ${village.trim()}, Kec. ${district.trim()}`;

    setError(null);
    run(() =>
      updateApplication(dialog.row.id, {
        ticketNumber: ticketNumber.trim(),
        applicantName: applicantName.trim(),
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
      return setError("Nomor Berkas wajib diisi.");
    }
    setError(null);
    run(() => markApplicationComplete(dialog.row.id, officialNumber));
  }

  function submitCancelSchedule(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (dialog?.kind !== "cancelSchedule") return;

    if (!cancelCategory) {
      return setError("Pilih kategori alasan terlebih dahulu.");
    }
    const cleanReason = cancelReason.trim();
    if (cleanReason.length < CANCEL_REASON_MIN) {
      return setError(`Alasan wajib diisi minimal ${CANCEL_REASON_MIN} karakter.`);
    }
    if (cleanReason.length > CANCEL_REASON_MAX) {
      return setError(`Alasan maksimal ${CANCEL_REASON_MAX} karakter.`);
    }

    if (cancelFollowUp === "CANCEL") {
      setError(null);
      run(() => cancelSchedule(dialog.row.id, cleanReason, cancelCategory));
      return;
    }

    if (!rescheduleDate) {
      return setError("Tanggal pemeriksaan baru wajib diisi.");
    }
    if (!rescheduleTime) {
      return setError("Jam pemeriksaan baru wajib diisi.");
    }
    if (rescheduleDate < getTodayWib()) {
      return setError("Tanggal pemeriksaan baru tidak boleh sebelum hari ini.");
    }
    if (
      dialog.row.inspectionDate === rescheduleDate &&
      dialog.row.inspectionTime === rescheduleTime
    ) {
      return setError("Tanggal dan jam baru sama dengan jadwal sebelumnya.");
    }
    if (rescheduleOfficers.length === 0) {
      return setError("Pilih minimal satu petugas untuk jadwal baru.");
    }

    setError(null);
    run(() =>
      rescheduleApplication({
        applicationId: dialog.row.id,
        category: cancelCategory,
        reason: cleanReason,
        newDate: rescheduleDate,
        newTime: rescheduleTime,
        notes: rescheduleNotes,
        officerIds: rescheduleOfficers,
      }),
    );
  }

  function submitCorrection(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (dialog?.kind !== "correction") return;
    if (!correctionNumber.trim()) {
      return setError("Nomor Berkas wajib diisi.");
    }
    if (correctionNumber.trim().length > 50) {
      return setError("Nomor Berkas maksimal 50 karakter.");
    }
    setError(null);
    run(() => updateOfficialFileNumber(dialog.row.id, correctionNumber.trim()));
  }

  function submitReopen(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (dialog?.kind !== "reopen") return;
    setError(null);
    run(() => reopenApplication(dialog.row.id));
  }

  async function submitAddVisit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (dialog?.kind !== "history") return;
    if (!visitDateInput.trim()) {
      return setError("Tanggal kedatangan wajib diisi.");
    }
    setError(null);
    setLoadingVisits(true);
    const res = await addVisitLog(
      dialog.row.id,
      visitDateInput,
      visitNotesInput,
    );
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

  // List berkas overdue & hari ini untuk peringatan jadwal otomatis
  const { overdueList, todayList } = useMemo(() => {
    const overdue: AdminRow[] = [];
    const today: AdminRow[] = [];
    for (const r of rows) {
      if (r.status === "DIJADWALKAN") {
        const urgency = checkScheduleUrgency(
          r.inspectionDate,
          r.inspectionTime,
        );
        if (urgency === "OVERDUE") overdue.push(r);
        else if (urgency === "TODAY") today.push(r);
      }
    }
    return { overdueList: overdue, todayList: today };
  }, [rows]);

  // Filtered rows dengan kombinasi Status, Kecamatan, Rentang Tanggal, & Search Query
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      // 1. Filter Status Tab
      if (selectedTab === "OVERDUE") {
        if (
          r.status !== "DIJADWALKAN" ||
          checkScheduleUrgency(r.inspectionDate, r.inspectionTime) !== "OVERDUE"
        ) {
          return false;
        }
      } else if (selectedTab === "TODAY") {
        if (
          r.status !== "DIJADWALKAN" ||
          checkScheduleUrgency(r.inspectionDate, r.inspectionTime) !== "TODAY"
        ) {
          return false;
        }
      } else if (selectedTab !== "SEMUA" && r.status !== selectedTab) {
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
        if (
          !matchTicket &&
          !matchName &&
          !matchAddress &&
          !matchFirstVisit &&
          !matchDate
        ) {
          return false;
        }
      }
      return true;
    });
  }, [rows, selectedTab, selectedDistrict, startDate, endDate, searchQuery]);

  // Tab counts
  const countAll = rows.length;
  const countDocs = rows.filter((r) => r.status === "MENUNGGU_DOKUMEN").length;
  const countVerify = rows.filter(
    (r) => r.status === "VERIFIKASI_PETUGAS",
  ).length;
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
      "Nomor Berkas",
    ];

    const csvRows = filteredRows.map((r) => [
      escapeCsv(r.ticketNumber),
      escapeCsv(r.firstVisitDate),
      escapeCsv(r.applicantName),
      escapeCsv(r.address),
      escapeCsv(STATUS_LABEL[r.status]),
      escapeCsv(r.daysInProcess),
      escapeCsv(r.daysInStage),
      escapeCsv(
        r.inspectionDate
          ? `${r.inspectionDate} ${r.inspectionTime ?? ""}`.trim()
          : "-",
      ),
      escapeCsv(r.officerNames.length ? r.officerNames.join(", ") : "-"),
      escapeCsv(r.missingDocuments ?? "-"),
      escapeCsv(r.officialFileNumber ?? "-"),
    ]);

    const csvContent =
      "\uFEFF" +
      [
        headers.map((h) => `"${h}"`).join(","),
        ...csvRows.map((row) => row.join(",")),
      ].join("\r\n");

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
            Total {rows.length} berkas terdaftar · Real-time status &amp;
            pemeriksaan lapangan ATR/BPN
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={openOfficers}
            type="button"
            className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50/70 px-3.5 py-2 text-sm font-semibold text-[#002B49] shadow-xs hover:bg-blue-100 transition"
          >
            <svg
              className="h-4 w-4 text-[#002B49]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            Kelola Petugas
          </button>
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

      {/* Operational Reminder Summary Banners */}
      {(overdueList.length > 0 || todayList.length > 0) && (
        <div className="mb-4 space-y-2.5">
          {overdueList.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-rose-300 bg-rose-50/90 p-3.5 sm:p-4 text-rose-900 shadow-xs">
              <div className="flex items-start sm:items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-600 text-white text-base shadow-xs">
                  ⚠️
                </span>
                <div>
                  <h4 className="text-sm font-bold text-rose-950">
                    Perhatian: {overdueList.length} Jadwal Pemeriksaan Terlewat / Belum Selesai!
                  </h4>
                  <p className="text-xs text-rose-800 font-medium">
                    Terdapat jadwal yang telah melewati batas waktu tetapi status berkas belum ditandai Selesai.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTab("OVERDUE")}
                className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition shadow-xs flex items-center justify-center gap-1.5 ${
                  selectedTab === "OVERDUE"
                    ? "bg-rose-800 text-white ring-2 ring-rose-400"
                    : "bg-rose-600 hover:bg-rose-700 text-white"
                }`}
              >
                <span>Lihat Berkas Terlewat</span>
                <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10px]">
                  {overdueList.length}
                </span>
              </button>
            </div>
          )}

          {todayList.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50/90 p-3.5 sm:p-4 text-amber-950 shadow-xs">
              <div className="flex items-start sm:items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white text-base shadow-xs">
                  ⏰
                </span>
                <div>
                  <h4 className="text-sm font-bold text-amber-950">
                    Agenda Hari Ini: {todayList.length} Jadwal Pemeriksaan Berlangsung Hari Ini
                  </h4>
                  <p className="text-xs text-amber-800 font-medium">
                    Pastikan petugas lapangan telah menerima konfirmasi dan siap menuju lokasi.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTab("TODAY")}
                className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition shadow-xs flex items-center justify-center gap-1.5 ${
                  selectedTab === "TODAY"
                    ? "bg-amber-800 text-white ring-2 ring-amber-400"
                    : "bg-amber-600 hover:bg-amber-700 text-white"
                }`}
              >
                <span>Lihat Jadwal Hari Ini</span>
                <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10px]">
                  {todayList.length}
                </span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Toolbar: Multi-Dimensional Filter (Search, Date Range, District, Status) */}
      <div className="mb-4 space-y-3 rounded-2xl border border-gray-200/90 bg-white/95 backdrop-blur-xs p-3.5 sm:p-4 shadow-xs">
        {/* Baris 1: Search Bar & Info Count */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1 max-w-md">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
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
            Menampilkan{" "}
            <strong className="text-gray-900">{filteredRows.length}</strong>{" "}
            dari <strong className="text-gray-900">{rows.length}</strong> berkas
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
              {districtOptions.map((d) => (
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
                <svg
                  className="h-3.5 w-3.5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
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
                selectedTab === "SEMUA"
                  ? "bg-white/20 text-white"
                  : "bg-gray-200 text-gray-700"
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
                selectedTab === "MENUNGGU_DOKUMEN"
                  ? "bg-white/20 text-white"
                  : "bg-red-100 text-red-800"
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
                selectedTab === "VERIFIKASI_PETUGAS"
                  ? "bg-white/20 text-white"
                  : "bg-amber-100 text-amber-800"
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
                selectedTab === "DIJADWALKAN"
                  ? "bg-white/20 text-white"
                  : "bg-blue-100 text-blue-800"
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
                selectedTab === "SELESAI"
                  ? "bg-white/20 text-white"
                  : "bg-emerald-100 text-emerald-800"
              }`}
            >
              {countDone}
            </span>
          </button>

          {/* Quick Filter: Overdue Alert Chip */}
          {overdueList.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedTab("OVERDUE")}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition border ${
                selectedTab === "OVERDUE"
                  ? "bg-rose-700 text-white border-rose-800 shadow-xs"
                  : "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
              }`}
            >
              <span>⚠️ Terlewat</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                  selectedTab === "OVERDUE"
                    ? "bg-white/20 text-white"
                    : "bg-rose-200 text-rose-800"
                }`}
              >
                {overdueList.length}
              </span>
            </button>
          )}

          {/* Quick Filter: Today Alert Chip */}
          {todayList.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedTab("TODAY")}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition border ${
                selectedTab === "TODAY"
                  ? "bg-amber-600 text-white border-amber-700 shadow-xs"
                  : "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
              }`}
            >
              <span>⏰ Hari Ini</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                  selectedTab === "TODAY"
                    ? "bg-white/20 text-white"
                    : "bg-amber-200 text-amber-900"
                }`}
              >
                {todayList.length}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Main Table: 7 Kolom Bersih, Responsif, & Tombol Aksi Selalu Sejajar Vertikal */}
      <div className="w-full overflow-x-auto rounded-xl border border-gray-200/90 bg-white/95 backdrop-blur-xs shadow-xs">
        <table className="w-full text-left text-sm divide-y divide-gray-200">
          <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wider text-gray-600">
            <tr>
              <th className="px-4 py-3.5">No. Tiket &amp; Tgl Masuk</th>
              <th className="px-4 py-3.5">Pemohon</th>
              <th className="px-4 py-3.5">Lokasi Tanah</th>
              <th className="px-4 py-3.5">Status &amp; Proses</th>
              <th className="px-4 py-3.5">Jadwal Pemeriksaan Tanah</th>
              <th className="px-4 py-3.5">Petugas</th>
              <th className="whitespace-nowrap px-3 py-3 text-left font-semibold w-[230px] min-w-[230px]">
                Aksi
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-gray-900">
            {filteredRows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-12 text-center text-gray-500"
                >
                  {hasActiveFilter
                    ? "Tidak ada berkas yang sesuai dengan filter pencarian."
                    : "Belum ada berkas terdaftar."}
                </td>
              </tr>
            )}
            {filteredRows.map((r) => (
              <tr
                key={r.id}
                className="align-top hover:bg-slate-50/60 transition-colors"
              >
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
                        <>
                          <p className="text-[11px] font-medium text-amber-600">
                            Antrean petugas · {r.daysInStage} hari
                          </p>
                          {r.lastCancelReason && (
                            (() => {
                              if (r.lastCancelCategory === "PEMOHON_ABSEN") {
                                const fullText = `Pemohon tidak di lokasi: ${r.lastCancelReason} - hubungi pemohon untuk jadwal ulang`;
                                return (
                                  <p
                                    title={fullText}
                                    className="mt-1 line-clamp-2 rounded-md border border-rose-300 bg-rose-50 px-1.5 py-0.5 text-[11px] font-medium text-rose-800"
                                  >
                                    {fullText}
                                  </p>
                                );
                              }
                              if (r.lastCancelCategory === "PETUGAS_HALANGAN") {
                                const fullText = `Petugas berhalangan: ${r.lastCancelReason}`;
                                return (
                                  <p
                                    title={fullText}
                                    className="mt-1 line-clamp-2 text-[11px] font-medium text-amber-800"
                                  >
                                    {fullText}
                                  </p>
                                );
                              }
                              const fullText = `Jadwal sebelumnya dibatalkan: ${r.lastCancelReason}`;
                              return (
                                <p
                                  title={fullText}
                                  className="mt-0.5 line-clamp-2 text-[11px] text-amber-700/80"
                                >
                                  {fullText}
                                </p>
                              );
                            })()
                          )}
                        </>
                      )}
                      {r.status === "DIJADWALKAN" && r.rescheduleCount > 0 && (
                        <p className="mt-1 inline-flex items-center rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 border border-blue-200/80">
                          Dijadwal ulang {r.rescheduleCount}x
                        </p>
                      )}
                      {r.status === "SELESAI" && r.officialFileNumber && (
                        <p className="text-[11px] font-medium text-emerald-700">
                          No. Berkas: {r.officialFileNumber}
                        </p>
                      )}
                    </div>
                  </div>
                </td>

                {/* 5. JADWAL PEMERIKSAAN */}
                <td className="px-4 py-3.5 whitespace-nowrap">
                  {r.inspectionDate ? (
                    <div>
                      {r.status === "DIJADWALKAN" ? (
                        (() => {
                          const urgency = checkScheduleUrgency(
                            r.inspectionDate,
                            r.inspectionTime,
                          );
                          if (urgency === "OVERDUE") {
                            return (
                              <div className="flex flex-col items-start gap-1">
                                <span className="bg-rose-100 text-rose-800 border border-rose-300 font-semibold px-2.5 py-1 rounded-lg inline-flex items-center gap-1 text-xs">
                                  <span>⚠️</span>
                                  <span>
                                    Terlewat ({formatShortDate(r.inspectionDate)}
                                    {r.inspectionTime ? ` ${r.inspectionTime} WIB` : ""})
                                  </span>
                                </span>
                                <span className="text-[11px] text-rose-600 font-medium">
                                  Konfirmasi hasil pemeriksaan
                                </span>
                              </div>
                            );
                          }
                          if (urgency === "TODAY") {
                            return (
                              <div className="flex flex-col items-start gap-1">
                                <span className="bg-amber-100 text-amber-900 border border-amber-300 font-bold px-2.5 py-1 rounded-lg inline-flex items-center gap-1 animate-pulse text-xs">
                                  <span>⏰</span>
                                  <span>
                                    HARI INI (
                                    {r.inspectionTime ? `${r.inspectionTime} WIB` : ""}
                                    )
                                  </span>
                                </span>
                                <span className="text-[11px] text-amber-700 font-medium">
                                  Ingatkan petugas lapangan
                                </span>
                              </div>
                            );
                          }
                          return (
                            <div>
                              <div className="font-medium text-gray-900 text-xs">
                                {formatIndoDate(r.inspectionDate)}
                              </div>
                              <div className="text-[11px] text-gray-500">
                                {r.inspectionTime ? `${r.inspectionTime} WIB` : ""}
                              </div>
                            </div>
                          );
                        })()
                      ) : (
                        <div>
                          <div className="font-medium text-gray-900 text-xs">
                            {formatIndoDate(r.inspectionDate)}
                          </div>
                          <div className="text-[11px] text-gray-500">
                            {r.inspectionTime ? `${r.inspectionTime} WIB` : ""}
                          </div>
                        </div>
                      )}
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
                <td className="whitespace-nowrap px-3 py-3 text-left w-[230px] min-w-[230px]">
                  <div className="flex items-center justify-start gap-1.5 w-[220px]">
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
                        <svg
                          className="h-3.5 w-3.5 shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2.5}
                            d="M5 13l4 4L19 7"
                          />
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
                        onClick={() =>
                          setOpenActionMenuId(
                            openActionMenuId === r.id ? null : r.id,
                          )
                        }
                        className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-slate-100 text-gray-600 transition"
                        title="Menu Aksi Lainnya"
                        aria-expanded={openActionMenuId === r.id}
                      >
                        <span className="text-base font-bold leading-none">
                          ⋮
                        </span>
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
                              <svg
                                className="h-3.5 w-3.5 text-gray-500 shrink-0"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                                />
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
                              <svg
                                className="h-3.5 w-3.5 text-gray-500 shrink-0"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                />
                              </svg>
                              <span>Edit Identitas Berkas</span>
                            </button>

                            {(r.status === "MENUNGGU_DOKUMEN" ||
                              r.status === "VERIFIKASI_PETUGAS") && (
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenActionMenuId(null);
                                  openDocs(r);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-amber-700 hover:bg-amber-50 transition"
                              >
                                <svg
                                  className="h-3.5 w-3.5 text-amber-600 shrink-0"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                                  />
                                </svg>
                                <span>Catat / Lengkapi Dokumen</span>
                              </button>
                            )}

                            {r.status === "DIJADWALKAN" && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionMenuId(null);
                                    openSchedule(r, true);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-blue-700 hover:bg-blue-50 transition"
                                >
                                  <svg
                                    className="h-3.5 w-3.5 text-blue-600 shrink-0"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                    />
                                  </svg>
                                  <span>Ubah Jadwal Pemeriksaan</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionMenuId(null);
                                    openCancelSchedule(r);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-rose-700 hover:bg-rose-50 transition"
                                >
                                  <svg
                                    className="h-3.5 w-3.5 text-rose-600 shrink-0"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M6 18L18 6M6 6l12 12"
                                    />
                                  </svg>
                                  <span>Batalkan / Jadwalkan Ulang</span>
                                </button>
                              </>
                            )}

                            {r.status === "SELESAI" && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionMenuId(null);
                                    openCorrection(r);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-blue-700 hover:bg-blue-50 transition"
                                >
                                  <svg
                                    className="h-3.5 w-3.5 text-blue-600 shrink-0"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                    />
                                  </svg>
                                  <span>Koreksi Nomor Berkas</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionMenuId(null);
                                    openReopen(r);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-amber-700 hover:bg-amber-50 transition"
                                >
                                  <svg
                                    className="h-3.5 w-3.5 text-amber-600 shrink-0"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                    />
                                  </svg>
                                  <span>Buka Kembali Berkas</span>
                                </button>
                              </>
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
                              <svg
                                className="h-3.5 w-3.5 text-red-500 shrink-0"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
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

      {/* Datalist Pilihan Kecamatan dari Data yang Ada */}
      <datalist id="district-options">
        {districtOptions.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>

      {/* Modal: Riwayat Kunjungan (Visit Logs) */}
      {dialog?.kind === "history" && (
        <Modal titleId="history-title" maxWidth="max-w-xl">
          <div className="space-y-4">
            <div className="border-b border-gray-200 pb-3">
              <h2
                id="history-title"
                className="text-lg font-bold text-gray-900"
              >
                Riwayat Kedatangan Pemohon
              </h2>
              <p className="mt-0.5 text-xs text-gray-600">
                No. Tiket:{" "}
                <strong className="text-[#002B49]">
                  {dialog.row.ticketNumber}
                </strong>{" "}
                · Pemohon: <strong>{dialog.row.applicantName}</strong>
              </p>
            </div>

            {/* Form Catat Kedatangan Baru */}
            <form
              onSubmit={submitAddVisit}
              className="rounded-xl border border-gray-200 bg-slate-50 p-3 space-y-2"
            >
              <p className="text-xs font-bold uppercase tracking-wider text-gray-700">
                + Catat Kedatangan / Konsultasi Baru
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label
                    htmlFor="visitDate"
                    className="block text-xs font-medium text-gray-600"
                  >
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
                  <label
                    htmlFor="visitNotes"
                    className="block text-xs font-medium text-gray-600"
                  >
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
                <p className="py-4 text-center text-xs text-gray-500">
                  Memuat riwayat...
                </p>
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

            {/* Riwayat Perubahan (Audit Logs) */}
            <div className="border-t border-gray-200 pt-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-700">
                Riwayat Perubahan ({auditLogs.length})
              </p>
              {loadingAuditLogs && auditLogs.length === 0 ? (
                <p className="py-4 text-center text-xs text-gray-500">
                  Memuat riwayat perubahan...
                </p>
              ) : auditLogs.length === 0 ? (
                <p className="py-4 text-center text-xs text-gray-500">
                  Belum ada riwayat perubahan data pada berkas ini.
                </p>
              ) : (
                <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                  {auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="rounded-lg border border-gray-200 bg-slate-50/80 p-2.5 text-xs space-y-1 shadow-xs"
                    >
                      <div className="flex items-center justify-between text-gray-500 text-[11px]">
                        <span>{formatDateTimeWib(log.createdAt)}</span>
                        {log.actor && (
                          <span className="font-medium text-gray-700">
                            oleh {log.actor}
                          </span>
                        )}
                      </div>
                      <div className="font-semibold text-gray-900">
                        {AUDIT_ACTION_LABEL[log.action] ?? log.action}
                      </div>
                      {(log.oldValue || log.newValue) && (
                        <div className="text-gray-600 font-mono text-[11px] break-all">
                          {log.oldValue ?? "-"} → {log.newValue ?? "-"}
                        </div>
                      )}
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
        <Modal titleId="edit-title" maxWidth="max-w-lg">
          <form onSubmit={submitEdit} className="space-y-4">
            <h2 id="edit-title" className="text-lg font-bold text-gray-900">
              Edit Identitas Berkas
            </h2>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              Mengubah nomor tiket atau nama membuat QR pada tanda terima yang sudah dicetak tidak lagi menemukan berkas ini. Cetak ulang tanda terima bila perlu.
            </div>
            <div>
              <label
                htmlFor="edit-tn"
                className="block text-sm font-medium text-gray-700"
              >
                No. Tiket / Registrasi
              </label>
              <input
                id="edit-tn"
                type="text"
                required
                value={ticketNumber}
                onChange={(e) => setTicketNumber(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label
                htmlFor="edit-an"
                className="block text-sm font-medium text-gray-700"
              >
                Nama Pemohon
              </label>
              <input
                id="edit-an"
                type="text"
                required
                value={applicantName}
                onChange={(e) => setApplicantName(e.target.value)}
                className={inputCls}
              />
            </div>

            {/* Input Alamat Bidang Tanah Terstruktur */}
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Lokasi Bidang Tanah
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="edit-dist"
                    className="block text-xs font-medium text-gray-700"
                  >
                    Kecamatan <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="edit-dist"
                    type="text"
                    required
                    list="district-options"
                    placeholder="Contoh: Sidikalang / Sumbul"
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label
                    htmlFor="edit-vill"
                    className="block text-xs font-medium text-gray-700"
                  >
                    Desa / Kelurahan <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="edit-vill"
                    type="text"
                    required
                    placeholder="Contoh: Batang Beruh / Pegagan Julu"
                    value={village}
                    onChange={(e) => setVillage(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="edit-street"
                  className="block text-xs font-medium text-gray-700"
                >
                  Detail Alamat / Jalan / Dusun / No{" "}
                  <span className="text-gray-400 font-normal">(Opsional)</span>
                </label>
                <input
                  id="edit-street"
                  type="text"
                  placeholder="Contoh: Jl. S.M Raja No. 12, Dusun II"
                  value={streetDetail}
                  onChange={(e) => setStreetDetail(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="text-[11px] text-gray-500 italic">
                Format tersimpan:{" "}
                <span className="font-semibold text-gray-700">
                  {`${streetDetail.trim() ? streetDetail.trim() + ", " : ""}Desa/Kel. ${village.trim() || "..."}, Kec. ${district.trim() || "..."}`}
                </span>
              </div>
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
              Berkas akan diarsipkan (soft-delete). Berkas ini tidak akan muncul
              lagi di pencarian publik maupun daftar aktif petugas.
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
              {dialog.edit ? "Ubah Jadwal" : "Atur Jadwal"} -{" "}
              {dialog.row.ticketNumber}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="date"
                  className="block text-sm font-medium text-gray-700"
                >
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
                <label
                  htmlFor="time"
                  className="block text-sm font-medium text-gray-700"
                >
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
              <label
                htmlFor="notes"
                className="block text-sm font-medium text-gray-700"
              >
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
              <legend className="text-sm font-medium text-gray-700">
                Petugas Lapangan
              </legend>
              <div className="mt-1 space-y-2">
                {officerList.length === 0 ? (
                  <p className="text-xs text-gray-500 italic py-1">
                    Belum ada data petugas. Silakan tambahkan melalui menu
                    `Kelola Petugas`.
                  </p>
                ) : (
                  officerList.map((o) => (
                    <label
                      key={o.id}
                      className="flex items-center gap-2 text-sm text-gray-900 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedOfficers.includes(o.id)}
                        onChange={() => toggleOfficer(o.id)}
                        className="h-4 w-4 rounded border-gray-300 text-[#002B49] focus:ring-[#002B49]"
                      />
                      {o.name}{" "}
                      <span className="text-gray-500">({o.position})</span>
                    </label>
                  ))
                )}
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
        <Modal titleId="new-title" maxWidth="max-w-lg">
          <form onSubmit={submitNew} className="space-y-4">
            <h2 id="new-title" className="text-lg font-bold text-gray-900">
              Tambah Berkas Baru
            </h2>
            <div>
              <label
                htmlFor="tn"
                className="block text-sm font-medium text-gray-700"
              >
                No. Tiket / Registrasi
              </label>
              <input
                id="tn"
                type="text"
                required
                placeholder="Contoh: REG-1204/2026"
                value={ticketNumber}
                onChange={(e) => setTicketNumber(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label
                htmlFor="an"
                className="block text-sm font-medium text-gray-700"
              >
                Nama Pemohon
              </label>
              <input
                id="an"
                type="text"
                required
                placeholder="Contoh: Hendra Sihombing"
                value={applicantName}
                onChange={(e) => setApplicantName(e.target.value)}
                className={inputCls}
              />
            </div>

            {/* Input Alamat Bidang Tanah Terstruktur */}
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Lokasi Bidang Tanah
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="new-dist"
                    className="block text-xs font-medium text-gray-700"
                  >
                    Kecamatan <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="new-dist"
                    type="text"
                    required
                    list="district-options"
                    placeholder="Contoh: Sidikalang / Sumbul"
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-vill"
                    className="block text-xs font-medium text-gray-700"
                  >
                    Desa / Kelurahan <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="new-vill"
                    type="text"
                    required
                    placeholder="Contoh: Batang Beruh / Pegagan Julu"
                    value={village}
                    onChange={(e) => setVillage(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="new-street"
                  className="block text-xs font-medium text-gray-700"
                >
                  Detail Alamat / Jalan / Dusun / No{" "}
                  <span className="text-gray-400 font-normal">(Opsional)</span>
                </label>
                <input
                  id="new-street"
                  type="text"
                  placeholder="Contoh: Jl. S.M Raja No. 12, Dusun II"
                  value={streetDetail}
                  onChange={(e) => setStreetDetail(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="text-[11px] text-gray-500 italic">
                Format tersimpan:{" "}
                <span className="font-semibold text-gray-700">
                  {`${streetDetail.trim() ? streetDetail.trim() + ", " : ""}Desa/Kel. ${village.trim() || "..."}, Kec. ${district.trim() || "..."}`}
                </span>
              </div>
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
              <label
                htmlFor="docs"
                className="block text-sm font-medium text-gray-700"
              >
                Dokumen yang kurang (satu per baris)
              </label>
              <textarea
                id="docs"
                rows={5}
                placeholder={
                  "FC KTP batas tanah sebelah utara\nSurat sporadik belum ttd kades"
                }
                value={docs}
                onChange={(e) => setDocs(e.target.value)}
                className={inputCls}
              />
              <p className="mt-1 text-xs text-gray-500">
                Kosongkan jika dokumen sudah lengkap; berkas akan kembali ke
                status verifikasi petugas.
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
              <label
                htmlFor="official"
                className="block text-sm font-medium text-gray-700"
              >
                Nomor Berkas
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
                Nomor berkas dari BPN; pemohon dapat mengeceknya di aplikasi Sentuh Tanahku.
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

      {/* Modal: Batalkan / Jadwalkan Ulang */}
      {dialog?.kind === "cancelSchedule" && (
        <Modal titleId="cancel-schedule-title" maxWidth="max-w-xl">
          <form onSubmit={submitCancelSchedule} className="space-y-4">
            <div className="border-b border-gray-200 pb-3">
              <h2
                id="cancel-schedule-title"
                className="text-lg font-bold text-gray-900"
              >
                Batalkan / Jadwalkan Ulang - {dialog.row.ticketNumber}
              </h2>
              <p className="mt-1 text-xs text-gray-600">
                Pemohon: <strong>{dialog.row.applicantName}</strong> · Jadwal saat ini:{" "}
                <strong>
                  {dialog.row.inspectionDate
                    ? `${formatIndoDate(dialog.row.inspectionDate)} ${dialog.row.inspectionTime ? `${dialog.row.inspectionTime} WIB` : ""}`
                    : "-"}
                </strong>
              </p>
              <div className="mt-2.5 rounded-lg bg-slate-50 border border-slate-200 p-2.5 text-xs text-slate-600">
                Gunakan menu ini bila pemeriksaan batal atau perlu dijadwalkan ulang; riwayatnya tersimpan. Untuk sekadar koreksi, gunakan Ubah Jadwal.
              </div>
            </div>

            {/* 1. Kategori Alasan */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Kategori Alasan <span className="text-red-500">*</span>
              </label>
              <div className="mt-2 space-y-2">
                <label className="flex items-start gap-2.5 rounded-xl border border-gray-200 p-3 hover:bg-gray-50/80 cursor-pointer transition">
                  <input
                    type="radio"
                    name="cancelCategory"
                    value="PEMOHON_ABSEN"
                    checked={cancelCategory === "PEMOHON_ABSEN"}
                    onChange={() => setCancelCategory("PEMOHON_ABSEN")}
                    className="mt-0.5 h-4 w-4 text-[#002B49] focus:ring-[#002B49]"
                  />
                  <div className="text-xs">
                    <p className="font-semibold text-gray-900">
                      Pemohon tidak di tempat saat petugas datang
                    </p>
                    <p className="mt-0.5 text-gray-500">
                      Hubungi pemohon lewat telepon untuk menanyakan waktu yang cocok.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 rounded-xl border border-gray-200 p-3 hover:bg-gray-50/80 cursor-pointer transition">
                  <input
                    type="radio"
                    name="cancelCategory"
                    value="PETUGAS_HALANGAN"
                    checked={cancelCategory === "PETUGAS_HALANGAN"}
                    onChange={() => setCancelCategory("PETUGAS_HALANGAN")}
                    className="mt-0.5 h-4 w-4 text-[#002B49] focus:ring-[#002B49]"
                  />
                  <div className="text-xs">
                    <p className="font-semibold text-gray-900">
                      Petugas berhalangan / kendala cuaca / kendala lapangan
                    </p>
                    <p className="mt-0.5 text-gray-500">
                      Keterangan ini akan terlihat oleh pemohon di halaman cek jadwal.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 rounded-xl border border-gray-200 p-3 hover:bg-gray-50/80 cursor-pointer transition">
                  <input
                    type="radio"
                    name="cancelCategory"
                    value="LAINNYA"
                    checked={cancelCategory === "LAINNYA"}
                    onChange={() => setCancelCategory("LAINNYA")}
                    className="mt-0.5 h-4 w-4 text-[#002B49] focus:ring-[#002B49]"
                  />
                  <div className="text-xs">
                    <p className="font-semibold text-gray-900">
                      Alasan lainnya
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* 2. Keterangan Alasan */}
            <div>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="cancel-reason"
                  className="block text-sm font-medium text-gray-700"
                >
                  Keterangan Alasan <span className="text-red-500">*</span>
                </label>
                <span
                  className={`text-xs ${
                    cancelReason.trim().length > CANCEL_REASON_MAX
                      ? "text-red-600 font-semibold"
                      : "text-gray-400"
                  }`}
                >
                  {cancelReason.trim().length}/{CANCEL_REASON_MAX}
                </span>
              </div>
              <textarea
                id="cancel-reason"
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder={
                  cancelCategory === "PEMOHON_ABSEN"
                    ? "Contoh: Petugas telah tiba di lokasi, namun pemohon tidak berada di tempat dan belum dapat dihubungi."
                    : cancelCategory === "PETUGAS_HALANGAN"
                      ? "Contoh: Petugas berhalangan hadir karena kendala cuaca ekstrem / kendala akses jalan."
                      : "Tuliskan alasan pembatalan / penjadwalan ulang..."
                }
                className={inputCls}
                required
              />
              {cancelCategory === "PETUGAS_HALANGAN" ? (
                <p className="mt-1.5 text-xs text-amber-700 font-medium">
                  ⚠️ Keterangan ini terlihat oleh pemohon. Tulis singkat dan sopan; jangan memuat data pribadi atau sengketa.
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-gray-500">
                  🔒 Keterangan ini hanya terlihat oleh petugas.
                </p>
              )}
            </div>

            {/* 3. Tindak Lanjut */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Tindak Lanjut <span className="text-red-500">*</span>
              </label>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <label
                  className={`flex items-center gap-2.5 rounded-xl border p-3 cursor-pointer transition text-xs ${
                    cancelFollowUp === "CANCEL"
                      ? "border-[#002B49] bg-blue-50/50 font-semibold text-gray-900"
                      : "border-gray-200 hover:bg-gray-50 text-gray-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="cancelFollowUp"
                    value="CANCEL"
                    checked={cancelFollowUp === "CANCEL"}
                    onChange={() => setCancelFollowUp("CANCEL")}
                    className="h-4 w-4 text-[#002B49] focus:ring-[#002B49]"
                  />
                  <span>Kembalikan ke antrean verifikasi</span>
                </label>

                <label
                  className={`flex items-center gap-2.5 rounded-xl border p-3 cursor-pointer transition text-xs ${
                    cancelFollowUp === "RESCHEDULE"
                      ? "border-[#002B49] bg-blue-50/50 font-semibold text-gray-900"
                      : "border-gray-200 hover:bg-gray-50 text-gray-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="cancelFollowUp"
                    value="RESCHEDULE"
                    checked={cancelFollowUp === "RESCHEDULE"}
                    onChange={() => setCancelFollowUp("RESCHEDULE")}
                    className="h-4 w-4 text-[#002B49] focus:ring-[#002B49]"
                  />
                  <span>Tetapkan jadwal baru sekarang</span>
                </label>
              </div>
            </div>

            {/* 4. Form Jadwal Baru (Jika Tetapkan Jadwal Baru Dipilih) */}
            {cancelFollowUp === "RESCHEDULE" && (
              <div className="space-y-4 rounded-xl border border-blue-200 bg-blue-50/30 p-4">
                <p className="text-xs font-bold text-gray-800 uppercase tracking-wide">
                  Penetapan Jadwal Pemeriksaan Baru
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="reschedule-date"
                      className="block text-xs font-semibold text-gray-700"
                    >
                      Tanggal Baru <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="reschedule-date"
                      type="date"
                      min={getTodayWib()}
                      value={rescheduleDate}
                      onChange={(e) => setRescheduleDate(e.target.value)}
                      className={inputCls}
                      required
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="reschedule-time"
                      className="block text-xs font-semibold text-gray-700"
                    >
                      Jam (WIB) <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="reschedule-time"
                      type="time"
                      value={rescheduleTime}
                      onChange={(e) => setRescheduleTime(e.target.value)}
                      className={inputCls}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="reschedule-notes"
                    className="block text-xs font-semibold text-gray-700"
                  >
                    Catatan untuk Pemohon
                  </label>
                  <textarea
                    id="reschedule-notes"
                    rows={2}
                    value={rescheduleNotes}
                    onChange={(e) => setRescheduleNotes(e.target.value)}
                    className={inputCls}
                  />
                </div>

                <fieldset>
                  <legend className="text-xs font-semibold text-gray-700">
                    Petugas Lapangan <span className="text-red-500">*</span>
                  </legend>
                  <div className="mt-1.5 space-y-2 max-h-40 overflow-y-auto pr-1">
                    {officerList.length === 0 ? (
                      <p className="text-xs text-gray-500 italic py-1">
                        Belum ada data petugas aktif. Silakan tambahkan melalui menu Kelola Petugas.
                      </p>
                    ) : (
                      officerList.map((o) => (
                        <label
                          key={o.id}
                          className="flex items-center gap-2 text-xs text-gray-900 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={rescheduleOfficers.includes(o.id)}
                            onChange={() => toggleRescheduleOfficer(o.id)}
                            className="h-4 w-4 rounded border-gray-300 text-[#002B49] focus:ring-[#002B49]"
                          />
                          <span>
                            {o.name}{" "}
                            <span className="text-gray-500">({o.position})</span>
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </fieldset>
              </div>
            )}

            <FormFooter
              error={error}
              pending={pending}
              disabled={
                pending ||
                !cancelCategory ||
                cancelReason.trim().length < CANCEL_REASON_MIN ||
                cancelReason.trim().length > CANCEL_REASON_MAX ||
                (cancelFollowUp === "RESCHEDULE" &&
                  (!rescheduleDate ||
                    !rescheduleTime ||
                    rescheduleOfficers.length === 0 ||
                    rescheduleDate < getTodayWib() ||
                    (dialog.row.inspectionDate === rescheduleDate &&
                      dialog.row.inspectionTime === rescheduleTime)))
              }
              submitLabel={
                cancelFollowUp === "RESCHEDULE"
                  ? "Jadwalkan Ulang"
                  : "Batalkan Jadwal"
              }
              onCancel={close}
            />
          </form>
        </Modal>
      )}

      {/* Modal: Koreksi Nomor Berkas */}
      {dialog?.kind === "correction" && (
        <Modal titleId="correction-title">
          <form onSubmit={submitCorrection} className="space-y-4">
            <div className="border-b border-gray-200 pb-3">
              <h2
                id="correction-title"
                className="text-lg font-bold text-gray-900"
              >
                Koreksi Nomor Berkas - {dialog.row.ticketNumber}
              </h2>
              <p className="mt-1 text-xs text-gray-600">
                Perbarui Nomor Berkas BPN Sentuh Tanahku tanpa mengubah status atau tanggal penyelesaian berkas.
              </p>
            </div>
            <div>
              <label
                htmlFor="correction-official"
                className="block text-sm font-medium text-gray-700"
              >
                Nomor Berkas Baru <span className="text-red-500">*</span>
              </label>
              <input
                id="correction-official"
                type="text"
                maxLength={50}
                placeholder="Contoh: 1201/2026"
                value={correctionNumber}
                onChange={(e) => setCorrectionNumber(e.target.value)}
                className={inputCls}
                required
              />
              <p className="mt-1 text-xs text-gray-500">
                Maksimal 50 karakter. Nomor berkas dari BPN; pemohon dapat mengeceknya di aplikasi Sentuh Tanahku.
              </p>
            </div>
            <FormFooter
              error={error}
              pending={pending}
              disabled={
                pending ||
                !correctionNumber.trim() ||
                correctionNumber.trim().length > 50
              }
              submitLabel="Simpan Perubahan"
              onCancel={close}
            />
          </form>
        </Modal>
      )}

      {/* Modal: Buka Kembali Berkas */}
      {dialog?.kind === "reopen" && (
        <Modal titleId="reopen-title">
          <form onSubmit={submitReopen} className="space-y-4">
            <div className="border-b border-gray-200 pb-3">
              <h2
                id="reopen-title"
                className="text-lg font-bold text-gray-900"
              >
                Buka Kembali Berkas - {dialog.row.ticketNumber}
              </h2>
              <p className="mt-1 text-xs text-gray-600">
                Pemohon: <strong>{dialog.row.applicantName}</strong>
              </p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 space-y-1.5">
              <p className="font-semibold text-sm text-amber-950">
                Konfirmasi Pembukaan Kembali Berkas
              </p>
              <p>
                Tindakan ini akan mengembalikan berkas ke proses aktif:
              </p>
              <ul className="list-disc pl-4 space-y-1 text-amber-900">
                <li>
                  Berkas akan kembali ke status <strong>Dijadwalkan</strong> jika jadwal dan seluruh petugasnya masih aktif.
                </li>
                <li>
                  Bila jadwal lama tidak dapat dipulihkan (petugas nonaktif atau jadwal tidak ada), berkas kembali ke antrean <strong>Verifikasi Petugas</strong> dan perlu dijadwalkan ulang.
                </li>
                <li>
                  Nomor Berkas sebelumnya akan dikosongkan.
                </li>
              </ul>
            </div>
            <FormFooter
              error={error}
              pending={pending}
              submitLabel="Ya, Buka Kembali Berkas"
              onCancel={close}
            />
          </form>
        </Modal>
      )}

      {/* Modal: Kelola Petugas Lapangan */}
      {dialog?.kind === "officers" && (
        <Modal titleId="officers-title" maxWidth="max-w-xl">
          <div className="space-y-4">
            <div className="border-b border-gray-200 pb-3">
              <div className="flex items-center justify-between">
                <h2
                  id="officers-title"
                  className="text-lg font-bold text-gray-900"
                >
                  Kelola Tim Petugas Lapangan
                </h2>
                <button
                  type="button"
                  onClick={close}
                  className="rounded-lg p-1 text-gray-400 hover:text-gray-600 transition"
                  aria-label="Tutup"
                >
                  ✕
                </button>
              </div>
              <p className="mt-0.5 text-xs text-gray-600">
                Daftar petugas ukur &amp; verifikasi lapangan ATR/BPN yang dapat
                ditugaskan pada berkas.
              </p>
            </div>

            {officerError && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700"
              >
                {officerError}
              </div>
            )}

            {/* Form Tambah Petugas Baru */}
            <form
              onSubmit={handleAddOfficer}
              className="rounded-xl border border-gray-200 bg-slate-50 p-3.5 space-y-2.5"
            >
              <p className="text-xs font-bold uppercase tracking-wider text-gray-700">
                + Tambah Petugas Baru
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label
                    htmlFor="newOfficerName"
                    className="block text-xs font-medium text-gray-600"
                  >
                    Nama Petugas &amp; Gelar
                  </label>
                  <input
                    id="newOfficerName"
                    type="text"
                    required
                    placeholder="Contoh: Budi Santoso, S.T."
                    value={officerNameInput}
                    onChange={(e) => setOfficerNameInput(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900 shadow-xs focus:border-[#002B49] focus:ring-2 focus:ring-[#002B49]/20 outline-none transition"
                  />
                </div>
                <div>
                  <label
                    htmlFor="newOfficerPosition"
                    className="block text-xs font-medium text-gray-600"
                  >
                    Jabatan / Seksi
                  </label>
                  <input
                    id="newOfficerPosition"
                    type="text"
                    required
                    placeholder="Contoh: Petugas Ukur Seksi Survei & Pemetaan"
                    value={officerPositionInput}
                    onChange={(e) => setOfficerPositionInput(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900 shadow-xs focus:border-[#002B49] focus:ring-2 focus:ring-[#002B49]/20 outline-none transition"
                  />
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={officerPending}
                  className="rounded-lg bg-[#002B49] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#003d66] disabled:opacity-60 transition"
                >
                  {officerPending ? "Menyimpan..." : "+ Tambah Petugas"}
                </button>
              </div>
            </form>

            {/* Daftar Petugas */}
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-700">
                Daftar Petugas Aktif ({officerList.length})
              </p>
              {officerList.length === 0 ? (
                <p className="py-4 text-center text-xs text-gray-500">
                  Belum ada data petugas.
                </p>
              ) : (
                <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                  {officerList.map((o) => (
                    <div
                      key={o.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 text-xs shadow-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-gray-900">{o.name}</div>
                        <div className="text-[11px] text-gray-500">
                          {o.position}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={officerPending}
                        onClick={() => handleDeleteOfficer(o.id)}
                        title={`Hapus ${o.name}`}
                        className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-600 hover:bg-red-100 disabled:opacity-50 transition"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Petugas Nonaktif (Arsip Riwayat) */}
            {inactiveOfficerList.length > 0 && (
              <div className="mt-4 border-t border-gray-200 pt-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">
                  Petugas Nonaktif (arsip riwayat) ({inactiveOfficerList.length})
                </p>
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                  {inactiveOfficerList.map((o) => (
                    <div
                      key={o.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-gray-200 bg-gray-50/80 p-3 text-xs"
                    >
                      <div className="min-w-0 flex-1 opacity-75">
                        <div className="font-semibold text-gray-800">{o.name}</div>
                        <div className="text-[11px] text-gray-500">{o.position}</div>
                      </div>
                      <button
                        type="button"
                        disabled={officerPending}
                        onClick={() => handleReactivateOfficer(o.id)}
                        className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 transition shrink-0"
                      >
                        {officerPending ? "Memproses..." : "Aktifkan Kembali"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
  disabled,
}: {
  error: string | null;
  pending: boolean;
  submitLabel: string;
  onCancel: () => void;
  disabled?: boolean;
}) {
  const isSubmitDisabled = disabled !== undefined ? disabled : pending;
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
          disabled={isSubmitDisabled}
          className="rounded-xl bg-[#002B49] px-4 py-2 text-sm font-semibold text-white hover:bg-[#003d66] disabled:opacity-60 transition shadow-xs"
        >
          {pending ? "Menyimpan..." : submitLabel}
        </button>
      </div>
    </>
  );
}
