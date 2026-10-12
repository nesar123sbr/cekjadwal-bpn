/**
 * Normalisasi nomor tiket/registrasi: lowercase, buang spasi, strip (-) dan garis miring (/ \).
 * "REG-1201/2026" -> "reg12012026"
 */
export function normalizeTicketNumber(input: string): string {
  return input.toLowerCase().replace(/[\s\-\u2013\u2014/\\]+/g, "");
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
