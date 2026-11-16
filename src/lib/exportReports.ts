import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type {
  CashSummary,
  CommunityEvent,
  EventBudgetItem,
  EventParticipant,
  Member,
  ReportType,
  Transaction,
} from '../types';
import { formatDateID, formatIDR } from './formatters';

export interface ReportExportPayload {
  reportType: ReportType;
  periodLabel: string;
  startDate: string;
  endDate: string;
  transactions: Transaction[];
  members: Member[];
  summary: CashSummary;
  generatedBy: string;
}

const REPORT_TITLES: Record<ReportType, string> = {
  kas_keseluruhan: 'Laporan Kas Keseluruhan',
  pemasukan: 'Laporan Pemasukan Kas',
  pengeluaran: 'Laporan Pengeluaran Kas',
  per_kategori: 'Laporan Rekapitulasi Per Kategori',
  kontribusi_anggota: 'Laporan Kontribusi Anggota',
};

export function exportReportToPDF(payload: ReportExportPayload): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header Navy Banner
  doc.setFillColor(11, 25, 44); // #0B192C
  doc.rect(0, 0, pageWidth, 32, 'F');
  doc.setFillColor(249, 115, 22); // #F97316 orange accent bar
  doc.rect(0, 32, pageWidth, 1.8, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('SENTRA ANGLER', 14, 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(203, 213, 225);
  doc.text('Transparansi Kas, Solidaritas Anggota — Digital Cash Management', 14, 19.5);
  doc.text(`Dicetak: ${new Date().toLocaleString('id-ID')} oleh ${payload.generatedBy}`, 14, 26);

  // Report Title & Period
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(REPORT_TITLES[payload.reportType], 14, 43);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Periode: ${payload.periodLabel} (${formatDateID(payload.startDate)} – ${formatDateID(payload.endDate)})`,
    14,
    49
  );

  // Summary Box
  const periodIncome = payload.transactions
    .filter((t) => t.type === 'pemasukan')
    .reduce((a, b) => a + b.amount, 0);
  const periodExpense = payload.transactions
    .filter((t) => t.type === 'pengeluaran')
    .reduce((a, b) => a + b.amount, 0);

  autoTable(doc, {
    startY: 54,
    theme: 'grid',
    headStyles: { fillColor: [15, 37, 68], textColor: 255, fontSize: 8.5, fontStyle: 'bold' },
    bodyStyles: { fontSize: 9, textColor: [15, 23, 42] },
    head: [['Saldo Awal Kas', 'Pemasukan Periode', 'Pengeluaran Periode', 'Saldo Kas Saat Ini']],
    body: [
      [
        formatIDR(payload.summary.initial_balance),
        formatIDR(periodIncome),
        formatIDR(periodExpense),
        formatIDR(payload.summary.current_balance),
      ],
    ],
    margin: { left: 14, right: 14 },
  });

  const lastY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 74;

  if (payload.reportType === 'per_kategori') {
    const map = new Map<string, { type: string; count: number; total: number }>();
    for (const t of payload.transactions) {
      const key = `${t.type}|${t.category_name}`;
      const prev = map.get(key) || { type: t.type, count: 0, total: 0 };
      prev.count += 1;
      prev.total += t.amount;
      map.set(key, prev);
    }
    const rows = Array.from(map.entries()).map(([k, v]) => [
      k.split('|')[1],
      v.type === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran',
      String(v.count),
      formatIDR(v.total),
    ]);
    autoTable(doc, {
      startY: lastY + 6,
      head: [['Kategori', 'Jenis', 'Jumlah Transaksi', 'Total Nominal']],
      body: rows.length ? rows : [['Belum ada transaksi pada periode ini', '-', '-', '-']],
      headStyles: { fillColor: [11, 25, 44], textColor: 255, fontSize: 8.5 },
      bodyStyles: { fontSize: 8.5 },
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    });
  } else if (payload.reportType === 'kontribusi_anggota') {
    const rows = payload.members.map((m) => {
      const mTx = payload.transactions.filter(
        (t) => t.member_id === m.id && t.type === 'pemasukan'
      );
      const total = mTx.reduce((a, b) => a + b.amount, 0);
      return [
        m.member_code,
        m.full_name,
        m.status === 'active' ? 'Aktif' : 'Nonaktif',
        String(mTx.length),
        formatIDR(total),
      ];
    });
    autoTable(doc, {
      startY: lastY + 6,
      head: [['ID Anggota', 'Nama Anggota', 'Status', 'Frekuensi Setor', 'Total Kontribusi']],
      body: rows.length ? rows : [['Belum ada data anggota', '-', '-', '-', '-']],
      headStyles: { fillColor: [11, 25, 44], textColor: 255, fontSize: 8.5 },
      bodyStyles: { fontSize: 8.5 },
      columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    });
  } else {
    const filtered =
      payload.reportType === 'pemasukan'
        ? payload.transactions.filter((t) => t.type === 'pemasukan')
        : payload.reportType === 'pengeluaran'
        ? payload.transactions.filter((t) => t.type === 'pengeluaran')
        : payload.transactions;

    const rows = filtered.map((t) => [
      t.transaction_code,
      formatDateID(t.transaction_date),
      t.type === 'pemasukan' ? 'Masuk' : 'Keluar',
      t.category_name,
      t.related_party,
      t.description || '-',
      formatIDR(t.amount),
    ]);
    autoTable(doc, {
      startY: lastY + 6,
      head: [['ID', 'Tanggal', 'Jenis', 'Kategori', 'Terkait', 'Keterangan', 'Nominal']],
      body: rows.length ? rows : [['Tidak ada transaksi pada periode ini', '-', '-', '-', '-', '-', '-']],
      headStyles: { fillColor: [11, 25, 44], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 6: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    });
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `SENTRA ANGLER — Transparansi Kas, Solidaritas Anggota | Halaman ${i} dari ${pageCount}`,
      14,
      doc.internal.pageSize.getHeight() - 8
    );
  }

  const filename = `SENTRA-ANGLER_${payload.reportType}_${payload.startDate}_sd_${payload.endDate}.pdf`;
  doc.save(filename);
}

export function exportReportToExcel(payload: ReportExportPayload): void {
  const wb = XLSX.utils.book_new();

  const periodIncome = payload.transactions
    .filter((t) => t.type === 'pemasukan')
    .reduce((a, b) => a + b.amount, 0);
  const periodExpense = payload.transactions
    .filter((t) => t.type === 'pengeluaran')
    .reduce((a, b) => a + b.amount, 0);

  const summarySheetData = [
    ['SENTRA ANGLER — DIGITAL CASH MANAGEMENT'],
    ['Tagline', 'Transparansi Kas, Solidaritas Anggota'],
    ['Jenis Laporan', REPORT_TITLES[payload.reportType]],
    ['Periode', `${payload.periodLabel} (${payload.startDate} s/d ${payload.endDate})`],
    ['Dicetak Oleh', payload.generatedBy],
    ['Waktu Cetak', new Date().toLocaleString('id-ID')],
    [],
    ['RINGKASAN KAS'],
    ['Saldo Awal Kas', payload.summary.initial_balance],
    ['Total Pemasukan Periode Ini', periodIncome],
    ['Total Pengeluaran Periode Ini', periodExpense],
    ['Saldo Akhir Kas Saat Ini (Keseluruhan)', payload.summary.current_balance],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summarySheetData);
  wsSummary['!cols'] = [{ wch: 36 }, { wch: 36 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan');

  if (payload.reportType === 'per_kategori') {
    const map = new Map<string, { type: string; count: number; total: number }>();
    for (const t of payload.transactions) {
      const key = `${t.type}|${t.category_name}`;
      const prev = map.get(key) || { type: t.type, count: 0, total: 0 };
      prev.count += 1;
      prev.total += t.amount;
      map.set(key, prev);
    }
    const rows = Array.from(map.entries()).map(([k, v]) => ({
      Kategori: k.split('|')[1],
      Jenis: v.type === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran',
      'Jumlah Transaksi': v.count,
      'Total Nominal (IDR)': v.total,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 18 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap Kategori');
  } else if (payload.reportType === 'kontribusi_anggota') {
    const rows = payload.members.map((m) => {
      const mTx = payload.transactions.filter(
        (t) => t.member_id === m.id && t.type === 'pemasukan'
      );
      return {
        'ID Anggota': m.member_code,
        'Nama Lengkap': m.full_name,
        WhatsApp: m.whatsapp,
        Status: m.status === 'active' ? 'Aktif' : 'Nonaktif',
        'Tanggal Bergabung': m.join_date,
        'Jumlah Setoran': mTx.length,
        'Total Kontribusi (IDR)': mTx.reduce((a, b) => a + b.amount, 0),
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 14 },
      { wch: 26 },
      { wch: 18 },
      { wch: 12 },
      { wch: 18 },
      { wch: 16 },
      { wch: 24 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Kontribusi Anggota');
  } else {
    const filtered =
      payload.reportType === 'pemasukan'
        ? payload.transactions.filter((t) => t.type === 'pemasukan')
        : payload.reportType === 'pengeluaran'
        ? payload.transactions.filter((t) => t.type === 'pengeluaran')
        : payload.transactions;

    const rows = filtered.map((t) => ({
      'ID Transaksi': t.transaction_code,
      Tanggal: t.transaction_date,
      Jenis: t.type === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran',
      Kategori: t.category_name,
      'Anggota / Pihak Terkait': t.related_party,
      Keterangan: t.description,
      'Nominal (IDR)': t.amount,
      'Petugas Pencatat': t.created_by_name,
      'Waktu Pencatatan': t.created_at,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 18 },
      { wch: 14 },
      { wch: 14 },
      { wch: 22 },
      { wch: 24 },
      { wch: 34 },
      { wch: 18 },
      { wch: 22 },
      { wch: 24 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Daftar Transaksi');
  }

  const filename = `SENTRA-ANGLER_${payload.reportType}_${payload.startDate}_sd_${payload.endDate}.xlsx`;
  XLSX.writeFile(wb, filename);
}

export interface EventReportExportPayload {
  event: CommunityEvent;
  budgetItems: EventBudgetItem[];
  participants: EventParticipant[];
  members: Member[];
  transactions: Transaction[];
  generatedBy: string;
}

const EVENT_STATUS_LABELS: Record<CommunityEvent['status'], string> = {
  planned: 'Direncanakan',
  ongoing: 'Berlangsung',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
};

function computeEventReportRows(payload: EventReportExportPayload) {
  const activeTx = payload.transactions.filter(
    (t) => t.event_id === payload.event.id && !t.deleted_at
  );

  const estIncome = payload.budgetItems
    .filter((b) => b.type === 'pemasukan')
    .reduce((sum, b) => sum + b.estimated_amount, 0);
  const estExpense = payload.budgetItems
    .filter((b) => b.type === 'pengeluaran')
    .reduce((sum, b) => sum + b.estimated_amount, 0);

  const actualIncome = activeTx
    .filter((t) => t.type === 'pemasukan')
    .reduce((sum, t) => sum + t.amount, 0);
  const actualExpense = activeTx
    .filter((t) => t.type === 'pengeluaran')
    .reduce((sum, t) => sum + t.amount, 0);

  // Actual realized grouped by type|category_id
  const actualByCat = new Map<string, number>();
  for (const t of activeTx) {
    const key = `${t.type}|${t.category_id}`;
    actualByCat.set(key, (actualByCat.get(key) || 0) + t.amount);
  }

  // Group budget items by type|category_id so category-level actual matches cleanly
  const budgetedCatKeys = new Set(payload.budgetItems.map((b) => `${b.type}|${b.category_id}`));

  const participantRows = payload.participants
    .map((p) => {
      const member = payload.members.find((m) => m.id === p.member_id);
      if (!member) return null;
      const paid = activeTx
        .filter((t) => t.type === 'pemasukan' && t.member_id === member.id)
        .reduce((sum, t) => sum + t.amount, 0);
      const target = payload.event.fee_per_member;
      const remaining = Math.max(0, target - paid);
      const status =
        target <= 0
          ? 'Tanpa Iuran'
          : paid >= target
          ? 'Lunas'
          : paid > 0
          ? 'Sebagian'
          : 'Belum Bayar';
      return {
        member_code: member.member_code,
        full_name: member.full_name,
        whatsapp: member.whatsapp,
        target,
        paid,
        remaining,
        status,
      };
    })
    .filter((r): r is NonNullable<typeof r> => Boolean(r));

  return {
    activeTx,
    estIncome,
    estExpense,
    actualIncome,
    actualExpense,
    actualByCat,
    budgetedCatKeys,
    participantRows,
  };
}

export function exportEventReportToPDF(payload: EventReportExportPayload): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const {
    activeTx,
    estIncome,
    estExpense,
    actualIncome,
    actualExpense,
    actualByCat,
    budgetedCatKeys,
    participantRows,
  } = computeEventReportRows(payload);

  // Header Navy Banner
  doc.setFillColor(11, 25, 44);
  doc.rect(0, 0, pageWidth, 32, 'F');
  doc.setFillColor(249, 115, 22);
  doc.rect(0, 32, pageWidth, 1.8, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('SENTRA ANGLER', 14, 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(203, 213, 225);
  doc.text('Laporan Pertanggungjawaban Acara (RAB vs Realisasi & Iuran Peserta)', 14, 19.5);
  doc.text(`Dicetak: ${new Date().toLocaleString('id-ID')} oleh ${payload.generatedBy}`, 14, 26);

  // Event Title & Metadata
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(`${payload.event.event_code} — ${payload.event.title}`, 14, 43);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Tanggal: ${formatDateID(payload.event.event_date)} | Lokasi: ${payload.event.location || '-'} | Status: ${EVENT_STATUS_LABELS[payload.event.status]}`,
    14,
    49
  );
  doc.text(
    `Peserta Terdaftar: ${participantRows.length} / ${payload.event.target_participants} orang | Iuran per Anggota: ${formatIDR(payload.event.fee_per_member)}`,
    14,
    54.5
  );

  // Summary Table
  autoTable(doc, {
    startY: 59,
    theme: 'grid',
    headStyles: { fillColor: [15, 37, 68], textColor: 255, fontSize: 8.5, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8.5, textColor: [15, 23, 42] },
    head: [['Komponen Keuangan', 'Estimasi (RAB)', 'Realisasi Aktual', 'Selisih']],
    body: [
      [
        'Total Pemasukan Acara',
        formatIDR(estIncome),
        formatIDR(actualIncome),
        formatIDR(actualIncome - estIncome),
      ],
      [
        'Total Pengeluaran Acara',
        formatIDR(estExpense),
        formatIDR(actualExpense),
        formatIDR(estExpense - actualExpense),
      ],
      [
        'Surplus / (Defisit) Acara',
        formatIDR(estIncome - estExpense),
        formatIDR(actualIncome - actualExpense),
        formatIDR(actualIncome - actualExpense - (estIncome - estExpense)),
      ],
    ],
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  });

  let nextY =
    ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 88) + 7;

  // RAB Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text('1. Rincian Pos Anggaran (RAB) & Realisasi Per Kategori', 14, nextY);

  const rabRows = payload.budgetItems.map((item) => {
    const key = `${item.type}|${item.category_id}`;
    const catActual = actualByCat.get(key) || 0;
    return [
      item.type === 'pemasukan' ? 'Masuk' : 'Keluar',
      item.item_name,
      item.category_name,
      formatIDR(item.estimated_amount),
      formatIDR(catActual),
    ];
  });

  // Add unbudgeted categories if any
  for (const [key, total] of actualByCat.entries()) {
    if (!budgetedCatKeys.has(key)) {
      const [tType, catId] = key.split('|');
      const sample = activeTx.find((t) => t.type === tType && t.category_id === catId);
      rabRows.push([
        tType === 'pemasukan' ? 'Masuk' : 'Keluar',
        '(Di luar RAB)',
        sample?.category_name || '-',
        formatIDR(0),
        formatIDR(total),
      ]);
    }
  }

  autoTable(doc, {
    startY: nextY + 3,
    head: [['Jenis', 'Pos / Uraian', 'Kategori', 'Estimasi RAB', 'Realisasi Kategori']],
    body: rabRows.length ? rabRows : [['-', 'Belum ada pos anggaran atau transaksi', '-', '-', '-']],
    headStyles: { fillColor: [11, 25, 44], textColor: 255, fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  });

  nextY =
    ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? nextY + 25) +
    8;

  // Participant Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text('2. Daftar Peserta & Status Pembayaran Iuran', 14, nextY);

  const pRows = participantRows.map((r) => [
    r.member_code,
    r.full_name,
    formatIDR(r.target),
    formatIDR(r.paid),
    formatIDR(r.remaining),
    r.status,
  ]);

  autoTable(doc, {
    startY: nextY + 3,
    head: [['ID', 'Nama Anggota', 'Target Iuran', 'Sudah Bayar', 'Kurang', 'Status']],
    body: pRows.length ? pRows : [['-', 'Belum ada peserta terdaftar pada acara ini', '-', '-', '-', '-']],
    headStyles: { fillColor: [11, 25, 44], textColor: 255, fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  });

  if (activeTx.length > 0) {
    nextY =
      ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? nextY + 25) +
      8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text('3. Rincian Transaksi Aktual Terkait Acara', 14, nextY);

    autoTable(doc, {
      startY: nextY + 3,
      head: [['Kode', 'Tanggal', 'Jenis', 'Kategori', 'Pihak Terkait', 'Nominal']],
      body: activeTx.map((t) => [
        t.transaction_code,
        formatDateID(t.transaction_date),
        t.type === 'pemasukan' ? 'Masuk' : 'Keluar',
        t.category_name,
        t.related_party,
        formatIDR(t.amount),
      ]),
      headStyles: { fillColor: [11, 25, 44], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 5: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    });
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `SENTRA ANGLER — Transparansi Kas, Solidaritas Anggota | Halaman ${i} dari ${pageCount}`,
      14,
      doc.internal.pageSize.getHeight() - 8
    );
  }

  doc.save(`SENTRA-ANGLER_LPJ_${payload.event.event_code}.pdf`);
}

