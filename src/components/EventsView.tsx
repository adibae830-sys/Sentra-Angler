import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Edit3,
  FileSpreadsheet,
  FileText,
  MapPin,
  MessageCircle,
  Plus,
  Trash2,
  UserCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { dataService } from '../lib/dataService';
import { exportEventReportToExcel, exportEventReportToPDF } from '../lib/exportReports';
import { formatDateID, formatIDR, getTodayISO, normalizeWhatsApp } from '../lib/formatters';
import type {
  CashSummary,
  Category,
  CommunityEvent,
  EventBudgetItem,
  EventParticipant,
  EventStatus,
  Member,
  Transaction,
  TransactionType,
  UserProfile,
} from '../types';
import type { TransactionPrefill } from './TransactionModal';

interface EventsViewProps {
  events: CommunityEvent[];
  budgetItems: EventBudgetItem[];
  participants: EventParticipant[];
  transactions: Transaction[];
  categories: Category[];
  members: Member[];
  summary: CashSummary;
  currentUser: UserProfile;
  isOnline: boolean;
  onOpenTransactionModal: (prefill: TransactionPrefill) => void;
  onRefresh: () => Promise<void>;
}

const STATUS_LABELS: Record<EventStatus, string> = {
  planned: 'Direncanakan',
  ongoing: 'Berlangsung',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
};

const STATUS_TEXT_COLORS: Record<EventStatus, string> = {
  planned: 'text-amber-700',
  ongoing: 'text-blue-700',
  completed: 'text-emerald-700',
  cancelled: 'text-slate-500',
};

