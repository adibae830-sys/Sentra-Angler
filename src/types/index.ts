export type UserRole = 'bendahara' | 'anggota';
export type TransactionType = 'pemasukan' | 'pengeluaran';
export type MemberStatus = 'active' | 'inactive';
export type EventStatus = 'planned' | 'ongoing' | 'completed' | 'cancelled';
export type DashboardPeriod = 'this_month' | 'last_month' | 'this_year' | 'all';
export type ReportType =
  | 'kas_keseluruhan'
  | 'pemasukan'
  | 'pengeluaran'
  | 'per_kategori'
  | 'kontribusi_anggota';
export type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  whatsapp?: string | null;
  avatar_url?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface Member {
  id: string;
  member_code: string;
  full_name: string;
  whatsapp: string;
  avatar_url?: string | null;
  join_date: string;
  status: MemberStatus;
  profile_id?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at?: string;
  total_contribution?: number;
  transaction_count?: number;
}

export interface Category {
  id: string;
  name: string;
  type: TransactionType;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
}

export interface Attachment {
  id: string;
  transaction_id: string;
  file_name: string;
  file_url: string;
  storage_path?: string | null;
  mime_type: string;
  file_size: number;
  uploaded_by?: string | null;
  created_at: string;
}

export interface CommunityEvent {
  id: string;
  event_code: string;
  title: string;
  event_date: string;
  location: string;
  description: string;
  target_participants: number;
  fee_per_member: number;
  status: EventStatus;
  created_by?: string | null;
  created_by_name: string;
  created_at: string;
  updated_at?: string;
}

export interface EventBudgetItem {
  id: string;
  event_id: string;
  type: TransactionType;
  category_id: string;
  category_name: string;
  item_name: string;
  estimated_amount: number;
  notes?: string | null;
  created_at: string;
}

export interface EventParticipant {
  id: string;
  event_id: string;
  member_id: string;
  is_attending: boolean;
  notes?: string | null;
  created_at: string;
}

export interface Transaction {
  id: string;
  transaction_code: string;
  transaction_date: string;
  type: TransactionType;
  category_id: string;
  category_name: string;
  amount: number;
  member_id?: string | null;
  event_id?: string | null;
  related_party: string;
  description: string;
  created_by?: string | null;
  created_by_name: string;
  created_at: string;
  updated_at?: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
  deleted_by_name?: string | null;
  delete_reason?: string | null;
  attachments?: Attachment[];
}

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'SOFT_DELETE'
  | 'RESTORE'
  | 'INITIAL_BALANCE'
  | 'ROLE_CHANGE'
  | 'MEMBER_CHANGE'
  | 'CATEGORY_CHANGE'
  | 'EVENT_CHANGE';

export interface AuditLog {
  id: string;
  table_name: string;
  record_id: string;
  action: AuditAction;
  actor_id?: string | null;
  actor_name: string;
  actor_role: string;
  before_data?: Record<string, unknown> | null;
  after_data?: Record<string, unknown> | null;
  summary: string;
  created_at: string;
}

export interface AppSettings {
  id: string;
  community_name: string;
  tagline: string;
  max_members: number;
  initial_balance: number;
  initial_balance_set: boolean;
  initial_balance_note?: string | null;
  initial_balance_set_at?: string | null;
  initial_balance_set_by?: string | null;
  updated_at?: string;
}

export interface CashSummary {
  initial_balance: number;
  initial_balance_set: boolean;
  total_income: number;
  total_expense: number;
  current_balance: number;
}

export interface RealtimeNotification {
  id: string;
  event_type:
    | 'TRANSACTION_CREATED'
    | 'TRANSACTION_UPDATED'
    | 'TRANSACTION_DELETED'
    | 'TRANSACTION_RESTORED'
    | 'BALANCE_INITIALIZED';
  title: string;
  message: string;
  transaction_type?: TransactionType;
  amount?: number;
  actor_name: string;
  created_at: string;
  read: boolean;
}
