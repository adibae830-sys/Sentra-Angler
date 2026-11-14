import React, { useState } from 'react';
import { ShieldAlert, Wallet, X } from 'lucide-react';
import { formatIDR } from '../lib/formatters';

interface InitialBalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (amount: number, note: string) => Promise<void>;
}

export const InitialBalanceModal: React.FC<InitialBalanceModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [amountInput, setAmountInput] = useState('0');
  const [note, setNote] = useState('Saldo awal kas komunitas saat mulai pembukuan digital');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const numericAmount = Number(amountInput.replace(/\D/g, '')) || 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(numericAmount, note);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menetapkan saldo awal.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold text-slate-900">
                Pengisian Saldo Awal Kas
              </h3>
              <p className="text-xs text-slate-500">Pengaturan pembukuan awal SENTRA ANGLER</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Saldo awal hanya dapat ditetapkan <strong>satu kali</strong> saat awal penggunaan aplikasi.
            Setelah ditetapkan, saldo dihitung otomatis dengan rumus{' '}
            <strong>Saldo Awal + Total Pemasukan − Total Pengeluaran</strong> dan tidak boleh diubah
            secara langsung tanpa transaksi resmi.
          </p>
        </div>

        {error && (
          <div className="mt-3 rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Nominal Saldo Awal Kas (IDR)
            </label>
            <input
              type="text"
              inputMode="numeric"
              required
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value.replace(/\D/g, ''))}
              className="w-full h-12 px-4 rounded-xl border border-slate-300 text-lg font-bold font-mono-num text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
            />
            <p className="mt-1 text-xs text-slate-500 font-mono-num">
              Terbaca: <strong className="text-slate-800">{formatIDR(numericAmount)}</strong>
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Catatan / Berita Acara Saldo Awal
            </label>
            <textarea
              rows={2}
              required
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Nanti Saja
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl bg-[#0B192C] hover:bg-[#132947] disabled:opacity-60 text-white text-sm font-semibold cursor-pointer"
            >
              {submitting ? 'Menyimpan...' : 'Tetapkan Saldo Awal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
