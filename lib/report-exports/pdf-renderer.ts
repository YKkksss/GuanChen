import { existsSync } from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import type { ReportExportDocument, ReportExportSection } from './types';

export const REPORT_PDF_RENDERER_VERSION = 'report-pdf-v1';

const PAGE_MARGIN = 54;
const COLORS = {
  ink: '#172033',
  text: '#344054',
  muted: '#667085',
  faint: '#98a2b3',
  gold: '#93651f',
  goldSoft: '#f8f2e7',
  rule: '#e4e7ec',
  paper: '#ffffff',
};

interface FontSet {
  regular: string;
  bold: string;
}

export async function renderReportPdf(document: ReportExportDocument): Promise<Buffer> {
  const fonts = resolvePdfFonts();
  const pdf = new PDFDocument({
    size: 'A4',
    margins: { top: PAGE_MARGIN, right: PAGE_MARGIN, bottom: 62, left: PAGE_MARGIN },
    bufferPages: true,
    autoFirstPage: true,
    info: {
      Title: sanitizePdfText(document.title),
      Author: '紫微斗数 AI 本地分析平台',
      Subject: sanitizePdfText(`${document.categoryLabel} ${document.versionLabel}`),
      Keywords: '紫微斗数, 报告, 本地数据, 结构化依据',
      CreationDate: new Date(document.generatedAt),
      ModDate: new Date(document.generatedAt),
    },
  });
  pdf.registerFont('ReportRegular', fonts.regular);
  pdf.registerFont('ReportBold', fonts.bold);

  const chunks: Buffer[] = [];
  const completed = new Promise<Buffer>((resolve, reject) => {
    pdf.on('data', chunk => chunks.push(Buffer.from(chunk)));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
  });

  drawCover(pdf, document);
  if (document.summary.trim()) drawSummary(pdf, document.summary);
  for (const [index, section] of document.sections.entries()) {
    drawSection(pdf, section, index + 1);
  }
  if (document.actionItems.length) drawListSection(pdf, '行动建议', document.actionItems, true);
  if (document.openQuestions.length) drawListSection(pdf, '待观察事项', document.openQuestions, false);
  drawDisclaimer(pdf, document.disclaimer);
  drawPageFooters(pdf, document.title);
  pdf.end();

  const buffer = await completed;
  if (buffer.length < 1_000 || buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new Error('PDF_RENDER_OUTPUT_INVALID');
  }
  return buffer;
}

export function resolvePdfFonts(): FontSet {
  const regularCandidates = [
    process.env.REPORT_PDF_FONT_PATH,
    path.join(process.cwd(), 'assets', 'fonts', 'NotoSansSC-Regular.ttf'),
    'C:\\Windows\\Fonts\\NotoSansSC-VF.ttf',
    'C:\\Windows\\Fonts\\Deng.ttf',
    'C:\\Windows\\Fonts\\msyh.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/truetype/noto/NotoSansSC-Regular.ttf',
    '/System/Library/Fonts/PingFang.ttc',
  ].filter((value): value is string => Boolean(value));
  const boldCandidates = [
    process.env.REPORT_PDF_BOLD_FONT_PATH,
    path.join(process.cwd(), 'assets', 'fonts', 'NotoSansSC-Bold.ttf'),
    'C:\\Windows\\Fonts\\NotoSansSC-VF.ttf',
    'C:\\Windows\\Fonts\\Dengb.ttf',
    'C:\\Windows\\Fonts\\msyhbd.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',
    '/usr/share/fonts/truetype/noto/NotoSansSC-Bold.ttf',
    '/System/Library/Fonts/PingFang.ttc',
  ].filter((value): value is string => Boolean(value));
  const regular = regularCandidates.find(existsSync);
  const bold = boldCandidates.find(existsSync) ?? regular;
  if (!regular || !bold) {
    throw new Error('PDF_CJK_FONT_NOT_FOUND：请通过 REPORT_PDF_FONT_PATH 配置可嵌入的中文字体');
  }
  return { regular, bold };
}

