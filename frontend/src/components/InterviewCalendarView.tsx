import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  Building2,
  Video,
  MapPin,
  Phone,
  Sparkles,
  Edit2,
  Trash2,
  ExternalLink,
  Copy,
  Check,
  X,
  Calendar as CalendarIcon,
  CheckCircle2,
  XCircle,
  Handshake,
  ChevronDown,
  ChevronUp,
  Banknote,
  FileText,
} from 'lucide-react';
import type { InterviewScheduleItem, ScheduleStatus } from '../types';

interface InterviewCalendarViewProps {
  schedules: InterviewScheduleItem[];
  onStartMockWithSchedule: (schedule: InterviewScheduleItem) => void;
  onEditSchedule: (schedule: InterviewScheduleItem, e: React.MouseEvent) => void;
  onDeleteSchedule: (scheduleId: string, company: string, e: React.MouseEvent) => void;
  onQuickStatusChange: (scheduleId: string, newStatus: ScheduleStatus, e: React.MouseEvent) => void;
  onCreateScheduleForDate: (dateStr: string) => void;
}

const WEEK_DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

export function parseScheduleDate(isoStr: string) {
  if (!isoStr) return null;

  // 从本地时间分量构造结果（后端返回的 UTC 时间需先换算成本地再取分量）
  const fromLocal = (dateObj: Date) => {
    const y = dateObj.getFullYear();
    const mo = dateObj.getMonth() + 1;
    const d = dateObj.getDate();
    const h = dateObj.getHours();
    const mi = dateObj.getMinutes();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return {
      year: y,
      month: mo,
      day: d,
      hour: h,
      minute: mi,
      dateKey: `${y}-${pad(mo)}-${pad(d)}`,
      timeStr: `${pad(h)}:${pad(mi)}`,
      minutesSinceMidnight: h * 60 + mi,
    };
  };

  const m =
    /^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{1,2})(?::\d{1,2}(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/.exec(
      isoStr.trim()
    );
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const d = parseInt(m[3], 10);
    const h = parseInt(m[4], 10);
    const mi = parseInt(m[5], 10);
    const tz = m[6];
    if (tz) {
      // 带时区标记（后端统一返回 UTC）：换算为本地墙上时间，否则清晨场会跨到前一天
      let offsetMs = 0;
      if (tz !== 'Z') {
        const om = /^[+-](\d{2}):?(\d{2})$/.exec(tz);
        if (!om) return null;
        offsetMs = (tz[0] === '-' ? -1 : 1) * (parseInt(om[1], 10) * 60 + parseInt(om[2], 10)) * 60000;
      }
      return fromLocal(new Date(Date.UTC(y, mo - 1, d, h, mi) - offsetMs));
    }
    // 无时区的裸时间串（datetime-local 录入格式）视为本地墙上时间
    const pad = (n: number) => n.toString().padStart(2, '0');
    return {
      year: y,
      month: mo,
      day: d,
      hour: h,
      minute: mi,
      dateKey: `${y}-${pad(mo)}-${pad(d)}`,
      timeStr: `${pad(h)}:${pad(mi)}`,
      minutesSinceMidnight: h * 60 + mi,
    };
  }
  const dateObj = new Date(isoStr);
  if (!isNaN(dateObj.getTime())) {
    return fromLocal(dateObj);
  }
  return null;
}

