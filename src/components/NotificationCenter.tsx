import React from 'react';
import { ArrowDownLeft, ArrowUpRight, Bell, CheckCheck, Info, X } from 'lucide-react';
import { formatDateTimeID, formatIDR } from '../lib/formatters';
import type { RealtimeNotification } from '../types';

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: RealtimeNotification[];
  onMarkAllRead: () => void;
  onClearAll: () => void;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  isOpen,
  onClose,
  notifications,
  onMarkAllRead,
  onClearAll,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Bell className="w-5 h-5 text-orange-500" />
            <div>
              <h3 className="font-display text-base font-bold text-slate-900">
                Notifikasi Real-Time
              </h3>
              <p className="text-xs text-slate-500">
                Setiap transaksi masuk & keluar muncul seketika
              </p>
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

        <div className="px-5 py-2.5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <button
            type="button"
            onClick={onMarkAllRead}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0B192C] hover:text-orange-600 cursor-pointer"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>Tandai semua dibaca</span>
          </button>
          {notifications.length > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="text-xs text-slate-500 hover:text-red-600 cursor-pointer"
            >
              Bersihkan
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {notifications.length === 0 ? (
            <div className="p-10 text-center">
              <Bell className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="mt-3 text-sm font-medium text-slate-700">Belum ada notifikasi baru</p>
              <p className="mt-1 text-xs text-slate-500">
                Notifikasi real-time akan muncul otomatis saat Bendahara mencatat atau mengubah
                transaksi.
              </p>
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={`p-4 flex items-start gap-3 transition-colors ${
                  n.read ? 'bg-white' : 'bg-orange-50/40'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    n.transaction_type === 'pemasukan'
                      ? 'bg-emerald-50 text-emerald-600'
                      : n.transaction_type === 'pengeluaran'
                      ? 'bg-red-50 text-red-600'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {n.transaction_type === 'pemasukan' ? (
                    <ArrowDownLeft className="w-4 h-4" />
                  ) : n.transaction_type === 'pengeluaran' ? (
                    <ArrowUpRight className="w-4 h-4" />
                  ) : (
                    <Info className="w-4 h-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900 truncate">{n.title}</p>
                    {!n.read && <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">{n.message}</p>
                  <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-400">
                    <span>Oleh {n.actor_name}</span>
                    <span>·</span>
                    <span className="font-mono-num">{formatDateTimeID(n.created_at)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

interface RealtimeToastStackProps {
  toasts: RealtimeNotification[];
  onDismiss: (id: string) => void;
}

export const RealtimeToastStack: React.FC<RealtimeToastStackProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2.5 w-[calc(100vw-2rem)] max-w-sm pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto rounded-2xl bg-[#0B192C] text-white p-4 shadow-xl border border-white/10 flex items-start gap-3"
        >
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              t.transaction_type === 'pemasukan'
                ? 'bg-emerald-500/20 text-emerald-300'
                : t.transaction_type === 'pengeluaran'
                ? 'bg-red-500/20 text-red-300'
                : 'bg-orange-500/20 text-orange-300'
            }`}
          >
            {t.transaction_type === 'pemasukan' ? (
              <ArrowDownLeft className="w-4 h-4" />
            ) : t.transaction_type === 'pengeluaran' ? (
              <ArrowUpRight className="w-4 h-4" />
            ) : (
              <Info className="w-4 h-4" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold tracking-wide text-orange-400">{t.title}</p>
              <button
                type="button"
                onClick={() => onDismiss(t.id)}
                className="text-slate-400 hover:text-white cursor-pointer"
                aria-label="Tutup notifikasi"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="mt-0.5 text-xs text-slate-200 leading-snug">{t.message}</p>
            {typeof t.amount === 'number' && t.amount > 0 && (
              <p className="mt-1 text-sm font-bold font-mono-num text-white">
                {t.transaction_type === 'pemasukan' ? '+' : t.transaction_type === 'pengeluaran' ? '−' : ''}{' '}
                {formatIDR(t.amount)}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
