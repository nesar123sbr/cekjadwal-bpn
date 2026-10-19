"use client";

import Image from "next/image";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import type { ReceiptData } from "@/actions/application";

function formatReceived(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return (
    d.toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }) + " WIB"
  );
}

/** Alamat situs utama yang dipindai warga; warga mengisi Nomor Tiket & Nama secara manual. */
export function buildTrackingUrl(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <tr className="align-top">
      <td className="w-48 py-1.5 pr-2">{label}</td>
      <td className="w-4 py-1.5 text-center">:</td>
      <td className="py-1.5">{children}</td>
    </tr>
  );
}

export default function ReceiptModal({
  receipt,
  onClose,
}: {
  receipt: ReceiptData;
  onClose: () => void;
}) {
  const url = buildTrackingUrl();

  // Dirender lewat portal ke <body> agar CSS cetak bisa menyembunyikan seluruh halaman lain.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-title"
      className="receipt-portal fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/40 sm:items-center sm:p-4"
    >
      <div className="w-full max-w-2xl rounded-t-2xl bg-white p-5 sm:rounded-2xl sm:p-6">
        <article
          id="receipt-sheet"
          className="text-sm text-black print:text-[11pt]"
          style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
        >
          {/* KOP SURAT RESMI BAGIAN TU KANTOR PERTANAHAN KABUPATEN DAIRI */}
          <header className="flex items-center gap-3 pb-2.5 print:gap-[4mm]">
            <Image
              src="/logo-bpn.svg"
              alt="Logo ATR/BPN"
              width={112}
              height={112}
              preload
              className="h-20 w-20 shrink-0 object-contain print:h-[27mm] print:w-[27mm]"
            />
            <div
              className="min-w-0 flex-1 text-center"
              style={{
                fontFamily:
                  "'Times New Roman', Times, 'Liberation Serif', serif",
              }}
            >
              <p className="text-sm font-bold uppercase leading-tight print:text-[14pt]">
                KEMENTERIAN AGRARIA DAN TATA RUANG/
              </p>
              <p className="text-sm font-bold uppercase leading-tight print:text-[14pt]">
                BADAN PERTANAHAN NASIONAL
              </p>
              <p className="mt-0.5 text-xs font-normal uppercase leading-tight print:text-[12pt]">
                KANTOR PERTANAHAN KABUPATEN DAIRI
              </p>
              <p className="text-xs font-normal uppercase leading-tight print:text-[12pt]">
                PROVINSI SUMATERA UTARA
              </p>
              <p
                className="mt-1 text-[10px] font-normal leading-tight print:text-[8.5pt] print:whitespace-nowrap"
                style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
              >
                Jalan Sisingamangaraja No. 134 Sidikalang 22211 Telp. (0627)
                2521276 <em>email</em> : kab-dairi@atrbpn.go.id
              </p>
            </div>
          </header>
          <div className="border-t-[2.5px] border-black" />

          {/* JUDUL */}
          <div className="mt-5 text-center">
            <h2
              id="receipt-title"
              className="inline-block border-b-2 border-black pb-0.5 text-base font-extrabold uppercase tracking-wide print:text-[12.5pt]"
            >
              Tanda Terima Registrasi Pra-Berkas
            </h2>
          </div>

          {/* KALIMAT PENGANTAR */}
          <p className="mt-4 leading-relaxed">
            Telah diterima berkas permohonan pada loket pelayanan Kantor
            Pertanahan Kabupaten Dairi dengan rincian sebagai berikut:
          </p>

          {/* RINCIAN (TITIK DUA SEJAJAR) */}
          <table className="mt-3 w-full border-collapse">
            <tbody>
              <Row label="Nomor Tiket / Registrasi">
                <span className="text-lg font-extrabold tracking-wide print:text-[14pt]">
                  {receipt.ticketNumber}
                </span>
              </Row>
              <Row label="Tanggal Penerimaan">
                {formatReceived(receipt.receivedAt)}
              </Row>
              <Row label="Nama Pemohon">
                <span className="font-bold">{receipt.applicantName}</span>
              </Row>
              <Row label="Letak Bidang Tanah">{receipt.objectAddress}</Row>
            </tbody>
          </table>

          {/* QR CODE + PETUNJUK */}
          <div className="mt-5 flex flex-col items-center gap-4 border-2 border-black p-4 sm:flex-row print:flex-row">
            <div className="flex shrink-0 flex-col items-center">
              <div className="border border-black bg-white p-1">
                <QRCodeSVG
                  value={url}
                  size={176}
                  level="H"
                  marginSize={4}
                  bgColor="#FFFFFF"
                  fgColor="#000000"
                />
              </div>
              <p className="mt-1 whitespace-nowrap text-center text-[10px] font-bold">
                {url}
              </p>
            </div>

            <div className="flex-1 leading-relaxed">
              <p className="border-b border-black pb-1 font-bold uppercase">
                Petunjuk Pemantauan Berkas Mandiri
              </p>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5">
                <li>
                  Pindai kode QR di samping dengan kamera HP, atau buka situs{" "}
                  <strong>{url}</strong> pada peramban (browser).
                </li>
                <li>
                  Masukkan <strong>Nomor Tiket</strong> dan{" "}
                  <strong>Nama Pemohon</strong> persis seperti yang tertera pada
                  lembar ini.
                </li>
                <li>
                  Simpan lembar ini sebagai bukti registrasi selama proses
                  verifikasi dan penjadwalan pemeriksaan lapangan.
                </li>
              </ol>
            </div>
          </div>
        </article>

        <div className="no-print mt-5 flex justify-end gap-2.5 border-t border-gray-200 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Tutup
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-xl bg-bpn-navy px-4 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-bpn-navy-light"
          >
            Cetak / Print
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