function drawCover(pdf: PDFKit.PDFDocument, document: ReportExportDocument) {
  const width = contentWidth(pdf);
  pdf.font('ReportRegular').fontSize(8).fillColor(COLORS.gold)
    .text(sanitizePdfText(document.categoryLabel), PAGE_MARGIN, PAGE_MARGIN, {
      width,
      characterSpacing: 1.4,
      align: 'center',
    });
  pdf.moveDown(2);
  pdf.font('ReportBold').fontSize(24).fillColor(COLORS.ink)
    .text(sanitizePdfText(document.title), { width, align: 'center', lineGap: 4 });
  pdf.moveDown(0.7);
  const completed = document.sourceCompletedAt
    ? formatDateTime(document.sourceCompletedAt)
    : '未记录';
  pdf.font('ReportRegular').fontSize(8.5).fillColor(COLORS.muted)
    .text(sanitizePdfText(`${document.versionLabel} · 报告完成于 ${completed}`), {
      width,
      align: 'center',
    });
  pdf.moveDown(2.2);

  const startY = pdf.y;
  const columnWidth = (width - 16) / 2;
  const rowHeight = 34;
  const rows = Math.ceil(document.metadata.length / 2);
  pdf.save().roundedRect(PAGE_MARGIN, startY, width, rows * rowHeight + 14, 8)
    .fill(COLORS.goldSoft).restore();
  document.metadata.forEach((item, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = PAGE_MARGIN + 10 + column * (columnWidth + 6);
    const y = startY + 10 + row * rowHeight;
    pdf.font('ReportRegular').fontSize(7.2).fillColor(COLORS.muted)
      .text(sanitizePdfText(item.label), x, y, { width: columnWidth, height: 10 });
    pdf.font('ReportRegular').fontSize(8.6).fillColor(COLORS.text)
      .text(sanitizePdfText(item.value || '-'), x, y + 12, {
        width: columnWidth,
        height: 16,
        ellipsis: true,
      });
  });
  pdf.y = startY + rows * rowHeight + 34;
  pdf.x = PAGE_MARGIN;
}

function drawSummary(pdf: PDFKit.PDFDocument, summary: string) {
  ensureSpace(pdf, 100);
  const width = contentWidth(pdf);
  const normalized = sanitizePdfText(summary);
  const textHeight = pdf.font('ReportRegular').fontSize(10.5)
    .heightOfString(normalized, { width: width - 28, lineGap: 5 });
  const blockHeight = textHeight + 48;
  if (blockHeight < availableHeight(pdf)) {
    pdf.save().roundedRect(PAGE_MARGIN, pdf.y, width, blockHeight, 8)
      .fillAndStroke(COLORS.goldSoft, '#eadbbd').restore();
  }
  const top = pdf.y + 14;
  pdf.font('ReportBold').fontSize(10).fillColor(COLORS.gold)
    .text('核心结论摘要', PAGE_MARGIN + 14, top, { width: width - 28 });
  pdf.font('ReportRegular').fontSize(10.5).fillColor(COLORS.text)
    .text(normalized, PAGE_MARGIN + 14, top + 22, {
      width: width - 28,
      lineGap: 5,
      paragraphGap: 5,
    });
  pdf.y = Math.max(pdf.y, top + blockHeight - 8);
  pdf.x = PAGE_MARGIN;
  pdf.moveDown(1.2);
}

function drawSection(pdf: PDFKit.PDFDocument, section: ReportExportSection, index: number) {
  ensureSpace(pdf, 92);
  const width = contentWidth(pdf);
  pdf.moveDown(0.4);
  const headingY = pdf.y;
  const heading = sanitizePdfText(`${String(index).padStart(2, '0')}  ${section.title}`);
  const headingHeight = pdf.font('ReportBold').fontSize(14)
    .heightOfString(heading, { width: width - 112 });
  pdf.font('ReportBold').fontSize(14).fillColor(COLORS.ink)
    .text(heading, PAGE_MARGIN, headingY, {
      width: width - 112,
      continued: false,
    });
  pdf.font('ReportRegular').fontSize(7.4).fillColor(COLORS.gold)
    .text(sanitizePdfText(section.basisLabel), PAGE_MARGIN + width - 110, headingY + 2, {
      width: 110,
      align: 'right',
    });
  const dividerY = headingY + Math.max(headingHeight, 14) + 9;
  pdf.moveTo(PAGE_MARGIN, dividerY).lineTo(PAGE_MARGIN + width, dividerY)
    .lineWidth(0.6).strokeColor(COLORS.rule).stroke();
  pdf.x = PAGE_MARGIN;
  pdf.y = dividerY + 13;
  pdf.font('ReportRegular').fontSize(10.5).fillColor(COLORS.text)
    .text(sanitizePdfText(section.content), PAGE_MARGIN, pdf.y, {
      width,
      lineGap: 5,
      paragraphGap: 6,
      align: 'justify',
    });

  if (section.evidence.length) {
    pdf.moveDown(0.8);
    ensureSpace(pdf, 48);
    pdf.font('ReportBold').fontSize(8.2).fillColor(COLORS.gold)
      .text('本节结构化依据', PAGE_MARGIN, pdf.y, { width });
    pdf.moveDown(0.3);
    for (const evidence of section.evidence) {
      ensureSpace(pdf, 32);
      pdf.font('ReportRegular').fontSize(8.2).fillColor(COLORS.muted)
        .text(sanitizePdfText(`- ${evidence.label}`), PAGE_MARGIN, pdf.y, { width, lineGap: 2 });
      if (evidence.detail) {
        pdf.font('ReportRegular').fontSize(7.6).fillColor(COLORS.faint)
          .text(sanitizePdfText(evidence.detail), PAGE_MARGIN, pdf.y, { width, lineGap: 2, indent: 10 });
      }
    }
  }
  pdf.moveDown(1.5);
}