export const EventsView: React.FC<EventsViewProps> = ({
  events,
  budgetItems,
  participants,
  transactions,
  categories,
  members,
  summary,
  currentUser,
  isOnline,
  onOpenTransactionModal,
  onRefresh,
}) => {
  const isBendahara = currentUser.role === 'bendahara';

  const [statusFilter, setStatusFilter] = useState<'all' | EventStatus>('all');
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [detailTab, setDetailTab] = useState<'rab' | 'participants' | 'transactions'>('rab');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create / Edit Event Modal
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CommunityEvent | null>(null);
  const [evTitle, setEvTitle] = useState('');
  const [evDate, setEvDate] = useState(getTodayISO());
  const [evLocation, setEvLocation] = useState('');
  const [evDesc, setEvDesc] = useState('');
  const [evTargetParticipants, setEvTargetParticipants] = useState('15');
  const [evFeePerMember, setEvFeePerMember] = useState('100000');

  // Inline Add RAB Item
  const [rabType, setRabType] = useState<TransactionType>('pengeluaran');
  const [rabCategoryId, setRabCategoryId] = useState('');
  const [rabItemName, setRabItemName] = useState('');
  const [rabAmount, setRabAmount] = useState('');
  const [rabNotes, setRabNotes] = useState('');

  // Participant Selector Modal
  const [participantModalOpen, setParticipantModalOpen] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  const filteredEvents = useMemo(() => {
    if (statusFilter === 'all') return events;
    return events.filter((e) => e.status === statusFilter);
  }, [events, statusFilter]);

  useEffect(() => {
    if (filteredEvents.length === 0) {
      setSelectedEventId('');
      return;
    }
    const stillExists = filteredEvents.some((e) => e.id === selectedEventId);
    if (!stillExists) {
      setSelectedEventId(filteredEvents[0].id);
    }
  }, [filteredEvents, selectedEventId]);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) || null,
    [events, selectedEventId]
  );

  const rabAvailableCategories = useMemo(
    () => categories.filter((c) => c.type === rabType && c.is_active),
    [categories, rabType]
  );

  useEffect(() => {
    if (!rabAvailableCategories.some((c) => c.id === rabCategoryId)) {
      setRabCategoryId(rabAvailableCategories[0]?.id || '');
    }
  }, [rabAvailableCategories, rabCategoryId]);

  const eventBudgets = useMemo(
    () => (selectedEvent ? budgetItems.filter((b) => b.event_id === selectedEvent.id) : []),
    [budgetItems, selectedEvent]
  );

  const eventParticipants = useMemo(
    () => (selectedEvent ? participants.filter((p) => p.event_id === selectedEvent.id) : []),
    [participants, selectedEvent]
  );

  const eventTransactions = useMemo(
    () =>
      selectedEvent
        ? transactions.filter((t) => t.event_id === selectedEvent.id && !t.deleted_at)
        : [],
    [transactions, selectedEvent]
  );

  const metrics = useMemo(() => {
    const estIncome = eventBudgets
      .filter((b) => b.type === 'pemasukan')
      .reduce((acc, b) => acc + b.estimated_amount, 0);
    const estExpense = eventBudgets
      .filter((b) => b.type === 'pengeluaran')
      .reduce((acc, b) => acc + b.estimated_amount, 0);

    const actualIncome = eventTransactions
      .filter((t) => t.type === 'pemasukan')
      .reduce((acc, t) => acc + t.amount, 0);
    const actualExpense = eventTransactions
      .filter((t) => t.type === 'pengeluaran')
      .reduce((acc, t) => acc + t.amount, 0);

    const actualByCat = new Map<string, number>();
    for (const t of eventTransactions) {
      const key = `${t.type}|${t.category_id}`;
      actualByCat.set(key, (actualByCat.get(key) || 0) + t.amount);
    }

    const budgetedCatKeys = new Set(eventBudgets.map((b) => `${b.type}|${b.category_id}`));
    const unbudgetedItems: Array<{
      key: string;
      type: TransactionType;
      category_id: string;
      category_name: string;
      actual: number;
    }> = [];
    for (const [key, total] of actualByCat.entries()) {
      if (!budgetedCatKeys.has(key)) {
        const [tType, catId] = key.split('|');
        const sample = eventTransactions.find((t) => t.type === tType && t.category_id === catId);
        unbudgetedItems.push({
          key,
          type: tType as TransactionType,
          category_id: catId,
          category_name: sample?.category_name || '-',
          actual: total,
        });
      }
    }

    const targetCount = selectedEvent?.target_participants || 1;
    const fee = selectedEvent?.fee_per_member || 0;
    const projectedMemberFeeIncome = targetCount * fee;
    const suggestedFee = estExpense > 0 ? Math.ceil(estExpense / Math.max(1, targetCount)) : 0;

    // Cash check: can existing community cash cover the deficit (if estExpense > estIncome)?
    const netNeedFromCash = Math.max(0, estExpense - estIncome);
    const cashShortfall = Math.max(0, netNeedFromCash - summary.current_balance);

    return {
      estIncome,
      estExpense,
      estSurplus: estIncome - estExpense,
      actualIncome,
      actualExpense,
      actualSurplus: actualIncome - actualExpense,
      actualByCat,
      unbudgetedItems,
      projectedMemberFeeIncome,
      suggestedFee,
      netNeedFromCash,
      cashShortfall,
    };
  }, [eventBudgets, eventTransactions, selectedEvent, summary.current_balance]);

  const participantDetails = useMemo(() => {
    if (!selectedEvent) return [];
    return eventParticipants
      .map((p) => {
        const member = members.find((m) => m.id === p.member_id);
        if (!member) return null;
        const paid = eventTransactions
          .filter((t) => t.type === 'pemasukan' && t.member_id === member.id)
          .reduce((acc, t) => acc + t.amount, 0);
        const target = selectedEvent.fee_per_member;
        const remaining = Math.max(0, target - paid);
        const status: 'lunas' | 'sebagian' | 'belum' | 'gratis' =
          target <= 0 ? 'gratis' : paid >= target ? 'lunas' : paid > 0 ? 'sebagian' : 'belum';
        return {
          participant: p,
          member,
          paid,
          target,
          remaining,
          status,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort((a, b) => a.member.member_code.localeCompare(b.member.member_code));
  }, [eventParticipants, members, eventTransactions, selectedEvent]);

  const participantStats = useMemo(() => {
    const lunas = participantDetails.filter((d) => d.status === 'lunas').length;
    const sebagian = participantDetails.filter((d) => d.status === 'sebagian').length;
    const belum = participantDetails.filter((d) => d.status === 'belum').length;
    const totalPaid = participantDetails.reduce((sum, d) => sum + d.paid, 0);
    return { lunas, sebagian, belum, totalPaid };
  }, [participantDetails]);

  const defaultFeeCategoryId = useMemo(() => {
    const incomeCats = categories.filter((c) => c.type === 'pemasukan' && c.is_active);
    return (
      incomeCats.find((c) => c.name.toLowerCase().includes('iuran'))?.id ||
      incomeCats.find((c) => c.name.toLowerCase().includes('kontribusi'))?.id ||
      incomeCats[0]?.id ||
      ''
    );
  }, [categories]);

  const openCreateEventModal = () => {
    setEditingEvent(null);
    setEvTitle('');
    setEvDate(getTodayISO());
    setEvLocation('');
    setEvDesc('');
    setEvTargetParticipants(String(Math.min(30, Math.max(1, members.filter((m) => m.status === 'active').length || 15))));
    setEvFeePerMember('100000');
    setError(null);
    setEventModalOpen(true);
  };

  const openEditEventModal = (ev: CommunityEvent) => {
    setEditingEvent(ev);
    setEvTitle(ev.title);
    setEvDate(ev.event_date);
    setEvLocation(ev.location || '');
    setEvDesc(ev.description || '');
    setEvTargetParticipants(String(ev.target_participants));
    setEvFeePerMember(String(Math.round(ev.fee_per_member)));
    setError(null);
    setEventModalOpen(true);
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const targetNum = Math.min(30, Math.max(1, Number(evTargetParticipants) || 1));
      const feeNum = Math.max(0, Number(evFeePerMember.replace(/\D/g, '')) || 0);
      if (editingEvent) {
        await dataService.updateEvent(
          editingEvent.id,
          editingEvent,
          {
            title: evTitle,
            event_date: evDate,
            location: evLocation,
            description: evDesc,
            target_participants: targetNum,
            fee_per_member: feeNum,
          },
          currentUser
        );
      } else {
        const created = await dataService.createEvent(
          {
            title: evTitle,
            event_date: evDate,
            location: evLocation,
            description: evDesc,
            target_participants: targetNum,
            fee_per_member: feeNum,
          },
          currentUser
        );
        setSelectedEventId(created.id);
      }
      setEventModalOpen(false);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan rencana acara.');
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateEventStatus = async (status: EventStatus) => {
    if (!selectedEvent) return;
    setBusy(true);
    setError(null);
    try {
      await dataService.updateEvent(selectedEvent.id, selectedEvent, { status }, currentUser);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengubah status acara.');
    } finally {
      setBusy(false);
    }
  };

  const handleAddBudgetItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvent) return;
    const numericAmount = Number(rabAmount.replace(/\D/g, '')) || 0;
    if (numericAmount <= 0) {
      setError('Nominal estimasi RAB harus lebih dari Rp 0.');
      return;
    }
    const cat = categories.find((c) => c.id === rabCategoryId);
    if (!cat) {
      setError('Pilih kategori anggaran terlebih dahulu.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await dataService.addEventBudgetItem(
        selectedEvent.id,
        selectedEvent.event_code,
        {
          type: rabType,
          category_id: cat.id,
          category_name: cat.name,
          item_name: rabItemName,
          estimated_amount: numericAmount,
          notes: rabNotes,
        },
        currentUser
      );
      setRabItemName('');
      setRabAmount('');
      setRabNotes('');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menambah pos RAB.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteBudgetItem = async (item: EventBudgetItem) => {
    if (!selectedEvent) return;
    setBusy(true);
    setError(null);
    try {
      await dataService.deleteEventBudgetItem(selectedEvent.id, item, currentUser);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus pos RAB.');
    } finally {
      setBusy(false);
    }
  };

  const openParticipantModal = () => {
    setSelectedMemberIds(eventParticipants.map((p) => p.member_id));
    setError(null);
    setParticipantModalOpen(true);
  };

  const toggleParticipantMember = (memberId: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    );
  };

  const handleSaveParticipants = async () => {
    if (!selectedEvent) return;
    setBusy(true);
    setError(null);
    try {
      await dataService.syncEventParticipants(
        selectedEvent.id,
        selectedEvent.event_code,
        selectedMemberIds,
        currentUser
      );
      setParticipantModalOpen(false);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan daftar peserta.');
    } finally {
      setBusy(false);
    }
  };

  const buildWhatsAppReminderUrl = (member: Member, paid: number, remaining: number) => {
    if (!selectedEvent) return '#';
    const phone = normalizeWhatsApp(member.whatsapp);
    const msg = [
      `Halo ${member.full_name},`,
      `Berikut pengingat iuran kegiatan komunitas *SENTRA ANGLER*:`,
      `• Acara: ${selectedEvent.title} (${selectedEvent.event_code})`,
      `• Tanggal: ${formatDateID(selectedEvent.event_date)}`,
      `• Lokasi: ${selectedEvent.location || '-'}`,
      `• Iuran Peserta: ${formatIDR(selectedEvent.fee_per_member)}`,
      paid > 0 ? `• Sudah Masuk: ${formatIDR(paid)}` : null,
      `• Sisa Tagihan: *${formatIDR(remaining)}*`,
      ``,
      `Mohon konfirmasi ke Bendahara apabila sudah transfer ya. Terima kasih!`,
    ]
      .filter(Boolean)
      .join('\n');
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  };

  return (
    <div className="space-y-5">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900">
            Perencanaan Acara, RAB & Peserta
          </h2>
          <p className="text-xs text-slate-500">
            Susun estimasi anggaran acara, bandingkan dengan realisasi kas, dan pantau status iuran
            peserta secara transparan.
          </p>
        </div>

        {isBendahara && (
          <button
            type="button"
            disabled={!isOnline}
            onClick={openCreateEventModal}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Buat Rencana Acara</span>
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Status Filter */}
      <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl w-fit overflow-x-auto max-w-full">
        {(
          [
            { id: 'all', label: 'Semua Acara' },
            { id: 'planned', label: 'Direncanakan' },
            { id: 'ongoing', label: 'Berlangsung' },
            { id: 'completed', label: 'Selesai' },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setStatusFilter(f.id)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              statusFilter === f.id
                ? 'bg-white text-[#0B192C] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Empty Events State */}
      {filteredEvents.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200 p-10 text-center">
          <CalendarDays className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="mt-3 text-sm font-bold text-slate-900">
            Belum ada rencana acara pada filter ini
          </p>
          <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
            {isBendahara
              ? 'Buat rencana acara mancing atau kopdar untuk menyusun pos RAB, menentukan iuran peserta, dan melacak realisasi kasnya.'
              : 'Bendahara belum mempublikasikan rencana acara pada kategori status ini.'}
          </p>
          {isBendahara && (
            <button
              type="button"
              disabled={!isOnline}
              onClick={openCreateEventModal}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#0B192C] hover:bg-[#132947] text-white text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-4 h-4 text-orange-400" />
              <span>Buat Rencana Acara Pertama</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Event Selector List */}
          <div className="lg:col-span-4 rounded-2xl bg-white border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">
                Daftar Acara ({filteredEvents.length})
              </span>
              <span className="text-[11px] text-slate-500">Pilih untuk kelola RAB</span>
            </div>
            <div className="divide-y divide-slate-100 max-h-[540px] overflow-y-auto">
              {filteredEvents.map((ev) => {
                const active = ev.id === selectedEvent?.id;
                const pCount = participants.filter((p) => p.event_id === ev.id).length;
                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => setSelectedEventId(ev.id)}
                    className={`w-full text-left p-4 transition-colors cursor-pointer ${
                      active ? 'bg-slate-900/5' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-mono-num font-semibold text-slate-500">
                        {ev.event_code} · {formatDateID(ev.event_date)}
                      </span>
                      <span className={`font-semibold ${STATUS_TEXT_COLORS[ev.status]}`}>
                        {STATUS_LABELS[ev.status]}
                      </span>
                    </div>
                    <p
                      className={`mt-1 text-sm font-bold truncate ${
                        active ? 'text-[#0B192C]' : 'text-slate-900'
                      }`}
                    >
                      {ev.title}
                    </p>
                    <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-500">
                      <span className="truncate">{ev.location || 'Lokasi belum diisi'}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-num shrink-0">
                        {pCount}/{ev.target_participants} peserta
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Event Workspace */}
          {selectedEvent && (
            <div className="lg:col-span-8 space-y-5">
              {/* Event Header & Actions */}
              <div className="rounded-2xl bg-white border border-slate-200 p-5 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono-num font-semibold text-orange-600">
                        {selectedEvent.event_code}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-mono-num">
                          {formatDateID(selectedEvent.event_date)}
                        </span>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span>{selectedEvent.location || '-'}</span>
                      </span>
                    </div>
                    <h3 className="mt-1.5 font-display text-lg sm:text-xl font-bold text-slate-900">
                      {selectedEvent.title}
                    </h3>
                    {selectedEvent.description && (
                      <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                        {selectedEvent.description}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {isBendahara ? (
                      <>
                        <select
                          disabled={!isOnline || busy}
                          value={selectedEvent.status}
                          onChange={(e) => handleUpdateEventStatus(e.target.value as EventStatus)}
                          className="h-9 px-3 rounded-xl border border-slate-300 text-xs font-semibold bg-white text-slate-800"
                        >
                          <option value="planned">Status: Direncanakan</option>
                          <option value="ongoing">Status: Berlangsung</option>
                          <option value="completed">Status: Selesai</option>
                          <option value="cancelled">Status: Dibatalkan</option>
                        </select>
                        <button
                          type="button"
                          disabled={!isOnline}
                          onClick={() => openEditEventModal(selectedEvent)}
                          className="h-9 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                      </>
                    ) : (
                      <span
                        className={`text-xs font-bold px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 ${STATUS_TEXT_COLORS[selectedEvent.status]}`}
                      >
                        {STATUS_LABELS[selectedEvent.status]}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                    <span>
                      Target Peserta:{' '}
                      <strong className="font-mono-num text-slate-900">
                        {selectedEvent.target_participants} orang
                      </strong>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Iuran / Anggota:{' '}
                      <strong className="font-mono-num text-slate-900">
                        {formatIDR(selectedEvent.fee_per_member)}
                      </strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        exportEventReportToPDF({
                          event: selectedEvent,
                          budgetItems: eventBudgets,
                          participants: eventParticipants,
                          members,
                          transactions,
                          generatedBy: currentUser.full_name,
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0B192C] hover:bg-[#132947] text-white text-xs font-semibold cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5 text-orange-400" />
                      <span>LPJ PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        exportEventReportToExcel({
                          event: selectedEvent,
                          budgetItems: eventBudgets,
                          participants: eventParticipants,
                          members,
                          transactions,
                          generatedBy: currentUser.full_name,
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                      <span>LPJ Excel</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 4-Column Summary Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="rounded-2xl bg-white border border-slate-200 p-4">
                  <p className="text-xs font-medium text-slate-500">Pemasukan Acara</p>
                  <p className="mt-1 font-display text-lg font-bold font-mono-num text-emerald-700">
                    {formatIDR(metrics.actualIncome)}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500 font-mono-num">
                    Target RAB: {formatIDR(metrics.estIncome)}
                  </p>
                </div>

                <div className="rounded-2xl bg-white border border-slate-200 p-4">
                  <p className="text-xs font-medium text-slate-500">Pengeluaran Acara</p>
                  <p className="mt-1 font-display text-lg font-bold font-mono-num text-red-700">
                    {formatIDR(metrics.actualExpense)}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500 font-mono-num">
                    Batas RAB: {formatIDR(metrics.estExpense)}
                  </p>
                </div>

                <div className="rounded-2xl bg-white border border-slate-200 p-4">
                  <p className="text-xs font-medium text-slate-500">Surplus / Defisit Aktual</p>
                  <p
                    className={`mt-1 font-display text-lg font-bold font-mono-num ${
                      metrics.actualSurplus >= 0 ? 'text-[#0B192C]' : 'text-red-700'
                    }`}
                  >
                    {formatIDR(metrics.actualSurplus)}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500 font-mono-num">
                    Proyeksi RAB: {formatIDR(metrics.estSurplus)}
                  </p>
                </div>

                <div className="rounded-2xl bg-[#0B192C] text-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-slate-300">Kecukupan Kas Komunitas</p>
                    <Wallet className="w-4 h-4 text-orange-400 shrink-0" />
                  </div>
                  <p className="mt-1 font-display text-base font-bold font-mono-num">
                    {metrics.cashShortfall > 0
                      ? `Kurang ${formatIDR(metrics.cashShortfall)}`
                      : 'Kas Mencukupi'}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-300 font-mono-num">
                    {metrics.suggestedFee > 0
                      ? `Rekomendasi iuran: ${formatIDR(metrics.suggestedFee)}/org`
                      : `Saldo kas: ${formatIDR(summary.current_balance)}`}
                  </p>
                </div>
              </div>

              {/* Detail Workspace Tabs */}
              <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl w-fit overflow-x-auto max-w-full">
                <button
                  type="button"
                  onClick={() => setDetailTab('rab')}
                  className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    detailTab === 'rab'
                      ? 'bg-white text-[#0B192C] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Pos RAB & Realisasi ({eventBudgets.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab('participants')}
                  className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    detailTab === 'participants'
                      ? 'bg-white text-[#0B192C] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Peserta & Status Iuran ({participantDetails.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab('transactions')}
                  className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    detailTab === 'transactions'
                      ? 'bg-white text-[#0B192C] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Transaksi Terkait ({eventTransactions.length})
                </button>
              </div>

              {/* TAB 1: POS RAB & REALISASI */}
              {detailTab === 'rab' && (
                <div className="space-y-4">
                  {isBendahara && (
                    <form
                      onSubmit={handleAddBudgetItem}
                      className="rounded-2xl bg-white border border-slate-200 p-4 sm:p-5 space-y-3"
                    >
                      <h4 className="font-display text-sm font-bold text-slate-900">
                        Tambah Pos Estimasi Anggaran (RAB)
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                        <select
                          value={rabType}
                          onChange={(e) => setRabType(e.target.value as TransactionType)}
                          className="h-10 px-3 rounded-xl border border-slate-300 text-xs font-semibold bg-white text-slate-800"
                        >
                          <option value="pengeluaran">Pengeluaran (Biaya)</option>
                          <option value="pemasukan">Pemasukan (Sumber Dana)</option>
                        </select>

                        <select
                          value={rabCategoryId}
                          onChange={(e) => setRabCategoryId(e.target.value)}
                          className="h-10 px-3 rounded-xl border border-slate-300 text-xs bg-white text-slate-800"
                        >
                          {rabAvailableCategories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>

                        <input
                          type="text"
                          required
                          value={rabItemName}
                          onChange={(e) => setRabItemName(e.target.value)}
                          placeholder="Uraian pos (mis. Sewa Kapal)"
                          className="h-10 px-3 rounded-xl border border-slate-300 text-xs text-slate-900"
                        />

                        <input
                          type="text"
                          inputMode="numeric"
                          required
                          value={rabAmount}
                          onChange={(e) => setRabAmount(e.target.value.replace(/\D/g, ''))}
                          placeholder="Estimasi Rp (mis. 500000)"
                          className="h-10 px-3 rounded-xl border border-slate-300 text-xs font-mono-num text-slate-900"
                        />

                        <button
                          type="submit"
                          disabled={!isOnline || busy}
                          className="h-10 px-4 rounded-xl bg-[#0B192C] hover:bg-[#132947] disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5 text-orange-400" />
                          <span>Tambah Pos</span>
                        </button>
                      </div>
                      <input
                        type="text"
                        value={rabNotes}
                        onChange={(e) => setRabNotes(e.target.value)}
                        placeholder="Catatan pos RAB opsional (mis. DP 50% H-7, kapasitas 15 orang)"
                        className="w-full h-9 px-3 rounded-xl border border-slate-200 text-xs text-slate-700"
                      />
                    </form>
                  )}

                  <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
                    {eventBudgets.length === 0 && metrics.unbudgetedItems.length === 0 ? (
                      <div className="p-8 text-center">
                        <p className="text-sm font-semibold text-slate-800">
                          Belum ada rincian pos RAB untuk acara ini
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {isBendahara
                            ? 'Tambahkan pos pemasukan dan pengeluaran di atas untuk menghitung proyeksi kebutuhan dana.'
                            : 'Bendahara belum menambahkan rincian pos anggaran untuk acara ini.'}
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Desktop Table */}
                        <div className="hidden md:block overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                                <th className="py-3 px-4">Pos / Uraian</th>
                                <th className="py-3 px-4">Kategori</th>
                                <th className="py-3 px-4 text-right">Estimasi RAB</th>
                                <th className="py-3 px-4 text-right">Realisasi Kategori</th>
                                {isBendahara && <th className="py-3 px-4 text-right">Aksi</th>}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-xs">
                              {eventBudgets.map((item) => {
                                const catActual =
                                  metrics.actualByCat.get(`${item.type}|${item.category_id}`) || 0;
                                const overBudget =
                                  item.type === 'pengeluaran' && catActual > item.estimated_amount;
                                return (
                                  <tr key={item.id} className="hover:bg-slate-50/70">
                                    <td className="py-3 px-4">
                                      <div className="flex items-center gap-2">
                                        <span
                                          className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                                            item.type === 'pemasukan'
                                              ? 'bg-emerald-50 text-emerald-600'
                                              : 'bg-red-50 text-red-600'
                                          }`}
                                        >
                                          {item.type === 'pemasukan' ? (
                                            <ArrowDownLeft className="w-3.5 h-3.5" />
                                          ) : (
                                            <ArrowUpRight className="w-3.5 h-3.5" />
                                          )}
                                        </span>
                                        <div>
                                          <p className="font-semibold text-slate-900">
                                            {item.item_name}
                                          </p>
                                          {item.notes && (
                                            <p className="text-[11px] text-slate-500">
                                              {item.notes}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    </td>
                                    <td className="py-3 px-4 text-slate-700">{item.category_name}</td>
                                    <td className="py-3 px-4 text-right font-mono-num font-semibold text-slate-900">
                                      {formatIDR(item.estimated_amount)}
                                    </td>
                                    <td className="py-3 px-4 text-right font-mono-num">
                                      <span
                                        className={`font-bold ${
                                          overBudget
                                            ? 'text-red-700'
                                            : item.type === 'pemasukan'
                                            ? 'text-emerald-700'
                                            : 'text-slate-900'
                                        }`}
                                      >
                                        {formatIDR(catActual)}
                                      </span>
                                      {overBudget && (
                                        <span className="block text-[10px] text-red-600 font-semibold">
                                          Melebihi pos ini
                                        </span>
                                      )}
                                    </td>
                                    {isBendahara && (
                                      <td className="py-3 px-4 text-right whitespace-nowrap">
                                        <div className="inline-flex items-center gap-1.5">
                                          <button
                                            type="button"
                                            disabled={!isOnline}
                                            onClick={() =>
                                              onOpenTransactionModal({
                                                event_id: selectedEvent.id,
                                                type: item.type,
                                                category_id: item.category_id,
                                                amount: item.estimated_amount,
                                                description: `${selectedEvent.title} — ${item.item_name}`,
                                              })
                                            }
                                            className="px-2.5 py-1.5 rounded-lg bg-orange-50 text-orange-700 hover:bg-orange-100 text-[11px] font-semibold cursor-pointer"
                                          >
                                            Catat Realisasi
                                          </button>
                                          <button
                                            type="button"
                                            disabled={!isOnline || busy}
                                            onClick={() => handleDeleteBudgetItem(item)}
                                            title="Hapus Pos RAB"
                                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      </td>
                                    )}
                                  </tr>
                                );
                              })}

                              {metrics.unbudgetedItems.map((u) => (
                                <tr key={u.key} className="bg-amber-50/40">
                                  <td className="py-3 px-4">
                                    <div className="flex items-center gap-2 text-amber-800">
                                      <AlertTriangle className="w-4 h-4 shrink-0" />
                                      <div>
                                        <p className="font-semibold">Transaksi di luar RAB</p>
                                        <p className="text-[11px]">
                                          Otomatis tercatat dari transaksi acara
                                        </p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 text-slate-700">{u.category_name}</td>
                                  <td className="py-3 px-4 text-right font-mono-num text-slate-500">
                                    {formatIDR(0)}
                                  </td>
                                  <td className="py-3 px-4 text-right font-mono-num font-bold text-slate-900">
                                    {formatIDR(u.actual)}
                                  </td>
                                  {isBendahara && <td className="py-3 px-4" />}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Mobile Card List */}
                        <div className="md:hidden divide-y divide-slate-100">
                          {eventBudgets.map((item) => {
                            const catActual =
                              metrics.actualByCat.get(`${item.type}|${item.category_id}`) || 0;
                            return (
                              <div key={item.id} className="p-4 space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="text-sm font-bold text-slate-900">
                                      {item.item_name}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                      {item.type === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran'} ·{' '}
                                      {item.category_name}
                                    </p>
                                  </div>
                                  {isBendahara && (
                                    <button
                                      type="button"
                                      disabled={!isOnline || busy}
                                      onClick={() => handleDeleteBudgetItem(item)}
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                                <div className="flex items-center justify-between text-xs font-mono-num">
                                  <span className="text-slate-500">
                                    RAB: <strong className="text-slate-900">{formatIDR(item.estimated_amount)}</strong>
                                  </span>
                                  <span className="text-slate-500">
                                    Realisasi: <strong className="text-slate-900">{formatIDR(catActual)}</strong>
                                  </span>
                                </div>
                                {isBendahara && (
                                  <button
                                    type="button"
                                    disabled={!isOnline}
                                    onClick={() =>
                                      onOpenTransactionModal({
                                        event_id: selectedEvent.id,
                                        type: item.type,
                                        category_id: item.category_id,
                                        amount: item.estimated_amount,
                                        description: `${selectedEvent.title} — ${item.item_name}`,
                                      })
                                    }
                                    className="w-full py-2 rounded-lg bg-orange-50 text-orange-700 text-xs font-semibold cursor-pointer"
                                  >
                                    + Catat Realisasi Kas
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: PESERTA & STATUS IURAN */}
              {detailTab === 'participants' && (
                <div className="space-y-4">
                  <div className="rounded-2xl bg-white border border-slate-200 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-4 text-xs">
                      <div>
                        <span className="text-slate-500 block">Terdaftar</span>
                        <strong className="font-mono-num text-sm text-slate-900">
                          {participantDetails.length} / {selectedEvent.target_participants} orang
                        </strong>
                      </div>
                      <span className="h-6 w-px bg-slate-200" aria-hidden="true" />
                      <div>
                        <span className="text-slate-500 block">Lunas</span>
                        <strong className="font-mono-num text-sm text-emerald-700">
                          {participantStats.lunas}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Sebagian / Belum</span>
                        <strong className="font-mono-num text-sm text-amber-700">
                          {participantStats.sebagian + participantStats.belum}
                        </strong>
                      </div>
                      <span className="h-6 w-px bg-slate-200" aria-hidden="true" />
                      <div>
                        <span className="text-slate-500 block">Iuran Terkumpul</span>
                        <strong className="font-mono-num text-sm text-[#0B192C]">
                          {formatIDR(participantStats.totalPaid)}
                        </strong>
                      </div>
                    </div>

                    {isBendahara && (
                      <button
                        type="button"
                        disabled={!isOnline}
                        onClick={openParticipantModal}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#0B192C] hover:bg-[#132947] disabled:opacity-50 text-white text-xs font-semibold shrink-0 cursor-pointer"
                      >
                        <UserCheck className="w-4 h-4 text-orange-400" />
                        <span>Atur Peserta Acara</span>
                      </button>
                    )}
                  </div>

                  <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
                    {participantDetails.length === 0 ? (
                      <div className="p-8 text-center">
                        <Users className="w-9 h-9 text-slate-300 mx-auto" />
                        <p className="mt-2.5 text-sm font-semibold text-slate-800">
                          Belum ada peserta terdaftar pada acara ini
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Pilih anggota komunitas yang mengikuti acara ini agar status iuran masing-masing
                          otomatis terlacak dari kas masuk.
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Desktop Table */}
                        <div className="hidden md:block overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                                <th className="py-3 px-4">Anggota</th>
                                <th className="py-3 px-4 text-right">Target Iuran</th>
                                <th className="py-3 px-4 text-right">Sudah Bayar</th>
                                <th className="py-3 px-4 text-right">Kekurangan</th>
                                <th className="py-3 px-4">Status</th>
                                {isBendahara && <th className="py-3 px-4 text-right">Aksi</th>}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-xs">
                              {participantDetails.map(({ member, paid, target, remaining, status }) => (
                                <tr key={member.id} className="hover:bg-slate-50/70">
                                  <td className="py-3 px-4">
                                    <p className="font-semibold text-slate-900">{member.full_name}</p>
                                    <p className="text-[11px] font-mono-num text-slate-500">
                                      {member.member_code}
                                      {member.whatsapp ? ` · ${member.whatsapp}` : ''}
                                    </p>
                                  </td>
                                  <td className="py-3 px-4 text-right font-mono-num text-slate-700">
                                    {formatIDR(target)}
                                  </td>
                                  <td className="py-3 px-4 text-right font-mono-num font-bold text-emerald-700">
                                    {formatIDR(paid)}
                                  </td>
                                  <td className="py-3 px-4 text-right font-mono-num font-semibold text-slate-900">
                                    {formatIDR(remaining)}
                                  </td>
                                  <td className="py-3 px-4">
                                    {status === 'lunas' ? (
                                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                                        <CheckCircle2 className="w-3.5 h-3.5" /> Lunas
                                      </span>
                                    ) : status === 'sebagian' ? (
                                      <span className="font-semibold text-amber-700">Sebagian</span>
                                    ) : status === 'gratis' ? (
                                      <span className="text-slate-500">Tanpa Iuran</span>
                                    ) : (
                                      <span className="font-semibold text-red-700">Belum Bayar</span>
                                    )}
                                  </td>
                                  {isBendahara && (
                                    <td className="py-3 px-4 text-right whitespace-nowrap">
                                      <div className="inline-flex items-center gap-1.5">
                                        {remaining > 0 && (
                                          <button
                                            type="button"
                                            disabled={!isOnline}
                                            onClick={() =>
                                              onOpenTransactionModal({
                                                event_id: selectedEvent.id,
                                                type: 'pemasukan',
                                                category_id: defaultFeeCategoryId,
                                                member_id: member.id,
                                                amount: remaining,
                                                description: `Iuran ${selectedEvent.title} — ${member.full_name}`,
                                              })
                                            }
                                            className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold cursor-pointer"
                                          >
                                            Catat Iuran
                                          </button>
                                        )}
                                        {remaining > 0 && member.whatsapp && (
                                          <a
                                            href={buildWhatsAppReminderUrl(member, paid, remaining)}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold"
                                          >
                                            <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                                            <span>Ingatkan WA</span>
                                          </a>
                                        )}
                                      </div>
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Mobile Cards */}
                        <div className="md:hidden divide-y divide-slate-100">
                          {participantDetails.map(({ member, paid, target, remaining, status }) => (
                            <div key={member.id} className="p-4 space-y-2.5">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-sm font-bold text-slate-900">
                                    {member.full_name}
                                  </p>
                                  <p className="text-xs font-mono-num text-slate-500">
                                    {member.member_code}
                                  </p>
                                </div>
                                <span
                                  className={`text-xs font-bold ${
                                    status === 'lunas'
                                      ? 'text-emerald-700'
                                      : status === 'sebagian'
                                      ? 'text-amber-700'
                                      : status === 'gratis'
                                      ? 'text-slate-500'
                                      : 'text-red-700'
                                  }`}
                                >
                                  {status === 'lunas'
                                    ? 'Lunas'
                                    : status === 'sebagian'
                                    ? 'Sebagian'
                                    : status === 'gratis'
                                    ? 'Tanpa Iuran'
                                    : 'Belum Bayar'}
                                </span>
                              </div>

                              <div className="grid grid-cols-3 gap-2 text-xs font-mono-num">
                                <div>
                                  <span className="text-slate-500 block text-[11px]">Target</span>
                                  <strong>{formatIDR(target)}</strong>
                                </div>
                                <div>
                                  <span className="text-slate-500 block text-[11px]">Masuk</span>
                                  <strong className="text-emerald-700">{formatIDR(paid)}</strong>
                                </div>
                                <div>
                                  <span className="text-slate-500 block text-[11px]">Kurang</span>
                                  <strong className="text-slate-900">{formatIDR(remaining)}</strong>
                                </div>
                              </div>

                              {isBendahara && remaining > 0 && (
                                <div className="flex items-center gap-2 pt-1">
                                  <button
                                    type="button"
                                    disabled={!isOnline}
                                    onClick={() =>
                                      onOpenTransactionModal({
                                        event_id: selectedEvent.id,
                                        type: 'pemasukan',
                                        category_id: defaultFeeCategoryId,
                                        member_id: member.id,
                                        amount: remaining,
                                        description: `Iuran ${selectedEvent.title} — ${member.full_name}`,
                                      })
                                    }
                                    className="flex-1 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
                                  >
                                    Catat Iuran
                                  </button>
                                  {member.whatsapp && (
                                    <a
                                      href={buildWhatsAppReminderUrl(member, paid, remaining)}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="flex-1 py-2 rounded-lg border border-slate-200 text-slate-700 text-xs font-semibold text-center"
                                    >
                                      Ingatkan WA
                                    </a>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: TRANSAKSI TERKAIT */}
              {detailTab === 'transactions' && (
                <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
                  <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
                    <span className="text-xs font-bold text-slate-800">
                      Realisasi Transaksi Terkait ({eventTransactions.length})
                    </span>
                    {isBendahara && (
                      <button
                        type="button"
                        disabled={!isOnline}
                        onClick={() =>
                          onOpenTransactionModal({
                            event_id: selectedEvent.id,
                            description: `${selectedEvent.title} — `,
                          })
                        }
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Catat Transaksi Acara</span>
                      </button>
                    )}
                  </div>

                  {eventTransactions.length === 0 ? (
                    <div className="p-8 text-center">
                      <p className="text-sm font-semibold text-slate-800">
                        Belum ada transaksi yang ditautkan ke acara ini
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Setiap transaksi yang ditautkan ke {selectedEvent.event_code} otomatis
                        memperbarui realisasi RAB dan status iuran peserta.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {eventTransactions.map((tx) => (
                        <div
                          key={tx.id}
                          className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50/70"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-mono-num text-slate-500">
                              {tx.transaction_code} · {formatDateID(tx.transaction_date)}
                            </p>
                            <p className="text-sm font-semibold text-slate-900 truncate">
                              {tx.category_name} — {tx.related_party}
                            </p>
                            {tx.description && (
                              <p className="text-xs text-slate-500 truncate">{tx.description}</p>
                            )}
                          </div>
                          <span
                            className={`text-sm font-bold font-mono-num whitespace-nowrap shrink-0 ${
                              tx.type === 'pemasukan' ? 'text-emerald-700' : 'text-red-700'
                            }`}
                          >
                            {tx.type === 'pemasukan' ? '+' : '−'} {formatIDR(tx.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Create / Edit Event Modal */}
      {eventModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="font-display text-lg font-bold text-slate-900">
                {editingEvent ? `Edit Acara ${editingEvent.event_code}` : 'Buat Rencana Acara Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setEventModalOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEvent} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Nama Acara / Kegiatan
                </label>
                <input
                  type="text"
                  required
                  value={evTitle}
                  onChange={(e) => setEvTitle(e.target.value)}
                  placeholder="Contoh: Trip Mancing Pulau Seribu / Lomba Galatama"
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Tanggal Pelaksanaan
                  </label>
                  <input
                    type="date"
                    required
                    value={evDate}
                    onChange={(e) => setEvDate(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Lokasi / Spot
                  </label>
                  <input
                    type="text"
                    value={evLocation}
                    onChange={(e) => setEvLocation(e.target.value)}
                    placeholder="Contoh: Dermaga Muara Angke"
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Target Peserta (Maks. 30)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    required
                    value={evTargetParticipants}
                    onChange={(e) => setEvTargetParticipants(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Patokan Iuran per Anggota (IDR)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={evFeePerMember}
                    onChange={(e) => setEvFeePerMember(e.target.value.replace(/\D/g, ''))}
                    placeholder="Contoh: 150000"
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm font-mono-num"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Catatan / Rundown Singkat
                </label>
                <textarea
                  rows={3}
                  value={evDesc}
                  onChange={(e) => setEvDesc(e.target.value)}
                  placeholder="Rincian titik kumpul, pembagian konsumsi, atau target acara..."
                  className="w-full p-3 rounded-xl border border-slate-300 text-sm"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEventModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-5 py-2.5 rounded-xl bg-[#0B192C] text-white text-sm font-semibold cursor-pointer"
                >
                  {busy ? 'Menyimpan...' : 'Simpan Acara'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Participant Selector Modal */}
      {participantModalOpen && selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-lg max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="font-display text-lg font-bold text-slate-900">
                  Atur Peserta Acara
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedEvent.title} · Terpilih{' '}
                  <strong className="font-mono-num text-slate-800">
                    {selectedMemberIds.length}
                  </strong>{' '}
                  anggota
                </p>
              </div>
              <button
                type="button"
                onClick={() => setParticipantModalOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-3 flex items-center gap-2 border-b border-slate-100">
              <button
                type="button"
                onClick={() =>
                  setSelectedMemberIds(
                    members.filter((m) => m.status === 'active').map((m) => m.id)
                  )
                }
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-800 cursor-pointer"
              >
                Pilih Semua Anggota Aktif
              </button>
              <button
                type="button"
                onClick={() => setSelectedMemberIds([])}
                className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-600 cursor-pointer"
              >
                Kosongkan
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 my-2">
              {members.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500">
                  Belum ada data anggota komunitas. Tambahkan anggota di menu Anggota terlebih dahulu.
                </p>
              ) : (
                members.map((m) => {
                  const checked = selectedMemberIds.includes(m.id);
                  return (
                    <label
                      key={m.id}
                      className="py-3 px-2 flex items-center justify-between gap-3 hover:bg-slate-50 cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleParticipantMember(m.id)}
                          className="w-4 h-4 accent-[#0B192C] rounded cursor-pointer"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {m.full_name}
                          </p>
                          <p className="text-xs font-mono-num text-slate-500">
                            {m.member_code} · {m.status === 'active' ? 'Aktif' : 'Nonaktif'}
                          </p>
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setParticipantModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleSaveParticipants}
                className="px-5 py-2.5 rounded-xl bg-[#0B192C] text-white text-sm font-semibold cursor-pointer"
              >
                {busy ? 'Menyimpan...' : 'Simpan Daftar Peserta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
