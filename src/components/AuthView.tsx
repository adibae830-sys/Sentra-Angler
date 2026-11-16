import React, { useState } from 'react';
import { ArrowRight, Eye, EyeOff, Lock, Mail, Phone, ShieldCheck, User } from 'lucide-react';
import { dataService } from '../lib/dataService';
import type { UserProfile } from '../types';

interface AuthViewProps {
  hasUsers: boolean;
  serverApiUnavailable?: boolean;
  onAuthenticated: (user: UserProfile) => void;
}

export const AuthView: React.FC<AuthViewProps> = ({
  hasUsers,
  serverApiUnavailable = false,
  onAuthenticated,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(hasUsers ? 'login' : 'register');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'login') {
        const user = await dataService.login(email, password);
        onAuthenticated(user);
      } else {
        const user = await dataService.register({
          email,
          password,
          full_name: fullName,
          whatsapp,
        });
        onAuthenticated(user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan autentikasi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B192C] flex flex-col lg:flex-row">
      {/* Brand Panel */}
      <div className="lg:w-[46%] p-8 lg:p-14 flex flex-col justify-between text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(circle_at_top_right,#F97316,transparent_55%)]" />
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-[#0B192C] border border-white/15 overflow-hidden flex items-center justify-center shrink-0">
            <img
              src="/assets/aistudio/image_a84502d5.png"
              alt="Logo SENTRA ANGLER"
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <span className="font-display text-lg font-bold tracking-tight text-white block leading-none">
              SENTRA ANGLER
            </span>
            <span className="text-xs text-slate-300 mt-1 block">Digital Cash Management</span>
          </div>
        </div>

        <div className="relative z-10 my-10 lg:my-0 max-w-md">
          <h1 className="font-display text-3xl lg:text-4xl font-bold tracking-tight text-white leading-tight [text-wrap:balance]">
            Transparansi Kas, Solidaritas Anggota.
          </h1>
          <p className="mt-4 text-sm lg:text-base text-slate-300 leading-relaxed">
            Sistem pembukuan kas komunitas mancing hingga 30 anggota dengan pemantauan saldo real-time,
            bukti transaksi terarsip, jejak audit bendahara, serta ekspor laporan PDF dan Excel.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-4 pt-6 border-t border-white/10">
            <div>
              <p className="text-xs text-slate-400">Kapasitas Komunitas</p>
              <p className="mt-1 text-lg font-semibold font-mono-num text-white">Maks. 30 Anggota</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Hak Kelola Database</p>
              <p className="mt-1 text-lg font-semibold text-orange-400">Bendahara Terverifikasi</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 text-xs text-slate-400 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-orange-400 shrink-0" />
          <span>
            Mode Penyimpanan:{' '}
            <strong className="text-slate-200">
              {dataService.mode === 'supabase'
                ? 'Supabase Cloud (PostgreSQL + RLS)'
                : 'Database Server Lokal (SQLite + WebSocket)'}
            </strong>
          </span>
        </div>
      </div>

      {/* Form Panel */}
      <div className="flex-1 bg-slate-50 rounded-t-3xl lg:rounded-t-none lg:rounded-l-3xl p-6 sm:p-10 lg:p-16 flex items-center justify-center">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl mb-7">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-colors cursor-pointer ${
                mode === 'login'
                  ? 'bg-white text-[#0B192C] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Masuk Akun
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-colors cursor-pointer ${
                mode === 'register'
                  ? 'bg-white text-[#0B192C] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Daftar Baru
            </button>
          </div>

          <div>
            <h2 className="font-display text-2xl font-bold text-slate-900">
              {mode === 'login'
                ? 'Masuk ke Buku Kas'
                : !hasUsers
                ? 'Inisialisasi Bendahara Pertama'
                : 'Registrasi Akun Anggota'}
            </h2>
            <p className="mt-1.5 text-sm text-slate-600">
              {mode === 'login'
                ? 'Gunakan email dan kata sandi terdaftar untuk mengakses kas komunitas.'
                : !hasUsers
                ? 'Belum ada pengguna terdaftar. Akun pertama yang dibuat otomatis menjadi Bendahara komunitas.'
                : 'Akun baru akan terdaftar sebagai Anggota (hanya baca). Hubungi Bendahara untuk perubahan akses.'}
            </p>
          </div>

          {serverApiUnavailable && dataService.mode !== 'supabase' && (
            <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900 leading-relaxed">
              <strong>Konfigurasi Supabase belum aktif pada build ini:</strong>
              <ol className="mt-1.5 list-decimal pl-4 space-y-1">
                <li>
                  Pastikan <code>VITE_SUPABASE_URL</code> dan <code>VITE_SUPABASE_ANON_KEY</code>{' '}
                  sudah diisi di <strong>Vercel → Settings → Environment Variables</strong> (tanpa
                  tanda kutip).
                </li>
                <li>
                  Buka tab <strong>Deployments</strong> di Vercel lalu klik{' '}
                  <strong>Redeploy</strong> agar variabel terbaca saat proses build.
                </li>
              </ol>
            </div>
          )}

          {error && (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Nama Lengkap
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Contoh: Budi Santoso"
                      className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Nomor WhatsApp (Opsional)
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      placeholder="081234567890"
                      className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 font-mono-num"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@komunitas.id"
                  className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Kata Sandi</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  className="w-full h-11 pl-10 pr-11 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                  aria-label="Lihat kata sandi"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 mt-2 rounded-xl bg-[#0B192C] hover:bg-[#132947] disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <span>
                {loading
                  ? 'Memproses...'
                  : mode === 'login'
                  ? 'Masuk ke Dashboard'
                  : !hasUsers
                  ? 'Buat Akun Bendahara'
                  : 'Daftar Sebagai Anggota'}
              </span>
              {!loading && <ArrowRight className="w-4 h-4 text-orange-400" />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