function drawListSection(
  pdf: PDFKit.PDFDocument,
  title: string,
  items: string[],
  numbered: boolean,
) {
  ensureSpace(pdf, 86);
  const width = contentWidth(pdf);
  pdf.font('ReportBold').fontSize(14).fillColor(COLORS.ink)
    .text(sanitizePdfText(title), PAGE_MARGIN, pdf.y, { width });
  pdf.moveDown(0.7);
  items.forEach((item, index) => {
    ensureSpace(pdf, 36);
    const prefix = numbered ? `${index + 1}.` : '-';
    pdf.font('ReportRegular').fontSize(10).fillColor(COLORS.text)
      .text(sanitizePdfText(`${prefix} ${item}`), PAGE_MARGIN, pdf.y, { width, lineGap: 4, indent: 2 });
    pdf.moveDown(0.35);
  });
  pdf.moveDown(1.2);
}

function drawDisclaimer(pdf: PDFKit.PDFDocument, disclaimer: string) {
  ensureSpace(pdf, 86);
  const width = contentWidth(pdf);
  pdf.save().roundedRect(PAGE_MARGIN, pdf.y, width, 1, 0).fill(COLORS.rule).restore();
  pdf.y += 15;
  pdf.font('ReportBold').fontSize(8).fillColor(COLORS.muted)
    .text('使用边界与免责声明', PAGE_MARGIN, pdf.y, { width });
  pdf.moveDown(0.4);
  pdf.font('ReportRegular').fontSize(8).fillColor(COLORS.faint)
    .text(sanitizePdfText(disclaimer), PAGE_MARGIN, pdf.y, { width, lineGap: 3 });
}

function drawPageFooters(pdf: PDFKit.PDFDocument, reportTitle: string) {
  const range = pdf.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    pdf.switchToPage(range.start + index);
    const width = contentWidth(pdf);
    const y = pdf.page.height - 36;
    const originalBottomMargin = pdf.page.margins.bottom;
    pdf.page.margins.bottom = 0;
    pdf.moveTo(PAGE_MARGIN, y - 8).lineTo(PAGE_MARGIN + width, y - 8)
      .lineWidth(0.5).strokeColor(COLORS.rule).stroke();
    pdf.font('ReportRegular').fontSize(6.8).fillColor(COLORS.faint)
      .text(sanitizePdfText(reportTitle), PAGE_MARGIN, y, {
        width: width - 70,
        ellipsis: true,
        lineBreak: false,
      });
    pdf.text(`${index + 1} / ${range.count}`, PAGE_MARGIN + width - 62, y, {
      width: 62,
      align: 'right',
      lineBreak: false,
    });
    pdf.page.margins.bottom = originalBottomMargin;
  }
}

function ensureSpace(pdf: PDFKit.PDFDocument, required: number) {
  if (availableHeight(pdf) < required) pdf.addPage();
}

function availableHeight(pdf: PDFKit.PDFDocument): number {
  return pdf.page.height - pdf.page.margins.bottom - pdf.y;
}

function contentWidth(pdf: PDFKit.PDFDocument): number {
  return pdf.page.width - pdf.page.margins.left - pdf.page.margins.right;
}

function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));
}

function sanitizePdfText(value: string): string {
  return value
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, '-')
    .replace(/\u00a0/g, ' ')
    .replace(/\t/g, '  ')
    .replace(/\r\n/g, '\n')
    .trim();
}
