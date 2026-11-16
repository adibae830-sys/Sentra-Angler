import { supabase, isSupabaseConfigured } from './supabaseClient';
import type {
  AppSettings,
  AuditLog,
  CashSummary,
  Category,
  CommunityEvent,
  EventBudgetItem,
  EventParticipant,
  EventStatus,
  Member,
  RealtimeNotification,
  Transaction,
  TransactionType,
  UserProfile,
  UserRole,
} from '../types';

const TOKEN_KEY = 'sentra_angler_token';
const CACHE_KEY = 'sentra_angler_offline_cache_v1';

export interface AppSnapshot {
  settings: AppSettings;
  summary: CashSummary;
  categories: Category[];
  members: Member[];
  transactions: Transaction[];
  events: CommunityEvent[];
  eventBudgetItems: EventBudgetItem[];
  eventParticipants: EventParticipant[];
  auditLogs: AuditLog[];
  users: UserProfile[];
  cachedAt: string;
}

export function saveOfflineCache(snapshot: AppSnapshot): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadOfflineCache(): AppSnapshot | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AppSnapshot;
  } catch {
    return null;
  }
}

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(url, { ...options, headers, credentials: 'include' });
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      'Konfigurasi Supabase belum terbaca pada build ini. Pastikan VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY sudah diisi di Vercel Environment Variables (tanpa tanda kutip), lalu klik Redeploy di Vercel.'
    );
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error || `Permintaan gagal (${res.status})`);
  }
  return body as T;
}

function generateTxCodeClient(dateStr: string, existingCount: number): string {
  const ym = dateStr.slice(0, 7).replace('-', '');
  return `TRX-${ym}-${String(existingCount + 1).padStart(4, '0')}`;
}

