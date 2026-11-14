# Panduan Deployment SENTRA ANGLER ke Supabase & Vercel

## Bagian 1: Setup Database & Autentikasi Supabase

1. Buka [supabase.com](https://supabase.com) dan buat project baru (misalnya `sentra-angler-kas`).
2. Masuk ke menu **SQL Editor** -> **New Query**.
3. Salin seluruh isi file `supabase/schema.sql` lalu klik **Run**.
   - Script ini akan membuat 7 tabel: `profiles`, `members`, `categories`, `transactions`, `attachments`, `audit_logs`, dan `settings`.
   - Mengaktifkan **Row Level Security (RLS)** sehingga hanya akun dengan role `bendahara` yang dapat menambah, mengubah, dan mengarsipkan transaksi di level database.
   - Mengaktifkan **Supabase Realtime** untuk notifikasi otomatis transaksi masuk & keluar.
4. Masuk ke **Authentication** -> **Providers** -> **Email**:
   - Pastikan **Enable Email provider** aktif.
   - Untuk pendaftaran cepat komunitas, Anda dapat menonaktifkan *Confirm email* jika anggota belum memiliki email aktif, atau membiarkannya aktif untuk verifikasi email.
5. Masuk ke **Project Settings** -> **API** dan salin:
   - `Project URL` (`VITE_SUPABASE_URL`)
   - `anon public` key (`VITE_SUPABASE_ANON_KEY`)

> **Catatan Akun Pertama:** Pengguna pertama yang mendaftar lewat layar Registrasi otomatis menjadi **Bendahara**. Pengguna berikutnya otomatis menjadi **Anggota**, dan Bendahara dapat mengelola role pengguna melalui menu **Pengguna & Role**.

---

## Bagian 2: Deployment ke Vercel

1. Push source code proyek ini ke repository GitHub/GitLab Anda.
2. Buka [vercel.com](https://vercel.com) -> **Add New Project** -> pilih repository **SENTRA ANGLER**.
3. Pada bagian **Framework Preset**, pilih **Vite**.
4. Pada **Build & Output Settings**:
   - Build Command: `npm run build`
   - Output Directory: `dist`
5. Tambahkan **Environment Variables**:
   - `VITE_SUPABASE_URL` = URL project Supabase Anda
   - `VITE_SUPABASE_ANON_KEY` = Anon Key Supabase Anda
6. Klik **Deploy**.
7. Setelah URL Vercel terbit (misalnya `https://sentra-angler.vercel.app`), kembali ke **Supabase Dashboard** -> **Authentication** -> **URL Configuration**:
   - Set **Site URL** menjadi `https://sentra-angler.vercel.app`.
   - Tambahkan `https://sentra-angler.vercel.app/**` ke **Redirect URLs**.
