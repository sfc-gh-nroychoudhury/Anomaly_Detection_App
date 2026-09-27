'use client';

import { useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { exportNodeToPdf } from '@/lib/exportPdf';

export default function ExportPdfButton({ targetRef, filename }: { targetRef: React.RefObject<HTMLElement>; filename: string }) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (!targetRef.current) return;
    setBusy(true);
    try {
      await exportNodeToPdf(targetRef.current, filename);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button onClick={handleClick} disabled={busy} className="sf-btn-secondary text-xs">
      {busy ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}
      Export PDF
    </button>
  );
}
