import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  History,
  ArrowLeft,
  Plus,
  Clock,
  AlertCircle,
  Loader2,
  RefreshCw,
  CheckCheck,
  X,
  Bell,
} from 'lucide-react';
import type {
  InterviewScheduleItem,
  CreateScheduleRequest,
  ScheduleStatus,
} from '../types';
import { HistoryView } from './HistoryView';
import { DateTimePicker } from './DateTimePicker';
import { ReminderSettingsModal } from './ReminderSettingsModal';
import { InterviewCalendarView } from './InterviewCalendarView';
import { InterviewTimelineView } from './InterviewTimelineView';
import { InterviewGuideModal } from './InterviewGuideModal';
import { ConfirmDialog } from './ConfirmDialog';
import { checkAndNotifyUpcomingSchedules } from '../utils/browserNotification';
import { isExpiredUnmarked, SCHEDULE_STATUS_META, SCHEDULE_STATUS_ORDER } from '../utils/scheduleStatus';
import { apiFetch, describeApiError } from '../utils/api';
import { useTheme } from '../context/ThemeContext';

/**
 * 面试轮次选项。
 * 表单初值与提交兜底都必须命中这里的 value，否则受控 select 会显示第一项、
 * 而 state 与落库值仍是那个不存在的值（曾用 '一面'，下拉里没有这个选项）。
 */
const INTERVIEW_ROUND_OPTIONS = [
  { value: '在线笔试 / 机试', label: '在线笔试 / 机试 (OA)' },
  { value: '专业测评 / 笔试', label: '专业测评 / 笔试' },
  { value: '技术一面', label: '技术一面' },
  { value: '技术二面', label: '技术二面' },
  { value: '技术三面', label: '技术三面' },
  { value: '业务终面', label: '业务终面' },
  { value: 'HR综合面', label: 'HR综合面' },
  { value: 'CTO/高管面', label: 'CTO/高管面' },
  { value: '谈薪', label: '谈薪（Offer 沟通）' },
] as const;

const DEFAULT_INTERVIEW_ROUND = '技术一面';

/**
 * 状态筛选档位 = 「全部」+ 状态元数据的展示顺序。
 * 标签取自 SCHEDULE_STATUS_META，不再手写，避免与徽章 / 表单下拉三处漂移。
 */
const STATUS_FILTERS: Array<{ key: 'all' | ScheduleStatus; label: string }> = [
  { key: 'all', label: '全部日程' },
  ...SCHEDULE_STATUS_ORDER.map((s) => ({ key: s, label: SCHEDULE_STATUS_META[s].label })),
];

/** 各筛选档位选中态的配色（取消态为中性灰，与月历视图的 cancelled 徽章语义一致）。 */
const FILTER_ACTIVE_CLS: Record<string, { dark: string; light: string }> = {
  all: { dark: 'bg-blue-600 text-white shadow-sm', light: 'bg-blue-600 text-white shadow-sm' },
  upcoming: { dark: 'bg-amber-500 text-white shadow-sm', light: 'bg-amber-500 text-white shadow-sm' },
  completed: {
    dark: 'bg-blue-900/60 text-blue-200 border border-blue-700/60',
    light: 'bg-blue-100 text-blue-700 border border-blue-200',
  },
  passed: {
    dark: 'bg-emerald-900/60 text-emerald-200 border border-emerald-700/60',
    light: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  },
  declined: {
    dark: 'bg-violet-900/60 text-violet-200 border border-violet-700/60',
    light: 'bg-violet-100 text-violet-700 border border-violet-200',
  },
  failed: {
    dark: 'bg-red-900/60 text-red-200 border border-red-700/60',
    light: 'bg-red-100 text-red-700 border border-red-200',
  },
  cancelled: {
    dark: 'bg-slate-800 text-slate-200 border border-slate-700',
    light: 'bg-slate-200 text-slate-700 border border-slate-300',
  },
};

