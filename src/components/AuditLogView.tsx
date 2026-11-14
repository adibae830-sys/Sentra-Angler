import React, { useState } from 'react';
import { ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react';
import { formatDateTimeID } from '../lib/formatters';
import type { AuditLog } from '../types';

interface AuditLogViewProps {
  logs: AuditLog[];
}

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Tambah Transaksi',
  UPDATE: 'Ubah Transaksi',
  SOFT_DELETE: 'Arsipkan Transaksi',
  RESTORE: 'Pulihkan Transaksi',
  INITIAL_BALANCE: 'Set Saldo Awal',
  ROLE_CHANGE: 'Kelola Pengguna',
  MEMBER_CHANGE: 'Kelola Anggota',
  CATEGORY_CHANGE: 'Kelola Kategori',
};

export const AuditLogView: React.FC<AuditLogViewProps> = ({ logs }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-bold text-slate-900">Audit Log Aktivitas</h2>
        <p className="text-xs text-slate-500">
          Rekam jejak permanen setiap penambahan, perubahan, dan pengarsipan data oleh Bendahara.
        </p>
      </div>

      {logs.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200 p-10 text-center">
          <ShieldCheck className="w-9 h-9 text-slate-300 mx-auto" />
          <p className="mt-3 text-sm font-semibold text-slate-800">Belum ada catatan audit</p>
          <p className="mt-1 text-xs text-slate-500">
            Setiap aktivitas Bendahara akan otomatis tercatat di sini lengkap dengan data sebelum
            dan sesudah perubahan.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-slate-200 divide-y divide-slate-100 overflow-hidden">
          {logs.map((log) => {
            const isOpen = expandedId === log.id;
            return (
              <div key={log.id} className="p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
                      <span className="font-semibold text-[#0B192C]">
                        {ACTION_LABELS[log.action] || log.action}
                      </span>
                      <span>·</span>
                      <span>Oleh {log.actor_name}</span>
                      <span>·</span>
                      <span className="font-mono-num">{formatDateTimeID(log.created_at)}</span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-slate-900">{log.summary}</p>
                  </div>

                  {(log.before_data || log.after_data) && (
                    <button
                      type="button"
                      onClick={() => setExpandedId(isOpen ? null : log.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 shrink-0 self-start sm:self-center cursor-pointer"
                    >
                      <span>Detail Perubahan</span>
                      {isOpen ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>

                {isOpen && (
                  <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
                    <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 overflow-x-auto">
                      <p className="font-semibold text-slate-600 mb-1.5">Data Sebelum Perubahan</p>
                      <pre className="font-mono-num text-[11px] text-slate-700 whitespace-pre-wrap break-all">
                        {log.before_data
                          ? JSON.stringify(log.before_data, null, 2)
                          : '— (Data baru)'}
                      </pre>
                    </div>
                    <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 overflow-x-auto">
                      <p className="font-semibold text-slate-600 mb-1.5">Data Sesudah Perubahan</p>
                      <pre className="font-mono-num text-[11px] text-slate-700 whitespace-pre-wrap break-all">
                        {log.after_data ? JSON.stringify(log.after_data, null, 2) : '—'}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
