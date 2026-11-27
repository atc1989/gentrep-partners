"use client";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { forwardRef, useImperativeHandle, useRef } from "react";

// One QR drawing for the public invite page and the admin side panel. Always black on white with a quiet zone, in
// every theme: a coloured or inverted QR scans badly. It is drawn in the browser (SVG on screen, a hidden canvas
// for the PNG), so the CSP needs nothing new. No logo in the middle: a cross-origin image would taint the canvas
// and break the download.

export type QrHandle = { download: () => void };

type Props = {
  value: string;
  /** Read by screen readers instead of the pattern, e.g. "QR code that opens the invite link". */
  label: string;
  /** PNG file name for download(). */
  filename: string;
  /** Size on screen in CSS pixels. The PNG is always 1024. */
  size?: number;
};

export const QrCode = forwardRef<QrHandle, Props>(function QrCode({ value, label, filename, size = 200 }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useImperativeHandle(ref, () => ({
    download() {
      const c = canvas.current;
      if (!c) return;
      const a = document.createElement("a");
      a.href = c.toDataURL("image/png");
      a.download = filename;
      a.click();
    },
  }));
  return (
    <>
      <QRCodeSVG value={value} size={size} level="M" marginSize={2} bgColor="#ffffff" fgColor="#000000" title={label} style={{ display: "block", maxWidth: "100%", height: "auto" }} />
      <QRCodeCanvas ref={canvas} value={value} size={1024} level="M" marginSize={4} bgColor="#ffffff" fgColor="#000000" style={{ display: "none" }} aria-hidden />
    </>
  );
});