interface InterviewManagementViewProps {
  onBack: () => void;
  onViewReport: (sessionId: string) => void;
  onStartMockWithSchedule: (schedule: InterviewScheduleItem) => void;
  initialTab?: 'calendar' | 'history';
  /** tab 切换时上报父级，便于从报告页返回时恢复上次停留的 tab */
  onTabChange?: (tab: 'calendar' | 'history') => void;
  /** 复盘列表的受控勾选（跨页面保持勾选），不传则由 HistoryView 内部自持 */
  selectedHistorySessions?: string[];
  onHistorySelectionChange?: (ids: string[]) => void;
}

export const InterviewManagementView: React.FC<InterviewManagementViewProps> = ({
  onBack,
  onViewReport,
  onStartMockWithSchedule,
  initialTab = 'calendar',
  onTabChange,
  selectedHistorySessions,
  onHistorySelectionChange,
}) => {
  const { isDark } = useTheme();
  const [activeTab, setActiveTab] = useState<'calendar' | 'history'>(initialTab);

  const switchTab = (tab: 'calendar' | 'history') => {
    setActiveTab(tab);
    onTabChange?.(tab);
  };

  // Schedules state
  const [schedules, setSchedules] = useState<InterviewScheduleItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  /** 加载失败：必须与「真的没有日程」区分，否则接口故障会被读成「今天没面试」 */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'timeline' | 'calendar'>('timeline');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showModal, setShowModal] = useState<boolean>(false);
  const [showReminderSettings, setShowReminderSettings] = useState<boolean>(false);
  const [editingSchedule, setEditingSchedule] = useState<InterviewScheduleItem | null>(null);
  const [guideSchedule, setGuideSchedule] = useState<InterviewScheduleItem | null>(null);
  /** 待删除日程（自绘确认弹窗替代 window.confirm） */
  const [pendingDelete, setPendingDelete] = useState<{ id: string; company: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  /** 就地操作（状态流转 / 删除 / 批量标记）的结果反馈：不能只 console.error */
  const [toast, setToast] = useState<{ text: string; tone: 'danger' | 'success' } | null>(null);
  /** 过期未标记日程的批量处理 */
  const [showBulkMarkConfirm, setShowBulkMarkConfirm] = useState(false);
  const [bulkMarking, setBulkMarking] = useState(false);

  // Form state
  const [formCompany, setFormCompany] = useState('');
  const [formJobRole, setFormJobRole] = useState('');
  const [formRound, setFormRound] = useState<string>(DEFAULT_INTERVIEW_ROUND);
  const [formScheduledAt, setFormScheduledAt] = useState('');
  const [formLocationType, setFormLocationType] = useState('online');
  const [formMeetingLink, setFormMeetingLink] = useState('');
  const [formSalary, setFormSalary] = useState('');
  const [formStatus, setFormStatus] = useState<ScheduleStatus>('upcoming');
  const [formJdText, setFormJdText] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // 就地操作结果提示 4 秒后自动消失
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  // 面试登记 / 编辑弹窗：Esc 关闭（与 ConfirmDialog、DateTimePicker 行为对齐，避免同页三套规范）
  useEffect(() => {
    if (!showModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowModal(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showModal]);

  const fetchSchedules = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiFetch<{ schedules?: InterviewScheduleItem[] }>('/api/v1/schedules');
      const list: InterviewScheduleItem[] = data.schedules || [];
      setSchedules(list);
      checkAndNotifyUpcomingSchedules(list, onStartMockWithSchedule);
    } catch (err) {
      // 明确区分「拉取失败」与「列表本来就空」，两者在 UI 上必须长得不一样
      setLoadError(describeApiError(err, '面试日程加载失败，请检查后端服务是否可用'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
    // 每 60 秒轮询检测临近面试并触发桌面通知
    const timer = setInterval(() => {
      setSchedules((prev) => {
        checkAndNotifyUpcomingSchedules(prev, onStartMockWithSchedule);
        return prev;
      });
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Open modal for Create
  const handleOpenCreate = (defaultDateKey?: string | React.MouseEvent) => {
    setEditingSchedule(null);
    setFormCompany('');
    setFormJobRole('');
    setFormRound(DEFAULT_INTERVIEW_ROUND);
    if (typeof defaultDateKey === 'string' && defaultDateKey) {
      // 预填指定日期上午 10:00
      setFormScheduledAt(`${defaultDateKey}T10:00`);
    } else {
      // Default scheduled time: tomorrow 14:00
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(14, 0, 0, 0);
      // Format to YYYY-MM-DDTHH:mm
      const tzOffset = tomorrow.getTimezoneOffset() * 60000;
      const localISOTime = new Date(tomorrow.getTime() - tzOffset).toISOString().slice(0, 16);
      setFormScheduledAt(localISOTime);
    }
    setFormLocationType('online');
    setFormMeetingLink('');
    setFormSalary('');
    setFormStatus('upcoming');
    setFormJdText('');
    setFormNotes('');
    setFormError(null);
    setShowModal(true);
  };

  // Open modal for Edit
  const handleOpenEdit = (s: InterviewScheduleItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSchedule(s);
    setFormCompany(s.company);
    setFormJobRole(s.job_role);
    setFormRound(s.interview_round);
    try {
      const d = new Date(s.scheduled_at);
      const tzOffset = d.getTimezoneOffset() * 60000;
      const localISOTime = new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
      setFormScheduledAt(localISOTime);
    } catch {
      setFormScheduledAt('');
    }
    setFormLocationType(s.location_type || 'online');
    setFormMeetingLink(s.meeting_link_or_address || '');
    setFormSalary(s.salary || '');
    setFormStatus(s.status || 'upcoming');
    setFormJdText(s.jd_text || '');
    setFormNotes(s.notes || '');
    setFormError(null);
    setShowModal(true);
  };

  // Submit modal form
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCompany.trim() || !formJobRole.trim() || !formScheduledAt) {
      setFormError('请填写公司名称、岗位与面试时间');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    // 时间非法时提前拦截：早期实现把它抛在 try 之外，一旦触发会让 submitting 永久卡在 true
    const scheduledAt = new Date(formScheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      setFormError('面试时间格式无效，请重新选择');
      setSubmitting(false);
      return;
    }

    const payload: CreateScheduleRequest = {
      company: formCompany.trim(),
      job_role: formJobRole.trim(),
      interview_round: formRound.trim() || DEFAULT_INTERVIEW_ROUND,
      scheduled_at: scheduledAt.toISOString(),
      location_type: formLocationType,
      meeting_link_or_address: formMeetingLink.trim() || undefined,
      salary: formSalary.trim() || undefined,
      status: formStatus,
      jd_text: formJdText.trim() || undefined,
      notes: formNotes.trim() || undefined,
    };

    try {
      if (editingSchedule) {
        // Update
        await apiFetch(`/api/v1/schedules/${editingSchedule.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        // Create
        await apiFetch('/api/v1/schedules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      setShowModal(false);
      await fetchSchedules();
    } catch (err: any) {
      setFormError(err.message || '操作失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  // Quick Status Update
  const handleQuickStatusChange = async (
    scheduleId: string,
    newStatus: ScheduleStatus,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    try {
      await apiFetch(`/api/v1/schedules/${scheduleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      setSchedules((prev) =>
        prev.map((s) => (s.id === scheduleId ? { ...s, status: newStatus } : s))
      );
    } catch (err) {
      setToast({ text: describeApiError(err, '状态更新失败，请重试'), tone: 'danger' });
    }
  };

  // Delete Schedule：先弹自绘确认框，确认后真删
  const handleDelete = (scheduleId: string, company: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingDelete({ id: scheduleId, company });
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/v1/schedules/${pendingDelete.id}`, { method: 'DELETE' });
      setSchedules((prev) => prev.filter((s) => s.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (err) {
      setPendingDelete(null);
      setToast({ text: describeApiError(err, '删除失败，请重试'), tone: 'danger' });
    } finally {
      setDeleting(false);
    }
  };

  /** 已过面试时间但状态仍停在「待面试」的日程：既不会触发提醒，也不进任何统计。 */
  const expiredUnmarked = useMemo(() => schedules.filter((s) => isExpiredUnmarked(s)), [schedules]);

  /**
   * 批量把它们标记为「已面完」。
   * 后端没有批量改状态的接口，这里逐个 PUT；失败的场次汇总成一条提示，不做静默跳过。
   */
  const handleBulkMarkExpired = async () => {
    const targets = expiredUnmarked;
    if (targets.length === 0) return;

    setBulkMarking(true);
    const failed: string[] = [];
    for (const s of targets) {
      try {
        await apiFetch(`/api/v1/schedules/${s.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'completed' }),
        });
      } catch {
        failed.push(s.company);
      }
    }
    setBulkMarking(false);
    setShowBulkMarkConfirm(false);
    await fetchSchedules();

    const okCount = targets.length - failed.length;
    if (failed.length === 0) {
      setToast({ text: `已将 ${okCount} 场过期日程标记为「已面完」`, tone: 'success' });
    } else {
      setToast({
        text: `${okCount} 场已标记，${failed.length} 场失败（${failed.join('、')}），请重试`,
        tone: 'danger',
      });
    }
  };

  // Filter schedules
  const filteredSchedules = schedules.filter((s) => {
    if (filterStatus === 'all') return true;
    return s.status === filterStatus;
  });

  const statusCounts = schedules.reduce<Record<string, number>>((acc, s) => {
    acc[s.status] = (acc[s.status] || 0) + 1;
    return acc;
  }, {});
  const countOf = (key: string) => statusCounts[key] || 0;
  const countUpcoming = countOf('upcoming');

  return (
    <div
      className={`min-h-screen transition-colors duration-200 ${
        isDark ? 'bg-[#0B0F17] text-gray-100' : 'bg-[#F8FAFC] text-gray-800'
      }`}
    >
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 space-y-6">
        {/* Top Breadcrumb & Page Header */}
        <div
          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5 ${
            isDark ? 'border-gray-800/80' : 'border-gray-200'
          }`}
        >
          <div>
            <button
              onClick={onBack}
              className={`inline-flex items-center space-x-1.5 text-xs transition mb-2 cursor-pointer ${
                isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>返回首页工作台</span>
            </button>
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-bold flex items-center space-x-2">
                <Calendar className="w-6 h-6 text-blue-500" />
                <span>面试日程与实战规划</span>
              </h1>
            </div>
            <p className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              清晰把握每一个面试关键节点，针对性开启全真模拟对练，告别被动等待与临场焦虑。
            </p>
          </div>

          {/* Primary Tab Switcher */}
          <div
            className={`flex items-center p-1 rounded-xl border shrink-0 ${
              isDark ? 'bg-gray-900/90 border-gray-800' : 'bg-white border-gray-200 shadow-sm'
            }`}
          >
            <button
              onClick={() => switchTab('calendar')}
              className={`inline-flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-medium transition cursor-pointer ${
                activeTab === 'calendar'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : isDark
                  ? 'text-gray-400 hover:text-white'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>面试日程与看板</span>
              {countUpcoming > 0 && (
                // 不能用 amber-200 on amber-500/30：浅色主题下几乎不可见（对比度 ≈1:1）
                <span className="inline-flex items-center justify-center min-w-[18px] px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-status-warning-bg border border-status-warning-border text-status-warning">
                  {countUpcoming}
                </span>
              )}
            </button>

            <button
              onClick={() => switchTab('history')}
              className={`inline-flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-medium transition cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : isDark
                  ? 'text-gray-400 hover:text-white'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>模拟复盘战报</span>
            </button>
          </div>
        </div>

        {/* TAB 1: 面试日程看板与日历 */}
        {activeTab === 'calendar' && (
          <div className="space-y-6 animate-fade-in">
            {/* Subheader & Filter Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              {/* Filter Pills：由 STATUS_FILTERS 单点驱动，选项与计数不会漏项 */}
              <div className="flex flex-wrap items-center gap-1.5">
                {STATUS_FILTERS.map(({ key, label }) => {
                  const active = filterStatus === key;
                  const count = key === 'all' ? schedules.length : countOf(key);
                  const activeCls = FILTER_ACTIVE_CLS[key][isDark ? 'dark' : 'light'];
                  const idleCls = isDark
                    ? 'bg-gray-900 text-gray-400 hover:text-white border border-gray-800'
                    : 'bg-white text-gray-600 hover:text-gray-900 border border-gray-200 shadow-xs';
                  return (
                    <button
                      key={key}
                      onClick={() => setFilterStatus(key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                        active ? activeCls : idleCls
                      }`}
                    >
                      {label} ({count})
                    </button>
                  );
                })}
              </div>

              {/* Action Buttons: View Toggle, Reminder Settings & Add Schedule */}
              <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
                {/* View Switcher: 时间轴视图 vs 月历排期 */}
                <div
                  className={`flex items-center p-1 rounded-xl border shrink-0 ${
                    isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200 shadow-sm'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setViewMode('timeline')}
                    className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                      viewMode === 'timeline'
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                        : isDark
                        ? 'text-gray-400 hover:text-white'
                        : 'text-gray-500 hover:text-gray-900'
                    }`}
                    title="现代时间轴看板视图，带呼吸灯与动态倒计时"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>时间轴看板</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('calendar')}
                    className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                      viewMode === 'calendar'
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                        : isDark
                        ? 'text-gray-400 hover:text-white'
                        : 'text-gray-500 hover:text-gray-900'
                    }`}
                    title="在月历表格上标注日程"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span>月历排期</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowReminderSettings(true)}
                  className={`inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition cursor-pointer ${
                    isDark
                      ? 'bg-gray-900 hover:bg-gray-800 text-gray-300 border-gray-800'
                      : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200 shadow-sm'
                  }`}
                  title="设置桌面通知与邮件日程提醒"
                >
                  <Bell className="w-3.5 h-3.5 text-amber-500" />
                  <span>提醒设置</span>
                </button>

                <button
                  onClick={() => handleOpenCreate()}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow-md shadow-blue-500/20 transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>登记新日程</span>
                </button>
              </div>
            </div>

            {/* 过期未标记横幅：这类日程既不会触发提醒，也不会进任何统计，必须主动提示 */}
            {expiredUnmarked.length > 0 && (
              <div
                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl border ${
                  isDark ? 'bg-amber-950/25 border-amber-800/50' : 'bg-amber-50 border-amber-200'
                }`}
              >
                <div className="flex items-start space-x-2.5 text-xs">
                  <AlertCircle
                    className={`w-4 h-4 shrink-0 mt-0.5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`}
                  />
                  <div>
                    <div className={`font-semibold ${isDark ? 'text-amber-300' : 'text-amber-800'}`}>
                      有 {expiredUnmarked.length} 场面试已过时间，状态仍停在「待面试」
                    </div>
                    <div className={`mt-0.5 ${isDark ? 'text-amber-400/80' : 'text-amber-700'}`}>
                      它们的提醒已失效、也不会进入任何统计。建议先批量标记为「已面完」，再逐条补记结果。
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setShowBulkMarkConfirm(true)}
                  className="shrink-0 inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-xs font-medium shadow-md shadow-amber-500/20 transition cursor-pointer"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>全部标记为已面完</span>
                </button>
              </div>
            )}

            {/* Schedule Content */}
            {loading ? (
              <div className="py-20 text-center space-y-3">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
                <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>正在同步面试日程...</p>
              </div>
            ) : loadError ? (
              // 加载失败必须独立成态：早期实现直接落进空状态，把接口故障伪装成「今天没有面试」
              <div
                className={`py-16 px-6 rounded-2xl border text-center ${
                  isDark ? 'bg-[#111827] border-gray-800' : 'bg-white border-gray-200 shadow-sm'
                }`}
              >
                <div className="w-12 h-12 rounded-2xl bg-status-danger-bg border border-status-danger-border text-status-danger flex items-center justify-center mx-auto mb-3">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <h3 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  面试日程加载失败
                </h3>
                <p
                  className={`text-xs mt-1.5 max-w-md mx-auto leading-relaxed ${
                    isDark ? 'text-gray-400' : 'text-gray-600'
                  }`}
                >
                  {loadError}
                </p>
                <button
                  onClick={fetchSchedules}
                  className="mt-4 inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium shadow-md shadow-blue-500/20 transition cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>重新加载</span>
                </button>
              </div>
            ) : viewMode === 'timeline' ? (
              <InterviewTimelineView
                schedules={filteredSchedules}
                isFiltered={filterStatus !== 'all'}
                activeFilterLabel={STATUS_FILTERS.find((f) => f.key === filterStatus)?.label}
                onClearFilter={() => setFilterStatus('all')}
                onStartMockWithSchedule={onStartMockWithSchedule}
                onEditSchedule={handleOpenEdit}
                onDeleteSchedule={handleDelete}
                onQuickStatusChange={handleQuickStatusChange}
                onOpenCreate={(dateStr) => handleOpenCreate(dateStr)}
                onViewGuide={(schedule) => setGuideSchedule(schedule)}
                onNavigateQuickMock={() =>
                  onStartMockWithSchedule({
                    id: 'quick',
                    company: '目标大厂',
                    job_role: '技术岗位',
                    interview_round: '技术一面',
                    scheduled_at: new Date().toISOString(),
                    location_type: 'online',
                    status: 'upcoming',
                  })
                }
              />
            ) : (
              <InterviewCalendarView
                schedules={filteredSchedules}
                onStartMockWithSchedule={onStartMockWithSchedule}
                onEditSchedule={handleOpenEdit}
                onDeleteSchedule={handleDelete}
                onQuickStatusChange={handleQuickStatusChange}
                onCreateScheduleForDate={(dateStr) => handleOpenCreate(dateStr)}
              />
            )}
          </div>
        )}

        {/* TAB 2: 模拟复盘与战报对比 */}
        {activeTab === 'history' && (
          <div className="animate-fade-in">
            <HistoryView
              onBack={onBack}
              onViewReport={onViewReport}
              hideBack={true}
              embedded={true}
              selectedSessions={selectedHistorySessions}
              onSelectionChange={onHistorySelectionChange}
            />
          </div>
        )}

        {/* Create / Edit Schedule Modal */}
        {showModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in"
            onClick={() => setShowModal(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="schedule-modal-title"
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-xl max-h-[90vh] rounded-2xl border p-6 flex flex-col shadow-2xl transition-all ${
                isDark ? 'bg-[#111827] border-gray-800 text-white' : 'bg-white border-gray-200 text-gray-900'
              }`}
            >
              {/* Modal Header */}
              <div
                className={`flex items-center justify-between border-b pb-3.5 ${
                  isDark ? 'border-gray-800' : 'border-gray-200'
                }`}
              >
                <h3 id="schedule-modal-title" className="text-base font-bold flex items-center space-x-2">
                  <Calendar className="w-4 h-4 text-blue-500" />
                  <span>{editingSchedule ? '编辑面试日程' : '登记新面试日程'}</span>
                </h3>
                <button
                  onClick={() => setShowModal(false)}
                  aria-label="关闭"
                  className={`p-1 rounded-lg transition cursor-pointer ${
                    isDark ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Form */}
              <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
                {formError && (
                  <div
                    className={`p-3 rounded-xl border text-xs flex items-center space-x-2 ${
                      isDark
                        ? 'bg-red-950/60 border-red-700/60 text-red-300'
                        : 'bg-red-50 border-red-200 text-red-700'
                    }`}
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                    <span>{formError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      className={`block text-xs font-semibold mb-1 ${
                        isDark ? 'text-gray-300' : 'text-gray-700'
                      }`}
                    >
                      目标公司 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="例如：字节跳动、腾讯、美团"
                      value={formCompany}
                      onChange={(e) => setFormCompany(e.target.value)}
                      className={`w-full text-xs px-3 py-2.5 rounded-xl border transition focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ${
                        isDark
                          ? 'bg-gray-900 border-gray-800 text-white placeholder-gray-500'
                          : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                      }`}
                    />
                  </div>

                  <div>
                    <label
                      className={`block text-xs font-semibold mb-1 ${
                        isDark ? 'text-gray-300' : 'text-gray-700'
                      }`}
                    >
                      面试岗位 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="例如：高级全栈工程师、产品专家"
                      value={formJobRole}
                      onChange={(e) => setFormJobRole(e.target.value)}
                      className={`w-full text-xs px-3 py-2.5 rounded-xl border transition focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ${
                        isDark
                          ? 'bg-gray-900 border-gray-800 text-white placeholder-gray-500'
                          : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                      }`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      className={`block text-xs font-semibold mb-1 ${
                        isDark ? 'text-gray-300' : 'text-gray-700'
                      }`}
                    >
                      面试轮次
                    </label>
                    <select
                      value={formRound}
                      onChange={(e) => setFormRound(e.target.value)}
                      className={`w-full text-xs px-3 py-2.5 rounded-xl border transition focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer ${
                        isDark
                          ? 'bg-gray-900 border-gray-800 text-white'
                          : 'bg-white border-gray-300 text-gray-900'
                      }`}
                    >
                      {/* 选项由 INTERVIEW_ROUND_OPTIONS 单点驱动：初值、兜底、下拉三处必须同源 */}
                      {INTERVIEW_ROUND_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                      {/* 历史脏值（如下拉已不存在的「一面」）原样保留，避免受控 select 静默回退到第一项 */}
                      {formRound && !INTERVIEW_ROUND_OPTIONS.some((o) => o.value === formRound) && (
                        <option value={formRound}>{formRound}（历史值）</option>
                      )}
                    </select>
                  </div>

                  <div>
                    <label
                      className={`block text-xs font-semibold mb-1 ${
                        isDark ? 'text-gray-300' : 'text-gray-700'
                      }`}
                    >
                      面试时间 <span className="text-red-500">*</span>
                    </label>
                    <DateTimePicker
                      value={formScheduledAt}
                      onChange={setFormScheduledAt}
                      placeholder="点击选择面试时间"
                    />
                  </div>
                </div>

                {formRound === '谈薪' && (
                  <div>
                    <label
                      className={`block text-xs font-semibold mb-1 ${
                        isDark ? 'text-gray-300' : 'text-gray-700'
                      }`}
                    >
                      Offer 薪资
                    </label>
                    <input
                      type="text"
                      placeholder="自由填写，例如：25k × 15 / 年包 40w / 28 × 16 + 期权"
                      value={formSalary}
                      onChange={(e) => setFormSalary(e.target.value)}
                      className={`w-full text-xs px-3 py-2.5 rounded-xl border transition focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ${
                        isDark
                          ? 'bg-gray-900 border-gray-800 text-white placeholder-gray-500'
                          : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                      }`}
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      className={`block text-xs font-semibold mb-1 ${
                        isDark ? 'text-gray-300' : 'text-gray-700'
                      }`}
                    >
                      面试形式
                    </label>
                    <select
                      value={formLocationType}
                      onChange={(e) => setFormLocationType(e.target.value)}
                      className={`w-full text-xs px-3 py-2.5 rounded-xl border transition focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer ${
                        isDark
                          ? 'bg-gray-900 border-gray-800 text-white'
                          : 'bg-white border-gray-300 text-gray-900'
                      }`}
                    >
                      <option value="online">远程视频面试 (腾讯会议/飞书/Zoom)</option>
                      <option value="offline">现场面试 (公司职场)</option>
                      <option value="phone">电话面试</option>
                    </select>
                  </div>

                  <div>
                    <label
                      className={`block text-xs font-semibold mb-1 ${
                        isDark ? 'text-gray-300' : 'text-gray-700'
                      }`}
                    >
                      日程状态
                    </label>
                    <select
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value as ScheduleStatus)}
                      className={`w-full text-xs px-3 py-2.5 rounded-xl border transition focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer ${
                        isDark
                          ? 'bg-gray-900 border-gray-800 text-white'
                          : 'bg-white border-gray-300 text-gray-900'
                      }`}
                    >
                      {/* 与徽章 / 筛选 pill 同源，标签不再手写 */}
                      {SCHEDULE_STATUS_ORDER.map((s) => (
                        <option key={s} value={s}>
                          {SCHEDULE_STATUS_META[s].formLabel}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label
                    className={`block text-xs font-semibold mb-1 ${
                      isDark ? 'text-gray-300' : 'text-gray-700'
                    }`}
                  >
                    会议链接 / 地点详情
                  </label>
                  <input
                    type="text"
                    placeholder="例如：https://meeting.tencent.com/dm/123456 或 望京保利中心 B 座 15F"
                    value={formMeetingLink}
                    onChange={(e) => setFormMeetingLink(e.target.value)}
                    className={`w-full text-xs px-3 py-2.5 rounded-xl border transition focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ${
                      isDark
                        ? 'bg-gray-900 border-gray-800 text-white placeholder-gray-500'
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                    }`}
                  />
                </div>

                <div>
                  <label
                    className={`block text-xs font-semibold mb-1 ${
                      isDark ? 'text-gray-300' : 'text-gray-700'
                    }`}
                  >
                    岗位 JD（用于一键发起针对性全真模拟）
                  </label>
                  <textarea
                    rows={4}
                    placeholder="可将该职位的岗位职责与任职要求粘贴在此，一键发起模拟时系统将自动带入..."
                    value={formJdText}
                    onChange={(e) => setFormJdText(e.target.value)}
                    className={`w-full text-xs p-3 rounded-xl border transition resize-none font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 leading-relaxed ${
                      isDark
                        ? 'bg-gray-900 border-gray-800 text-white placeholder-gray-500'
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                    }`}
                  />
                </div>

                <div>
                  <label
                    className={`block text-xs font-semibold mb-1 ${
                      isDark ? 'text-gray-300' : 'text-gray-700'
                    }`}
                  >
                    备忘笔记 / 面经反思
                  </label>
                  <textarea
                    rows={3}
                    placeholder="记录面试重点要求、需着重复习的项目亮点，或面完后的复盘面经..."
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    className={`w-full text-xs p-3 rounded-xl border transition resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 leading-relaxed ${
                      isDark
                        ? 'bg-gray-900 border-gray-800 text-white placeholder-gray-500'
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                    }`}
                  />
                </div>

                <div
                  className={`pt-3 flex items-center justify-end space-x-3 border-t ${
                    isDark ? 'border-gray-800' : 'border-gray-200'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className={`px-4 py-2 rounded-xl border text-xs font-medium transition cursor-pointer ${
                      isDark
                        ? 'border-gray-800 hover:bg-gray-800 text-gray-300'
                        : 'border-gray-300 hover:bg-gray-100 text-gray-700'
                    }`}
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center space-x-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium text-xs shadow-md shadow-blue-500/20 transition cursor-pointer"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>正在保存...</span>
                      </>
                    ) : (
                      <span>{editingSchedule ? '保存修改' : '确认添加'}</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 面试通关锦囊 Modal */}
        {guideSchedule && (
          <InterviewGuideModal
            schedule={guideSchedule}
            open={Boolean(guideSchedule)}
            onClose={() => setGuideSchedule(null)}
            onStartMock={() => {
              const target = guideSchedule;
              setGuideSchedule(null);
              onStartMockWithSchedule(target);
            }}
          />
        )}

        {/* 面试日程提醒设置 Modal (桌面弹窗 & 邮件推送) */}
        <ReminderSettingsModal
          open={showReminderSettings}
          onClose={() => setShowReminderSettings(false)}
        />

        {/* 删除确认：自绘弹窗，替代阻塞式 window.confirm（页内统一第三套对话框风格） */}
        <ConfirmDialog
          open={Boolean(pendingDelete)}
          title="删除面试日程"
          description={
            pendingDelete
              ? `确定要删除「${pendingDelete.company}」的这条面试日程吗？此操作不可撤销。`
              : undefined
          }
          confirmLabel="删除"
          tone="danger"
          busy={deleting}
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDelete(null)}
        />

        {/* 过期日程批量标记：二次确认（属于批量变更，不能一键直改） */}
        <ConfirmDialog
          open={showBulkMarkConfirm}
          title="批量标记为已面完"
          description={`将把 ${expiredUnmarked.length} 场已过期的「待面试」日程改为「已面完」。标记后仍可逐条改为通过 / 未通过 / 婉拒。`}
          confirmLabel={bulkMarking ? '处理中...' : '全部标记'}
          tone="primary"
          busy={bulkMarking}
          onConfirm={handleBulkMarkExpired}
          onCancel={() => setShowBulkMarkConfirm(false)}
        />

        {/* 就地操作结果提示（状态流转 / 删除 / 批量标记）：不能只 console.error */}
        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] animate-fade-in">
            <div
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl border text-xs font-medium shadow-lg ${
                toast.tone === 'success'
                  ? 'bg-status-success-bg border-status-success-border text-status-success'
                  : 'bg-status-danger-bg border-status-danger-border text-status-danger'
              }`}
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{toast.text}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
