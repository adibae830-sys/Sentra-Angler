import React, { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  Plus,
  Users,
  Wallet,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatDateID, formatIDR } from '../lib/formatters';
import type {
  CashSummary,
  DashboardPeriod,
  Member,
  Transaction,
  UserRole,
} from '../types';

interface DashboardViewProps {
  role: UserRole;
  summary: CashSummary;
  transactions: Transaction[];
  members: Member[];
  isOnline: boolean;
  onOpenInitialBalance: () => void;
  onAddTransaction: () => void;
  onNavigateTransactions: () => void;
}

const PERIOD_LABELS: Record<DashboardPeriod, string> = {
  this_month: 'Bulan ini',
  last_month: 'Bulan sebelumnya',
  this_year: 'Tahun ini',
  all: 'Semua periode',
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  role,
  summary,
  transactions,
  members,
  isOnline,
  onOpenInitialBalance,
  onAddTransaction,
  onNavigateTransactions,
}) => {
  const [period, setPeriod] = useState<DashboardPeriod>('this_month');

  const activeTransactions = useMemo(
    () => transactions.filter((t) => !t.deleted_at),
    [transactions]
  );

  const filteredTransactions = useMemo(() => {
    const now = new Date();
    const curY = now.getFullYear();
    const curM = now.getMonth();
    const prevDate = new Date(curY, curM - 1, 1);
    const prevY = prevDate.getFullYear();
    const prevM = prevDate.getMonth();

    return activeTransactions.filter((t) => {
      if (period === 'all') return true;
      const d = new Date(`${t.transaction_date}T00:00:00`);
      if (Number.isNaN(d.getTime())) return false;
      if (period === 'this_month') {
        return d.getFullYear() === curY && d.getMonth() === curM;
      }
      if (period === 'last_month') {
        return d.getFullYear() === prevY && d.getMonth() === prevM;
      }
      if (period === 'this_year') {
        return d.getFullYear() === curY;
      }
      return true;
    });
  }, [activeTransactions, period]);

  const periodIncome = useMemo(
    () =>
      filteredTransactions
        .filter((t) => t.type === 'pemasukan')
        .reduce((acc, t) => acc + t.amount, 0),
    [filteredTransactions]
  );

  const periodExpense = useMemo(
    () =>
      filteredTransactions
        .filter((t) => t.type === 'pengeluaran')
        .reduce((acc, t) => acc + t.amount, 0),
    [filteredTransactions]
  );

  const activeMembersCount = useMemo(
    () => members.filter((m) => m.status === 'active').length,
    [members]
  );

  // Chart data: group by month or day depending on period
  const chartSeries = useMemo(() => {
    const sorted = [...filteredTransactions].sort((a, b) =>
      a.transaction_date.localeCompare(b.transaction_date)
    );

    const groupByMonth = period === 'this_year' || period === 'all';
    const buckets = new Map<string, { label: string; pemasukan: number; pengeluaran: number }>();

    for (const t of sorted) {
      const key = groupByMonth ? t.transaction_date.slice(0, 7) : t.transaction_date;
      const label = groupByMonth
        ? new Intl.DateTimeFormat('id-ID', { month: 'short', year: '2-digit' }).format(
            new Date(`${key}-01T00:00:00`)
          )
        : formatDateID(key).slice(0, 6);
      const curr = buckets.get(key) || { label, pemasukan: 0, pengeluaran: 0 };
      if (t.type === 'pemasukan') curr.pemasukan += t.amount;
      else curr.pengeluaran += t.amount;
      buckets.set(key, curr);
    }

    // Running balance trajectory starting from initial_balance + prior transactions
    let runningBalance = summary.initial_balance;
    if (sorted.length > 0) {
      const firstDate = sorted[0].transaction_date;
      for (const t of activeTransactions) {
        if (t.transaction_date < firstDate) {
          runningBalance += t.type === 'pemasukan' ? t.amount : -t.amount;
        }
      }
    }

    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, val]) => {
        runningBalance += val.pemasukan - val.pengeluaran;
        return {
          ...val,
          saldo: runningBalance,
        };
      });
  }, [filteredTransactions, activeTransactions, period, summary.initial_balance]);

  // Category summary
  const categoryBreakdown = useMemo(() => {
    const map = new Map<
      string,
      { name: string; type: 'pemasukan' | 'pengeluaran'; total: number; count: number }
    >();
    for (const t of filteredTransactions) {
      const key = `${t.type}:${t.category_name}`;
      const curr = map.get(key) || {
        name: t.category_name,
        type: t.type,
        total: 0,
        count: 0,
      };
      curr.total += t.amount;
      curr.count += 1;
      map.set(key, curr);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filteredTransactions]);

  const latestTransactions = useMemo(() => activeTransactions.slice(0, 6), [activeTransactions]);

  return (
    <div className="space-y-6">
      {/* First-time Initial Balance Prompt for Bendahara */}
      {!summary.initial_balance_set && role === 'bendahara' && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50/70 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-sm font-bold text-slate-900">
              Saldo Awal Kas Belum Ditetapkan
            </h3>
            <p className="mt-1 text-xs sm:text-sm text-slate-700">
              Tetapkan saldo kas awal komunitas sebelum memulai pencatatan transaksi rutin.
            </p>
          </div>
          <button
            type="button"
            disabled={!isOnline}
            onClick={onOpenInitialBalance}
            className="px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer"
          >
            Atur Saldo Awal Kas
          </button>
        </div>
      )}

      {/* Period Filter Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900">Ringkasan Keuangan</h2>
          <p className="text-xs text-slate-500">
            Menampilkan statistik periode:{' '}
            <strong className="text-slate-700">{PERIOD_LABELS[period]}</strong>
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl overflow-x-auto">
          {(Object.keys(PERIOD_LABELS) as DashboardPeriod[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setPeriod(key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                period === key
                  ? 'bg-white text-[#0B192C] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {PERIOD_LABELS[key]}
            </button>
          ))}
        </div>
      </div>

      {/* Hero Saldo Card + 3 KPI Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Large Navy Balance Card */}
        <div className="lg:col-span-5 rounded-2xl bg-[#0B192C] text-white p-6 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute -right-10 -top-10 w-44 h-44 rounded-full bg-orange-500/15 blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-300">Saldo Kas Saat Ini</span>
            <Wallet className="w-5 h-5 text-orange-400" />
          </div>

          <div className="my-4">
            <p className="font-display text-3xl sm:text-4xl font-bold tracking-tight font-mono-num text-white">
              {formatIDR(summary.current_balance)}
            </p>
            <p className="mt-2 text-xs text-slate-300 font-mono-num">
              Saldo Awal {formatIDR(summary.initial_balance)} + Masuk{' '}
              {formatIDR(summary.total_income)} − Keluar {formatIDR(summary.total_expense)}
            </p>
          </div>

          <div className="pt-4 border-t border-white/10 flex items-center justify-between text-xs text-slate-300">
            <span>Dihitung otomatis dari buku kas</span>
            {role === 'bendahara' && !summary.initial_balance_set && (
              <button
                type="button"
                onClick={onOpenInitialBalance}
                className="text-orange-400 hover:text-orange-300 font-semibold cursor-pointer"
              >
                Set Saldo Awal →
              </button>
            )}
          </div>
        </div>

        {/* 3 Metrics */}
        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl bg-white border border-slate-200 p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">
                Pemasukan ({PERIOD_LABELS[period]})
              </span>
              <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <ArrowDownLeft className="w-4 h-4" />
              </span>
            </div>
            <p className="mt-4 font-display text-2xl font-bold font-mono-num text-emerald-700">
              {formatIDR(periodIncome)}
            </p>
            <p className="mt-2 text-xs text-slate-500 font-mono-num">
              {filteredTransactions.filter((t) => t.type === 'pemasukan').length} transaksi masuk
            </p>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200 p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">
                Pengeluaran ({PERIOD_LABELS[period]})
              </span>
              <span className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
                <ArrowUpRight className="w-4 h-4" />
              </span>
            </div>
            <p className="mt-4 font-display text-2xl font-bold font-mono-num text-red-700">
              {formatIDR(periodExpense)}
            </p>
            <p className="mt-2 text-xs text-slate-500 font-mono-num">
              {filteredTransactions.filter((t) => t.type === 'pengeluaran').length} transaksi keluar
            </p>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200 p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Anggota Aktif</span>
              <span className="w-8 h-8 rounded-lg bg-slate-100 text-[#0B192C] flex items-center justify-center">
                <Users className="w-4 h-4" />
              </span>
            </div>
            <p className="mt-4 font-display text-2xl font-bold font-mono-num text-slate-900">
              {activeMembersCount}{' '}
              <span className="text-sm font-normal text-slate-400">/ 30</span>
            </p>
            <div className="mt-2">
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-500 rounded-full"
                  style={{ width: `${Math.min(100, (members.length / 30) * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-500 font-mono-num">
                {members.length} terdaftar dari maks. 30
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Income vs Expense Bar Chart */}
        <div className="rounded-2xl bg-white border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900">
                Pemasukan vs Pengeluaran
              </h3>
              <p className="text-xs text-slate-500">Arus kas berdasarkan periode terpilih</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-600">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#0B192C]" /> Masuk
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#F97316]" /> Keluar
              </span>
            </div>
          </div>

          {chartSeries.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center border border-dashed border-slate-200 rounded-xl p-6">
              <p className="text-sm font-medium text-slate-700">
                Belum ada transaksi pada periode ini
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Grafik arus kas akan terisi otomatis setelah transaksi dicatat.
              </p>
              {role === 'bendahara' && (
                <button
                  type="button"
                  disabled={!isOnline}
                  onClick={onAddTransaction}
                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0B192C] text-white text-xs font-semibold hover:bg-[#132947] disabled:opacity-50 cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-orange-400" />
                  <span>Catat Transaksi Pertama</span>
                </button>
              )}
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => (v >= 1000000 ? `${(v / 1000000).toFixed(1)}jt` : `${Math.round(v / 1000)}rb`)}
                  />
                  <Tooltip
                    formatter={(value) => formatIDR(Number(value ?? 0))}
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #E2E8F0',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="pemasukan" name="Pemasukan" fill="#0B192C" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="pengeluaran" name="Pengeluaran" fill="#F97316" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Cumulative Balance Trend */}
        <div className="rounded-2xl bg-white border border-slate-200 p-5">
          <div className="mb-4">
            <h3 className="font-display text-base font-bold text-slate-900">
              Perkembangan Saldo Kas
            </h3>
            <p className="text-xs text-slate-500">Tren akumulasi saldo dari waktu ke waktu</p>
          </div>

          {chartSeries.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center border border-dashed border-slate-200 rounded-xl p-6">
              <p className="text-sm font-medium text-slate-700">Grafik saldo menunggu transaksi</p>
              <p className="mt-1 text-xs text-slate-500 font-mono-num">
                Saldo awal tercatat: {formatIDR(summary.initial_balance)}
              </p>
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="saldoGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0B192C" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#0B192C" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => (v >= 1000000 ? `${(v / 1000000).toFixed(1)}jt` : `${Math.round(v / 1000)}rb`)}
                  />
                  <Tooltip
                    formatter={(value) => formatIDR(Number(value ?? 0))}
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #E2E8F0',
                      fontSize: '12px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="saldo"
                    name="Saldo Kas"
                    stroke="#0B192C"
                    strokeWidth={2.5}
                    fill="url(#saldoGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Row: Latest Transactions + Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Latest Transactions */}
        <div className="lg:col-span-7 rounded-2xl bg-white border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900">Transaksi Terakhir</h3>
              <p className="text-xs text-slate-500">Catatan kas terbaru yang masuk ke database</p>
            </div>
            <button
              type="button"
              onClick={onNavigateTransactions}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#0B192C] hover:text-orange-600 cursor-pointer"
            >
              <span>Lihat Semua</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {latestTransactions.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              Belum ada transaksi yang tercatat.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {latestTransactions.map((tx) => (
                <div key={tx.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        tx.type === 'pemasukan'
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-red-50 text-red-600'
                      }`}
                    >
                      {tx.type === 'pemasukan' ? (
                        <ArrowDownLeft className="w-4 h-4" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {tx.category_name}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {tx.related_party} · {formatDateID(tx.transaction_date)} ·{' '}
                        <span className="font-mono-num">{tx.transaction_code}</span>
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-sm font-bold font-mono-num whitespace-nowrap shrink-0 ${
                      tx.type === 'pemasukan' ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {tx.type === 'pemasukan' ? '+' : '−'} {formatIDR(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Category Summary */}
        <div className="lg:col-span-5 rounded-2xl bg-white border border-slate-200 p-5">
          <div className="mb-4">
            <h3 className="font-display text-base font-bold text-slate-900">
              Ringkasan Per Kategori
            </h3>
            <p className="text-xs text-slate-500">Periode: {PERIOD_LABELS[period]}</p>
          </div>

          {categoryBreakdown.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              Belum ada ringkasan kategori pada periode ini.
            </div>
          ) : (
            <div className="space-y-3.5 max-h-80 overflow-y-auto pr-1">
              {categoryBreakdown.map((item) => {
                const denom = item.type === 'pemasukan' ? periodIncome : periodExpense;
                const pct = denom > 0 ? Math.round((item.total / denom) * 100) : 0;
                return (
                  <div key={`${item.type}-${item.name}`}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium text-slate-800 truncate">
                        {item.name}{' '}
                        <span className="text-slate-400">
                          ({item.type === 'pemasukan' ? 'Masuk' : 'Keluar'} · {item.count}x)
                        </span>
                      </span>
                      <span className="font-semibold font-mono-num text-slate-900 whitespace-nowrap ml-2">
                        {formatIDR(item.total)}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          item.type === 'pemasukan' ? 'bg-[#0B192C]' : 'bg-orange-500'
                        }`}
                        style={{ width: `${Math.max(4, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
