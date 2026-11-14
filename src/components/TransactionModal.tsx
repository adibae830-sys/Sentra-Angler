import React, { useEffect, useMemo, useState } from 'react';
import { Paperclip, Upload, X } from 'lucide-react';
import { dataService } from '../lib/dataService';
import { formatIDR, getTodayISO } from '../lib/formatters';
import type { Category, Member, Transaction, TransactionType, UserProfile } from '../types';

interface TransactionModalProps {
  isOpen: boolean;
  editingTransaction: Transaction | null;
  categories: Category[];
  members: Member[];
  currentUser: UserProfile;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  editingTransaction,
  categories,
  members,
  currentUser,
  onClose,
  onSaved,
}) => {
  const [type, setType] = useState<TransactionType>('pemasukan');
  const [transactionDate, setTransactionDate] = useState(getTodayISO());
  const [categoryId, setCategoryId] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [memberId, setMemberId] = useState('');
  const [relatedParty, setRelatedParty] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableCategories = useMemo(
    () => categories.filter((c) => c.type === type && c.is_active),
    [categories, type]
  );

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setFile(null);
    if (editingTransaction) {
      setType(editingTransaction.type);
      setTransactionDate(editingTransaction.transaction_date);
      setCategoryId(editingTransaction.category_id);
      setAmountInput(String(Math.round(editingTransaction.amount)));
      setMemberId(editingTransaction.member_id || '');
      setRelatedParty(editingTransaction.related_party === '-' ? '' : editingTransaction.related_party);
      setDescription(editingTransaction.description || '');
    } else {
      setType('pemasukan');
      setTransactionDate(getTodayISO());
      const firstCat = categories.find((c) => c.type === 'pemasukan' && c.is_active);
      setCategoryId(firstCat?.id || '');
      setAmountInput('');
      setMemberId('');
      setRelatedParty('');
      setDescription('');
    }
  }, [isOpen, editingTransaction, categories]);

  useEffect(() => {
    if (!isOpen) return;
    const exists = availableCategories.some((c) => c.id === categoryId);
    if (!exists) {
      setCategoryId(availableCategories[0]?.id || '');
    }
  }, [type, availableCategories, categoryId, isOpen]);

  if (!isOpen) return null;

  const numericAmount = Number(amountInput.replace(/\D/g, '')) || 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (numericAmount <= 0) {
      setError('Nominal transaksi harus lebih dari Rp 0.');
      return;
    }
    if (!categoryId) {
      setError('Silakan pilih kategori transaksi.');
      return;
    }

    setSaving(true);
    try {
      let uploadedAttachment = null;
      if (file) {
        uploadedAttachment = await dataService.uploadFile(file);
      }

      const selectedCategory = categories.find((c) => c.id === categoryId);
      const selectedMember = members.find((m) => m.id === memberId);
      const partyName = selectedMember
        ? selectedMember.full_name
        : relatedParty.trim() || '-';

      const payload = {
        transaction_date: transactionDate,
        type,
        category_id: categoryId,
        category_name: selectedCategory?.name || '',
        amount: numericAmount,
        member_id: memberId || null,
        related_party: partyName,
        description: description.trim(),
        attachment: uploadedAttachment,
      };

      if (editingTransaction) {
        await dataService.updateTransaction(
          editingTransaction.id,
          editingTransaction,
          payload,
          currentUser
        );
      } else {
        await dataService.createTransaction(payload, currentUser);
      }
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan transaksi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h3 className="font-display text-lg font-bold text-slate-900">
              {editingTransaction
                ? `Edit Transaksi ${editingTransaction.transaction_code}`
                : 'Catat Transaksi Baru'}
            </h3>
            <p className="text-xs text-slate-500">
              Petugas Pencatat: <strong className="text-slate-700">{currentUser.full_name}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Segmented Type Selector */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setType('pemasukan')}
              className={`py-2.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                type === 'pemasukan'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pemasukan (Kas Masuk)
            </button>
            <button
              type="button"
              onClick={() => setType('pengeluaran')}
              className={`py-2.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                type === 'pengeluaran'
                  ? 'bg-orange-500 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pengeluaran (Kas Keluar)
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Tanggal Transaksi
              </label>
              <input
                type="date"
                required
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm font-mono-num text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Kategori</label>
              <select
                required
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
              >
                {availableCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Nominal (IDR)
            </label>
            <input
              type="text"
              inputMode="numeric"
              required
              placeholder="Contoh: 150000"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value.replace(/\D/g, ''))}
              className="w-full h-12 px-4 rounded-xl border border-slate-300 text-lg font-bold font-mono-num text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
            />
            <p className="mt-1 text-xs text-slate-500 font-mono-num">
              Terbaca: <strong className="text-slate-900">{formatIDR(numericAmount)}</strong>
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Tautkan Anggota (Opsional)
              </label>
              <select
                value={memberId}
                onChange={(e) => {
                  setMemberId(e.target.value);
                  if (e.target.value) {
                    const found = members.find((m) => m.id === e.target.value);
                    if (found) setRelatedParty(found.full_name);
                  }
                }}
                className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
              >
                <option value="">-- Pihak Eksternal / Umum --</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.member_code} · {m.full_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Nama Anggota / Pihak Terkait
              </label>
              <input
                type="text"
                value={relatedParty}
                onChange={(e) => setRelatedParty(e.target.value)}
                disabled={Boolean(memberId)}
                placeholder="Contoh: Toko Pancing Jaya / Nama"
                className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm text-slate-900 disabled:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Keterangan Transaksi
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detail keperluan, lokasi kolam/spot, atau catatan pembayaran..."
              className="w-full p-3 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Bukti Transaksi (Foto Struk / Transfer / PDF, maks. 5 MB)
            </label>
            <label className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer">
              <div className="flex items-center gap-2.5 min-w-0">
                <Upload className="w-4 h-4 text-orange-500 shrink-0" />
                <span className="text-xs text-slate-700 truncate">
                  {file
                    ? file.name
                    : editingTransaction?.attachments?.[0]
                    ? `Terlampir: ${editingTransaction.attachments[0].file_name} (klik untuk ganti)`
                    : 'Pilih foto struk atau bukti transfer...'}
                </span>
              </div>
              <Paperclip className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-[#0B192C] hover:bg-[#132947] disabled:opacity-60 text-white text-sm font-semibold cursor-pointer"
            >
              {saving
                ? 'Menyimpan...'
                : editingTransaction
                ? 'Simpan Perubahan'
                : 'Simpan Transaksi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
