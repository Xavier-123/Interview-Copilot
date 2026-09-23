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
  const getStatusBadge = (status: ScheduleStatus) => {
    switch (status) {
      case 'upcoming':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-950/70 border border-amber-700/60 text-amber-300">
            <Clock className="w-2.5 h-2.5 text-amber-400" />
            <span>待面试</span>
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-950/70 border border-blue-700/60 text-blue-300">
            <CheckCircle2 className="w-2.5 h-2.5 text-blue-400" />
            <span>已面试</span>
          </span>
        );
      case 'passed':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-950/70 border border-emerald-700/60 text-emerald-300">
            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
            <span>已通过</span>
          </span>
        );
      case 'declined':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-violet-950/70 border border-violet-700/60 text-violet-300">
            <Handshake className="w-2.5 h-2.5 text-violet-400" />
            <span>已婉拒</span>
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-950/70 border border-red-700/60 text-red-300">
            <XCircle className="w-2.5 h-2.5 text-red-400" />
            <span>未通过</span>
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-800 text-gray-400 border border-gray-700">
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
        return 'bg-amber-950/80 border-amber-600/60 text-amber-200 hover:bg-amber-900/80 hover:border-amber-400';
      case 'passed':
        return 'bg-emerald-950/80 border-emerald-600/60 text-emerald-200 hover:bg-emerald-900/80 hover:border-emerald-400';
      case 'completed':
        return 'bg-blue-950/80 border-blue-600/60 text-blue-200 hover:bg-blue-900/80 hover:border-blue-400';
      case 'declined':
        return 'bg-violet-950/80 border-violet-600/60 text-violet-200 hover:bg-violet-900/80 hover:border-violet-400';
      case 'failed':
        return 'bg-red-950/80 border-red-600/60 text-red-200 hover:bg-red-900/80 hover:border-red-400';
      default:
        return 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700';
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-900/80 border border-gray-800 p-3.5 rounded-2xl">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 rounded-lg bg-gray-800/80 hover:bg-gray-700 text-gray-300 hover:text-white transition cursor-pointer"
              title="上一月"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleNextMonth}
              className="p-1.5 rounded-lg bg-gray-800/80 hover:bg-gray-700 text-gray-300 hover:text-white transition cursor-pointer"
              title="下一月"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <h2 className="text-base sm:text-lg font-bold text-white tracking-wide flex items-center space-x-2">
            <span>{currentYear} 年 {currentMonth + 1} 月</span>
          </h2>

          <button
            onClick={handleToday}
            className="px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 transition cursor-pointer"
          >
            返回今天
          </button>
        </div>

        {/* Legend & Month Metrics */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center space-x-2 text-gray-400">
            <span>本月排期:</span>
            <span className="font-semibold text-white">{monthStats.totalInMonth} 场</span>
            {monthStats.upcomingInMonth > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[11px] bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium">
                {monthStats.upcomingInMonth} 场待面试
              </span>
            )}
          </div>

          <div className="hidden md:flex items-center space-x-2.5 border-l border-gray-800 pl-3 text-[11px] text-gray-400">
            <span className="flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>待面试</span>
            </span>
            <span className="flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>已通过</span>
            </span>
            <span className="flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              <span>已面试</span>
            </span>
            <span className="flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-red-400" />
              <span>未通过</span>
            </span>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-gray-900/60 border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
        {/* Weekdays Row */}
        <div className="grid grid-cols-7 border-b border-gray-800 bg-gray-900/90 text-center text-xs font-semibold text-gray-400 py-2.5">
          {WEEK_DAYS.map((wd, index) => (
            <div
              key={wd}
              className={index >= 5 ? 'text-emerald-400/70' : ''}
            >
              {wd}
            </div>
          ))}
        </div>

        {/* Cells Grid */}
        <div className="grid grid-cols-7 divide-x divide-y divide-gray-800/80 bg-gray-950/40">
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
                    ? 'bg-gray-950/60 opacity-45 hover:opacity-75'
                    : isSelected
                    ? 'bg-emerald-950/20 ring-1 ring-emerald-500/70'
                    : 'hover:bg-gray-900/70'
                } ${cell.isToday ? 'border-t-2 border-t-emerald-500' : ''}`}
              >
                {/* Cell Header: Day Number + Today Badge + Quick Add */}
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center space-x-1.5">
                    <span
                      className={`text-xs sm:text-sm font-semibold inline-flex items-center justify-center ${
                        cell.isToday
                          ? 'w-6 h-6 rounded-full bg-emerald-500 text-white font-bold shadow-md shadow-emerald-900/50'
                          : cell.isCurrentMonth
                          ? 'text-gray-200'
                          : 'text-gray-500'
                      }`}
                    >
                      {cell.dayNumber}
                    </span>
                    {cell.isToday && (
                      <span className="text-[10px] text-emerald-400 font-medium hidden sm:inline">
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
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-md bg-gray-800 hover:bg-emerald-600 text-gray-400 hover:text-white transition cursor-pointer"
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
                    <div className="text-[10px] text-gray-400 font-medium px-1 py-0.5 hover:text-emerald-300">
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
                            ? 'bg-amber-400'
                            : s.status === 'passed'
                            ? 'bg-emerald-400'
                            : s.status === 'completed'
                            ? 'bg-blue-400'
                            : s.status === 'failed'
                            ? 'bg-red-400'
                            : 'bg-gray-400'
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
          <div className="relative w-full max-w-lg bg-gray-900 border-l border-gray-800 shadow-2xl flex flex-col z-10 drawer-slide-left">
            {/* Drawer Header */}
            <div className="p-5 border-b border-gray-800 flex items-start justify-between bg-gray-900/90 sticky top-0 z-10">
              <div className="space-y-1">
                <div className="flex items-center space-x-2 text-xs text-emerald-400 font-semibold">
                  <CalendarIcon className="w-3.5 h-3.5" />
                  <span>
                    {(() => {
                      const d = new Date(selectedDateKey);
                      const weekDay = WEEK_DAYS[(d.getDay() + 6) % 7];
                      return `${selectedDateKey} (${weekDay})`;
                    })()}
                  </span>
                  {selectedDateKey === todayKey && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      今天
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-bold text-white">
                  当日面试日程
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    (共 {selectedDaySchedules?.length || 0} 场)
                  </span>
                </h3>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => onCreateScheduleForDate(selectedDateKey)}
                  className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>登记此日日程</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDateKey(null)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Drawer Body: Timeline list */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {(!selectedDaySchedules || selectedDaySchedules.length === 0) ? (
                <div className="py-16 text-center space-y-3">
                  <div className="w-12 h-12 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center text-gray-400 mx-auto">
                    <Clock className="w-6 h-6 text-gray-500" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-gray-300">当天暂无面试安排</p>
                    <p className="text-xs text-gray-500 max-w-xs mx-auto">
                      点击右上角“登记此日日程”，即可为 {selectedDateKey} 快捷预约面试时间。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onCreateScheduleForDate(selectedDateKey)}
                    className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-emerald-400 text-xs font-medium border border-gray-700 transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>立即为这一天添加日程</span>
                  </button>
                </div>
              ) : (
                <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-800">
                  {selectedDaySchedules.map((schedule) => {
                    const parsed = parseScheduleDate(schedule.scheduled_at);
                    const isUpcoming = schedule.status === 'upcoming';
                    const hasJd = Boolean(schedule.jd_text?.trim());
                    const isJdExpanded = expandedJdId === schedule.id;

                    return (
                      <div key={schedule.id} className="relative group">
                        {/* Timeline Node Dot */}
                        <div
                          className={`absolute -left-[27px] top-1.5 w-3.5 h-3.5 rounded-full border-2 bg-gray-950 ${
                            isUpcoming
                              ? 'border-amber-400 ring-2 ring-amber-400/20'
                              : schedule.status === 'passed'
                              ? 'border-emerald-400 ring-2 ring-emerald-400/20'
                              : 'border-gray-500'
                          }`}
                        />

                        {/* Schedule Card Container */}
                        <div
                          className={`rounded-xl border p-4 transition-all bg-gray-950/70 space-y-3.5 ${
                            isUpcoming
                              ? 'border-amber-700/50 hover:border-amber-500/70 shadow-lg shadow-amber-950/10'
                              : 'border-gray-800 hover:border-gray-700'
                          }`}
                        >
                          {/* Time & Status Row */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center space-x-2">
                              <span className="text-sm font-bold text-amber-300 flex items-center space-x-1">
                                <Clock className="w-3.5 h-3.5 text-amber-400" />
                                <span>{parsed ? parsed.timeStr : ''}</span>
                              </span>
                              <span className="text-xs text-gray-400">
                                {schedule.interview_round}
                              </span>
                            </div>
                            <div>{getStatusBadge(schedule.status)}</div>
                          </div>

                          {/* Company & Role */}
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                              <Building2 className="w-4 h-4 text-emerald-400 shrink-0" />
                              <h4 className="text-base font-bold text-white truncate">
                                {schedule.company}
                              </h4>
                            </div>
                            <p className="text-xs text-emerald-400/90 font-medium pl-6">
                              {schedule.job_role}
                            </p>
                          </div>

                          {/* Location / Meeting Link */}
                          {schedule.meeting_link_or_address && (
                            <div className="p-2.5 rounded-lg bg-gray-900 border border-gray-800 flex items-center justify-between text-xs text-gray-300">
                              <div className="flex items-center space-x-2 min-w-0 pr-2">
                                {schedule.location_type === 'online' ? (
                                  <Video className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                ) : schedule.location_type === 'phone' ? (
                                  <Phone className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                                ) : (
                                  <MapPin className="w-3.5 h-3.5 text-red-400 shrink-0" />
                                )}
                                <span className="truncate text-gray-300">
                                  {schedule.meeting_link_or_address}
                                </span>
                              </div>

                              <div className="flex items-center space-x-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(schedule.meeting_link_or_address!)}
                                  className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-white transition cursor-pointer"
                                  title="复制链接/地址"
                                >
                                  {copiedLink ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
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
                                      className="p-1 rounded hover:bg-gray-800 text-blue-400 hover:text-blue-300 transition"
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
                            <div className="flex items-center space-x-1.5 text-xs text-amber-300/90">
                              <Banknote className="w-3.5 h-3.5 text-amber-400" />
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
                                className="inline-flex items-center space-x-1 text-gray-400 hover:text-white transition cursor-pointer py-1"
                              >
                                <FileText className="w-3 h-3 text-gray-400" />
                                <span>{isJdExpanded ? '收起岗位 JD' : '查看岗位 JD 要求'}</span>
                                {isJdExpanded ? (
                                  <ChevronUp className="w-3 h-3" />
                                ) : (
                                  <ChevronDown className="w-3 h-3" />
                                )}
                              </button>
                              {isJdExpanded && (
                                <div className="mt-1.5 p-3 rounded-lg bg-gray-900/90 border border-gray-800 text-gray-300 whitespace-pre-wrap text-xs max-h-48 overflow-y-auto font-mono leading-relaxed">
                                  {schedule.jd_text}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Notes if any */}
                          {schedule.notes && (
                            <div className="text-xs text-gray-400 bg-gray-900/60 p-2.5 rounded-lg border border-gray-800/60">
                              <span className="text-gray-500 font-medium mr-1">备注:</span>
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
                            className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium text-xs shadow-md shadow-emerald-950/40 flex items-center justify-center space-x-2 transition cursor-pointer"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-emerald-200 animate-pulse" />
                            <span>针对此岗位发起 AI 模拟对练</span>
                          </button>

                          {/* Card Footer: Quick Status Switch + Edit + Delete */}
                          <div className="pt-2 border-t border-gray-800/80 flex items-center justify-between text-xs">
                            {/* Quick Status Buttons */}
                            <div className="flex items-center space-x-1">
                              {schedule.status !== 'passed' && (
                                <button
                                  type="button"
                                  onClick={(e) => onQuickStatusChange(schedule.id, 'passed', e)}
                                  className="px-2 py-1 rounded bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-800/60 text-emerald-300 text-[10px] transition cursor-pointer"
                                >
                                  标记通过
                                </button>
                              )}
                              {schedule.status !== 'failed' && (
                                <button
                                  type="button"
                                  onClick={(e) => onQuickStatusChange(schedule.id, 'failed', e)}
                                  className="px-2 py-1 rounded bg-red-950/60 hover:bg-red-900/80 border border-red-800/60 text-red-300 text-[10px] transition cursor-pointer"
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
                                className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition cursor-pointer"
                                title="编辑日程"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => onDeleteSchedule(schedule.id, schedule.company, e)}
                                className="p-1 rounded text-gray-400 hover:text-red-400 hover:bg-red-950/50 transition cursor-pointer"
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
