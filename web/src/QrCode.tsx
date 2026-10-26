import { useEffect, useState } from 'react';

// A QR code of a link, drawn in the browser (the link never goes to a QR service). The library loads with it.
export function QrCode({ text, label }: { text: string; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void import('qrcode').then((q) => q.toDataURL(text, { margin: 1, width: 360, errorCorrectionLevel: 'M' }))
      .then((url) => { if (live) setSrc(url); }, () => {});
    return () => { live = false; };
  }, [text]);
  return src ? <img className="qr-code" src={src} alt={label} width={180} height={180} /> : null;
}
