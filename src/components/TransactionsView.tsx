import React, { useMemo, useState } from 'react';
import {
  Archive,
  ArrowDownLeft,
  ArrowUpRight,
  Edit3,
  Eye,
  Paperclip,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { dataService } from '../lib/dataService';
import { formatDateID, formatDateTimeID, formatIDR } from '../lib/formatters';
import type { Category, Member, Transaction, UserProfile } from '../types';

interface TransactionsViewProps {
  transactions: Transaction[];
  categories: Category[];
  members: Member[];
  currentUser: UserProfile;
  isOnline: boolean;
  onAddNew: () => void;
  onEdit: (tx: Transaction) => void;
  onRefresh: () => Promise<void>;
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({
  transactions,
  categories,
  members,
  currentUser,
  isOnline,
  onAddNew,
  onEdit,
  onRefresh,
}) => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'pemasukan' | 'pengeluaran'>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [memberFilter, setMemberFilter] = useState('all');
  const [showArchived, setShowArchived] = useState(false);

  const [detailTx, setDetailTx] = useState<Transaction | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const isBendahara = currentUser.role === 'bendahara';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((t) => {
      if (showArchived ? !t.deleted_at : Boolean(t.deleted_at)) return false;
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;
      if (categoryFilter !== 'all' && t.category_id !== categoryFilter) return false;
      if (memberFilter !== 'all' && t.member_id !== memberFilter) return false;
      if (q) {
        const hay =
          `${t.transaction_code} ${t.category_name} ${t.related_party} ${t.description} ${t.created_by_name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, showArchived, typeFilter, categoryFilter, memberFilter, search]);

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    setActionError(null);
    try {
      await dataService.softDeleteTransaction(
        deleteTarget,
        deleteReason || 'Dihapus oleh Bendahara',
        currentUser
      );
      setDeleteTarget(null);
      setDeleteReason('');
      await onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal mengarsipkan transaksi.');
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async (tx: Transaction) => {
    setBusy(true);
    setActionError(null);
    try {
      await dataService.restoreTransaction(tx, currentUser);
      await onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal memulihkan transaksi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900">
            {showArchived ? 'Arsip Transaksi (Soft Delete)' : 'Buku Kas & Transaksi'}
          </h2>
          <p className="text-xs text-slate-500">
            {showArchived
              ? 'Transaksi yang diarsipkan tidak dihitung dalam saldo dan dapat dipulihkan Bendahara.'
              : 'Seluruh anggota dapat memeriksa rincian pemasukan, pengeluaran, dan bukti transaksi.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
              showArchived
                ? 'bg-[#0B192C] text-white border-[#0B192C]'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Archive className="w-4 h-4" />
            <span>{showArchived ? 'Kembali ke Buku Kas' : 'Lihat Arsip'}</span>
          </button>

          {isBendahara && !showArchived && (
            <button
              type="button"
              disabled={!isOnline}
              onClick={onAddNew}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Catat Transaksi</span>
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700">
          {actionError}
        </div>
      )}

      {/* Search & Filters Bar */}
      <div className="rounded-2xl bg-white border border-slate-200 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari kode, nama, keterangan..."
            className="w-full h-10 pl-10 pr-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
          />
        </div>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as 'all' | 'pemasukan' | 'pengeluaran')}
          className="h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
        >
          <option value="all">Semua Jenis Transaksi</option>
          <option value="pemasukan">Hanya Pemasukan</option>
          <option value="pengeluaran">Hanya Pengeluaran</option>
        </select>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
        >
          <option value="all">Semua Kategori</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.type === 'pemasukan' ? 'Masuk' : 'Keluar'})
            </option>
          ))}
        </select>

        <select
          value={memberFilter}
          onChange={(e) => setMemberFilter(e.target.value)}
          className="h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
        >
          <option value="all">Semua Anggota / Pihak</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.member_code} · {m.full_name}
            </option>
          ))}
        </select>
      </div>

      {/* Empty State */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200 p-10 text-center">
          <p className="text-sm font-semibold text-slate-800">
            {showArchived
              ? 'Tidak ada transaksi di dalam arsip'
              : 'Tidak ada transaksi yang sesuai filter'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {showArchived
              ? 'Transaksi yang dihapus oleh Bendahara akan tersimpan aman di sini.'
              : 'Coba ubah kata kunci pencarian atau catat transaksi kas baru.'}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden lg:block rounded-2xl bg-white border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">ID & Tanggal</th>
                    <th className="py-3 px-4">Jenis & Kategori</th>
                    <th className="py-3 px-4">Anggota / Pihak Terkait</th>
                    <th className="py-3 px-4">Keterangan</th>
                    <th className="py-3 px-4">Petugas</th>
                    <th className="py-3 px-4 text-right">Nominal</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filtered.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-mono-num text-xs font-semibold text-slate-900">
                          {tx.transaction_code}
                        </div>
                        <div className="font-mono-num text-xs text-slate-500">
                          {formatDateID(tx.transaction_date)}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                              tx.type === 'pemasukan'
                                ? 'bg-emerald-50 text-emerald-600'
                                : 'bg-red-50 text-red-600'
                            }`}
                          >
                            {tx.type === 'pemasukan' ? (
                              <ArrowDownLeft className="w-3.5 h-3.5" />
                            ) : (
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            )}
                          </span>
                          <div>
                            <div className="font-medium text-slate-900">{tx.category_name}</div>
                            <div className="text-xs text-slate-500">
                              {tx.type === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-800">{tx.related_party}</td>
                      <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                        {tx.description || '-'}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="text-xs font-medium text-slate-800">{tx.created_by_name}</div>
                        <div className="text-[11px] text-slate-400 font-mono-num">
                          {formatDateTimeID(tx.created_at)}
                        </div>
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-bold font-mono-num whitespace-nowrap ${
                          tx.type === 'pemasukan' ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {tx.type === 'pemasukan' ? '+' : '−'} {formatIDR(tx.amount)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setDetailTx(tx)}
                            title="Lihat Detail & Bukti"
                            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                          >
                            {tx.attachments && tx.attachments.length > 0 ? (
                              <Paperclip className="w-4 h-4 text-orange-500" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>

                          {isBendahara && !showArchived && (
                            <>
                              <button
                                type="button"
                                disabled={!isOnline}
                                onClick={() => onEdit(tx)}
                                title="Edit Transaksi"
                                className="p-2 rounded-lg text-slate-500 hover:text-[#0B192C] hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                disabled={!isOnline}
                                onClick={() => setDeleteTarget(tx)}
                                title="Arsipkan / Hapus"
                                className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}

                          {isBendahara && showArchived && (
                            <button
                              type="button"
                              disabled={!isOnline || busy}
                              onClick={() => handleRestore(tx)}
                              title="Pulihkan Transaksi"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-semibold cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Pulihkan</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card List View */}
          <div className="lg:hidden space-y-3">
            {filtered.map((tx) => (
              <div
                key={tx.id}
                onClick={() => setDetailTx(tx)}
                className="rounded-2xl bg-white border border-slate-200 p-4 active:scale-[0.99] transition-transform cursor-pointer"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        tx.type === 'pemasukan'
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-red-50 text-red-600'
                      }`}
                    >
                      {tx.type === 'pemasukan' ? (
                        <ArrowDownLeft className="w-5 h-5" />
                      ) : (
                        <ArrowUpRight className="w-5 h-5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">
                        {tx.category_name}
                      </p>
                      <p className="text-xs text-slate-600 truncate">{tx.related_party}</p>
                      <p className="mt-1 text-[11px] text-slate-400 font-mono-num">
                        {tx.transaction_code} · {formatDateID(tx.transaction_date)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={`text-sm font-bold font-mono-num ${
                        tx.type === 'pemasukan' ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {tx.type === 'pemasukan' ? '+' : '−'} {formatIDR(tx.amount)}
                    </p>
                    {tx.attachments && tx.attachments.length > 0 && (
                      <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-orange-600">
                        <Paperclip className="w-3 h-3" /> Bukti
                      </span>
                    )}
                  </div>
                </div>

                {tx.description && (
                  <p className="mt-2.5 text-xs text-slate-600 line-clamp-2">{tx.description}</p>
                )}

                {isBendahara && (
                  <div
                    className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-end gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {!showArchived ? (
                      <>
                        <button
                          type="button"
                          disabled={!isOnline}
                          onClick={() => onEdit(tx)}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={!isOnline}
                          onClick={() => setDeleteTarget(tx)}
                          className="px-3 py-1.5 rounded-lg border border-red-200 text-xs font-medium text-red-600 hover:bg-red-50 cursor-pointer"
                        >
                          Arsipkan
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={!isOnline || busy}
                        onClick={() => handleRestore(tx)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold cursor-pointer"
                      >
                        Pulihkan
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Detail & Receipt Preview Modal */}
      {detailTx && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <p className="font-mono-num text-xs font-semibold text-orange-600">
                  {detailTx.transaction_code}
                </p>
                <h3 className="font-display text-lg font-bold text-slate-900 mt-0.5">
                  {detailTx.category_name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDetailTx(null)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Nominal</span>
                <span
                  className={`font-bold font-mono-num ${
                    detailTx.type === 'pemasukan' ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {detailTx.type === 'pemasukan' ? '+' : '−'} {formatIDR(detailTx.amount)}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Tanggal Transaksi</span>
                <span className="font-mono-num text-slate-900">
                  {formatDateID(detailTx.transaction_date)}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Anggota / Pihak Terkait</span>
                <span className="font-medium text-slate-900">{detailTx.related_party}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Petugas Pencatat</span>
                <span className="text-slate-900">{detailTx.created_by_name}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Waktu Pencatatan</span>
                <span className="font-mono-num text-xs text-slate-700">
                  {formatDateTimeID(detailTx.created_at)}
                </span>
              </div>
              <div className="pt-1">
                <span className="text-slate-500 block mb-1">Keterangan</span>
                <p className="text-slate-800 bg-slate-50 rounded-xl p-3 text-xs leading-relaxed">
                  {detailTx.description || 'Tidak ada keterangan tambahan.'}
                </p>
              </div>

              {detailTx.deleted_at && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-800">
                  Diarsipkan pada {formatDateTimeID(detailTx.deleted_at)} oleh{' '}
                  <strong>{detailTx.deleted_by_name}</strong>. Alasan: {detailTx.delete_reason}
                </div>
              )}

              {detailTx.attachments && detailTx.attachments.length > 0 && (
                <div className="pt-2">
                  <span className="text-slate-500 block mb-2 text-xs font-semibold">
                    Bukti Transaksi
                  </span>
                  {detailTx.attachments.map((att) => (
                    <div
                      key={att.id}
                      className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50"
                    >
                      {att.mime_type.startsWith('image/') ? (
                        <img
                          src={att.file_url}
                          alt={att.file_name}
                          referrerPolicy="no-referrer"
                          className="w-full max-h-64 object-contain bg-slate-900/5"
                        />
                      ) : null}
                      <div className="p-3 flex items-center justify-between text-xs">
                        <span className="truncate font-medium text-slate-700">{att.file_name}</span>
                        <a
                          href={att.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-orange-600 font-semibold hover:underline shrink-0 ml-3"
                        >
                          Buka File
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Soft Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
            <h3 className="font-display text-lg font-bold text-slate-900">
              Konfirmasi Arsip Transaksi
            </h3>
            <p className="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
              Transaksi{' '}
              <strong className="font-mono-num text-slate-900">
                {deleteTarget.transaction_code}
              </strong>{' '}
              ({deleteTarget.category_name} —{' '}
              <strong className="font-mono-num">{formatIDR(deleteTarget.amount)}</strong>) akan
              dipindahkan ke <strong>Arsip (Soft Delete)</strong> dan dicatat di Audit Log.
            </p>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Alasan Penghapusan / Koreksi
              </label>
              <input
                type="text"
                required
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Contoh: Salah input nominal / duplikat"
                className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
              />
            </div>

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteReason('');
                }}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-semibold cursor-pointer"
              >
                {busy ? 'Mengarsipkan...' : 'Ya, Arsipkan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
