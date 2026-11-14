import React, { useState } from 'react';
import {
  BookOpen,
  Check,
  Database,
  Plus,
  Shield,
  Smartphone,
  Tag,
  UserPlus,
  Users,
} from 'lucide-react';
import { dataService } from '../lib/dataService';
import { formatDateTimeID, formatIDR } from '../lib/formatters';
import type {
  AppSettings,
  Category,
  TransactionType,
  UserProfile,
  UserRole,
} from '../types';

interface SettingsAdminViewProps {
  currentUser: UserProfile;
  settings: AppSettings;
  categories: Category[];
  users: UserProfile[];
  isOnline: boolean;
  onOpenInitialBalance: () => void;
  onRefresh: () => Promise<void>;
}

export const SettingsAdminView: React.FC<SettingsAdminViewProps> = ({
  currentUser,
  settings,
  categories,
  users,
  isOnline,
  onOpenInitialBalance,
  onRefresh,
}) => {
  const [tab, setTab] = useState<'categories' | 'users' | 'guides'>(
    currentUser.role === 'bendahara' ? 'categories' : 'guides'
  );
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState<TransactionType>('pemasukan');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // New user form (available in server mode; in Supabase mode users sign up & bendahara assigns role)
  const [uName, setUName] = useState('');
  const [uEmail, setUEmail] = useState('');
  const [uPassword, setUPassword] = useState('');
  const [uWhatsapp, setUWhatsapp] = useState('');
  const [uRole, setURole] = useState<UserRole>('anggota');

  const isBendahara = currentUser.role === 'bendahara';

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await dataService.createCategory({ name: newCatName.trim(), type: newCatType }, currentUser);
      setNewCatName('');
      setSuccessMsg('Kategori berhasil ditambahkan.');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menambahkan kategori.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleCategory = async (cat: Category) => {
    setBusy(true);
    setError(null);
    try {
      await dataService.updateCategory(cat.id, cat, { is_active: !cat.is_active }, currentUser);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memperbarui kategori.');
    } finally {
      setBusy(false);
    }
  };

  const handleChangeUserRole = async (u: UserProfile, role: UserRole) => {
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await dataService.updateUserAccess(u.id, u, { role }, currentUser);
      setSuccessMsg(`Role ${u.full_name} diubah menjadi ${role}.`);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengubah role pengguna.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleUserActive = async (u: UserProfile) => {
    setBusy(true);
    setError(null);
    try {
      await dataService.updateUserAccess(u.id, u, { is_active: !u.is_active }, currentUser);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengubah status pengguna.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await dataService.createUser({
        email: uEmail,
        password: uPassword,
        full_name: uName,
        role: uRole,
        whatsapp: uWhatsapp,
      });
      setUName('');
      setUEmail('');
      setUPassword('');
      setUWhatsapp('');
      setSuccessMsg('Akun pengguna baru berhasil dibuat.');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat akun pengguna.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-bold text-slate-900">
          Pengaturan, Kategori & Panduan
        </h2>
        <p className="text-xs text-slate-500">
          Kelola kategori transaksi, hak akses pengguna, serta panduan deployment Supabase, Vercel &
          PWA.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl w-fit overflow-x-auto">
        {isBendahara && (
          <>
            <button
              type="button"
              onClick={() => setTab('categories')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                tab === 'categories'
                  ? 'bg-white text-[#0B192C] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Tag className="w-3.5 h-3.5" />
              <span>Kategori Transaksi</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('users')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                tab === 'users'
                  ? 'bg-white text-[#0B192C] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Pengguna & Role</span>
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => setTab('guides')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
            tab === 'guides'
              ? 'bg-white text-[#0B192C] shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Panduan Supabase, Vercel & PWA</span>
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs text-emerald-700 flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Categories Tab */}
      {tab === 'categories' && isBendahara && (
        <div className="space-y-5">
          {/* Saldo Awal Card */}
          <div className="rounded-2xl bg-white border border-slate-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-display text-sm font-bold text-slate-900">
                Status Saldo Awal Kas
              </h3>
              {settings.initial_balance_set ? (
                <p className="mt-1 text-xs text-slate-600 font-mono-num">
                  Saldo awal resmi:{' '}
                  <strong className="text-[#0B192C]">{formatIDR(settings.initial_balance)}</strong>{' '}
                  · Ditetapkan pada {formatDateTimeID(settings.initial_balance_set_at)}
                </p>
              ) : (
                <p className="mt-1 text-xs text-amber-700">
                  Belum ditetapkan. Anda dapat mengisi saldo awal kas satu kali sebelum transaksi
                  berjalan.
                </p>
              )}
            </div>
            {!settings.initial_balance_set && (
              <button
                type="button"
                disabled={!isOnline}
                onClick={onOpenInitialBalance}
                className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold shrink-0 cursor-pointer"
              >
                Isi Saldo Awal
              </button>
            )}
          </div>

          {/* Add Category */}
          <form
            onSubmit={handleAddCategory}
            className="rounded-2xl bg-white border border-slate-200 p-5 flex flex-col sm:flex-row gap-3 items-stretch sm:items-end"
          >
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Nama Kategori Baru
              </label>
              <input
                type="text"
                required
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="Contoh: Dana Sosial / Perbaikan Jaring"
                className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Jenis</label>
              <select
                value={newCatType}
                onChange={(e) => setNewCatType(e.target.value as TransactionType)}
                className="w-full sm:w-44 h-10 px-3 rounded-xl border border-slate-300 text-sm bg-white"
              >
                <option value="pemasukan">Pemasukan</option>
                <option value="pengeluaran">Pengeluaran</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={!isOnline || busy}
              className="h-10 px-4 rounded-xl bg-[#0B192C] hover:bg-[#132947] disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-orange-400" />
              <span>Tambah Kategori</span>
            </button>
          </form>

          {/* Category Lists */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {(['pemasukan', 'pengeluaran'] as const).map((catType) => (
              <div
                key={catType}
                className="rounded-2xl bg-white border border-slate-200 overflow-hidden"
              >
                <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200">
                  <h3 className="font-display text-sm font-bold text-slate-900">
                    Kategori {catType === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran'}
                  </h3>
                </div>
                <div className="divide-y divide-slate-100">
                  {categories
                    .filter((c) => c.type === catType)
                    .map((c) => (
                      <div key={c.id} className="px-5 py-3 flex items-center justify-between gap-3">
                        <div>
                          <p
                            className={`text-sm font-medium ${
                              c.is_active ? 'text-slate-900' : 'text-slate-400 line-through'
                            }`}
                          >
                            {c.name}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {c.is_default ? 'Kategori standar' : 'Kategori tambahan'}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={!isOnline || busy}
                          onClick={() => handleToggleCategory(c)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                            c.is_active
                              ? 'border-slate-200 text-slate-700 hover:bg-slate-50'
                              : 'border-emerald-200 text-emerald-700 bg-emerald-50'
                          }`}
                        >
                          {c.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Users & Roles Tab */}
      {tab === 'users' && isBendahara && (
        <div className="space-y-5">
          {dataService.mode === 'server' && (
            <form
              onSubmit={handleCreateUser}
              className="rounded-2xl bg-white border border-slate-200 p-5 space-y-4"
            >
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-orange-500" />
                <h3 className="font-display text-sm font-bold text-slate-900">
                  Buat Akun Pengguna Baru
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <input
                  type="text"
                  required
                  value={uName}
                  onChange={(e) => setUName(e.target.value)}
                  placeholder="Nama lengkap"
                  className="h-10 px-3 rounded-xl border border-slate-300 text-sm"
                />
                <input
                  type="email"
                  required
                  value={uEmail}
                  onChange={(e) => setUEmail(e.target.value)}
                  placeholder="Email"
                  className="h-10 px-3 rounded-xl border border-slate-300 text-sm"
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={uPassword}
                  onChange={(e) => setUPassword(e.target.value)}
                  placeholder="Password (min. 6)"
                  className="h-10 px-3 rounded-xl border border-slate-300 text-sm"
                />
                <input
                  type="tel"
                  value={uWhatsapp}
                  onChange={(e) => setUWhatsapp(e.target.value)}
                  placeholder="WhatsApp (opsional)"
                  className="h-10 px-3 rounded-xl border border-slate-300 text-sm font-mono-num"
                />
                <div className="flex gap-2">
                  <select
                    value={uRole}
                    onChange={(e) => setURole(e.target.value as UserRole)}
                    className="h-10 px-2.5 rounded-xl border border-slate-300 text-sm bg-white flex-1"
                  >
                    <option value="anggota">Anggota</option>
                    <option value="bendahara">Bendahara</option>
                  </select>
                  <button
                    type="submit"
                    disabled={!isOnline || busy}
                    className="h-10 px-4 rounded-xl bg-[#0B192C] text-white text-xs font-semibold shrink-0 cursor-pointer"
                  >
                    Buat
                  </button>
                </div>
              </div>
            </form>
          )}

          <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-sm font-bold text-slate-900">
                Daftar Pengguna & Hak Akses ({users.length})
              </h3>
              <span className="text-xs text-slate-500">Hanya Bendahara yang bisa mengubah role</span>
            </div>
            <div className="divide-y divide-slate-100">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      {u.full_name}{' '}
                      {u.id === currentUser.id && (
                        <span className="text-xs font-normal text-orange-600">(Anda)</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">
                      {u.email} {u.whatsapp ? `· WA ${u.whatsapp}` : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      disabled={!isOnline || busy}
                      value={u.role}
                      onChange={(e) => handleChangeUserRole(u, e.target.value as UserRole)}
                      className="h-9 px-3 rounded-lg border border-slate-300 text-xs font-semibold bg-white text-slate-800"
                    >
                      <option value="anggota">Anggota (Hanya Baca)</option>
                      <option value="bendahara">Bendahara (Kelola Penuh)</option>
                    </select>

                    <button
                      type="button"
                      disabled={!isOnline || busy || u.id === currentUser.id}
                      onClick={() => handleToggleUserActive(u)}
                      className={`h-9 px-3 rounded-lg text-xs font-semibold border cursor-pointer disabled:opacity-40 ${
                        u.is_active
                          ? 'border-slate-200 text-slate-700 hover:bg-slate-50'
                          : 'border-emerald-200 text-emerald-700 bg-emerald-50'
                      }`}
                    >
                      {u.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Guides Tab */}
      {tab === 'guides' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="rounded-2xl bg-white border border-slate-200 p-6 space-y-4">
            <div className="flex items-center gap-2.5">
              <Database className="w-5 h-5 text-orange-500" />
              <h3 className="font-display text-base font-bold text-slate-900">
                1. Konfigurasi Supabase & Deployment Vercel
              </h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Mode aktif saat ini:{' '}
              <strong className="text-[#0B192C]">
                {dataService.mode === 'supabase'
                  ? 'Supabase Cloud (Produksi)'
                  : 'Express + SQLite Lokal (Siap migrasi ke Supabase)'}
              </strong>
            </p>
            <ol className="space-y-2.5 text-xs text-slate-700 list-decimal pl-4 leading-relaxed">
              <li>
                Buat project di <strong>supabase.com</strong> lalu buka <strong>SQL Editor</strong>.
              </li>
              <li>
                Jalankan seluruh script SQL pada file{' '}
                <code className="px-1.5 py-0.5 rounded bg-slate-100 font-mono-num">
                  supabase/schema.sql
                </code>{' '}
                (membuat 7 tabel, trigger maks. 30 anggota, bucket bukti transaksi, RLS Bendahara,
                dan Supabase Realtime).
              </li>
              <li>
                Salin <strong>Project URL</strong> & <strong>anon public key</strong> dari{' '}
                <em>Project Settings → API</em>.
              </li>
              <li>
                Deploy repository ini ke <strong>Vercel</strong> dengan framework{' '}
                <strong>Vite</strong> dan tambahkan Environment Variables:{' '}
                <code className="px-1.5 py-0.5 rounded bg-slate-100 font-mono-num">
                  VITE_SUPABASE_URL
                </code>{' '}
                dan{' '}
                <code className="px-1.5 py-0.5 rounded bg-slate-100 font-mono-num">
                  VITE_SUPABASE_ANON_KEY
                </code>
                .
              </li>
              <li>
                Tambahkan URL Vercel Anda ke <em>Supabase Auth → URL Configuration</em> agar login
                dan redirect berjalan lancar.
              </li>
            </ol>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200 p-6 space-y-4">
            <div className="flex items-center gap-2.5">
              <Smartphone className="w-5 h-5 text-orange-500" />
              <h3 className="font-display text-base font-bold text-slate-900">
                2. Instalasi PWA di Android & iPhone
              </h3>
            </div>
            <div className="space-y-3 text-xs text-slate-700 leading-relaxed">
              <div>
                <p className="font-bold text-slate-900">Android (Google Chrome / Edge):</p>
                <p className="mt-1">
                  Buka web SENTRA ANGLER di Chrome → ketuk tombol <strong>Install App</strong> di
                  aplikasi, atau buka menu <strong>⋮ → Tambahkan ke Layar Utama / Install app</strong>.
                </p>
              </div>
              <div>
                <p className="font-bold text-slate-900">iPhone / iPad (Safari):</p>
                <p className="mt-1">
                  Buka web SENTRA ANGLER lewat browser <strong>Safari</strong> → ketuk ikon{' '}
                  <strong>Share</strong> (kotak panah ke atas) → pilih{' '}
                  <strong>Add to Home Screen</strong> → ketuk <strong>Add</strong>.
                </p>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-start gap-2 text-slate-600">
                <Shield className="w-4 h-4 text-[#0B192C] shrink-0 mt-0.5" />
                <p>
                  Saat koneksi internet terputus, aplikasi otomatis menampilkan indikator Mode
                  Offline dengan data cache sementara dan menahan input transaksi baru hingga online
                  kembali.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