export const dataService = {
  mode: isSupabaseConfigured ? ('supabase' as const) : ('server' as const),

  async getBootstrapStatus(): Promise<{ hasUsers: boolean }> {
    if (isSupabaseConfigured && supabase) {
      const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true });
      return { hasUsers: (count ?? 0) > 0 };
    }
    return apiFetch<{ hasUsers: boolean }>('/api/auth/bootstrap-status');
  },

  async getCurrentUser(): Promise<UserProfile | null> {
    if (isSupabaseConfigured && supabase) {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) return null;
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authData.user.id)
        .single();
      if (error || !profile) return null;
      return profile as UserProfile;
    }
    try {
      const res = await apiFetch<{ user: UserProfile }>('/api/auth/me');
      return res.user;
    } catch {
      return null;
    }
  },

  async login(email: string, password: string): Promise<UserProfile> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.user) throw new Error(error?.message || 'Gagal masuk.');
      const { data: profile, error: profErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();
      if (profErr || !profile) throw new Error('Profil pengguna tidak ditemukan.');
      if (!profile.is_active) {
        await supabase.auth.signOut();
        throw new Error('Akun Anda telah dinonaktifkan oleh Bendahara.');
      }
      return profile as UserProfile;
    }
    const res = await apiFetch<{ user: UserProfile; token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(res.token);
    return res.user;
  },

  async register(params: {
    email: string;
    password: string;
    full_name: string;
    whatsapp?: string;
  }): Promise<UserProfile> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.signUp({
        email: params.email,
        password: params.password,
        options: {
          data: {
            full_name: params.full_name,
            whatsapp: params.whatsapp || null,
          },
        },
      });
      if (error) throw new Error(error.message);
      if (!data.user) throw new Error('Registrasi gagal.');
      // Wait briefly for trigger to insert profile
      await new Promise((r) => setTimeout(r, 400));
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();
      if (!profile) {
        throw new Error('Akun dibuat. Silakan cek email verifikasi Anda sebelum masuk.');
      }
      return profile as UserProfile;
    }
    const res = await apiFetch<{ user: UserProfile; token: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    setToken(res.token);
    return res.user;
  },

  async logout(): Promise<void> {
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut();
      return;
    }
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setToken(null);
  },

  async fetchAllSnapshot(): Promise<AppSnapshot> {
    if (isSupabaseConfigured && supabase) {
      const [
        settingsRes,
        categoriesRes,
        membersRes,
        txRes,
        attRes,
        auditRes,
        usersRes,
        eventsRes,
        budgetRes,
        participantsRes,
      ] = await Promise.all([
        supabase.from('settings').select('*').eq('id', 'community_cash').single(),
        supabase.from('categories').select('*').order('type').order('sort_order').order('name'),
        supabase.from('members').select('*').order('member_code'),
        supabase
          .from('transactions')
          .select('*')
          .order('transaction_date', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase.from('attachments').select('*'),
        supabase
          .from('audit_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(300),
        supabase.from('profiles').select('*').order('created_at'),
        supabase
          .from('events')
          .select('*')
          .order('event_date', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('event_budget_items')
          .select('*')
          .order('type')
          .order('created_at'),
        supabase.from('event_participants').select('*').order('created_at'),
      ]);

      const settings = (settingsRes.data || {
        id: 'community_cash',
        community_name: 'SENTRA ANGLER',
        tagline: 'Transparansi Kas, Solidaritas Anggota',
        max_members: 30,
        initial_balance: 0,
        initial_balance_set: false,
      }) as AppSettings;

      const rawTx = (txRes.data || []) as Transaction[];
      const rawAtt = (attRes.data || []) as Array<{ transaction_id: string }>;
      const attMap = new Map<string, Transaction['attachments']>();
      for (const a of rawAtt) {
        if (!attMap.has(a.transaction_id)) attMap.set(a.transaction_id, []);
        attMap.get(a.transaction_id)!.push(a as never);
      }

      const transactions = rawTx.map((t) => ({
        ...t,
        amount: Number(t.amount),
        attachments: attMap.get(t.id) ?? [],
      }));

      const activeTx = transactions.filter((t) => !t.deleted_at);
      const totalIncome = activeTx
        .filter((t) => t.type === 'pemasukan')
        .reduce((acc, t) => acc + Number(t.amount), 0);
      const totalExpense = activeTx
        .filter((t) => t.type === 'pengeluaran')
        .reduce((acc, t) => acc + Number(t.amount), 0);
      const initBal = Number(settings.initial_balance || 0);

      const members = ((membersRes.data || []) as Member[]).map((m) => {
        const mTx = activeTx.filter((t) => t.member_id === m.id);
        return {
          ...m,
          total_contribution: mTx
            .filter((t) => t.type === 'pemasukan')
            .reduce((acc, t) => acc + Number(t.amount), 0),
          transaction_count: mTx.length,
        };
      });

      const events = ((eventsRes.data || []) as CommunityEvent[]).map((e) => ({
        ...e,
        target_participants: Number(e.target_participants),
        fee_per_member: Number(e.fee_per_member),
      }));
      const eventBudgetItems = ((budgetRes.data || []) as EventBudgetItem[]).map((b) => ({
        ...b,
        estimated_amount: Number(b.estimated_amount),
      }));
      const eventParticipants = (participantsRes.data || []) as EventParticipant[];

      const snapshot: AppSnapshot = {
        settings: { ...settings, initial_balance: initBal },
        summary: {
          initial_balance: initBal,
          initial_balance_set: Boolean(settings.initial_balance_set),
          total_income: totalIncome,
          total_expense: totalExpense,
          current_balance: initBal + totalIncome - totalExpense,
        },
        categories: (categoriesRes.data || []) as Category[],
        members,
        transactions,
        events,
        eventBudgetItems,
        eventParticipants,
        auditLogs: (auditRes.data || []) as AuditLog[],
        users: (usersRes.data || []) as UserProfile[],
        cachedAt: new Date().toISOString(),
      };
      saveOfflineCache(snapshot);
      return snapshot;
    }

    const [settingsWithSummary, categories, members, txRes, eventsRes, auditLogs, users] =
      await Promise.all([
        apiFetch<AppSettings & { summary: CashSummary }>('/api/settings'),
        apiFetch<Category[]>('/api/categories'),
        apiFetch<Member[]>('/api/members'),
        apiFetch<{ transactions: Transaction[]; summary: CashSummary }>(
          '/api/transactions?includeDeleted=true'
        ),
        apiFetch<{
          events: CommunityEvent[];
          budgetItems: EventBudgetItem[];
          participants: EventParticipant[];
        }>('/api/events'),
        apiFetch<AuditLog[]>('/api/audit-logs'),
        apiFetch<UserProfile[]>('/api/users'),
      ]);

    const { summary, ...settings } = settingsWithSummary;
    const snapshot: AppSnapshot = {
      settings,
      summary,
      categories,
      members,
      transactions: txRes.transactions,
      events: eventsRes.events,
      eventBudgetItems: eventsRes.budgetItems,
      eventParticipants: eventsRes.participants,
      auditLogs,
      users,
      cachedAt: new Date().toISOString(),
    };
    saveOfflineCache(snapshot);
    return snapshot;
  },

  async setInitialBalance(
    initial_balance: number,
    note: string,
    actor: UserProfile
  ): Promise<void> {
    if (isSupabaseConfigured && supabase) {
      const ts = new Date().toISOString();
      const { error } = await supabase
        .from('settings')
        .update({
          initial_balance,
          initial_balance_set: true,
          initial_balance_note: note || 'Saldo awal kas komunitas',
          initial_balance_set_at: ts,
          initial_balance_set_by: actor.id,
        })
        .eq('id', 'community_cash')
        .eq('initial_balance_set', false);
      if (error) throw new Error(error.message);

      await supabase.from('audit_logs').insert({
        table_name: 'settings',
        record_id: 'community_cash',
        action: 'INITIAL_BALANCE',
        actor_id: actor.id,
        actor_name: actor.full_name,
        actor_role: actor.role,
        before_data: { initial_balance: 0, initial_balance_set: false },
        after_data: { initial_balance, initial_balance_set: true, note },
        summary: `Menetapkan saldo awal kas sebesar Rp ${initial_balance.toLocaleString('id-ID')}`,
      });
      return;
    }

    await apiFetch('/api/settings/initial-balance', {
      method: 'POST',
      body: JSON.stringify({ initial_balance, note }),
    });
  },

  async uploadFile(
    file: File
  ): Promise<{
    file_name: string;
    file_url: string;
    storage_path?: string;
    mime_type: string;
    file_size: number;
  }> {
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('Ukuran file maksimal 5 MB.');
    }
    if (isSupabaseConfigured && supabase) {
      const ext = file.name.split('.').pop() || 'jpg';
      const storagePath = `receipts/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from('receipts').upload(storagePath, file, {
        upsert: false,
      });
      if (error) throw new Error(error.message);
      const { data: pub } = supabase.storage.from('receipts').getPublicUrl(storagePath);
      return {
        file_name: file.name,
        file_url: pub.publicUrl,
        storage_path: storagePath,
        mime_type: file.type || 'image/jpeg',
        file_size: file.size,
      };
    }

    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Gagal membaca file.'));
      reader.readAsDataURL(file);
    });

    return apiFetch('/api/uploads', {
      method: 'POST',
      body: JSON.stringify({
        file_name: file.name,
        mime_type: file.type,
        base64_data: base64,
      }),
    });
  },

  async createTransaction(
    payload: {
      transaction_date: string;
      type: TransactionType;
      category_id: string;
      category_name?: string;
      amount: number;
      member_id?: string | null;
      event_id?: string | null;
      related_party: string;
      description: string;
      attachment?: {
        file_name: string;
        file_url: string;
        storage_path?: string;
        mime_type: string;
        file_size: number;
      } | null;
    },
    actor: UserProfile
  ): Promise<void> {
    if (isSupabaseConfigured && supabase) {
      const ym = payload.transaction_date.slice(0, 7).replace('-', '');
      const { count } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .like('transaction_code', `TRX-${ym}-%`);
      const txCode = generateTxCodeClient(payload.transaction_date, count ?? 0);

      const { data: created, error } = await supabase
        .from('transactions')
        .insert({
          transaction_code: txCode,
          transaction_date: payload.transaction_date,
          type: payload.type,
          category_id: payload.category_id,
          category_name: payload.category_name || '',
          amount: payload.amount,
          member_id: payload.member_id || null,
          event_id: payload.event_id || null,
          related_party: payload.related_party || '-',
          description: payload.description || '',
          created_by: actor.id,
          created_by_name: actor.full_name,
        })
        .select()
        .single();
      if (error || !created) throw new Error(error?.message || 'Gagal mencatat transaksi.');

      if (payload.attachment?.file_url) {
        await supabase.from('attachments').insert({
          transaction_id: created.id,
          file_name: payload.attachment.file_name,
          file_url: payload.attachment.file_url,
          storage_path: payload.attachment.storage_path || null,
          mime_type: payload.attachment.mime_type,
          file_size: payload.attachment.file_size,
          uploaded_by: actor.id,
        });
      }

      await supabase.from('audit_logs').insert({
        table_name: 'transactions',
        record_id: created.id,
        action: 'CREATE',
        actor_id: actor.id,
        actor_name: actor.full_name,
        actor_role: actor.role,
        after_data: created,
        summary: `Mencatat ${payload.type} ${txCode} (${payload.category_name}) sebesar Rp ${payload.amount.toLocaleString('id-ID')}`,
      });
      return;
    }

    await apiFetch('/api/transactions', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateTransaction(
    id: string,
    before: Transaction,
    payload: {
      transaction_date: string;
      type: TransactionType;
      category_id: string;
      category_name?: string;
      amount: number;
      member_id?: string | null;
      event_id?: string | null;
      related_party: string;
      description: string;
      attachment?: {
        file_name: string;
        file_url: string;
        storage_path?: string;
        mime_type: string;
        file_size: number;
      } | null;
    },
    actor: UserProfile
  ): Promise<void> {
    if (isSupabaseConfigured && supabase) {
      const { data: updated, error } = await supabase
        .from('transactions')
        .update({
          transaction_date: payload.transaction_date,
          type: payload.type,
          category_id: payload.category_id,
          category_name: payload.category_name || before.category_name,
          amount: payload.amount,
          member_id: payload.member_id || null,
          event_id: payload.event_id || null,
          related_party: payload.related_party || '-',
          description: payload.description || '',
        })
        .eq('id', id)
        .select()
        .single();
      if (error || !updated) throw new Error(error?.message || 'Gagal memperbarui transaksi.');

      if (payload.attachment?.file_url) {
        await supabase.from('attachments').delete().eq('transaction_id', id);
        await supabase.from('attachments').insert({
          transaction_id: id,
          file_name: payload.attachment.file_name,
          file_url: payload.attachment.file_url,
          storage_path: payload.attachment.storage_path || null,
          mime_type: payload.attachment.mime_type,
          file_size: payload.attachment.file_size,
          uploaded_by: actor.id,
        });
      }

      await supabase.from('audit_logs').insert({
        table_name: 'transactions',
        record_id: id,
        action: 'UPDATE',
        actor_id: actor.id,
        actor_name: actor.full_name,
        actor_role: actor.role,
        before_data: before,
        after_data: updated,
        summary: `Mengubah transaksi ${before.transaction_code} (${updated.category_name}) menjadi Rp ${payload.amount.toLocaleString('id-ID')}`,
      });
      return;
    }

    await apiFetch(`/api/transactions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async softDeleteTransaction(
    tx: Transaction,
    reason: string,
    actor: UserProfile
  ): Promise<void> {
    if (isSupabaseConfigured && supabase) {
      const ts = new Date().toISOString();
      const { data: updated, error } = await supabase
        .from('transactions')
        .update({
          deleted_at: ts,
          deleted_by: actor.id,
          deleted_by_name: actor.full_name,
          delete_reason: reason || 'Diarsipkan oleh Bendahara',
        })
        .eq('id', tx.id)
        .select()
        .single();
      if (error || !updated) throw new Error(error?.message || 'Gagal mengarsipkan transaksi.');

      await supabase.from('audit_logs').insert({
        table_name: 'transactions',
        record_id: tx.id,
        action: 'SOFT_DELETE',
        actor_id: actor.id,
        actor_name: actor.full_name,
        actor_role: actor.role,
        before_data: tx,
        after_data: updated,
        summary: `Mengarsipkan transaksi ${tx.transaction_code} (${tx.category_name}) — Alasan: ${reason || '-'}`,
      });
      return;
    }

    await apiFetch(`/api/transactions/${tx.id}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    });
  },

  async restoreTransaction(tx: Transaction, actor: UserProfile): Promise<void> {
    if (isSupabaseConfigured && supabase) {
      const { data: updated, error } = await supabase
        .from('transactions')
        .update({
          deleted_at: null,
          deleted_by: null,
          deleted_by_name: null,
          delete_reason: null,
        })
        .eq('id', tx.id)
        .select()
        .single();
      if (error || !updated) throw new Error(error?.message || 'Gagal memulihkan transaksi.');

      await supabase.from('audit_logs').insert({
        table_name: 'transactions',
        record_id: tx.id,
        action: 'RESTORE',
        actor_id: actor.id,
        actor_name: actor.full_name,
        actor_role: actor.role,
        before_data: tx,
        after_data: updated,
        summary: `Memulihkan transaksi ${tx.transaction_code} dari arsip`,
      });
      return;
    }

    await apiFetch(`/api/transactions/${tx.id}/restore`, { method: 'POST' });
  },

  async createMember(
    payload: {
      full_name: string;
      whatsapp: string;
      avatar_url?: string | null;
      join_date: string;
      status: 'active' | 'inactive';
      notes?: string;
    },
    existingMembers: Member[],
    actor: UserProfile
  ): Promise<void> {
    if (isSupabaseConfigured && supabase) {
      if (existingMembers.length >= 30) {
        throw new Error('Batas maksimal 30 anggota komunitas SENTRA ANGLER telah tercapai.');
      }
      let maxNum = 0;
      for (const m of existingMembers) {
        const n = parseInt(m.member_code.replace(/\D/g, ''), 10);
        if (!Number.isNaN(n) && n > maxNum) maxNum = n;
      }
      const memberCode = `ANG-${String(maxNum + 1).padStart(3, '0')}`;
      const { data: created, error } = await supabase
        .from('members')
        .insert({ ...payload, member_code: memberCode })
        .select()
        .single();
      if (error || !created) throw new Error(error?.message || 'Gagal menambah anggota.');

      await supabase.from('audit_logs').insert({
        table_name: 'members',
        record_id: created.id,
        action: 'MEMBER_CHANGE',
        actor_id: actor.id,
        actor_name: actor.full_name,
        actor_role: actor.role,
        after_data: created,
        summary: `Menambahkan anggota baru ${payload.full_name} (${memberCode})`,
      });
      return;
    }

    await apiFetch('/api/members', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateMember(
    id: string,
    before: Member,
    payload: Partial<Member>,
    actor: UserProfile
  ): Promise<void> {
    if (isSupabaseConfigured && supabase) {
      const { data: updated, error } = await supabase
        .from('members')
        .update({
          full_name: payload.full_name,
          whatsapp: payload.whatsapp,
          avatar_url: payload.avatar_url,
          join_date: payload.join_date,
          status: payload.status,
          notes: payload.notes,
        })
        .eq('id', id)
        .select()
        .single();
      if (error || !updated) throw new Error(error?.message || 'Gagal mengubah data anggota.');

      await supabase.from('audit_logs').insert({
        table_name: 'members',
        record_id: id,
        action: 'MEMBER_CHANGE',
        actor_id: actor.id,
        actor_name: actor.full_name,
        actor_role: actor.role,
        before_data: before,
        after_data: updated,
        summary: `Memperbarui data anggota ${updated.full_name} (${updated.member_code})`,
      });
      return;
    }

    await apiFetch(`/api/members/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async createCategory(
    payload: { name: string; type: TransactionType },
    actor: UserProfile
  ): Promise<void> {
    if (isSupabaseConfigured && supabase) {
      const { data: created, error } = await supabase
        .from('categories')
        .insert({ name: payload.name.trim(), type: payload.type, is_default: false, sort_order: 99 })
        .select()
        .single();
      if (error || !created) throw new Error(error?.message || 'Gagal menambah kategori.');

      await supabase.from('audit_logs').insert({
        table_name: 'categories',
        record_id: created.id,
        action: 'CATEGORY_CHANGE',
        actor_id: actor.id,
        actor_name: actor.full_name,
        actor_role: actor.role,
        after_data: created,
        summary: `Menambahkan kategori ${payload.type}: ${payload.name}`,
      });
      return;
    }

    await apiFetch('/api/categories', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateCategory(
    id: string,
    before: Category,
    payload: { name?: string; is_active?: boolean },
    actor: UserProfile
  ): Promise<void> {
    if (isSupabaseConfigured && supabase) {
      const { data: updated, error } = await supabase
        .from('categories')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
      if (error || !updated) throw new Error(error?.message || 'Gagal memperbarui kategori.');

      await supabase.from('audit_logs').insert({
        table_name: 'categories',
        record_id: id,
        action: 'CATEGORY_CHANGE',
        actor_id: actor.id,
        actor_name: actor.full_name,
        actor_role: actor.role,
        before_data: before,
        after_data: updated,
        summary: `Mengubah kategori ${updated.name} (${updated.is_active ? 'Aktif' : 'Nonaktif'})`,
      });
      return;
    }

    await apiFetch(`/api/categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async updateUserAccess(
    id: string,
    before: UserProfile,
    payload: { role?: UserRole; is_active?: boolean; full_name?: string; whatsapp?: string },
    actor: UserProfile
  ): Promise<void> {
    if (isSupabaseConfigured && supabase) {
      const { data: updated, error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
      if (error || !updated) throw new Error(error?.message || 'Gagal mengubah akses pengguna.');

      await supabase.from('audit_logs').insert({
        table_name: 'profiles',
        record_id: id,
        action: 'ROLE_CHANGE',
        actor_id: actor.id,
        actor_name: actor.full_name,
        actor_role: actor.role,
        before_data: before,
        after_data: updated,
        summary: `Memperbarui akses pengguna ${updated.full_name} (${updated.role})`,
      });
      return;
    }

    await apiFetch(`/api/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async createUser(payload: {
    email: string;
    password: string;
    full_name: string;
    role: UserRole;
    whatsapp?: string;
  }): Promise<void> {
    if (isSupabaseConfigured) {
      throw new Error(
        'Di mode Supabase, anggota baru mendaftar via halaman Registrasi lalu Bendahara mengubah role-nya di menu Pengguna & Role.'
      );
    }
    await apiFetch('/api/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async createEvent(
    payload: {
      title: string;
      event_date: string;
      location: string;
      description: string;
      target_participants: number;
      fee_per_member: number;
    },
    actor: UserProfile
  ): Promise<CommunityEvent> {
    if (isSupabaseConfigured && supabase) {
      const ym = payload.event_date.slice(0, 7).replace('-', '');
      const { count, error: countErr } = await supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .like('event_code', `EVT-${ym}-%`);
      if (countErr) {
        throw new Error(
          'Tabel acara belum tersedia di Supabase. Jalankan file supabase/migration_events.sql di SQL Editor Supabase terlebih dahulu.'
        );
      }
      const eventCode = `EVT-${ym}-${String((count ?? 0) + 1).padStart(3, '0')}`;
      const { data: created, error } = await supabase
        .from('events')
        .insert({
          event_code: eventCode,
          title: payload.title.trim(),
          event_date: payload.event_date,
          location: payload.location.trim(),
          description: payload.description.trim(),
          target_participants: Math.min(30, Math.max(1, payload.target_participants)),
          fee_per_member: Math.max(0, payload.fee_per_member),
          status: 'planned',
          created_by: actor.id,
          created_by_name: actor.full_name,
        })
        .select()
        .single();
      if (error || !created) throw new Error(error?.message || 'Gagal membuat acara.');

      await supabase.from('audit_logs').insert({
        table_name: 'events',
        record_id: created.id,
        action: 'EVENT_CHANGE',
        actor_id: actor.id,
        actor_name: actor.full_name,
        actor_role: actor.role,
        after_data: created,
        summary: `Membuat rencana acara ${eventCode}: ${payload.title}`,
      });
      return created as CommunityEvent;
    }

    return apiFetch<CommunityEvent>('/api/events', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateEvent(
    id: string,
    before: CommunityEvent,
    payload: {
      title?: string;
      event_date?: string;
      location?: string;
      description?: string;
      target_participants?: number;
      fee_per_member?: number;
      status?: EventStatus;
    },
    actor: UserProfile
  ): Promise<void> {
    if (isSupabaseConfigured && supabase) {
      const { data: updated, error } = await supabase
        .from('events')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
      if (error || !updated) throw new Error(error?.message || 'Gagal memperbarui acara.');

      await supabase.from('audit_logs').insert({
        table_name: 'events',
        record_id: id,
        action: 'EVENT_CHANGE',
        actor_id: actor.id,
        actor_name: actor.full_name,
        actor_role: actor.role,
        before_data: before,
        after_data: updated,
        summary: `Memperbarui acara ${updated.event_code}: ${updated.title} (${updated.status})`,
      });
      return;
    }

    await apiFetch(`/api/events/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async addEventBudgetItem(
    eventId: string,
    eventCode: string,
    payload: {
      type: TransactionType;
      category_id: string;
      category_name: string;
      item_name: string;
      estimated_amount: number;
      notes?: string;
    },
    actor: UserProfile
  ): Promise<void> {
    if (isSupabaseConfigured && supabase) {
      const { data: created, error } = await supabase
        .from('event_budget_items')
        .insert({
          event_id: eventId,
          type: payload.type,
          category_id: payload.category_id,
          category_name: payload.category_name,
          item_name: payload.item_name.trim(),
          estimated_amount: Math.max(0, payload.estimated_amount),
          notes: payload.notes?.trim() || null,
        })
        .select()
        .single();
      if (error || !created) throw new Error(error?.message || 'Gagal menambah pos RAB.');

      await supabase.from('audit_logs').insert({
        table_name: 'event_budget_items',
        record_id: created.id,
        action: 'EVENT_CHANGE',
        actor_id: actor.id,
        actor_name: actor.full_name,
        actor_role: actor.role,
        after_data: created,
        summary: `Menambah pos RAB ${eventCode}: ${payload.item_name} (Rp ${payload.estimated_amount.toLocaleString('id-ID')})`,
      });
      return;
    }

    await apiFetch(`/api/events/${eventId}/budget-items`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async deleteEventBudgetItem(
    eventId: string,
    item: EventBudgetItem,
    actor: UserProfile
  ): Promise<void> {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from('event_budget_items').delete().eq('id', item.id);
      if (error) throw new Error(error.message);

      await supabase.from('audit_logs').insert({
        table_name: 'event_budget_items',
        record_id: item.id,
        action: 'EVENT_CHANGE',
        actor_id: actor.id,
        actor_name: actor.full_name,
        actor_role: actor.role,
        before_data: item,
        summary: `Menghapus pos RAB: ${item.item_name}`,
      });
      return;
    }

    await apiFetch(`/api/events/${eventId}/budget-items/${item.id}`, {
      method: 'DELETE',
    });
  },

  async syncEventParticipants(
    eventId: string,
    eventCode: string,
    memberIds: string[],
    actor: UserProfile
  ): Promise<void> {
    if (isSupabaseConfigured && supabase) {
      const { error: delErr } = await supabase
        .from('event_participants')
        .delete()
        .eq('event_id', eventId);
      if (delErr) throw new Error(delErr.message);

      if (memberIds.length > 0) {
        const rows = memberIds.map((mid) => ({
          event_id: eventId,
          member_id: mid,
          is_attending: true,
        }));
        const { error: insErr } = await supabase.from('event_participants').insert(rows);
        if (insErr) throw new Error(insErr.message);
      }

      await supabase.from('audit_logs').insert({
        table_name: 'event_participants',
        record_id: eventId,
        action: 'EVENT_CHANGE',
        actor_id: actor.id,
        actor_name: actor.full_name,
        actor_role: actor.role,
        after_data: { event_id: eventId, participant_count: memberIds.length },
        summary: `Memperbarui daftar peserta acara ${eventCode} (${memberIds.length} anggota)`,
      });
      return;
    }

    await apiFetch(`/api/events/${eventId}/participants`, {
      method: 'PUT',
      body: JSON.stringify({ member_ids: memberIds }),
    });
  },

  subscribeRealtime(
    onNotification: (notif: RealtimeNotification) => void,
    onDataChange: () => void
  ): () => void {
    if (isSupabaseConfigured && supabase) {
      const channel = supabase
        .channel('sentra-angler-realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'transactions' },
          (payload) => {
            const row = (payload.new || payload.old) as Partial<Transaction> | undefined;
            if (!row) return;
            const amount = Number(row.amount || 0);
            let eventType: RealtimeNotification['event_type'] = 'TRANSACTION_CREATED';
            let title = row.type === 'pemasukan' ? 'Kas Masuk Baru' : 'Pengeluaran Baru';
            let message = `${row.category_name || 'Transaksi'} · ${row.related_party || '-'} — Rp ${amount.toLocaleString('id-ID')}`;

            if (payload.eventType === 'UPDATE') {
              if (row.deleted_at) {
                eventType = 'TRANSACTION_DELETED';
                title = 'Transaksi Diarsipkan';
                message = `${row.transaction_code} · ${row.category_name} dipindahkan ke arsip`;
              } else {
                eventType = 'TRANSACTION_UPDATED';
                title = 'Transaksi Diperbarui';
                message = `${row.transaction_code} · ${row.category_name} — Rp ${amount.toLocaleString('id-ID')}`;
              }
            }

            onNotification({
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              event_type: eventType,
              title,
              message,
              transaction_type: row.type,
              amount,
              actor_name: row.created_by_name || 'Bendahara',
              created_at: new Date().toISOString(),
              read: false,
            });
            onDataChange();
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'settings' },
          () => {
            onDataChange();
          }
        )
        .subscribe();

      return () => {
        supabase?.removeChannel(channel);
      };
    }

    // WebSocket real-time connection to server.ts
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      if (closed) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${window.location.host}/ws`);
      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(String(evt.data)) as Partial<RealtimeNotification> & {
            event_type: string;
          };
          if (
            data.event_type === 'TRANSACTION_CREATED' ||
            data.event_type === 'TRANSACTION_UPDATED' ||
            data.event_type === 'TRANSACTION_DELETED' ||
            data.event_type === 'TRANSACTION_RESTORED' ||
            data.event_type === 'BALANCE_INITIALIZED'
          ) {
            onNotification({
              id: data.id || `${Date.now()}`,
              event_type: data.event_type,
              title: data.title || 'Pembaruan Kas',
              message: data.message || '',
              transaction_type: data.transaction_type,
              amount: data.amount,
              actor_name: data.actor_name || 'Bendahara',
              created_at: data.created_at || new Date().toISOString(),
              read: false,
            });
            onDataChange();
          }
        } catch {
          // ignore malformed WS frames
        }
      };
      ws.onclose = () => {
        if (!closed) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  },
};
