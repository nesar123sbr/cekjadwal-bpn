/**
 * Sensor nama: kata pertama tampil utuh, kata berikutnya hanya huruf awal + "****".
 * "Ahmad Syahputra" -> "Ahmad S****"
 */
export function maskName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].charAt(0) + "****";
  return [
    parts[0],
    ...parts.slice(1).map((p) => p.charAt(0).toUpperCase() + "****"),
  ].join(" ");
}

/**
 * Sensor alamat: sembunyikan nama/nomor jalan, sisakan kelurahan/kecamatan.
 * Contoh: "Jl. Merdeka No. 12, Kel. Sukajadi, Kec. Coblong" -> "**** , Kel. Sukajadi, Kec. Coblong"
 */
export function maskAddress(address: string): string {
  const segments = address
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) return "";

  const areaRe =
    /^(kel(urahan)?|kec(amatan)?|desa|kota|kab(upaten)?|kabupaten|provinsi|prov)\b\.?/i;
  const streetRe =
    /^(jl|jln|jalan|gg|gang|blok|no|nomor|rt|rw|perum|komplek|kompleks)\b\.?/i;

  const area = segments.filter((s) => areaRe.test(s));
  if (area.length > 0) return ["****", ...area].join(", ");

  // Tanpa penanda eksplisit: sensor segmen pertama (jalan/nomor), sisanya tampil.
  const rest = segments.filter((s, i) => i > 0 && !streetRe.test(s));
  return ["****", ...rest].join(", ");
}
