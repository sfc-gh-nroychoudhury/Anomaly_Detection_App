// lib/exportPdf.ts -- snapshots a DOM node into a downloadable PDF using
// html2canvas + jsPDF, both client-side only (no server round-trip).
'use client';

export async function exportNodeToPdf(node: HTMLElement, filename: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const canvas = await html2canvas(node, { scale: 2, backgroundColor: null });
  const imgData = canvas.toDataURL('image/png');

  const pdf = new jsPDF({
    orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [canvas.width, canvas.height],
  });
  pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
  pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}
