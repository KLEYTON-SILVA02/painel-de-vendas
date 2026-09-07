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

export async function generateConquistaCalendarPdfBlob(data: ConquistaCalendarData): Promise<Blob> {
  const canvas = await renderConquistaCalendar(data);
  const imgData = canvas.toDataURL('image/jpeg', 0.92);

  const pageW = 297; // A4 landscape, mm
  const pageH = 210;
  const margin = 10;
  const availW = pageW - margin * 2;
  const availH = pageH - margin * 2;
  const scale = Math.min(availW / canvas.width, availH / canvas.height);
  const w = canvas.width * scale;
  const h = canvas.height * scale;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.addImage(imgData, 'JPEG', (pageW - w) / 2, (pageH - h) / 2, w, h);
  return doc.output('blob');
}
