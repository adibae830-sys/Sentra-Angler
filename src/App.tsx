import React, { useCallback, useEffect, useState } from 'react';
import {
  Anchor,
  ArrowLeftRight,
  Bell,
  FileBarChart2,
  LayoutDashboard,
  LogOut,
  Plus,
  Settings,
  ShieldCheck,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { AuditLogView } from './components/AuditLogView';
import { AuthView } from './components/AuthView';
import { DashboardView } from './components/DashboardView';
import { InitialBalanceModal } from './components/InitialBalanceModal';
import { MembersView } from './components/MembersView';
import {
  NotificationDrawer,
  RealtimeToastStack,
} from './components/NotificationCenter';
import { PWAInstallButton } from './components/PWAInstallButton';
import { ReportsView } from './components/ReportsView';
import { SettingsAdminView } from './components/SettingsAdminView';
import { TransactionModal } from './components/TransactionModal';
import { TransactionsView } from './components/TransactionsView';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { dataService, loadOfflineCache, type AppSnapshot } from './lib/dataService';
import { formatDateTimeID } from './lib/formatters';
import type { RealtimeNotification, Transaction, UserProfile } from './types';

type ActiveTab =
  | 'dashboard'
  | 'transactions'
  | 'members'
  | 'reports'
  | 'audit'
  | 'settings';

const NAV_ITEMS: Array<{
  id: ActiveTab;
  label: string;
  shortLabel: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { id: 'dashboard', label: 'Dashboard', shortLabel: 'Beranda', icon: LayoutDashboard },
  { id: 'transactions', label: 'Transaksi Kas', shortLabel: 'Kas', icon: ArrowLeftRight },
  { id: 'members', label: 'Anggota (Maks 30)', shortLabel: 'Anggota', icon: Users },
  { id: 'reports', label: 'Laporan PDF & Excel', shortLabel: 'Laporan', icon: FileBarChart2 },
  { id: 'audit', label: 'Audit Log', shortLabel: 'Audit', icon: ShieldCheck },
  { id: 'settings', label: 'Pengaturan & Panduan', shortLabel: 'Menu', icon: Settings },
];

function playNotificationPing() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.26);
  } catch {
    // Ignore autoplay restriction
  }
}