export function exportEventReportToExcel(payload: EventReportExportPayload): void {
  const wb = XLSX.utils.book_new();
  const {
    activeTx,
    estIncome,
    estExpense,
    actualIncome,
    actualExpense,
    actualByCat,
    budgetedCatKeys,
    participantRows,
  } = computeEventReportRows(payload);

  const summarySheet = [
    ['SENTRA ANGLER — LAPORAN PERTANGGUNGJAWABAN ACARA (LPJ)'],
    ['Kode Acara', payload.event.event_code],
    ['Nama Acara', payload.event.title],
    ['Tanggal Acara', payload.event.event_date],
    ['Lokasi', payload.event.location || '-'],
    ['Status', EVENT_STATUS_LABELS[payload.event.status]],
    ['Target Peserta', payload.event.target_participants],
    ['Peserta Terdaftar', participantRows.length],
    ['Iuran per Anggota (IDR)', payload.event.fee_per_member],
    ['Dicetak Oleh', payload.generatedBy],
    ['Waktu Cetak', new Date().toLocaleString('id-ID')],
    [],
    ['RINGKASAN RAB VS REALISASI', 'Estimasi (IDR)', 'Realisasi (IDR)', 'Selisih (IDR)'],
    ['Total Pemasukan', estIncome, actualIncome, actualIncome - estIncome],
    ['Total Pengeluaran', estExpense, actualExpense, estExpense - actualExpense],
    [
      'Surplus / Defisit',
      estIncome - estExpense,
      actualIncome - actualExpense,
      actualIncome - actualExpense - (estIncome - estExpense),
    ],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summarySheet);
  wsSummary['!cols'] = [{ wch: 32 }, { wch: 22 }, { wch: 22 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan Acara');

  const rabData = payload.budgetItems.map((item) => ({
    Jenis: item.type === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran',
    'Pos / Uraian': item.item_name,
    Kategori: item.category_name,
    'Estimasi RAB (IDR)': item.estimated_amount,
    'Realisasi Kategori (IDR)': actualByCat.get(`${item.type}|${item.category_id}`) || 0,
    Catatan: item.notes || '-',
  }));
  for (const [key, total] of actualByCat.entries()) {
    if (!budgetedCatKeys.has(key)) {
      const [tType, catId] = key.split('|');
      const sample = activeTx.find((t) => t.type === tType && t.category_id === catId);
      rabData.push({
        Jenis: tType === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran',
        'Pos / Uraian': '(Transaksi di luar RAB)',
        Kategori: sample?.category_name || '-',
        'Estimasi RAB (IDR)': 0,
        'Realisasi Kategori (IDR)': total,
        Catatan: 'Otomatis dari transaksi terkait acara',
      });
    }
  }
  const wsRab = XLSX.utils.json_to_sheet(
    rabData.length
      ? rabData
      : [
          {
            Jenis: '-',
            'Pos / Uraian': 'Belum ada pos anggaran',
            Kategori: '-',
            'Estimasi RAB (IDR)': 0,
            'Realisasi Kategori (IDR)': 0,
            Catatan: '-',
          },
        ]
  );
  wsRab['!cols'] = [
    { wch: 14 },
    { wch: 28 },
    { wch: 22 },
    { wch: 20 },
    { wch: 24 },
    { wch: 28 },
  ];
  XLSX.utils.book_append_sheet(wb, wsRab, 'RAB vs Realisasi');

  const pData = participantRows.map((r) => ({
    'ID Anggota': r.member_code,
    'Nama Anggota': r.full_name,
    WhatsApp: r.whatsapp,
    'Target Iuran (IDR)': r.target,
    'Sudah Dibayar (IDR)': r.paid,
    'Kekurangan (IDR)': r.remaining,
    Status: r.status,
  }));
  const wsParticipants = XLSX.utils.json_to_sheet(
    pData.length
      ? pData
      : [
          {
            'ID Anggota': '-',
            'Nama Anggota': 'Belum ada peserta terdaftar',
            WhatsApp: '-',
            'Target Iuran (IDR)': 0,
            'Sudah Dibayar (IDR)': 0,
            'Kekurangan (IDR)': 0,
            Status: '-',
          },
        ]
  );
  wsParticipants['!cols'] = [
    { wch: 14 },
    { wch: 26 },
    { wch: 18 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 },
    { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, wsParticipants, 'Peserta & Iuran');

  const txData = activeTx.map((t) => ({
    'ID Transaksi': t.transaction_code,
    Tanggal: t.transaction_date,
    Jenis: t.type === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran',
    Kategori: t.category_name,
    'Anggota / Pihak': t.related_party,
    Keterangan: t.description,
    'Nominal (IDR)': t.amount,
    Petugas: t.created_by_name,
  }));
  const wsTx = XLSX.utils.json_to_sheet(
    txData.length
      ? txData
      : [
          {
            'ID Transaksi': '-',
            Tanggal: '-',
            Jenis: '-',
            Kategori: '-',
            'Anggota / Pihak': 'Belum ada transaksi acara',
            Keterangan: '-',
            'Nominal (IDR)': 0,
            Petugas: '-',
          },
        ]
  );
  wsTx['!cols'] = [
    { wch: 18 },
    { wch: 14 },
    { wch: 14 },
    { wch: 20 },
    { wch: 24 },
    { wch: 30 },
    { wch: 18 },
    { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, wsTx, 'Transaksi Acara');

  XLSX.writeFile(wb, `SENTRA-ANGLER_LPJ_${payload.event.event_code}.xlsx`);
}
