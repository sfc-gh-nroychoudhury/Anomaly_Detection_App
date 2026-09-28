// lib/exportPdf.ts -- snapshots a DOM node into a downloadable PDF using
// html2canvas + jsPDF, both client-side only (no server round-trip).
'use client';

export async function exportNodeToPdf(node: HTMLElement, filename: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const canvas = await html2canvas(node, {
    scale: 2,
    backgroundColor: '#0f172a',
    useCORS: true,
    logging: false,
  });

  const imgData = canvas.toDataURL('image/png');
  const margin = 40;
  const headerHeight = 80;
  const pageW = canvas.width + margin * 2;
  const pageH = canvas.height + margin * 2 + headerHeight;

  const pdf = new jsPDF({
    orientation: pageW > pageH ? 'landscape' : 'portrait',
    unit: 'px',
    format: [pageW, pageH],
  });

  // Header
  pdf.setFillColor(15, 23, 42); // sf-midnight
  pdf.rect(0, 0, pageW, pageH, 'F');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.setTextColor(226, 232, 240); // sf-ink light
  const title = filename.replace(/-/g, ' ').replace(/\.pdf$/i, '');
  pdf.text(title, margin, margin + 24);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(148, 163, 184); // sf-slate
  pdf.text(`ML Behavioral Anomaly Detection  |  Generated ${new Date().toLocaleString()}`, margin, margin + 44);

  // Divider line
  pdf.setDrawColor(51, 65, 85); // sf-line
  pdf.setLineWidth(1);
  pdf.line(margin, margin + 56, pageW - margin, margin + 56);

  // Content
  pdf.addImage(imgData, 'PNG', margin, margin + headerHeight, canvas.width, canvas.height);
  pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}
