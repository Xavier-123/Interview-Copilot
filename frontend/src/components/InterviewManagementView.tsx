import React, { useState, useEffect } from 'react';
import {
  Calendar,
  History,
  ArrowLeft,
  Plus,
  Clock,
  AlertCircle,
  Loader2,
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
import { checkAndNotifyUpcomingSchedules } from '../utils/browserNotification';
import { apiFetch } from '../utils/api';
import { useTheme } from '../context/ThemeContext';

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
  const [viewMode, setViewMode] = useState<'timeline' | 'calendar'>('timeline');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showModal, setShowModal] = useState<boolean>(false);
  const [showReminderSettings, setShowReminderSettings] = useState<boolean>(false);
  const [editingSchedule, setEditingSchedule] = useState<InterviewScheduleItem | null>(null);
  const [guideSchedule, setGuideSchedule] = useState<InterviewScheduleItem | null>(null);

  // Form state
  const [formCompany, setFormCompany] = useState('');
  const [formJobRole, setFormJobRole] = useState('');
  const [formRound, setFormRound] = useState('一面');
  const [formScheduledAt, setFormScheduledAt] = useState('');
  const [formLocationType, setFormLocationType] = useState('online');
  const [formMeetingLink, setFormMeetingLink] = useState('');
  const [formSalary, setFormSalary] = useState('');
  const [formStatus, setFormStatus] = useState<ScheduleStatus>('upcoming');
  const [formJdText, setFormJdText] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchSchedules = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ schedules?: InterviewScheduleItem[] }>('/api/v1/schedules');
      const list: InterviewScheduleItem[] = data.schedules || [];
      setSchedules(list);
      checkAndNotifyUpcomingSchedules(list, onStartMockWithSchedule);
    } catch (err) {
      console.error('Failed to load schedules:', err);
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
    setFormRound('一面');
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

    const payload: CreateScheduleRequest = {
      company: formCompany.trim(),
      job_role: formJobRole.trim(),
      interview_round: formRound.trim() || '一面',
      scheduled_at: new Date(formScheduledAt).toISOString(),
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
      console.error('Failed to update status:', err);
    }
  };

  // Delete Schedule
  const handleDelete = async (scheduleId: string, company: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`确定要删除 ${company} 的面试日程吗？`)) return;

    try {
      await apiFetch(`/api/v1/schedules/${scheduleId}`, {
        method: 'DELETE',
      });
      setSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
    } catch (err) {
      console.error('Failed to delete schedule:', err);
    }
  };

  // Filter schedules
  const filteredSchedules = schedules.filter((s) => {
    if (filterStatus === 'all') return true;
    return s.status === filterStatus;
  });

  const countUpcoming = schedules.filter((s) => s.status === 'upcoming').length;
  const countCompleted = schedules.filter((s) => s.status === 'completed').length;
  const countPassed = schedules.filter((s) => s.status === 'passed').length;
  const countDeclined = schedules.filter((s) => s.status === 'declined').length;
  const countFailed = schedules.filter((s) => s.status === 'failed').length;

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
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/30 text-amber-200 border border-amber-400/40">
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
              {/* Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => setFilterStatus('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                    filterStatus === 'all'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : isDark
                      ? 'bg-gray-900 text-gray-400 hover:text-white border border-gray-800'
                      : 'bg-white text-gray-600 hover:text-gray-900 border border-gray-200 shadow-xs'
                  }`}
                >
                  全部日程 ({schedules.length})
                </button>
                <button
                  onClick={() => setFilterStatus('upcoming')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                    filterStatus === 'upcoming'
                      ? 'bg-amber-500 text-white shadow-sm'
                      : isDark
                      ? 'bg-gray-900 text-gray-400 hover:text-white border border-gray-800'
                      : 'bg-white text-gray-600 hover:text-gray-900 border border-gray-200 shadow-xs'
                  }`}
                >
                  待面试 ({countUpcoming})
                </button>
                <button
                  onClick={() => setFilterStatus('completed')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                    filterStatus === 'completed'
                      ? isDark
                        ? 'bg-blue-900/60 text-blue-200 border border-blue-700/60'
                        : 'bg-blue-100 text-blue-700 border border-blue-200'
                      : isDark
                      ? 'bg-gray-900 text-gray-400 hover:text-white border border-gray-800'
                      : 'bg-white text-gray-600 hover:text-gray-900 border border-gray-200 shadow-xs'
                  }`}
                >
                  已面试 ({countCompleted})
                </button>
                <button
                  onClick={() => setFilterStatus('passed')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                    filterStatus === 'passed'
                      ? isDark
                        ? 'bg-emerald-900/60 text-emerald-200 border border-emerald-700/60'
                        : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                      : isDark
                      ? 'bg-gray-900 text-gray-400 hover:text-white border border-gray-800'
                      : 'bg-white text-gray-600 hover:text-gray-900 border border-gray-200 shadow-xs'
                  }`}
                >
                  已通过 ({countPassed})
                </button>
                <button
                  onClick={() => setFilterStatus('declined')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                    filterStatus === 'declined'
                      ? isDark
                        ? 'bg-violet-900/60 text-violet-200 border border-violet-700/60'
                        : 'bg-violet-100 text-violet-700 border border-violet-200'
                      : isDark
                      ? 'bg-gray-900 text-gray-400 hover:text-white border border-gray-800'
                      : 'bg-white text-gray-600 hover:text-gray-900 border border-gray-200 shadow-xs'
                  }`}
                >
                  已婉拒 ({countDeclined})
                </button>
                <button
                  onClick={() => setFilterStatus('failed')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                    filterStatus === 'failed'
                      ? isDark
                        ? 'bg-red-900/60 text-red-200 border border-red-700/60'
                        : 'bg-red-100 text-red-700 border border-red-200'
                      : isDark
                      ? 'bg-gray-900 text-gray-400 hover:text-white border border-gray-800'
                      : 'bg-white text-gray-600 hover:text-gray-900 border border-gray-200 shadow-xs'
                  }`}
                >
                  未通过 ({countFailed})
                </button>
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

            {/* Schedule Content */}
            {loading ? (
              <div className="py-20 text-center space-y-3">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
                <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>正在同步面试日程...</p>
              </div>
            ) : viewMode === 'timeline' ? (
              <InterviewTimelineView
                schedules={filteredSchedules}
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
              selectedSessions={selectedHistorySessions}
              onSelectionChange={onHistorySelectionChange}
            />
          </div>
        )}

        {/* Create / Edit Schedule Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
            <div
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
                <h3 className="text-base font-bold flex items-center space-x-2">
                  <Calendar className="w-4 h-4 text-blue-500" />
                  <span>{editingSchedule ? '编辑面试日程' : '登记新面试日程'}</span>
                </h3>
                <button
                  onClick={() => setShowModal(false)}
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
                      <option value="在线笔试 / 机试">在线笔试 / 机试 (OA)</option>
                      <option value="专业测评 / 笔试">专业测评 / 笔试</option>
                      <option value="技术一面">技术一面</option>
                      <option value="技术二面">技术二面</option>
                      <option value="技术三面">技术三面</option>
                      <option value="业务终面">业务终面</option>
                      <option value="HR综合面">HR综合面</option>
                      <option value="CTO/高管面">CTO/高管面</option>
                      <option value="谈薪">谈薪（Offer 沟通）</option>
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
                      <option value="upcoming">待面试 (Upcoming)</option>
                      <option value="completed">已完成 (Completed)</option>
                      <option value="passed">已通过 (Passed / Offer)</option>
                      <option value="declined">已婉拒 (Declined)</option>
                      <option value="failed">未通过 (Failed)</option>
                      <option value="cancelled">已取消 (Cancelled)</option>
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
      </div>
    </div>
  );
};
