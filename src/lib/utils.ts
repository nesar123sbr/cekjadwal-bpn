/**
 * Normalisasi nomor tiket/registrasi: lowercase, buang spasi, strip (-) dan garis miring (/ \).
 * "REG-1201/2026" -> "reg12012026"
 */
export function normalizeTicketNumber(input: string): string {
  return input.toLowerCase().replace(/[\s\-\u2013\u2014/\\]+/g, "");
}

/**
 * Normalisasi nama pemohon: lowercase, hapus tanda baca/simbol, satukan spasi ganda/beruntun menjadi spasi tunggal, lalu trim.
 * Contoh: "Dr. H. Ahmad Fauzi, S.H." -> "dr h ahmad fauzi sh"
 */
export function normalizeName(input: string): string {
  return (input ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

const TITLE_SET = new Set([
  "dr",
  "drg",
  "drs",
  "dra",
  "ir",
  "prof",
  "h",
  "hj",
  "kh",
  "sh",
  "mh",
  "mkn",
  "se",
  "mm",
  "ak",
  "st",
  "mt",
  "ssi",
  "msc",
  "phd",
  "skom",
  "mkom",
  "spd",
  "mpd",
  "sip",
  "msi",
  "ssos",
  "sag",
  "skm",
  "mkes",
  "skep",
  "ners",
  "amd",
]);

/**
 * Normalisasi nama pemohon dengan membuang gelar akademik / keagamaan umum.
 * Jika hasil penghapusan gelar kosong, mengembalikan hasil normalizeName awal.
 */
export function normalizeNameForMatch(input: string): string {
  const normalized = normalizeName(input);
  if (!normalized) return "";

  const words = normalized.split(" ").filter(Boolean);
  const filteredWords = words.filter((w) => !TITLE_SET.has(w));

  const result = filteredWords.join(" ").trim();
  return result || normalized;
}

/** Hitung selisih hari penuh antara dua waktu ISO (minimal 0). */
export function daysBetween(fromIso: string, to: Date = new Date()): number {
  const from = new Date(fromIso).getTime();
  if (Number.isNaN(from)) return 0;
  return Math.max(0, Math.floor((to.getTime() - from) / 86_400_000));
}

/**
 * Format jam dalam standar bahasa Indonesia dengan keterangan waktu.
 * Contoh: "09:00" -> "09:00 WIB (9 Pagi)", "15:00" -> "15:00 WIB (3 Sore)", "14:30" -> "14:30 WIB (2.30 Siang)".
 */
export function formatIndoTime(timeStr: string): string {
  if (!timeStr) return "-";
  const match = timeStr.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return `${timeStr} WIB`;

  const hour = parseInt(match[1], 10);
  const minute = match[2];

  let period = "Pagi";
  if (hour >= 11 && hour <= 14) {
    period = "Siang";
  } else if (hour >= 15 && hour <= 17) {
    period = "Sore";
  } else if (hour >= 18 || hour < 0) {
    period = "Malam";
  } else {
    period = "Pagi";
  }

  const hourNon24 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  const minuteSuffix = minute !== "00" ? `.${minute}` : "";

  const formattedHhMm = `${String(hour).padStart(2, "0")}:${minute}`;
  return `${formattedHhMm} WIB (${hourNon24}${minuteSuffix} ${period})`;
}

/** Mengembalikan tanggal hari ini dalam format YYYY-MM-DD terkunci ke Asia/Jakarta (WIB). */
export function getTodayWib(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Mengembalikan ISO string dengan offset resmi +07:00 terkunci ke Asia/Jakarta (WIB). */
export function getNowWibIso(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((p) => p.type === type)?.value || "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}+07:00`;
}
