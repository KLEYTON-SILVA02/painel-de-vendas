import { jsPDF } from 'jspdf';
import { renderConquistaCalendar, type ConquistaCalendarData } from './conquistaCalendarImage';

// The canvas from renderConquistaCalendar already contains everything the
// PDF spec asks for (collaborator photo, nome, matrícula, mês, total de
// estrelas, percentual de atingimento, and the calendar itself) — so both
// export formats just place that same rendered canvas, no separate layout.

export async function generateConquistaCalendarJpgBlob(data: ConquistaCalendarData): Promise<Blob | null> {
  const canvas = await renderConquistaCalendar(data);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.92));
}

// Print (not screen/WhatsApp) output: A4 portrait — 210 x 297mm — and the
// 'print' theme (white background, dark-on-light text, color only on the
// day cells that have an achievement) so a black-and-white office printer
// doesn't have to lay down a near-solid dark block for every page.
export async function generateConquistaCalendarPdfBlob(data: ConquistaCalendarData): Promise<Blob> {
  const canvas = await renderConquistaCalendar(data, 'print');
  const imgData = canvas.toDataURL('image/jpeg', 0.92);

  const pageW = 210; // A4 portrait (retrato), mm
  const pageH = 297;
  const margin = 10;
  const availW = pageW - margin * 2;
  const availH = pageH - margin * 2;
  const scale = Math.min(availW / canvas.width, availH / canvas.height);
  const w = canvas.width * scale;
  const h = canvas.height * scale;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, pageH, 'F');
  doc.addImage(imgData, 'JPEG', (pageW - w) / 2, (pageH - h) / 2, w, h);
  return doc.output('blob');
}
