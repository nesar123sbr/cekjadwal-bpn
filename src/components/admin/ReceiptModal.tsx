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

/** Link publik yang dipindai warga; form pencarian terisi & berjalan otomatis. */
export function buildTrackingUrl(receipt: ReceiptData): string {
  const params = new URLSearchParams({
    ticket: receipt.ticketNumber,
    name: receipt.applicantName,
  });
  return `${window.location.origin}/?${params.toString()}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-base font-medium text-gray-900">{children}</dd>
    </div>
  );
}

export default function ReceiptModal({
  receipt,
  onClose,
}: {
  receipt: ReceiptData;
  onClose: () => void;
}) {
  const url = buildTrackingUrl(receipt);

  // Dirender lewat portal ke <body> agar CSS cetak bisa menyembunyikan seluruh halaman lain.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-title"
      className="receipt-portal fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/40 sm:items-center sm:p-4"
    >
      <div className="w-full max-w-lg rounded-t-2xl bg-white p-5 sm:rounded-2xl">
        <article id="receipt-sheet" className="space-y-4 text-gray-900">
          <header className="border-b-2 border-[#D4AF37] pb-3 text-center">
            <div className="mb-2 flex justify-center">
              <Image
                src="/logo-bpn.svg"
                alt="Logo Kementerian ATR/BPN"
                width={48}
                height={48}
                priority
                className="h-12 w-12 object-contain"
              />
            </div>
            <p className="text-[11px] font-semibold uppercase leading-tight tracking-wider text-[#002B49]">
              Kementerian Agraria dan Tata Ruang /
              <br />
              Badan Pertanahan Nasional
            </p>
            <p className="mt-1 text-sm font-bold uppercase text-[#002B49]">
              Kantor Pertanahan
            </p>
            <h2 id="receipt-title" className="mt-2 text-lg font-bold">
              Lembar Tanda Terima Registrasi
            </h2>
          </header>

          <dl className="space-y-3">
            <Field label="Nomor Tiket">
              <span className="text-xl font-bold">{receipt.ticketNumber}</span>
            </Field>
            <Field label="Tanggal Terima">{formatReceived(receipt.receivedAt)}</Field>
            <Field label="Nama Pemohon">{receipt.applicantName}</Field>
            <Field label="Alamat Bidang Tanah">{receipt.objectAddress}</Field>
          </dl>

          <div className="flex flex-col items-center gap-2 rounded-xl border border-gray-300 p-4">
            <QRCodeSVG value={url} size={160} level="M" marginSize={1} />
            <p className="text-center text-[11px] text-gray-500 break-all">{url}</p>
          </div>

          <p className="rounded-lg bg-slate-100 p-3 text-sm">
            Simpan lembar ini dan scan QR Code di atas secara berkala untuk memantau
            kelengkapan dokumen dan jadwal pemeriksaan lapangan.
          </p>
        </article>

        <div className="no-print mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700"
          >
            Tutup
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg bg-[#002B49] px-4 py-2 text-sm font-semibold text-white hover:bg-[#003d66]"
          >
            Cetak / Print
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