export default function App() {
  const isOnline = useOnlineStatus();

  const [booting, setBooting] = useState(true);
  const [hasUsers, setHasUsers] = useState(true);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [initialBalModalOpen, setInitialBalModalOpen] = useState(false);

  const [notifications, setNotifications] = useState<RealtimeNotification[]>([]);
  const [toasts, setToasts] = useState<RealtimeNotification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoadingData(true);
    setDataError(null);
    try {
      const fresh = await dataService.fetchAllSnapshot();
      setSnapshot(fresh);
    } catch (err) {
      const cached = loadOfflineCache();
      if (cached) {
        setSnapshot(cached);
      } else {
        setDataError(err instanceof Error ? err.message : 'Gagal memuat data kas.');
      }
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [boot, user] = await Promise.all([
          dataService.getBootstrapStatus().catch(() => ({ hasUsers: true })),
          dataService.getCurrentUser().catch(() => null),
        ]);
        if (!mounted) return;
        setHasUsers(boot.hasUsers);
        setCurrentUser(user);
        if (user) {
          await loadData();
        }
      } finally {
        if (mounted) setBooting(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [loadData]);

  // Real-time subscription when logged in & online
  useEffect(() => {
    if (!currentUser || !isOnline) return;
    const unsubscribe = dataService.subscribeRealtime(
      (notif) => {
        setNotifications((prev) => [notif, ...prev].slice(0, 50));
        setToasts((prev) => [notif, ...prev].slice(0, 3));
        playNotificationPing();
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== notif.id));
        }, 6000);
      },
      () => {
        void loadData();
      }
    );
    return unsubscribe;
  }, [currentUser, isOnline, loadData]);

  const handleAuthenticated = async (user: UserProfile) => {
    setCurrentUser(user);
    setHasUsers(true);
    await loadData();
  };

  const handleLogout = async () => {
    await dataService.logout();
    setCurrentUser(null);
    setSnapshot(null);
    setNotifications([]);
  };

  const handleSetInitialBalance = async (amount: number, note: string) => {
    if (!currentUser) return;
    await dataService.setInitialBalance(amount, note, currentUser);
    await loadData();
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  if (booting) {
    return (
      <div className="min-h-screen bg-[#0B192C] flex flex-col items-center justify-center text-white p-6">
        <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center">
          <Anchor className="w-6 h-6 text-orange-400 animate-pulse" />
        </div>
        <p className="mt-4 font-display text-lg font-bold tracking-tight">SENTRA ANGLER</p>
        <p className="mt-1 text-xs text-slate-400">Memuat buku kas digital...</p>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthView hasUsers={hasUsers} onAuthenticated={handleAuthenticated} />;
  }

  const isBendahara = currentUser.role === 'bendahara';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row">
      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-[#0B192C] text-white border-r border-slate-800">
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
              <Anchor className="w-5 h-5 text-orange-400" />
            </div>
            <div className="min-w-0">
              <span className="font-display text-base font-bold tracking-tight block truncate">
                SENTRA ANGLER
              </span>
              <span className="text-[11px] text-slate-400 block truncate">
                Transparansi Kas Komunitas
              </span>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-orange-500 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-3">
          <PWAInstallButton variant="sidebar" />

          <div className="rounded-xl bg-white/5 border border-white/10 p-3">
            <p className="text-xs font-semibold text-white truncate">{currentUser.full_name}</p>
            <p className="text-[11px] text-orange-400 font-medium mt-0.5">
              {isBendahara ? 'Bendahara (Akses Penuh)' : 'Anggota (Hanya Baca)'}
            </p>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium text-slate-200 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Keluar</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-h-screen pb-20 lg:pb-8">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 h-14 lg:h-16 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="lg:hidden w-8 h-8 rounded-lg bg-[#0B192C] flex items-center justify-center shrink-0">
              <Anchor className="w-4 h-4 text-orange-400" />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-sm sm:text-base font-bold text-slate-900 truncate">
                {NAV_ITEMS.find((n) => n.id === activeTab)?.label || 'SENTRA ANGLER'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Online / Offline Indicator */}
            <div
              title={isOnline ? 'Terhubung ke server' : 'Mode Offline (Cache sementara)'}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border ${
                isOnline
                  ? 'border-slate-200 bg-slate-50 text-slate-700'
                  : 'border-amber-300 bg-amber-50 text-amber-800'
              }`}
            >
              {isOnline ? (
                <Wifi className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-amber-600" />
              )}
              <span className="hidden sm:inline">{isOnline ? 'Online' : 'Offline'}</span>
            </div>

            <div className="lg:hidden">
              <PWAInstallButton variant="compact" />
            </div>

            {/* Real-time Notification Bell */}
            <button
              type="button"
              onClick={() => setNotifOpen(true)}
              aria-label="Notifikasi Real-Time"
              className="relative min-w-[40px] min-h-[40px] rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-700 cursor-pointer"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center font-mono-num">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Primary Bendahara Action */}
            {isBendahara && (
              <button
                type="button"
                disabled={!isOnline}
                onClick={() => {
                  setEditingTx(null);
                  setTxModalOpen(true);
                }}
                className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 min-h-[40px] cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Catat Transaksi</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleLogout}
              title="Keluar"
              className="lg:hidden min-w-[40px] min-h-[40px] rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-600 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Offline Banner */}
        {!isOnline && (
          <div className="bg-amber-500 text-white px-4 py-2.5 text-xs font-medium flex items-center justify-center gap-2 text-center">
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>
              Mode Offline — Menampilkan data cache sementara
              {snapshot?.cachedAt ? ` (${formatDateTimeID(snapshot.cachedAt)})` : ''}. Pencatatan
              transaksi dinonaktifkan sampai koneksi tersambung kembali.
            </span>
          </div>
        )}

        {/* Main Workspace */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {dataError && !snapshot ? (
            <div className="rounded-2xl bg-red-50 border border-red-200 p-6 text-center">
              <p className="text-sm font-semibold text-red-800">{dataError}</p>
              <button
                type="button"
                onClick={() => void loadData()}
                className="mt-3 px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold cursor-pointer"
              >
                Coba Muat Ulang
              </button>
            </div>
          ) : !snapshot || (loadingData && !snapshot) ? (
            <div className="space-y-4">
              <div className="h-36 rounded-2xl bg-slate-200 animate-pulse" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="h-28 rounded-2xl bg-slate-200 animate-pulse" />
                <div className="h-28 rounded-2xl bg-slate-200 animate-pulse" />
                <div className="h-28 rounded-2xl bg-slate-200 animate-pulse" />
              </div>
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <DashboardView
                  role={currentUser.role}
                  summary={snapshot.summary}
                  transactions={snapshot.transactions}
                  members={snapshot.members}
                  isOnline={isOnline}
                  onOpenInitialBalance={() => setInitialBalModalOpen(true)}
                  onAddTransaction={() => {
                    setEditingTx(null);
                    setTxModalOpen(true);
                  }}
                  onNavigateTransactions={() => setActiveTab('transactions')}
                />
              )}

              {activeTab === 'transactions' && (
                <TransactionsView
                  transactions={snapshot.transactions}
                  categories={snapshot.categories}
                  members={snapshot.members}
                  currentUser={currentUser}
                  isOnline={isOnline}
                  onAddNew={() => {
                    setEditingTx(null);
                    setTxModalOpen(true);
                  }}
                  onEdit={(tx) => {
                    setEditingTx(tx);
                    setTxModalOpen(true);
                  }}
                  onRefresh={loadData}
                />
              )}

              {activeTab === 'members' && (
                <MembersView
                  members={snapshot.members}
                  transactions={snapshot.transactions}
                  currentUser={currentUser}
                  isOnline={isOnline}
                  onRefresh={loadData}
                />
              )}

              {activeTab === 'reports' && (
                <ReportsView
                  transactions={snapshot.transactions}
                  members={snapshot.members}
                  summary={snapshot.summary}
                  currentUser={currentUser}
                />
              )}

              {activeTab === 'audit' && <AuditLogView logs={snapshot.auditLogs} />}

              {activeTab === 'settings' && (
                <SettingsAdminView
                  currentUser={currentUser}
                  settings={snapshot.settings}
                  categories={snapshot.categories}
                  users={snapshot.users}
                  isOnline={isOnline}
                  onOpenInitialBalance={() => setInitialBalModalOpen(true)}
                  onRefresh={loadData}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Mobile Floating Add Transaction Button for Bendahara (Thumb Zone) */}
      {isBendahara && (
        <button
          type="button"
          disabled={!isOnline}
          onClick={() => {
            setEditingTx(null);
            setTxModalOpen(true);
          }}
          aria-label="Catat Transaksi Baru"
          className="lg:hidden fixed bottom-20 right-4 z-40 h-12 px-4 rounded-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold text-xs shadow-lg shadow-orange-500/30 flex items-center gap-1.5 active:scale-95 transition-transform cursor-pointer"
        >
          <Plus className="w-5 h-5" />
          <span>Catat</span>
        </button>
      )}

      {/* Mobile Fixed Bottom Navigation (<= 15% viewport height) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe">
        <div className="grid grid-cols-6 h-16 items-center">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center justify-center min-h-[44px] text-[10px] font-semibold transition-colors cursor-pointer ${
                  active ? 'text-orange-600' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="mt-1 truncate max-w-full px-0.5">{item.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Modals & Real-time Overlays */}
      {snapshot && (
        <TransactionModal
          isOpen={txModalOpen}
          editingTransaction={editingTx}
          categories={snapshot.categories}
          members={snapshot.members}
          currentUser={currentUser}
          onClose={() => {
            setTxModalOpen(false);
            setEditingTx(null);
          }}
          onSaved={loadData}
        />
      )}

      <InitialBalanceModal
        isOpen={initialBalModalOpen}
        onClose={() => setInitialBalModalOpen(false)}
        onSubmit={handleSetInitialBalance}
      />

      <NotificationDrawer
        isOpen={notifOpen}
        onClose={() => setNotifOpen(false)}
        notifications={notifications}
        onMarkAllRead={() =>
          setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
        }
        onClearAll={() => setNotifications([])}
      />

      <RealtimeToastStack
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />
    </div>
  );
}
