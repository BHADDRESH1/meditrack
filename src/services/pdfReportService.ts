/**
 * pdfReportService.ts
 *
 * Client-side PDF report generation for MEDiTRACK.
 *
 * DATA AUTHORITY:
 *   This service accepts pre-fetched, pre-filtered data from the calling view.
 *   It does NOT independently query Supabase or any external data source.
 *   The caller is responsible for ensuring the data is already scoped to the
 *   user's authorized view (RBAC + location isolation).
 *
 * LIBRARY: jsPDF + jspdf-autotable
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── Types accepted from views ────────────────────────────────────────────────

export interface PdfReportMeta {
  reportTitle: string;
  userName: string;
  userRole: string;
  dataMode: 'SUPABASE' | 'DEMO';
  appliedFilters?: Record<string, string>;
}

export interface CommandCenterReportData {
  expiringCount: number;
  wasteRiskCount: number;
  stockoutRiskCount: number;
  overstockCount: number;
  slowMovingCount: number;
  actions: Array<{
    productName: string;
    type: string;
    urgency: string;
    quantity: number;
    fromLocation: string;
    toLocation: string;
    status: string;
    reason: string;
  }>;
  topRiskItems: Array<{
    productName: string;
    batchNumber: string;
    location: string;
    expiryDate: string;
    daysToExpiry: number;
    potentialAtRisk: number;
    riskLevel: string;
  }>;
}

export interface ExpiryReportRow {
  productName: string;
  productSku: string;
  variantName: string;
  batchNumber: string;
  locationName: string;
  expiryDate: string;
  daysToExpiry: number;
  quantity: number;
  adu: number;
  expectedUsage: number;
  potentialAtRiskUnits: number;
  riskLevel: string;
  recommendedAction: string;
}

export interface StockReportRow {
  productName: string;
  variantName: string;
  batchNumber: string;
  locationName: string;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  expiryDate: string;
  status: string;
  category: string;
}

export interface MovementsReportRow {
  transactionNumber: string;
  timestamp: string;
  type: string;
  productName: string;
  batchNumber: string;
  fromLocation: string;
  toLocation: string;
  quantity: number;
  referenceDoc: string;
  reason: string;
  performedBy: string;
}

export interface ProcurementReportRow {
  productName: string;
  productSku: string;
  locationName: string;
  networkStock: number;
  adu: number;
  daysOfStock: number;
  leadTimeDays: number;
  safetyStockUnits: number;
  reorderPoint: number;
  targetStock: number;
  pendingPOQty: number;
  nearExpiryQty: number;
  suggestedQty: number;
  estimatedUnitCost: number;
  recommendation: string;
  status: string;
}

export interface PurchaseRequestReportRow {
  requestNumber: string;
  productName: string;
  productSku: string;
  variantName: string;
  requestedQty: number;
  locationName: string;
  justification: string;
  estimatedCost: number;
  requestedBy: string;
  status: string;
  reviewedBy: string;
  createdAt: string;
}

// ── Shared helpers ────────────────────────────────────────────────────────────

const BRAND_COLOR: [number, number, number] = [14, 116, 144]; // cyan-700 approx
const HEADER_FILL: [number, number, number] = [15, 23, 42]; // slate-900

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch {
    return iso || '—';
  }
}

function formatDateTime(): string {
  return new Date().toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function buildPdfFilename(type: string): string {
  const dateStr = new Date().toISOString().slice(0, 10);
  return `meditrack-${type}-${dateStr}.pdf`;
}

/** Draws the standard MEDiTRACK page header and returns the Y offset after the header. */
function drawPageHeader(doc: jsPDF, meta: PdfReportMeta): number {
  const pageW = doc.internal.pageSize.getWidth();

  // Title bar
  doc.setFillColor(...HEADER_FILL);
  doc.rect(0, 0, pageW, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('MEDiTRACK', 14, 11);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('Smart Medical Inventory, Expiry & Waste-Prevention System', 14, 17);

  // Data mode badge
  const modeLabel = meta.dataMode === 'SUPABASE' ? 'SUPABASE MODE' : 'DEMO MODE';
  const modeColor: [number, number, number] = meta.dataMode === 'SUPABASE'
    ? [16, 185, 129]
    : [245, 158, 11];
  doc.setFillColor(...modeColor);
  const badgeW = 32;
  doc.roundedRect(pageW - 14 - badgeW, 8, badgeW, 8, 1, 1, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(6);
  doc.setFont('helvetica', 'bold');
  doc.text(modeLabel, pageW - 14 - badgeW + badgeW / 2, 13, { align: 'center' });

  // Report title section
  doc.setTextColor(...BRAND_COLOR);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(meta.reportTitle, 14, 40);

  doc.setTextColor(71, 85, 105); // slate-600
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${formatDateTime()}`, 14, 47);
  doc.text(`User: ${meta.userName} (${meta.userRole})`, 14, 53);

  // Filters
  let filterY = 53;
  if (meta.appliedFilters && Object.keys(meta.appliedFilters).length > 0) {
    filterY += 6;
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139); // slate-500
    const filterText = Object.entries(meta.appliedFilters)
      .filter(([, v]) => v && v !== 'ALL')
      .map(([k, v]) => `${k}: ${v}`)
      .join('  ·  ');
    if (filterText) {
      doc.text(`Filters: ${filterText}`, 14, filterY);
    }
  }

  // Separator
  doc.setDrawColor(226, 232, 240);
  doc.line(14, filterY + 5, pageW - 14, filterY + 5);

  return filterY + 12;
}

/** Draws the standard page footer with page numbers. */
function addPageNumbers(doc: jsPDF): void {
  const pageCount = doc.getNumberOfPages();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.setFont('helvetica', 'normal');
    doc.text('MEDiTRACK — For authorized hospital staff only. Confidential.', 14, pageH - 8);
    doc.text(`Page ${i} of ${pageCount}`, pageW - 14, pageH - 8, { align: 'right' });
  }
}

/** Renders an "empty state" notice into the PDF. */
function drawEmptyState(doc: jsPDF, startY: number): void {
  doc.setTextColor(148, 163, 184);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'italic');
  doc.text('No records match the selected filters.', 14, startY + 8);
}

// ── autoTable shared style ────────────────────────────────────────────────────

const TABLE_STYLES = {
  headStyles: {
    fillColor: HEADER_FILL,
    textColor: [255, 255, 255] as [number, number, number],
    fontStyle: 'bold' as const,
    fontSize: 7,
  },
  bodyStyles: {
    fontSize: 7,
    textColor: [30, 41, 59] as [number, number, number],
  },
  alternateRowStyles: {
    fillColor: [248, 250, 252] as [number, number, number],
  },
  margin: { left: 14, right: 14 },
  tableLineColor: [226, 232, 240] as [number, number, number],
  tableLineWidth: 0.2,
  showHead: 'everyPage' as const,
};

// ── Report generators ─────────────────────────────────────────────────────────

class PdfReportService {

  // ── 1. Command Center ──────────────────────────────────────────────────────
  generateCommandCenterReport(
    data: CommandCenterReportData,
    meta: Omit<PdfReportMeta, 'reportTitle'>
  ): void {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const fullMeta: PdfReportMeta = { ...meta, reportTitle: 'Expiry & Waste Prevention Command Center' };
    let y = drawPageHeader(doc, fullMeta);

    // KPI summary row
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('System Intelligence Summary', 14, y);
    y += 5;

    const kpiItems = [
      { label: 'Expiring Soon', value: String(data.expiringCount), color: [234, 179, 8] as [number,number,number] },
      { label: 'Waste Risk', value: String(data.wasteRiskCount), color: [239, 68, 68] as [number,number,number] },
      { label: 'Stockout Risk', value: String(data.stockoutRiskCount), color: [239, 68, 68] as [number,number,number] },
      { label: 'Overstock Risk', value: String(data.overstockCount), color: [245, 158, 11] as [number,number,number] },
      { label: 'Slow Moving', value: String(data.slowMovingCount), color: [100, 116, 139] as [number,number,number] },
    ];
    const boxW = 50;
    const boxH = 14;
    kpiItems.forEach((kpi, i) => {
      const x = 14 + i * (boxW + 3);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(...kpi.color);
      doc.roundedRect(x, y, boxW, boxH, 1, 1, 'FD');
      doc.setTextColor(...kpi.color);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(kpi.value, x + boxW / 2, y + 7, { align: 'center' });
      doc.setTextColor(100, 116, 139);
      doc.setFontSize(6);
      doc.setFont('helvetica', 'normal');
      doc.text(kpi.label, x + boxW / 2, y + 12, { align: 'center' });
    });
    y += boxH + 8;

    // Top risk items
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('Key Risk Items', 14, y);
    y += 3;

    if (data.topRiskItems.length === 0) {
      drawEmptyState(doc, y);
      y += 16;
    } else {
      autoTable(doc, {
        startY: y,
        head: [['Product', 'Batch', 'Location', 'Expiry Date', 'Days Left', 'At Risk Units', 'Risk Level']],
        body: data.topRiskItems.map(r => [
          r.productName,
          r.batchNumber,
          r.location,
          formatDate(r.expiryDate),
          r.daysToExpiry <= 0 ? 'EXPIRED' : String(r.daysToExpiry),
          String(r.potentialAtRisk),
          r.riskLevel,
        ]),
        ...TABLE_STYLES,
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // Recommended actions
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('Recommended Actions', 14, y);
    y += 3;

    if (data.actions.length === 0) {
      drawEmptyState(doc, y);
    } else {
      autoTable(doc, {
        startY: y,
        head: [['Product', 'Action Type', 'Urgency', 'Qty', 'From', 'To', 'Status', 'Reason']],
        body: data.actions.map(a => [
          a.productName,
          a.type,
          a.urgency,
          String(a.quantity),
          a.fromLocation,
          a.toLocation,
          a.status,
          a.reason.slice(0, 60) + (a.reason.length > 60 ? '…' : ''),
        ]),
        ...TABLE_STYLES,
      });
    }

    // Methodology note
    doc.addPage();
    let my = 20;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('Calculation Methodology', 14, my);
    my += 7;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    const methodLines = [
      'All risk calculations in MEDiTRACK are deterministic and rule-based. They are NOT AI predictions or machine-learning forecasts.',
      '',
      'Expected Usage = ADU (Average Daily Usage) × Days to Expiry',
      'Potential At-Risk Units = max(0, Quantity − Expected Usage)',
      'Reorder Point (ROP) = (ADU × Lead Time Days) + Safety Stock Units',
      'Safety Stock Units = ADU × Safety Stock Days',
      '',
      'ADU is derived from historical daily_consumption records in the authoritative database.',
      'All figures reflect the data state at the time this report was generated.',
      'This report is for authorized hospital staff only and must not be shared externally.',
    ];
    methodLines.forEach(line => {
      doc.text(line, 14, my);
      my += 5;
    });

    addPageNumbers(doc);
    doc.save(buildPdfFilename('command-center'));
  }

  // ── 2. Expiry Risk ─────────────────────────────────────────────────────────
  generateExpiryReport(
    rows: ExpiryReportRow[],
    meta: Omit<PdfReportMeta, 'reportTitle'>
  ): void {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const fullMeta: PdfReportMeta = { ...meta, reportTitle: 'Expiry Risk & Loss Prevention Report' };
    const y = drawPageHeader(doc, fullMeta);

    if (rows.length === 0) {
      drawEmptyState(doc, y);
    } else {
      autoTable(doc, {
        startY: y,
        head: [[
          'Product', 'Variant', 'Batch', 'Location',
          'Expiry Date', 'Days Left', 'Qty', 'ADU',
          'Expected Usage', 'At Risk Units', 'Risk Level', 'Recommended Action',
        ]],
        body: rows.map(r => [
          r.productName,
          r.variantName || '—',
          r.batchNumber,
          r.locationName,
          formatDate(r.expiryDate),
          r.daysToExpiry <= 0 ? 'EXPIRED' : String(r.daysToExpiry),
          String(r.quantity),
          r.adu.toFixed(1),
          r.expectedUsage.toFixed(0),
          String(r.potentialAtRiskUnits),
          r.riskLevel,
          r.recommendedAction.slice(0, 40) + (r.recommendedAction.length > 40 ? '…' : ''),
        ]),
        ...TABLE_STYLES,
        columnStyles: {
          0: { cellWidth: 32 },
          11: { cellWidth: 36 },
        },
      });
    }

    addPageNumbers(doc);
    doc.save(buildPdfFilename('expiry-risk'));
  }

  // ── 3. Stock Balances ──────────────────────────────────────────────────────
  generateStockReport(
    rows: StockReportRow[],
    meta: Omit<PdfReportMeta, 'reportTitle'>
  ): void {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const fullMeta: PdfReportMeta = { ...meta, reportTitle: 'Stock Balances Report' };
    const y = drawPageHeader(doc, fullMeta);

    if (rows.length === 0) {
      drawEmptyState(doc, y);
    } else {
      autoTable(doc, {
        startY: y,
        head: [[
          'Product', 'Variant', 'Batch', 'Location',
          'Category', 'Qty', 'Reserved', 'Available',
          'Expiry Date', 'Status',
        ]],
        body: rows.map(r => [
          r.productName,
          r.variantName || '—',
          r.batchNumber,
          r.locationName,
          r.category,
          String(r.quantity),
          String(r.reservedQuantity),
          String(r.availableQuantity),
          r.expiryDate ? formatDate(r.expiryDate) : '—',
          r.status,
        ]),
        ...TABLE_STYLES,
      });
    }

    addPageNumbers(doc);
    doc.save(buildPdfFilename('stock-balances'));
  }

  // ── 4. Movements Ledger ────────────────────────────────────────────────────
  generateMovementsReport(
    rows: MovementsReportRow[],
    meta: Omit<PdfReportMeta, 'reportTitle'>
  ): void {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const fullMeta: PdfReportMeta = { ...meta, reportTitle: 'Auditable Movements Ledger Report' };
    const y = drawPageHeader(doc, fullMeta);

    if (rows.length === 0) {
      drawEmptyState(doc, y);
    } else {
      autoTable(doc, {
        startY: y,
        head: [[
          'Ref #', 'Date/Time', 'Type', 'Product',
          'Batch', 'From', 'To', 'Qty',
          'Reference Doc', 'Reason', 'Performed By',
        ]],
        body: rows.map(r => [
          r.transactionNumber,
          formatDate(r.timestamp),
          r.type,
          r.productName,
          r.batchNumber,
          r.fromLocation || 'Supplier',
          r.toLocation || 'Discarded',
          String(r.quantity),
          r.referenceDoc || 'Internal',
          r.reason.slice(0, 35) + (r.reason.length > 35 ? '…' : ''),
          r.performedBy,
        ]),
        ...TABLE_STYLES,
        columnStyles: {
          9: { cellWidth: 35 },
        },
      });
    }

    addPageNumbers(doc);
    doc.save(buildPdfFilename('movements-ledger'));
  }

  // ── 5. Procurement Planning ────────────────────────────────────────────────
  generateProcurementReport(
    rows: ProcurementReportRow[],
    meta: Omit<PdfReportMeta, 'reportTitle'>
  ): void {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const fullMeta: PdfReportMeta = {
      ...meta,
      reportTitle: 'Smart Procurement & Replenishment Planning Report',
    };
    const y = drawPageHeader(doc, fullMeta);

    // Disclaimer
    doc.setFontSize(7);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(217, 119, 6);
    doc.text(
      'Estimated procurement values are planning figures only. They do not constitute actual spending commitments or approved expenditure.',
      14, y
    );

    if (rows.length === 0) {
      drawEmptyState(doc, y + 8);
    } else {
      autoTable(doc, {
        startY: y + 8,
        head: [[
          'Product', 'SKU', 'Location', 'Net Stock',
          'ADU', 'Days of Stock', 'Lead Time', 'Safety Stock',
          'ROP', 'Target Stock', 'Pending PO', 'Near-Expiry',
          'Suggested Qty', 'Est. Unit Cost', 'Recommendation', 'Status',
        ]],
        body: rows.map(r => [
          r.productName,
          r.productSku,
          r.locationName,
          String(r.networkStock),
          r.adu.toFixed(1),
          r.daysOfStock.toFixed(0),
          String(r.leadTimeDays),
          String(r.safetyStockUnits),
          String(r.reorderPoint),
          String(r.targetStock),
          String(r.pendingPOQty),
          String(r.nearExpiryQty),
          String(r.suggestedQty),
          `$${r.estimatedUnitCost.toFixed(2)}`,
          r.recommendation.slice(0, 30) + (r.recommendation.length > 30 ? '…' : ''),
          r.status,
        ]),
        ...TABLE_STYLES,
        styles: { fontSize: 6 },
      });
    }

    addPageNumbers(doc);
    doc.save(buildPdfFilename('procurement-planning'));
  }

  // ── 6. Purchase Requests ───────────────────────────────────────────────────
  generatePurchaseRequestsReport(
    rows: PurchaseRequestReportRow[],
    meta: Omit<PdfReportMeta, 'reportTitle'>
  ): void {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const fullMeta: PdfReportMeta = {
      ...meta,
      reportTitle: 'Hospital Purchase Requests Report',
    };
    const y = drawPageHeader(doc, fullMeta);

    if (rows.length === 0) {
      drawEmptyState(doc, y);
    } else {
      autoTable(doc, {
        startY: y,
        head: [[
          'Request #', 'Product', 'SKU', 'Variant',
          'Qty', 'Location', 'Justification', 'Est. Cost',
          'Requested By', 'Status', 'Reviewed By', 'Created',
        ]],
        body: rows.map(r => [
          r.requestNumber,
          r.productName,
          r.productSku,
          r.variantName || '—',
          String(r.requestedQty),
          r.locationName,
          r.justification.slice(0, 35) + (r.justification.length > 35 ? '…' : ''),
          `$${r.estimatedCost.toFixed(2)}`,
          r.requestedBy,
          r.status,
          r.reviewedBy || '—',
          formatDate(r.createdAt),
        ]),
        ...TABLE_STYLES,
      });
    }

    addPageNumbers(doc);
    doc.save(buildPdfFilename('purchase-requests'));
  }
}

export const pdfReportService = new PdfReportService();