export const InterviewCalendarView: React.FC<InterviewCalendarViewProps> = ({
  schedules,
  onStartMockWithSchedule,
  onEditSchedule,
  onDeleteSchedule,
  onQuickStatusChange,
  onCreateScheduleForDate,
}) => {
  const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(() => new Date().getMonth()); // 0-11
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [expandedJdId, setExpandedJdId] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Group schedules by YYYY-MM-DD
  const schedulesByDate = useMemo(() => {
    const map: Record<string, InterviewScheduleItem[]> = {};
    for (const item of schedules) {
      const parsed = parseScheduleDate(item.scheduled_at);
      if (parsed) {
        if (!map[parsed.dateKey]) {
          map[parsed.dateKey] = [];
        }
        map[parsed.dateKey].push(item);
      }
    }
    // Sort items within each day chronologically
    for (const key in map) {
      map[key].sort((a, b) => {
        const timeA = parseScheduleDate(a.scheduled_at)?.minutesSinceMidnight ?? 0;
        const timeB = parseScheduleDate(b.scheduled_at)?.minutesSinceMidnight ?? 0;
        return timeA - timeB;
      });
    }
    return map;
  }, [schedules]);

  // Today's date string YYYY-MM-DD
  const todayKey = useMemo(() => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }, []);

  // Calendar month navigation
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentYear((y) => y - 1);
      setCurrentMonth(11);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentYear((y) => y + 1);
      setCurrentMonth(0);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const handleToday = () => {
    const now = new Date();
    setCurrentYear(now.getFullYear());
    setCurrentMonth(now.getMonth());
    setSelectedDateKey(todayKey);
  };

  // Month stats
  const monthStats = useMemo(() => {
    let totalInMonth = 0;
    let upcomingInMonth = 0;
    for (const item of schedules) {
      const parsed = parseScheduleDate(item.scheduled_at);
      if (parsed && parsed.year === currentYear && parsed.month === currentMonth + 1) {
        totalInMonth++;
        if (item.status === 'upcoming') {
          upcomingInMonth++;
        }
      }
    }
    return { totalInMonth, upcomingInMonth };
  }, [schedules, currentYear, currentMonth]);

  // Build 35 or 42 grid cells
  const calendarCells = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1);
    // Monday = 0, Sunday = 6
    const startDayOffset = (firstDay.getDay() + 6) % 7;
    const daysInCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

    const cells: Array<{
      dateKey: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      schedules: InterviewScheduleItem[];
    }> = [];

    const pad = (n: number) => n.toString().padStart(2, '0');

    // 1. Previous month trailing days
    for (let i = startDayOffset - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const prevMo = currentMonth === 0 ? 12 : currentMonth;
      const prevYr = currentMonth === 0 ? currentYear - 1 : currentYear;
      const dateKey = `${prevYr}-${pad(prevMo)}-${pad(d)}`;
      cells.push({
        dateKey,
        dayNumber: d,
        isCurrentMonth: false,
        isToday: dateKey === todayKey,
        schedules: schedulesByDate[dateKey] || [],
      });
    }

    // 2. Current month days
    for (let d = 1; d <= daysInCurrentMonth; d++) {
      const dateKey = `${currentYear}-${pad(currentMonth + 1)}-${pad(d)}`;
      cells.push({
        dateKey,
        dayNumber: d,
        isCurrentMonth: true,
        isToday: dateKey === todayKey,
        schedules: schedulesByDate[dateKey] || [],
      });
    }

    // 3. Next month leading days (fill up to complete weeks, e.g. 35 or 42 cells)
    const remainder = cells.length % 7;
    const daysToAdd = remainder === 0 ? 0 : 7 - remainder;
    // ensure at least 35 cells
    const totalNeeded = cells.length + daysToAdd < 35 ? 35 - cells.length : daysToAdd;

    for (let d = 1; d <= totalNeeded; d++) {
      const nextMo = currentMonth === 11 ? 1 : currentMonth + 2;
      const nextYr = currentMonth === 11 ? currentYear + 1 : currentYear;
      const dateKey = `${nextYr}-${pad(nextMo)}-${pad(d)}`;
      cells.push({
        dateKey,
        dayNumber: d,
        isCurrentMonth: false,
        isToday: dateKey === todayKey,
        schedules: schedulesByDate[dateKey] || [],
      });
    }

    return cells;
  }, [currentYear, currentMonth, todayKey, schedulesByDate]);

  // Selected Day schedules
  const selectedDaySchedules = useMemo(() => {
    if (!selectedDateKey) return null;
    return schedulesByDate[selectedDateKey] || [];
  }, [selectedDateKey, schedulesByDate]);

  // Status Badge Helper
  // 状态语义统一走 status-* 设计 token，随 classic-dark / linear-light 自动切换，
  // 并与时间轴视图 InterviewTimelineView 保持同一套映射。
  const getStatusBadge = (status: ScheduleStatus) => {
    switch (status) {
      case 'upcoming':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-status-warning-bg border border-status-warning-border text-status-warning">
            <Clock className="w-2.5 h-2.5" />
            <span>待面试</span>
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-status-info-bg border border-status-info-border text-status-info">
            <CheckCircle2 className="w-2.5 h-2.5" />
            <span>已面试</span>
          </span>
        );
      case 'passed':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-status-success-bg border border-status-success-border text-status-success">
            <CheckCircle2 className="w-2.5 h-2.5" />
            <span>已通过</span>
          </span>
        );
      case 'declined':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-surface-hover border border-line-default text-content-secondary">
            <Handshake className="w-2.5 h-2.5 text-content-muted" />
            <span>已婉拒</span>
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-status-danger-bg border border-status-danger-border text-status-danger">
            <XCircle className="w-2.5 h-2.5" />
            <span>未通过</span>
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-surface-hover border border-line-subtle text-content-muted">
            <span>已取消</span>
          </span>
        );
      default:
        return null;
    }
  };

  // Schedule Badge in cell
  const getItemBadgeStyle = (status: ScheduleStatus) => {
    switch (status) {
      case 'upcoming':
        return 'bg-status-warning-bg border-status-warning-border text-status-warning hover:border-status-warning';
      case 'passed':
        return 'bg-status-success-bg border-status-success-border text-status-success hover:border-status-success';
      case 'completed':
        return 'bg-status-info-bg border-status-info-border text-status-info hover:border-status-info';
      case 'declined':
        return 'bg-surface-hover border-line-default text-content-secondary hover:border-line-focus';
      case 'failed':
        return 'bg-status-danger-bg border-status-danger-border text-status-danger hover:border-status-danger';
      default:
        return 'bg-surface-hover border-line-subtle text-content-secondary hover:border-line-default';
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Top Controls: Month Selector & Quick Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface border border-line-subtle p-3.5 rounded-2xl">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 rounded-lg bg-surface-hover hover:bg-surface-active text-content-secondary hover:text-content-primary transition cursor-pointer"
              title="上一月"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleNextMonth}
              className="p-1.5 rounded-lg bg-surface-hover hover:bg-surface-active text-content-secondary hover:text-content-primary transition cursor-pointer"
              title="下一月"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <h2 className="text-base sm:text-lg font-bold text-content-primary tracking-wide flex items-center space-x-2">
            <span>{currentYear} 年 {currentMonth + 1} 月</span>
          </h2>

          <button
            onClick={handleToday}
            className="px-2.5 py-1 rounded-lg text-xs font-medium bg-brand-subtle text-brand-primary border border-line-focus hover:border-brand-primary transition cursor-pointer"
          >
            返回今天
          </button>
        </div>

        {/* Legend & Month Metrics */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center space-x-2 text-content-secondary">
            <span>本月排期:</span>
            <span className="font-semibold text-content-primary">{monthStats.totalInMonth} 场</span>
            {monthStats.upcomingInMonth > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[11px] bg-status-warning-bg text-status-warning border border-status-warning-border font-medium">
                {monthStats.upcomingInMonth} 场待面试
              </span>
            )}
          </div>

          <div className="hidden md:flex items-center space-x-2.5 border-l border-line-subtle pl-3 text-[11px] text-content-secondary">
            <span className="flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-status-warning" />
              <span>待面试</span>
            </span>
            <span className="flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-status-success" />
              <span>已通过</span>
            </span>
            <span className="flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-status-info" />
              <span>已面试</span>
            </span>
            <span className="flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-status-danger" />
              <span>未通过</span>
            </span>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-surface border border-line-subtle rounded-2xl overflow-hidden shadow-card">
        {/* Weekdays Row */}
        <div className="grid grid-cols-7 border-b border-line-subtle bg-surface text-center text-xs font-semibold text-content-secondary py-2.5">
          {WEEK_DAYS.map((wd, index) => (
            <div
              key={wd}
              className={index >= 5 ? 'text-content-muted' : ''}
            >
              {wd}
            </div>
          ))}
        </div>

        {/* Cells Grid */}
        <div className="grid grid-cols-7 divide-x divide-y divide-line-subtle bg-app">
          {calendarCells.map((cell) => {
            const hasSchedules = cell.schedules.length > 0;
            const isSelected = selectedDateKey === cell.dateKey;
            const maxVisible = 3;
            const visibleSchedules = cell.schedules.slice(0, maxVisible);
            const extraCount = cell.schedules.length - maxVisible;

            return (
              <div
                key={cell.dateKey}
                onClick={() => setSelectedDateKey(cell.dateKey)}
                className={`min-h-[115px] sm:min-h-[135px] p-1.5 sm:p-2 transition-all flex flex-col justify-between group cursor-pointer relative ${
                  !cell.isCurrentMonth
                    ? 'opacity-45 hover:opacity-75 hover:bg-surface'
                    : isSelected
                    ? 'bg-brand-subtle ring-1 ring-line-focus'
                    : 'hover:bg-surface'
                } ${cell.isToday ? 'border-t-2 border-t-brand-primary' : ''}`}
              >
                {/* Cell Header: Day Number + Today Badge + Quick Add */}
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center space-x-1.5">
                    <span
                      className={`text-xs sm:text-sm font-semibold inline-flex items-center justify-center ${
                        cell.isToday
                          ? 'w-6 h-6 rounded-full bg-brand-primary text-white font-bold shadow-sm'
                          : cell.isCurrentMonth
                          ? 'text-content-primary'
                          : 'text-content-muted'
                      }`}
                    >
                      {cell.dayNumber}
                    </span>
                    {cell.isToday && (
                      <span className="text-[10px] text-brand-primary font-medium hidden sm:inline">
                        今天
                      </span>
                    )}
                  </div>

                  {/* Quick Add Button on Hover */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreateScheduleForDate(cell.dateKey);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-md bg-surface-hover hover:bg-brand-primary text-content-secondary hover:text-white transition cursor-pointer"
                    title={`在 ${cell.dateKey} 登记面试`}
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>

                {/* Day Schedule Time Badges */}
                <div className="flex-1 space-y-1 overflow-hidden">
                  {visibleSchedules.map((item) => {
                    const parsed = parseScheduleDate(item.scheduled_at);
                    const timeLabel = parsed ? parsed.timeStr : '';

                    return (
                      <div
                        key={item.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDateKey(cell.dateKey);
                        }}
                        className={`px-1.5 py-1 rounded-lg border text-[11px] font-medium leading-tight truncate transition-all shadow-xs flex items-center space-x-1.5 ${getItemBadgeStyle(
                          item.status
                        )}`}
                        title={`${timeLabel} ${item.company} · ${item.interview_round}`}
                      >
                        {/* Time icon & text */}
                        <span className="font-bold shrink-0 text-[10px] opacity-90">
                          {timeLabel}
                        </span>
                        <span className="truncate">
                          {item.company}
                        </span>
                      </div>
                    );
                  })}

                  {extraCount > 0 && (
                    <div className="text-[10px] text-content-secondary font-medium px-1 py-0.5 hover:text-brand-primary">
                      +{extraCount} 场更多...
                    </div>
                  )}
                </div>

                {/* Bottom marker dot if has items */}
                {hasSchedules && (
                  <div className="flex items-center space-x-1 mt-1">
                    {cell.schedules.slice(0, 5).map((s, idx) => (
                      <span
                        key={idx}
                        className={`w-1.5 h-1.5 rounded-full ${
                          s.status === 'upcoming'
                            ? 'bg-status-warning'
                            : s.status === 'passed'
                            ? 'bg-status-success'
                            : s.status === 'completed'
                            ? 'bg-status-info'
                            : s.status === 'failed'
                            ? 'bg-status-danger'
                            : 'bg-content-muted'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Day Detail Drawer (Overlay / Side Panel) */}
      {selectedDateKey && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setSelectedDateKey(null)}
          />

          {/* Drawer content */}
          <div className="relative w-full max-w-lg bg-surface border-l border-line-subtle shadow-modal flex flex-col z-10 drawer-slide-left">
            {/* Drawer Header */}
            <div className="p-5 border-b border-line-subtle flex items-start justify-between bg-surface sticky top-0 z-10">
              <div className="space-y-1">
                <div className="flex items-center space-x-2 text-xs text-brand-primary font-semibold">
                  <CalendarIcon className="w-3.5 h-3.5" />
                  <span>
                    {(() => {
                      const d = new Date(selectedDateKey);
                      const weekDay = WEEK_DAYS[(d.getDay() + 6) % 7];
                      return `${selectedDateKey} (${weekDay})`;
                    })()}
                  </span>
                  {selectedDateKey === todayKey && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-brand-subtle text-brand-primary border border-line-focus">
                      今天
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-bold text-content-primary">
                  当日面试日程
                  <span className="ml-2 text-xs font-normal text-content-secondary">
                    (共 {selectedDaySchedules?.length || 0} 场)
                  </span>
                </h3>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => onCreateScheduleForDate(selectedDateKey)}
                  className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-primary hover:bg-brand-hover text-white transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>登记此日日程</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDateKey(null)}
                  className="p-1.5 rounded-lg text-content-secondary hover:text-content-primary hover:bg-surface-hover transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Drawer Body: Timeline list */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {(!selectedDaySchedules || selectedDaySchedules.length === 0) ? (
                <div className="py-16 text-center space-y-3">
                  <div className="w-12 h-12 rounded-xl bg-surface-hover border border-line-default flex items-center justify-center text-content-secondary mx-auto">
                    <Clock className="w-6 h-6 text-content-muted" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-content-secondary">当天暂无面试安排</p>
                    <p className="text-xs text-content-muted max-w-xs mx-auto">
                      点击右上角“登记此日日程”，即可为 {selectedDateKey} 快捷预约面试时间。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onCreateScheduleForDate(selectedDateKey)}
                    className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-surface-hover hover:bg-surface-active text-brand-primary text-xs font-medium border border-line-default transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>立即为这一天添加日程</span>
                  </button>
                </div>
              ) : (
                <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-line-subtle">
                  {selectedDaySchedules.map((schedule) => {
                    const parsed = parseScheduleDate(schedule.scheduled_at);
                    const isUpcoming = schedule.status === 'upcoming';
                    const hasJd = Boolean(schedule.jd_text?.trim());
                    const isJdExpanded = expandedJdId === schedule.id;

                    return (
                      <div key={schedule.id} className="relative group">
                        {/* Timeline Node Dot */}
                        <div
                          className={`absolute -left-[27px] top-1.5 w-3.5 h-3.5 rounded-full border-2 bg-app ${
                            isUpcoming
                              ? 'border-status-warning ring-2 ring-status-warning-border'
                              : schedule.status === 'passed'
                              ? 'border-status-success ring-2 ring-status-success-border'
                              : 'border-line-default'
                          }`}
                        />

                        {/* Schedule Card Container */}
                        <div
                          className={`rounded-xl border p-4 transition-all bg-app space-y-3.5 ${
                            isUpcoming
                              ? 'border-status-warning-border hover:border-status-warning shadow-card'
                              : 'border-line-subtle hover:border-line-default'
                          }`}
                        >
                          {/* Time & Status Row */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center space-x-2">
                              <span className="text-sm font-bold text-content-primary flex items-center space-x-1">
                                <Clock className="w-3.5 h-3.5 text-content-muted" />
                                <span>{parsed ? parsed.timeStr : ''}</span>
                              </span>
                              <span className="text-xs text-content-secondary">
                                {schedule.interview_round}
                              </span>
                            </div>
                            <div>{getStatusBadge(schedule.status)}</div>
                          </div>

                          {/* Company & Role */}
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                              <Building2 className="w-4 h-4 text-content-muted shrink-0" />
                              <h4 className="text-base font-bold text-content-primary truncate">
                                {schedule.company}
                              </h4>
                            </div>
                            <p className="text-xs text-content-secondary font-medium pl-6">
                              {schedule.job_role}
                            </p>
                          </div>

                          {/* Location / Meeting Link */}
                          {schedule.meeting_link_or_address && (
                            <div className="p-2.5 rounded-lg bg-surface-hover border border-line-subtle flex items-center justify-between text-xs text-content-secondary">
                              <div className="flex items-center space-x-2 min-w-0 pr-2">
                                {schedule.location_type === 'online' ? (
                                  <Video className="w-3.5 h-3.5 text-brand-primary shrink-0" />
                                ) : schedule.location_type === 'phone' ? (
                                  <Phone className="w-3.5 h-3.5 text-status-info shrink-0" />
                                ) : (
                                  <MapPin className="w-3.5 h-3.5 text-content-muted shrink-0" />
                                )}
                                <span className="truncate text-content-secondary">
                                  {schedule.meeting_link_or_address}
                                </span>
                              </div>

                              <div className="flex items-center space-x-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(schedule.meeting_link_or_address!)}
                                  className="p-1 rounded hover:bg-surface-active text-content-secondary hover:text-content-primary transition cursor-pointer"
                                  title="复制链接/地址"
                                >
                                  {copiedLink ? (
                                    <Check className="w-3.5 h-3.5 text-status-success" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                                {schedule.location_type === 'online' &&
                                  (schedule.meeting_link_or_address.startsWith('http') ||
                                    schedule.meeting_link_or_address.includes('meeting')) && (
                                    <a
                                      href={schedule.meeting_link_or_address}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="p-1 rounded hover:bg-surface-active text-brand-primary hover:text-brand-hover transition"
                                      title="进入在线会议"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                  )}
                              </div>
                            </div>
                          )}

                          {/* Salary Note if any */}
                          {schedule.salary && (
                            <div className="flex items-center space-x-1.5 text-xs text-status-warning">
                              <Banknote className="w-3.5 h-3.5" />
                              <span>目标/Offer薪资：{schedule.salary}</span>
                            </div>
                          )}

                          {/* Expandable JD Text */}
                          {hasJd && (
                            <div className="text-xs">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedJdId(isJdExpanded ? null : schedule.id)
                                }
                                className="inline-flex items-center space-x-1 text-content-secondary hover:text-content-primary transition cursor-pointer py-1"
                              >
                                <FileText className="w-3 h-3 text-content-muted" />
                                <span>{isJdExpanded ? '收起岗位 JD' : '查看岗位 JD 要求'}</span>
                                {isJdExpanded ? (
                                  <ChevronUp className="w-3 h-3" />
                                ) : (
                                  <ChevronDown className="w-3 h-3" />
                                )}
                              </button>
                              {isJdExpanded && (
                                <div className="mt-1.5 p-3 rounded-lg bg-surface-hover border border-line-subtle text-content-secondary whitespace-pre-wrap text-xs max-h-48 overflow-y-auto font-mono leading-relaxed">
                                  {schedule.jd_text}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Notes if any */}
                          {schedule.notes && (
                            <div className="text-xs text-content-secondary bg-surface-hover p-2.5 rounded-lg border border-line-subtle">
                              <span className="text-content-muted font-medium mr-1">备注:</span>
                              {schedule.notes}
                            </div>
                          )}

                          {/* Core Action: Start Mock with this schedule */}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedDateKey(null);
                              onStartMockWithSchedule(schedule);
                            }}
                            className="w-full py-2 px-3 rounded-xl bg-brand-primary hover:bg-brand-hover text-white font-medium text-xs shadow-sm flex items-center justify-center space-x-2 transition cursor-pointer"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-white/80 animate-pulse" />
                            <span>针对此岗位发起 AI 模拟对练</span>
                          </button>

                          {/* Card Footer: Quick Status Switch + Edit + Delete */}
                          <div className="pt-2 border-t border-line-subtle flex items-center justify-between text-xs">
                            {/* Quick Status Buttons */}
                            <div className="flex items-center space-x-1">
                              {schedule.status !== 'passed' && (
                                <button
                                  type="button"
                                  onClick={(e) => onQuickStatusChange(schedule.id, 'passed', e)}
                                  className="px-2 py-1 rounded bg-status-success-bg hover:border-status-success border border-status-success-border text-status-success text-[10px] transition cursor-pointer"
                                >
                                  标记通过
                                </button>
                              )}
                              {schedule.status !== 'failed' && (
                                <button
                                  type="button"
                                  onClick={(e) => onQuickStatusChange(schedule.id, 'failed', e)}
                                  className="px-2 py-1 rounded bg-status-danger-bg hover:border-status-danger border border-status-danger-border text-status-danger text-[10px] transition cursor-pointer"
                                >
                                  未通过
                                </button>
                              )}
                            </div>

                            {/* Edit & Delete */}
                            <div className="flex items-center space-x-2">
                              <button
                                type="button"
                                onClick={(e) => onEditSchedule(schedule, e)}
                                className="p-1 rounded text-content-secondary hover:text-content-primary hover:bg-surface-hover transition cursor-pointer"
                                title="编辑日程"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => onDeleteSchedule(schedule.id, schedule.company, e)}
                                className="p-1 rounded text-content-secondary hover:text-status-danger hover:bg-status-danger-bg transition cursor-pointer"
                                title="删除日程"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
