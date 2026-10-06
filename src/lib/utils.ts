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
