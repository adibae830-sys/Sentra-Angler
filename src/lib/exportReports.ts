import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { CashSummary, Member, ReportType, Transaction } from '../types';
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
