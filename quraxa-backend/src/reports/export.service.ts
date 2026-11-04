import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

export interface ReportColumn {
    key: string;
    label: string;
}

// Shared CSV/Excel/PDF builders — every report renders through the exact
// same {columns, rows} shape it uses for the on-screen table, so what you
// see is what you export.
@Injectable()
export class ExportService {
    toCsv(columns: ReportColumn[], rows: Record<string, any>[]): string {
        const escape = (v: any) => {
            const s = v === null || v === undefined ? '' : String(v);
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const header = columns.map((c) => escape(c.label)).join(',');
        const lines = rows.map((r) => columns.map((c) => escape(r[c.key])).join(','));
        return [header, ...lines].join('\r\n');
    }

    async toExcel(title: string, columns: ReportColumn[], rows: Record<string, any>[]): Promise<Buffer> {
        const wb = new ExcelJS.Workbook();
        wb.creator = 'QuraXa';
        wb.created = new Date();
        const sheet = wb.addWorksheet((title || 'Report').slice(0, 31));

        sheet.columns = columns.map((c) => ({
            header: c.label,
            key: c.key,
            width: Math.max(12, c.label.length + 4),
        }));
        sheet.getRow(1).font = { bold: true };
        sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        sheet.getRow(1).eachCell((cell) => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; });
        rows.forEach((r) => sheet.addRow(r));

        const buf = await wb.xlsx.writeBuffer();
        return Buffer.from(buf);
    }

    toPdf(title: string, columns: ReportColumn[], rows: Record<string, any>[], subtitle?: string): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const landscape = columns.length > 6;
            const doc = new PDFDocument({ margin: 36, size: 'A4', layout: landscape ? 'landscape' : 'portrait' });
            const chunks: Buffer[] = [];
            doc.on('data', (c) => chunks.push(c));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            doc.fontSize(16).fillColor('#0f172a').text(title);
            if (subtitle) {
                doc.moveDown(0.15);
                doc.fontSize(9).fillColor('#64748b').text(subtitle);
            }
            doc.moveDown(0.6);

            const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
            const colWidth = pageWidth / columns.length;
            const rowHeight = 20;
            const left = doc.page.margins.left;

            const drawHeaderRow = () => {
                const y = doc.y;
                doc.rect(left, y, pageWidth, rowHeight).fill('#1e293b');
                doc.fillColor('#ffffff').fontSize(8);
                columns.forEach((c, i) => {
                    doc.text(c.label, left + i * colWidth + 4, y + 6, { width: colWidth - 8, ellipsis: true });
                });
                doc.y = y + rowHeight;
                doc.fillColor('#000000');
            };

            drawHeaderRow();

            rows.forEach((r, idx) => {
                if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
                    doc.addPage();
                    drawHeaderRow();
                }
                const y = doc.y;
                if (idx % 2 === 1) {
                    doc.rect(left, y, pageWidth, rowHeight).fill('#f1f5f9');
                }
                doc.fillColor('#0f172a').fontSize(8);
                columns.forEach((c, i) => {
                    const val = r[c.key];
                    doc.text(val === null || val === undefined ? '-' : String(val), left + i * colWidth + 4, y + 6, {
                        width: colWidth - 8, ellipsis: true,
                    });
                });
                doc.y = y + rowHeight;
            });

            if (rows.length === 0) {
                doc.moveDown(1);
                doc.fontSize(10).fillColor('#94a3b8').text('No data for the selected filters.');
            }

            doc.end();
        });
    }
}
