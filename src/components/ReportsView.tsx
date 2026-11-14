import React, { useMemo, useState } from 'react';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { exportReportToExcel, exportReportToPDF } from '../lib/exportReports';
import { formatDateID, formatIDR, getTodayISO } from '../lib/formatters';
import type {
  CashSummary,
  Member,
  ReportPeriod,
  ReportType,
  Transaction,
  UserProfile,
} from '../types';

interface ReportsViewProps {
  transactions: Transaction[];
  members: Member[];
  summary: CashSummary;
  currentUser: UserProfile;
}

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  kas_keseluruhan: 'Laporan Kas Keseluruhan',
  pemasukan: 'Laporan Pemasukan',
  pengeluaran: 'Laporan Pengeluaran',
  per_kategori: 'Laporan Per Kategori',
  kontribusi_anggota: 'Laporan Kontribusi Anggota',
};

const PERIOD_LABELS: Record<ReportPeriod, string> = {
  daily: 'Harian',
  weekly: 'Mingguan',
  monthly: 'Bulanan',
  yearly: 'Tahunan',
  custom: 'Rentang Tanggal',
};

export const ReportsView: React.FC<ReportsViewProps> = ({
  transactions,
  members,
  summary,
  currentUser,
}) => {
  const [reportType, setReportType] = useState<ReportType>('kas_keseluruhan');
  const [period, setPeriod] = useState<ReportPeriod>('monthly');
  const today = getTodayISO();
  const [customStart, setCustomStart] = useState(`${today.slice(0, 7)}-01`);
  const [customEnd, setCustomEnd] = useState(today);

  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`;

    if (period === 'daily') {
      const t = iso(now);
      return { startDate: t, endDate: t };
    }
    if (period === 'weekly') {
      const start = new Date(now);
      const day = start.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      start.setDate(start.getDate() + diff);
      return { startDate: iso(start), endDate: iso(now) };
    }
    if (period === 'monthly') {
      return { startDate: `${y}-${String(m + 1).padStart(2, '0')}-01`, endDate: iso(now) };
    }
    if (period === 'yearly') {
      return { startDate: `${y}-01-01`, endDate: `${y}-12-31` };
    }
    return {
      startDate: customStart <= customEnd ? customStart : customEnd,
      endDate: customEnd >= customStart ? customEnd : customStart,
    };
  }, [period, customStart, customEnd]);

  const scopedTransactions = useMemo(
    () =>
      transactions.filter(
        (t) =>
          !t.deleted_at &&
          t.transaction_date >= startDate &&
          t.transaction_date <= endDate
      ),
    [transactions, startDate, endDate]
  );

  const periodIncome = useMemo(
    () =>
      scopedTransactions
        .filter((t) => t.type === 'pemasukan')
        .reduce((a, b) => a + b.amount, 0),
    [scopedTransactions]
  );

  const periodExpense = useMemo(
    () =>
      scopedTransactions
        .filter((t) => t.type === 'pengeluaran')
        .reduce((a, b) => a + b.amount, 0),
    [scopedTransactions]
  );

  const categoryRows = useMemo(() => {
    const map = new Map<string, { name: string; type: string; count: number; total: number }>();
    for (const t of scopedTransactions) {
      const key = `${t.type}|${t.category_name}`;
      const prev = map.get(key) || {
        name: t.category_name,
        type: t.type,
        count: 0,
        total: 0,
      };
      prev.count += 1;
      prev.total += t.amount;
      map.set(key, prev);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [scopedTransactions]);

  const memberRows = useMemo(
    () =>
      members.map((m) => {
        const mTx = scopedTransactions.filter(
          (t) => t.member_id === m.id && t.type === 'pemasukan'
        );
        return {
          member: m,
          count: mTx.length,
          total: mTx.reduce((a, b) => a + b.amount, 0),
        };
      }),
    [members, scopedTransactions]
  );

  const ledgerRows = useMemo(() => {
    if (reportType === 'pemasukan') {
      return scopedTransactions.filter((t) => t.type === 'pemasukan');
    }
    if (reportType === 'pengeluaran') {
      return scopedTransactions.filter((t) => t.type === 'pengeluaran');
    }
    return scopedTransactions;
  }, [scopedTransactions, reportType]);

  const handleExportPDF = () => {
    exportReportToPDF({
      reportType,
      periodLabel: PERIOD_LABELS[period],
      startDate,
      endDate,
      transactions: scopedTransactions,
      members,
      summary,
      generatedBy: currentUser.full_name,
    });
  };

  const handleExportExcel = () => {
    exportReportToExcel({
      reportType,
      periodLabel: PERIOD_LABELS[period],
      startDate,
      endDate,
      transactions: scopedTransactions,
      members,
      summary,
      generatedBy: currentUser.full_name,
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900">
            Laporan Keuangan & Ekspor
          </h2>
          <p className="text-xs text-slate-500">
            Seluruh anggota dapat mengunduh laporan resmi beridentitas SENTRA ANGLER dalam format
            PDF & Excel.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportPDF}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#0B192C] hover:bg-[#132947] text-white text-xs font-semibold cursor-pointer"
          >
            <FileText className="w-4 h-4 text-orange-400" />
            <span>Unduh PDF</span>
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Unduh Excel</span>
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="rounded-2xl bg-white border border-slate-200 p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Jenis Laporan
            </label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as ReportType)}
              className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
            >
              {(Object.keys(REPORT_TYPE_LABELS) as ReportType[]).map((k) => (
                <option key={k} value={k}>
                  {REPORT_TYPE_LABELS[k]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Periode Laporan
            </label>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto">
              {(Object.keys(PERIOD_LABELS) as ReportPeriod[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    period === p
                      ? 'bg-white text-[#0B192C] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {period === 'custom' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Dari Tanggal
              </label>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-mono-num"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Sampai Tanggal
              </label>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-mono-num"
              />
            </div>
          </div>
        )}

        <div className="pt-3 border-t border-slate-100 grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div>
            <span className="text-slate-500 block">Rentang Tanggal</span>
            <span className="font-semibold font-mono-num text-slate-900">
              {formatDateID(startDate)} – {formatDateID(endDate)}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Pemasukan Periode</span>
            <span className="font-bold font-mono-num text-emerald-700">
              {formatIDR(periodIncome)}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Pengeluaran Periode</span>
            <span className="font-bold font-mono-num text-red-700">
              {formatIDR(periodExpense)}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Saldo Kas Saat Ini</span>
            <span className="font-bold font-mono-num text-[#0B192C]">
              {formatIDR(summary.current_balance)}
            </span>
          </div>
        </div>
      </div>

      {/* Live Preview Table */}
      <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-display text-sm font-bold text-slate-900">
            Pratinjau: {REPORT_TYPE_LABELS[reportType]}
          </h3>
          <span className="text-xs text-slate-500 font-mono-num">
            {reportType === 'per_kategori'
              ? `${categoryRows.length} kategori`
              : reportType === 'kontribusi_anggota'
              ? `${memberRows.length} anggota`
              : `${ledgerRows.length} transaksi`}
          </span>
        </div>

        <div className="overflow-x-auto">
          {reportType === 'per_kategori' ? (
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600 bg-slate-50/50">
                  <th className="py-3 px-4">Kategori</th>
                  <th className="py-3 px-4">Jenis</th>
                  <th className="py-3 px-4 text-right">Frekuensi</th>
                  <th className="py-3 px-4 text-right">Total Nominal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {categoryRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-500 text-xs">
                      Tidak ada transaksi pada periode ini.
                    </td>
                  </tr>
                ) : (
                  categoryRows.map((r) => (
                    <tr key={`${r.type}-${r.name}`}>
                      <td className="py-3 px-4 font-medium text-slate-900">{r.name}</td>
                      <td className="py-3 px-4 text-slate-600">
                        {r.type === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-num text-slate-700">
                        {r.count}
                      </td>
                      <td className="py-3 px-4 text-right font-bold font-mono-num text-slate-900">
                        {formatIDR(r.total)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : reportType === 'kontribusi_anggota' ? (
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600 bg-slate-50/50">
                  <th className="py-3 px-4">ID Anggota</th>
                  <th className="py-3 px-4">Nama Anggota</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Setoran Periode Ini</th>
                  <th className="py-3 px-4 text-right">Total Nominal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {memberRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500 text-xs">
                      Belum ada anggota terdaftar.
                    </td>
                  </tr>
                ) : (
                  memberRows.map((r) => (
                    <tr key={r.member.id}>
                      <td className="py-3 px-4 font-mono-num text-xs font-semibold text-orange-600">
                        {r.member.member_code}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900">
                        {r.member.full_name}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {r.member.status === 'active' ? 'Aktif' : 'Nonaktif'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-num text-slate-700">
                        {r.count}x
                      </td>
                      <td className="py-3 px-4 text-right font-bold font-mono-num text-emerald-700">
                        {formatIDR(r.total)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600 bg-slate-50/50">
                  <th className="py-3 px-4">Kode</th>
                  <th className="py-3 px-4">Tanggal</th>
                  <th className="py-3 px-4">Kategori</th>
                  <th className="py-3 px-4">Pihak Terkait</th>
                  <th className="py-3 px-4">Keterangan</th>
                  <th className="py-3 px-4 text-right">Nominal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledgerRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">
                      Tidak ada transaksi pada periode ini.
                    </td>
                  </tr>
                ) : (
                  ledgerRows.map((t) => (
                    <tr key={t.id}>
                      <td className="py-3 px-4 font-mono-num text-xs font-semibold text-slate-700">
                        {t.transaction_code}
                      </td>
                      <td className="py-3 px-4 font-mono-num text-xs text-slate-600">
                        {formatDateID(t.transaction_date)}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900">{t.category_name}</td>
                      <td className="py-3 px-4 text-slate-700">{t.related_party}</td>
                      <td className="py-3 px-4 text-slate-500 max-w-xs truncate">
                        {t.description || '-'}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-bold font-mono-num ${
                          t.type === 'pemasukan' ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {t.type === 'pemasukan' ? '+' : '−'} {formatIDR(t.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
