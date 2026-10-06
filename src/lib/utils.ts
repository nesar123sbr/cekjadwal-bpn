/**
 * Normalisasi nomor berkas: lowercase, buang spasi, strip (-) dan garis miring (/ \).
 */
export function normalizeFileNumber(input: string): string {
  return input.toLowerCase().replace(/[\s\-\u2013\u2014/\\]+/g, "");
}
