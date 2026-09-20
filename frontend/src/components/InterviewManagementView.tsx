import React, { useState, useEffect } from 'react';
import {
  Calendar,
  History,
  ArrowLeft,
  Plus,
  Clock,
  Building2,
  Video,
  MapPin,
  Sparkles,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  X,
  Phone,
} from 'lucide-react';
import type {
  InterviewScheduleItem,
  CreateScheduleRequest,
  ScheduleStatus,
} from '../types';
import { HistoryView } from './HistoryView';

interface InterviewManagementViewProps {
  onBack: () => void;
  onViewReport: (sessionId: string) => void;
  onStartMockWithSchedule: (schedule: InterviewScheduleItem) => void;
  initialTab?: 'calendar' | 'history';
}

export const InterviewManagementView: React.FC<InterviewManagementViewProps> = ({
  onBack,
  onViewReport,
  onStartMockWithSchedule,
  initialTab = 'calendar',
}) => {
  const [activeTab, setActiveTab] = useState<'calendar' | 'history'>(initialTab);

  // Schedules state
  const [schedules, setSchedules] = useState<InterviewScheduleItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showModal, setShowModal] = useState<boolean>(false);
  const [editingSchedule, setEditingSchedule] = useState<InterviewScheduleItem | null>(null);
  const [expandedJdId, setExpandedJdId] = useState<string | null>(null);

  // Form state
  const [formCompany, setFormCompany] = useState('');
  const [formJobRole, setFormJobRole] = useState('');
  const [formRound, setFormRound] = useState('一面');
  const [formScheduledAt, setFormScheduledAt] = useState('');
  const [formLocationType, setFormLocationType] = useState('online');
  const [formMeetingLink, setFormMeetingLink] = useState('');
  const [formStatus, setFormStatus] = useState<ScheduleStatus>('upcoming');
  const [formJdText, setFormJdText] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchSchedules = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/schedules');
      if (res.ok) {
        const data = await res.json();
        setSchedules(data.schedules || []);
      }
    } catch (err) {
      console.error('Failed to load schedules:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
  }, []);

  // Open modal for Create
  const handleOpenCreate = () => {
    setEditingSchedule(null);
    setFormCompany('');
    setFormJobRole('');
    setFormRound('一面');
    // Default scheduled time: tomorrow 14:00
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(14, 0, 0, 0);
    // Format to YYYY-MM-DDTHH:mm
    const tzOffset = tomorrow.getTimezoneOffset() * 60000;
    const localISOTime = new Date(tomorrow.getTime() - tzOffset).toISOString().slice(0, 16);
    setFormScheduledAt(localISOTime);
    setFormLocationType('online');
    setFormMeetingLink('');
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
      status: formStatus,
      jd_text: formJdText.trim() || undefined,
      notes: formNotes.trim() || undefined,
    };

    try {
      if (editingSchedule) {
        // Update
        const res = await fetch(`/api/v1/schedules/${editingSchedule.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('更新日程失败');
      } else {
        // Create
        const res = await fetch('/api/v1/schedules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('创建日程失败');
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
      const res = await fetch(`/api/v1/schedules/${scheduleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setSchedules((prev) =>
          prev.map((s) => (s.id === scheduleId ? { ...s, status: newStatus } : s))
        );
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  // Delete Schedule
  const handleDelete = async (scheduleId: string, company: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`确定要删除 ${company} 的面试日程吗？`)) return;

    try {
      const res = await fetch(`/api/v1/schedules/${scheduleId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
      } else {
        alert('删除失败，请稍后重试');
      }
    } catch (err) {
      console.error('Failed to delete schedule:', err);
    }
  };

  // Status Styling & Labels
  const getStatusBadge = (status: ScheduleStatus) => {
    switch (status) {
      case 'upcoming':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-950/70 border border-amber-700/60 text-amber-300">
            <Clock className="w-3 h-3 text-amber-400" />
            <span>待面试</span>
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-950/70 border border-blue-700/60 text-blue-300">
            <CheckCircle2 className="w-3 h-3 text-blue-400" />
            <span>已面试</span>
          </span>
        );
      case 'passed':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-950/70 border border-emerald-700/60 text-emerald-300">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>已通过 / Offer</span>
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-950/70 border border-red-700/60 text-red-300">
            <XCircle className="w-3 h-3 text-red-400" />
            <span>未通过</span>
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-800 text-gray-400 border border-gray-700">
            <span>已取消</span>
          </span>
        );
      default:
        return null;
    }
  };

  // Relative Time text
  const getRelativeTimeLabel = (isoStr: string) => {
    try {
      const target = new Date(isoStr).getTime();
      const now = Date.now();
      const diffMs = target - now;
      const diffHours = Math.round(diffMs / (1000 * 60 * 60));
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      if (diffMs < 0) {
        return <span className="text-gray-500 text-xs">已过日程</span>;
      }
      if (diffHours < 24) {
        return (
          <span className="text-amber-400 font-bold text-xs bg-amber-950/80 px-2 py-0.5 rounded">
            {diffHours <= 1 ? '即将开始' : `${diffHours} 小时后`}
          </span>
        );
      }
      if (diffDays === 1) {
        return (
          <span className="text-amber-300 text-xs bg-amber-950/60 px-2 py-0.5 rounded">明天</span>
        );
      }
      return <span className="text-blue-300 text-xs bg-blue-950/60 px-2 py-0.5 rounded">{diffDays} 天后</span>;
    } catch {
      return null;
    }
  };

  const formatDateTime = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      const year = d.getFullYear();
      const m = (d.getMonth() + 1).toString().padStart(2, '0');
      const date = d.getDate().toString().padStart(2, '0');
      const hours = d.getHours().toString().padStart(2, '0');
      const mins = d.getMinutes().toString().padStart(2, '0');
      const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      const weekDay = weekDays[d.getDay()];
      return `${year}-${m}-${date} (${weekDay}) ${hours}:${mins}`;
    } catch {
      return isoStr;
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
  const countFailed = schedules.filter((s) => s.status === 'failed').length;

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 space-y-6 animate-fade-in">
      {/* Top Breadcrumb & Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-800 pb-5">
        <div>
          <button
            onClick={onBack}
            className="inline-flex items-center space-x-1.5 text-xs text-gray-400 hover:text-white transition mb-2 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>返回首页工作台</span>
          </button>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold text-white flex items-center space-x-2">
              <Calendar className="w-6 h-6 text-emerald-400" />
              <span>面试综合管理</span>
            </h1>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            聚合真实求职日程追踪与 AI 模拟实战战报，支撑从投递、备战对练到实战复盘的全流程。
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center p-1 rounded-xl bg-gray-900 border border-gray-800 shrink-0">
          <button
            onClick={() => setActiveTab('calendar')}
            className={`inline-flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-medium transition cursor-pointer ${
              activeTab === 'calendar'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/40'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>面试日程日历</span>
            {countUpcoming > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/30 text-amber-200 border border-amber-400/40">
                {countUpcoming}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`inline-flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-medium transition cursor-pointer ${
              activeTab === 'history'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>模拟复盘与战报对比</span>
          </button>
        </div>
      </div>

      {/* TAB 1: 面试日程日历 */}
      {activeTab === 'calendar' && (
        <div className="space-y-6">
          {/* Subheader & Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setFilterStatus('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                  filterStatus === 'all'
                    ? 'bg-gray-800 text-white border border-gray-700'
                    : 'bg-gray-900/60 text-gray-400 hover:text-white border border-gray-800/80'
                }`}
              >
                全部日程 ({schedules.length})
              </button>
              <button
                onClick={() => setFilterStatus('upcoming')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                  filterStatus === 'upcoming'
                    ? 'bg-amber-950/80 text-amber-200 border border-amber-600/60'
                    : 'bg-gray-900/60 text-gray-400 hover:text-white border border-gray-800/80'
                }`}
              >
                待面试 ({countUpcoming})
              </button>
              <button
                onClick={() => setFilterStatus('completed')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                  filterStatus === 'completed'
                    ? 'bg-blue-950/80 text-blue-200 border border-blue-600/60'
                    : 'bg-gray-900/60 text-gray-400 hover:text-white border border-gray-800/80'
                }`}
              >
                已面试 ({countCompleted})
              </button>
              <button
                onClick={() => setFilterStatus('passed')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                  filterStatus === 'passed'
                    ? 'bg-emerald-950/80 text-emerald-200 border border-emerald-600/60'
                    : 'bg-gray-900/60 text-gray-400 hover:text-white border border-gray-800/80'
                }`}
              >
                已通过 ({countPassed})
              </button>
              <button
                onClick={() => setFilterStatus('failed')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                  filterStatus === 'failed'
                    ? 'bg-red-950/80 text-red-200 border border-red-600/60'
                    : 'bg-gray-900/60 text-gray-400 hover:text-white border border-gray-800/80'
                }`}
              >
                未通过 ({countFailed})
              </button>
            </div>

            {/* Add Schedule Button */}
            <button
              onClick={handleOpenCreate}
              className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium text-xs shadow-lg shadow-emerald-900/30 transition cursor-pointer self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>登记面试日程</span>
            </button>
          </div>

          {/* Schedule Cards List */}
          {loading ? (
            <div className="py-20 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mx-auto" />
              <p className="text-xs text-gray-400">正在加载面试日程...</p>
            </div>
          ) : filteredSchedules.length === 0 ? (
            <div className="py-16 text-center border border-dashed border-gray-800 rounded-2xl p-8 space-y-4 bg-gray-900/30">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                <Calendar className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white">
                  {filterStatus === 'all' ? '暂无面试日程' : '暂无符合筛选条件的日程'}
                </h3>
                <p className="text-xs text-gray-400 max-w-md mx-auto">
                  登记你最近投递收到的面试邀请（如字节跳动后端一面），便于及时倒计时提醒并一键针对该岗位发起全真模拟对练。
                </p>
              </div>
              <button
                onClick={handleOpenCreate}
                className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>立即登记第一场面试</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {filteredSchedules.map((schedule) => {
                const isUpcoming = schedule.status === 'upcoming';
                const hasJd = Boolean(schedule.jd_text?.trim());
                const isJdExpanded = expandedJdId === schedule.id;

                return (
                  <div
                    key={schedule.id}
                    className={`rounded-2xl bg-gray-900/80 border p-5 transition-all duration-200 hover:shadow-xl flex flex-col justify-between space-y-4 ${
                      isUpcoming
                        ? 'border-amber-700/50 hover:border-amber-500/70 hover:shadow-amber-950/20'
                        : 'border-gray-800 hover:border-gray-700'
                    }`}
                  >
                    <div className="space-y-3.5">
                      {/* Company & Status row */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center space-x-2.5 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center text-gray-300 shrink-0">
                            <Building2 className="w-5 h-5 text-emerald-400" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-base font-bold text-white truncate" title={schedule.company}>
                              {schedule.company}
                            </h3>
                            <div className="flex items-center space-x-2 text-xs text-gray-300 mt-0.5">
                              <span className="font-semibold text-emerald-400">{schedule.job_role}</span>
                              <span className="text-gray-500">·</span>
                              <span className="px-2 py-0.5 rounded bg-gray-800 text-[11px] text-gray-300 border border-gray-700">
                                {schedule.interview_round}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 shrink-0">
                          {getStatusBadge(schedule.status)}
                        </div>
                      </div>

                      {/* Scheduled Time & Countdown */}
                      <div className="p-3 rounded-xl bg-gray-950/80 border border-gray-800/80 flex items-center justify-between text-xs">
                        <div className="flex items-center space-x-2 text-gray-300">
                          <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>{formatDateTime(schedule.scheduled_at)}</span>
                        </div>
                        <div>{getRelativeTimeLabel(schedule.scheduled_at)}</div>
                      </div>

                      {/* Location or Meeting Link */}
                      <div className="flex items-center space-x-2 text-xs text-gray-400">
                        {schedule.location_type === 'online' ? (
                          <Video className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        ) : schedule.location_type === 'phone' ? (
                          <Phone className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        ) : (
                          <MapPin className="w-3.5 h-3.5 text-red-400 shrink-0" />
                        )}
                        <span className="truncate">
                          {schedule.meeting_link_or_address ? (
                            schedule.location_type === 'online' &&
                            (schedule.meeting_link_or_address.startsWith('http') ||
                              schedule.meeting_link_or_address.includes('meeting')) ? (
                              <a
                                href={schedule.meeting_link_or_address}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-400 hover:underline inline-flex items-center space-x-1"
                              >
                                <span>{schedule.meeting_link_or_address}</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span>{schedule.meeting_link_or_address}</span>
                            )
                          ) : (
                            <span>{schedule.location_type === 'online' ? '远程线上面试' : '线下现场面试'}</span>
                          )}
                        </span>
                      </div>

                      {/* Notes / 面经备忘 */}
                      {schedule.notes && (
                        <div className="p-2.5 rounded-lg bg-gray-950 border border-gray-800/80 text-xs text-gray-300 leading-relaxed">
                          <div className="text-[10px] text-gray-500 font-bold mb-0.5">面经与备忘：</div>
                          <div>{schedule.notes}</div>
                        </div>
                      )}

                      {/* JD Collapsible Preview */}
                      {hasJd && (
                        <div className="border-t border-gray-800/60 pt-2 text-xs">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedJdId(isJdExpanded ? null : schedule.id)
                            }
                            className="text-gray-400 hover:text-gray-200 inline-flex items-center space-x-1 transition cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5 text-emerald-400" />
                            <span>关联岗位 JD {isJdExpanded ? '收起' : '展开查看'}</span>
                            {isJdExpanded ? (
                              <ChevronUp className="w-3 h-3" />
                            ) : (
                              <ChevronDown className="w-3 h-3" />
                            )}
                          </button>
                          {isJdExpanded && (
                            <div className="mt-2 p-3 rounded-lg bg-gray-950 border border-gray-800 text-gray-300 font-mono text-[11px] whitespace-pre-wrap max-h-40 overflow-y-auto leading-relaxed">
                              {schedule.jd_text}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Bottom Action Footer */}
                    <div className="pt-3 border-t border-gray-800/80 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center space-x-1.5">
                        {/* Status Quick Flow */}
                        {schedule.status === 'upcoming' && (
                          <button
                            onClick={(e) => handleQuickStatusChange(schedule.id, 'completed', e)}
                            className="px-2.5 py-1 rounded bg-blue-950/60 hover:bg-blue-900 border border-blue-800/50 text-blue-300 text-xs transition cursor-pointer"
                          >
                            标记已面完
                          </button>
                        )}
                        {schedule.status === 'completed' && (
                          <>
                            <button
                              onClick={(e) => handleQuickStatusChange(schedule.id, 'passed', e)}
                              className="px-2 py-1 rounded bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-800/50 text-emerald-300 text-xs transition cursor-pointer"
                            >
                              标记通过
                            </button>
                            <button
                              onClick={(e) => handleQuickStatusChange(schedule.id, 'failed', e)}
                              className="px-2 py-1 rounded bg-red-950/60 hover:bg-red-900 border border-red-800/50 text-red-300 text-xs transition cursor-pointer"
                            >
                              未通过
                            </button>
                          </>
                        )}

                        <button
                          onClick={(e) => handleOpenEdit(schedule, e)}
                          title="编辑日程"
                          className="p-1.5 text-gray-400 hover:text-white rounded hover:bg-gray-800 transition cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => handleDelete(schedule.id, schedule.company, e)}
                          title="删除日程"
                          className="p-1.5 text-gray-400 hover:text-red-400 rounded hover:bg-gray-800 transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Primary CTA: 针对本场开启模拟 */}
                      <button
                        onClick={() => onStartMockWithSchedule(schedule)}
                        className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-md shadow-emerald-900/30 transition cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>针对本场开启模拟</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
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
          />
        </div>
      )}

      {/* Create / Edit Schedule Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-xl max-h-[90vh] rounded-2xl bg-gray-900 border border-gray-800 p-6 flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-emerald-400" />
                <span>{editingSchedule ? '编辑面试日程' : '登记新面试日程'}</span>
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 rounded text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
              {formError && (
                <div className="p-3 rounded-lg bg-red-950/60 border border-red-700/60 text-red-300 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    目标公司 <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="例如：字节跳动、腾讯、美团"
                    value={formCompany}
                    onChange={(e) => setFormCompany(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg bg-gray-950 border border-gray-800 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    面试岗位 <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="例如：后端开发专家、前端工程师"
                    value={formJobRole}
                    onChange={(e) => setFormJobRole(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg bg-gray-950 border border-gray-800 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    面试轮次
                  </label>
                  <select
                    value={formRound}
                    onChange={(e) => setFormRound(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg bg-gray-950 border border-gray-800 text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="技术一面">技术一面</option>
                    <option value="技术二面">技术二面</option>
                    <option value="技术三面">技术三面</option>
                    <option value="业务终面">业务终面</option>
                    <option value="HR综合面">HR综合面</option>
                    <option value="CTO/高管面">CTO/高管面</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    面试时间 <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={formScheduledAt}
                    onChange={(e) => setFormScheduledAt(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg bg-gray-950 border border-gray-800 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    面试形式
                  </label>
                  <select
                    value={formLocationType}
                    onChange={(e) => setFormLocationType(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg bg-gray-950 border border-gray-800 text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="online">远程视频面试 (腾讯会议/飞书/Zoom)</option>
                    <option value="offline">现场面试 (公司职场)</option>
                    <option value="phone">电话面试</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    日程状态
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as ScheduleStatus)}
                    className="w-full text-xs px-3 py-2 rounded-lg bg-gray-950 border border-gray-800 text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="upcoming">待面试 (Upcoming)</option>
                    <option value="completed">已完成 (Completed)</option>
                    <option value="passed">已通过 (Passed / Offer)</option>
                    <option value="failed">未通过 (Failed)</option>
                    <option value="cancelled">已取消 (Cancelled)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  会议链接 / 地点详情
                </label>
                <input
                  type="text"
                  placeholder="例如：https://meeting.tencent.com/dm/123456 或 望京大厦 B 座 12F"
                  value={formMeetingLink}
                  onChange={(e) => setFormMeetingLink(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-lg bg-gray-950 border border-gray-800 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  岗位 JD（用于一键发起针对性全真模拟）
                </label>
                <textarea
                  rows={4}
                  placeholder="可将该职位的岗位职责与任职要求粘贴在此，一键发起模拟时系统将自动带入..."
                  value={formJdText}
                  onChange={(e) => setFormJdText(e.target.value)}
                  className="w-full text-xs p-3 rounded-lg bg-gray-950 border border-gray-800 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 resize-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  备忘笔记 / 面经反思
                </label>
                <textarea
                  rows={3}
                  placeholder="记录面试重点要求、需着重复习的项目亮点，或面完后的复盘面经..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full text-xs p-3 rounded-lg bg-gray-950 border border-gray-800 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-3 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs transition cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center space-x-2 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium text-xs transition cursor-pointer"
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
    </div>
  );
};
