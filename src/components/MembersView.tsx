import React, { useMemo, useState } from 'react';
import {
  Edit3,
  ExternalLink,
  History,
  Phone,
  Plus,
  Search,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { dataService } from '../lib/dataService';
import {
  formatDateID,
  formatIDR,
  getInitials,
  getTodayISO,
  normalizeWhatsApp,
} from '../lib/formatters';
import type { Member, Transaction, UserProfile } from '../types';

interface MembersViewProps {
  members: Member[];
  transactions: Transaction[];
  currentUser: UserProfile;
  isOnline: boolean;
  onRefresh: () => Promise<void>;
}

export const MembersView: React.FC<MembersViewProps> = ({
  members,
  transactions,
  currentUser,
  isOnline,
  onRefresh,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [historyMember, setHistoryMember] = useState<Member | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);

  // Form states
  const [fullName, setFullName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [joinDate, setJoinDate] = useState(getTodayISO());
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [notes, setNotes] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isBendahara = currentUser.role === 'bendahara';
  const isAtMaxLimit = members.length >= 30;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      if (statusFilter !== 'all' && m.status !== statusFilter) return false;
      if (q) {
        const hay = `${m.member_code} ${m.full_name} ${m.whatsapp}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [members, search, statusFilter]);

  const memberTransactions = useMemo(() => {
    if (!historyMember) return [];
    return transactions.filter((t) => !t.deleted_at && t.member_id === historyMember.id);
  }, [historyMember, transactions]);

  const openAdd = () => {
    setEditingMember(null);
    setFullName('');
    setWhatsapp('');
    setJoinDate(getTodayISO());
    setStatus('active');
    setNotes('');
    setAvatarFile(null);
    setAvatarUrl(null);
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (m: Member) => {
    setEditingMember(m);
    setFullName(m.full_name);
    setWhatsapp(m.whatsapp);
    setJoinDate(m.join_date);
    setStatus(m.status);
    setNotes(m.notes || '');
    setAvatarFile(null);
    setAvatarUrl(m.avatar_url || null);
    setError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      let finalAvatar = avatarUrl;
      if (avatarFile) {
        const uploaded = await dataService.uploadFile(avatarFile);
        finalAvatar = uploaded.file_url;
      }

      if (editingMember) {
        await dataService.updateMember(
          editingMember.id,
          editingMember,
          {
            full_name: fullName.trim(),
            whatsapp: whatsapp.trim(),
            join_date: joinDate,
            status,
            notes: notes.trim(),
            avatar_url: finalAvatar,
          },
          currentUser
        );
      } else {
        await dataService.createMember(
          {
            full_name: fullName.trim(),
            whatsapp: whatsapp.trim(),
            join_date: joinDate,
            status,
            notes: notes.trim(),
            avatar_url: finalAvatar,
          },
          members,
          currentUser
        );
      }
      await onRefresh();
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan data anggota.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900">Database Anggota</h2>
          <p className="text-xs text-slate-500">
            Kapasitas terdaftar:{' '}
            <strong className="font-mono-num text-slate-800">{members.length} / 30</strong> anggota
            komunitas SENTRA ANGLER.
          </p>
        </div>

        {isBendahara && (
          <button
            type="button"
            disabled={!isOnline || isAtMaxLimit}
            onClick={openAdd}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#0B192C] hover:bg-[#132947] disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
          >
            <Plus className="w-4 h-4 text-orange-400" />
            <span>{isAtMaxLimit ? 'Batas 30 Anggota Penuh' : 'Tambah Anggota'}</span>
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="rounded-2xl bg-white border border-slate-200 p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari ID, nama anggota, atau nomor WhatsApp..."
            className="w-full h-10 pl-10 pr-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
          {(['all', 'active', 'inactive'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                statusFilter === s
                  ? 'bg-white text-[#0B192C] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {s === 'all' ? 'Semua' : s === 'active' ? 'Aktif' : 'Nonaktif'}
            </button>
          ))}
        </div>
      </div>

      {/* Empty State */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200 p-10 text-center">
          <Users className="w-9 h-9 text-slate-300 mx-auto" />
          <p className="mt-3 text-sm font-semibold text-slate-800">Belum ada data anggota</p>
          <p className="mt-1 text-xs text-slate-500">
            {isBendahara
              ? 'Tambahkan hingga 30 anggota komunitas untuk memantau kontribusi masing-masing.'
              : 'Belum ada data anggota yang terdaftar.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((m) => (
            <div
              key={m.id}
              className="rounded-2xl bg-white border border-slate-200 p-5 flex flex-col justify-between gap-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {m.avatar_url ? (
                    <img
                      src={m.avatar_url}
                      alt={m.full_name}
                      referrerPolicy="no-referrer"
                      className="w-12 h-12 rounded-xl object-cover border border-slate-200 shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-[#0B192C] text-white font-display font-bold text-sm flex items-center justify-center shrink-0">
                      {getInitials(m.full_name)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-mono-num text-[11px] font-semibold text-orange-600">
                      {m.member_code} · {m.status === 'active' ? 'Aktif' : 'Nonaktif'}
                    </p>
                    <h3 className="font-display text-base font-bold text-slate-900 truncate">
                      {m.full_name}
                    </h3>
                    <p className="text-xs text-slate-500 font-mono-num">
                      Gabung: {formatDateID(m.join_date)}
                    </p>
                  </div>
                </div>

                {isBendahara && (
                  <button
                    type="button"
                    disabled={!isOnline}
                    onClick={() => openEdit(m)}
                    title="Edit Anggota"
                    className="p-2 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 block">Total Pemasukan</span>
                  <span className="font-bold font-mono-num text-sm text-emerald-700">
                    {formatIDR(m.total_contribution ?? 0)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">WhatsApp</span>
                  <a
                    href={`https://wa.me/${normalizeWhatsApp(m.whatsapp)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-mono-num font-semibold text-[#0B192C] hover:text-orange-600"
                  >
                    <Phone className="w-3 h-3" />
                    <span className="truncate">{m.whatsapp}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setHistoryMember(m)}
                className="w-full py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <History className="w-3.5 h-3.5 text-orange-500" />
                <span>Riwayat Kontribusi ({m.transaction_count ?? 0})</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Member Contribution History Drawer/Modal */}
      {historyMember && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-lg max-h-[88vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-4">
              <div>
                <p className="font-mono-num text-xs font-semibold text-orange-600">
                  {historyMember.member_code}
                </p>
                <h3 className="font-display text-lg font-bold text-slate-900">
                  Riwayat Kontribusi — {historyMember.full_name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-mono-num">
                  Total Pemasukan:{' '}
                  <strong className="text-emerald-700">
                    {formatIDR(historyMember.total_contribution ?? 0)}
                  </strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryMember(null)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 divide-y divide-slate-100">
              {memberTransactions.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  Belum ada catatan transaksi terkait anggota ini.
                </p>
              ) : (
                memberTransactions.map((tx) => (
                  <div key={tx.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{tx.category_name}</p>
                      <p className="text-xs text-slate-500 font-mono-num">
                        {tx.transaction_code} · {formatDateID(tx.transaction_date)}
                      </p>
                      {tx.description && (
                        <p className="text-xs text-slate-600 mt-0.5">{tx.description}</p>
                      )}
                    </div>
                    <span
                      className={`text-sm font-bold font-mono-num whitespace-nowrap ${
                        tx.type === 'pemasukan' ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {tx.type === 'pemasukan' ? '+' : '−'} {formatIDR(tx.amount)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Member Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="font-display text-lg font-bold text-slate-900">
                {editingMember
                  ? `Edit Anggota (${editingMember.member_code})`
                  : 'Tambah Anggota Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
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

            <form onSubmit={handleSave} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Nama Lengkap Anggota
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nama lengkap"
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Nomor WhatsApp
                  </label>
                  <input
                    type="tel"
                    required
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="081234567890"
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm font-mono-num focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Tanggal Bergabung
                  </label>
                  <input
                    type="date"
                    required
                    value={joinDate}
                    onChange={(e) => setJoinDate(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm font-mono-num focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Status Keanggotaan
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                >
                  <option value="active">Aktif</option>
                  <option value="inactive">Nonaktif</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Foto Profil (Opsional)
                </label>
                <label className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 cursor-pointer text-xs text-slate-700">
                  <Upload className="w-4 h-4 text-orange-500" />
                  <span className="truncate">
                    {avatarFile ? avatarFile.name : 'Pilih foto anggota (maks. 5 MB)...'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => setAvatarFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Catatan (Opsional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Contoh: Koordinator lapangan / Spesialis galatama"
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-[#0B192C] hover:bg-[#132947] disabled:opacity-60 text-white text-sm font-semibold cursor-pointer"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Data'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
