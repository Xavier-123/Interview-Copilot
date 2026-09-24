import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock,
  Building2,
  Video,
  MapPin,
  Phone,
  Sparkles,
  Edit2,
  Trash2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileText,
  Mail,
  Compass,
  Copy,
  Check,
  Plus,
  Coffee,
  HeartHandshake,
  BellRing,
  AlertCircle,
} from 'lucide-react';
import type { InterviewScheduleItem, ScheduleStatus } from '../types';
import { ScheduleStatusBadge } from './ScheduleStatusBadge';
import { ScheduleStatusActions } from './ScheduleStatusActions';
import { isExpiredUnmarked } from '../utils/scheduleStatus';
import { useTheme } from '../context/ThemeContext';

interface InterviewTimelineViewProps {
  schedules: InterviewScheduleItem[];
  onStartMockWithSchedule: (schedule: InterviewScheduleItem) => void;
  onEditSchedule: (schedule: InterviewScheduleItem, e: React.MouseEvent) => void;
  onDeleteSchedule: (scheduleId: string, company: string, e: React.MouseEvent) => void;
  onQuickStatusChange: (scheduleId: string, newStatus: ScheduleStatus, e: React.MouseEvent) => void;
  onOpenCreate: (dateStr?: string) => void;
  onViewGuide: (schedule: InterviewScheduleItem) => void;
  onNavigateQuickMock: () => void;
  /** 是否处于「状态筛选」中：为空状态区分「筛选无结果」与「确实没有日程」 */
  isFiltered?: boolean;
  /** 当前筛选档位名称，用于空状态文案 */
  activeFilterLabel?: string;
  /** 清除筛选（空状态里的引导按钮） */
  onClearFilter?: () => void;
}

export const InterviewTimelineView: React.FC<InterviewTimelineViewProps> = ({
  schedules,
  onStartMockWithSchedule,
  onEditSchedule,
  onDeleteSchedule,
  onQuickStatusChange,
  onOpenCreate,
  onViewGuide,
  onNavigateQuickMock,
  isFiltered = false,
  activeFilterLabel,
  onClearFilter,
}) => {
  const { isDark } = useTheme();

  // 秒级动态计时器，驱动全量卡片倒计时无抖动跳动
  const [currentTime, setCurrentTime] = useState<number>(() => Date.now());
  const [expandedJdId, setExpandedJdId] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 对日程排序：待面试优先（按时间升序），已结束排后
  const sortedSchedules = useMemo(() => {
    return [...schedules].sort((a, b) => {
      const isAUpcoming = a.status === 'upcoming';
      const isBUpcoming = b.status === 'upcoming';
      if (isAUpcoming && !isBUpcoming) return -1;
      if (!isAUpcoming && isBUpcoming) return 1;
      const tA = new Date(a.scheduled_at).getTime();
      const tB = new Date(b.scheduled_at).getTime();
      return isAUpcoming ? tA - tB : tB - tA;
    });
  }, [schedules]);

  // 定位最临近的下一场待面试日程（给予特殊的呼吸灯微动效）
  const nextUpcomingId = useMemo(() => {
    const upcomings = sortedSchedules.filter((s) => s.status === 'upcoming');
    if (upcomings.length === 0) return null;
    // 取未来时间最临近的一场；全部已过期时不回退到 upcomings[0]，否则会给过期面试戴上「下一场」呼吸灯
    const futureUpcoming = upcomings.find((s) => new Date(s.scheduled_at).getTime() >= currentTime - 1800000);
    return futureUpcoming ? futureUpcoming.id : null;
  }, [sortedSchedules, currentTime]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(text);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  // 解析日期分量
  const parseDateTimeParts = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      const m = (d.getMonth() + 1).toString().padStart(2, '0');
      const date = d.getDate().toString().padStart(2, '0');
      const hours = d.getHours().toString().padStart(2, '0');
      const mins = d.getMinutes().toString().padStart(2, '0');
      const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      const weekDay = weekDays[d.getDay()];
      return {
        dateStr: `${m}月${date}日`,
        weekDay,
        timeStr: `${hours}:${mins}`,
        fullDate: `${d.getFullYear()}-${m}-${date}`,
      };
    } catch {
      return { dateStr: '-', weekDay: '', timeStr: '--:--', fullDate: '' };
    }
  };

  // 计算精确倒计时与情绪状态
  const getCountdownData = (isoStr: string, status: ScheduleStatus) => {
    try {
      const target = new Date(isoStr).getTime();
      const diffMs = target - currentTime;

      if (status !== 'upcoming') {
        return { isUpcoming: false, label: '已结束', encouragement: null, diffMs };
      }

      if (diffMs <= 0) {
        // 3 小时内当作正在进行；再往后当作已结束，避免给三天前的面试显示「进行中」
        const elapsedHours = Math.floor(-diffMs / 3600000);
        return {
          isUpcoming: true,
          label: elapsedHours >= 3 ? '已结束，待更新状态' : '进行中 / 待更新状态',
          encouragement: '面试时间已到达，保持冷静，专注发挥！面完后记得标记状态或复盘。',
          diffMs,
          days: 0,
          hours: 0,
          minutes: 0,
          seconds: 0,
          isImminent: true,
        };
      }

      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

      const pad = (n: number) => n.toString().padStart(2, '0');

      let label = '';
      if (days > 0) {
        label = `还有 ${days} 天 ${pad(hours)} 小时 ${pad(minutes)} 分 ${pad(seconds)} 秒`;
      } else if (hours > 0) {
        label = `还有 ${pad(hours)} 小时 ${pad(minutes)} 分 ${pad(seconds)} 秒`;
      } else {
        label = `还有 ${pad(minutes)} 分 ${pad(seconds)} 秒`;
      }

      // 情感化鼓励文案梯队
      let encouragement = '';
      const isImminent = diffMs <= 2 * 3600 * 1000; // 2小时内

      if (isImminent) {
        encouragement = '🌱 深呼吸，你准备得很好了！喝口温水，放平心态自信展示真实的自己。';
      } else if (diffMs <= 24 * 3600 * 1000) {
        encouragement = '💡 距离面试已临近，梳理好核心项目 STAR 亮点与技术选型权衡，做从容自信的自己。';
      } else if (diffMs <= 3 * 24 * 3600 * 1000) {
        encouragement = '🎯 节奏平稳，随时可以去【模拟面试】练手保持手感与题感。';
      } else {
        encouragement = '✨ 提前规划，胸有成竹。点击查看面试指南梳理考察要点。';
      }

      return {
        isUpcoming: true,
        label,
        days,
        hours,
        minutes,
        seconds,
        encouragement,
        diffMs,
        isImminent,
      };
    } catch {
      return { isUpcoming: false, label: '-', encouragement: null, diffMs: 0 };
    }
  };

  // 状态徽章已抽到 ScheduleStatusBadge（与月历共用一个来源），此处不再本地维护 switch。

  // 空状态：必须区分「当前筛选无结果」与「确实一条日程都没有」，
  // 否则筛「未通过 / 已取消」为空时也会说「今天没有安排面试」，误导用户。
  if (sortedSchedules.length === 0) {
    const shellCls = `py-16 text-center border border-dashed rounded-2xl p-8 space-y-6 transition-all ${
      isDark ? 'border-gray-800 bg-gray-900/40 text-white' : 'border-gray-300 bg-white text-gray-900 shadow-sm'
    }`;
    const iconCls = `w-16 h-16 rounded-2xl flex items-center justify-center mx-auto transition-transform hover:scale-105 ${
      isDark
        ? 'bg-blue-500/10 border border-blue-500/20 text-blue-400'
        : 'bg-blue-50 border border-blue-200 text-blue-600'
    }`;

    if (isFiltered) {
      return (
        <div className={shellCls}>
          <div className={iconCls}>
            <Coffee className="w-8 h-8" />
          </div>
          <div className="space-y-2 max-w-md mx-auto">
            <h3 className="text-lg font-bold">当前筛选下暂无日程</h3>
            <p className={`text-xs leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              {activeFilterLabel ? `「${activeFilterLabel}」筛选下没有匹配的面试日程。` : '当前筛选条件下没有匹配的面试日程。'}
              清除筛选即可查看全部日程。
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <button
              onClick={onClearFilter}
              className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow-md shadow-blue-600/20 hover:shadow-blue-600/30 transition cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>清除筛选，查看全部</span>
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className={shellCls}>
        <div className={iconCls}>
          <Coffee className="w-8 h-8" />
        </div>

        <div className="space-y-2 max-w-md mx-auto">
          <h3 className="text-lg font-bold">
            今天没有安排面试，好好休息！
          </h3>
          <p className={`text-xs leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            享受放松的时刻，或者去【模拟面试】房间和 AI 面试官对练几道经典真题保持手感？
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <button
            onClick={onNavigateQuickMock}
            className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow-md shadow-blue-600/20 hover:shadow-blue-600/30 transition cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>去模拟面试练练手</span>
          </button>

          <button
            onClick={() => onOpenCreate()}
            className={`inline-flex items-center space-x-1.5 px-4 py-2.5 rounded-xl border text-xs font-medium transition cursor-pointer ${
              isDark
                ? 'border-gray-700 hover:bg-gray-800 text-gray-300'
                : 'border-gray-300 hover:bg-gray-100 text-gray-700'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>登记一场新面试</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative pl-4 sm:pl-8 space-y-8 animate-fade-in">
      {/* 贯穿全线的时间轴主轨道轴线 */}
      <div
        className={`absolute left-4 sm:left-8 top-4 bottom-4 w-0.5 -translate-x-1/2 transition-colors ${
          isDark
            ? 'bg-gradient-to-b from-blue-500 via-gray-800 to-gray-900'
            : 'bg-gradient-to-b from-blue-500 via-gray-200 to-gray-200'
        }`}
      />

      {sortedSchedules.map((schedule) => {
        const isNextUpcoming = schedule.id === nextUpcomingId;
        const isUpcoming = schedule.status === 'upcoming';
        const { dateStr, weekDay, timeStr } = parseDateTimeParts(schedule.scheduled_at);
        const countdown = getCountdownData(schedule.scheduled_at, schedule.status);
        const isExpired = isExpiredUnmarked(schedule);
        const hasJd = Boolean(schedule.jd_text?.trim());
        const isJdExpanded = expandedJdId === schedule.id;

        return (
          <div key={schedule.id} className="relative flex items-start gap-4 sm:gap-6 group">
            {/* ================= 1. 左侧时间节点圆点 (微动效) ================= */}
            <div className="relative -ml-[13px] sm:-ml-[17px] mt-6 flex items-center justify-center shrink-0 z-10">
              {isNextUpcoming ? (
                // 重点：即将到来的面试节点搭载双环扩散呼吸灯微动效
                <div className="relative flex items-center justify-center">
                  <span className="animate-ping absolute inline-flex h-7 w-7 rounded-full bg-blue-500 opacity-60" />
                  <span className="relative flex h-5 w-5 rounded-full bg-blue-600 border-2 border-white dark:border-gray-950 shadow-[0_0_15px_rgba(37,99,235,0.8)] items-center justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  </span>
                </div>
              ) : isUpcoming ? (
                // 普通待面节点
                <div className="w-4 h-4 rounded-full bg-blue-500 border-2 border-white dark:border-gray-950 shadow-sm" />
              ) : schedule.status === 'passed' ? (
                // 已通过节点
                <div className="w-4 h-4 rounded-full bg-emerald-500 border-2 border-white dark:border-gray-950 flex items-center justify-center text-white">
                  <Check className="w-2.5 h-2.5" />
                </div>
              ) : (
                // 已完结/其它状态节点
                <div
                  className={`w-3.5 h-3.5 rounded-full border-2 ${
                    isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-300 border-white'
                  }`}
                />
              )}
            </div>

            {/* ================= 2. 时间信息标签列 (响应式对齐) ================= */}
            <div className="hidden md:flex flex-col items-start w-28 shrink-0 pt-5">
              <span className={`text-xs font-semibold ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                {dateStr}
              </span>
              <span className={`text-[11px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                {weekDay}
              </span>
              <span className="text-xl font-bold font-mono tracking-tight text-blue-500 mt-1">
                {timeStr}
              </span>
              {isNextUpcoming && (
                <span className="mt-1.5 inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-500 text-[10px] font-semibold border border-blue-500/30">
                  <BellRing className="w-2.5 h-2.5 animate-pulse" />
                  <span>下一场</span>
                </span>
              )}
            </div>

            {/* ================= 3. 右侧面试大日程卡片 (Card) ================= */}
            <div
              className={`flex-1 rounded-2xl border p-5 sm:p-6 transition-all duration-200 hover:-translate-y-0.5 flex flex-col justify-between space-y-4 shadow-sm ${
                isNextUpcoming
                  ? isDark
                    ? 'bg-gray-900/90 border-blue-500/60 shadow-[0_12px_36px_rgba(37,99,235,0.15)] ring-1 ring-blue-500/20'
                    : 'bg-white border-blue-300 shadow-[0_12px_36px_rgba(37,99,235,0.08)] ring-1 ring-blue-500/10'
                  : isDark
                  ? 'bg-gray-900/70 border-gray-800 hover:border-gray-700 hover:shadow-xl'
                  : 'bg-white border-gray-200/90 hover:border-gray-300 hover:shadow-md'
              }`}
            >
              <div className="space-y-4">
                {/* 顶部企业与轮次行 */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex items-start space-x-3.5 min-w-0">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${
                        isNextUpcoming
                          ? isDark
                            ? 'bg-blue-500/20 border-blue-500/40 text-blue-400'
                            : 'bg-blue-50 border-blue-200 text-blue-600'
                          : isDark
                          ? 'bg-gray-800 border-gray-700 text-gray-300'
                          : 'bg-gray-100 border-gray-200 text-gray-700'
                      }`}
                    >
                      <Building2 className="w-6 h-6" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <h3 className="text-base sm:text-lg font-bold truncate tracking-tight">
                          {schedule.company}
                        </h3>
                        {/* 移动端时间展示 */}
                        <span className="md:hidden text-xs font-mono font-bold text-blue-500">
                          {dateStr} {timeStr}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className="text-xs font-semibold text-blue-500">
                          {schedule.job_role}
                        </span>
                        <span className={`text-xs ${isDark ? 'text-gray-600' : 'text-gray-300'}`}>•</span>
                        <span
                          className={`px-2.5 py-0.5 rounded-md text-xs font-medium border ${
                            schedule.interview_round.includes('笔试') || schedule.interview_round.includes('机试') || schedule.interview_round.toUpperCase().includes('OA') || schedule.interview_round.includes('测评')
                              ? isDark
                                ? 'bg-amber-950/60 text-amber-300 border-amber-800/60'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                              : isDark
                                ? 'bg-gray-800/90 text-gray-200 border-gray-700'
                                : 'bg-gray-100 text-gray-800 border-gray-200'
                          }`}
                        >
                          {schedule.interview_round}
                        </span>

                        {schedule.email_reminded_at && (
                          <span
                            className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] border ${
                              isDark
                                ? 'bg-blue-950/60 border-blue-800/40 text-blue-300'
                                : 'bg-blue-50 border-blue-200 text-blue-700'
                            }`}
                            title="已向您的邮箱发送临近提醒"
                          >
                            <Mail className="w-3 h-3 text-blue-500" />
                            <span>邮件已提醒</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 self-start shrink-0">
                    {isExpired ? (
                      // 过期未标记比「待面试」信息量更大，直接替代它，避免两个徽章并排拥挤
                      <span
                        className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium border bg-status-danger-bg border-status-danger-border text-status-danger"
                        title="面试时间已过，但状态仍停在「待面试」。请标记为已面完并补记结果。"
                      >
                        <AlertCircle className="w-3 h-3" />
                        <span>已过期未标记</span>
                      </span>
                    ) : (
                      <ScheduleStatusBadge status={schedule.status} />
                    )}
                  </div>
                </div>

                {/* 倒计时与时间横幅 (核心高亮区) */}
                <div
                  className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                    isNextUpcoming
                      ? isDark
                        ? 'bg-blue-950/30 border-blue-800/50'
                        : 'bg-blue-50/70 border-blue-200/90'
                      : isDark
                      ? 'bg-gray-950/60 border-gray-800/80'
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 text-xs">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        isDark ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-medium text-xs">
                        {dateStr} ({weekDay}) {timeStr}
                      </div>
                      <div className={`text-[11px] mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        面试时间节点
                      </div>
                    </div>
                  </div>

                  {/* 倒计时模块 (等宽数字 tabular-nums，营造紧迫感但不焦虑) */}
                  {countdown.isUpcoming && (
                    <div className="flex items-center space-x-2 shrink-0">
                      <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        距离开始：
                      </span>
                      <span
                        className={`font-mono font-bold text-xs sm:text-sm px-3 py-1 rounded-lg border tabular-nums shadow-xs ${
                          countdown.isImminent
                            ? isDark
                              ? 'bg-amber-950/70 border-amber-600/70 text-amber-300'
                              : 'bg-amber-50 border-amber-300 text-amber-800'
                            : isDark
                            ? 'bg-blue-950/60 border-blue-700/60 text-blue-300'
                            : 'bg-white border-blue-200 text-blue-700'
                        }`}
                      >
                        {countdown.label}
                      </span>
                    </div>
                  )}
                </div>

                {/* 情感化安抚与鼓励文案 (仅针对待面试卡片) */}
                {countdown.encouragement && (
                  <div
                    className={`p-3 rounded-xl border flex items-center space-x-2 text-xs leading-relaxed ${
                      countdown.isImminent
                        ? isDark
                          ? 'bg-amber-950/20 border-amber-800/40 text-amber-300'
                          : 'bg-amber-50/80 border-amber-200 text-amber-900'
                        : isDark
                        ? 'bg-gray-950/40 border-gray-800/80 text-gray-300'
                        : 'bg-gray-50/90 border-gray-200 text-gray-700'
                    }`}
                  >
                    <HeartHandshake className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>{countdown.encouragement}</span>
                  </div>
                )}

                {/* 地点、在线会议链接与线下地址 */}
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <div className="flex items-center space-x-1.5">
                    {schedule.location_type === 'online' ? (
                      <Video className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    ) : schedule.location_type === 'phone' ? (
                      <Phone className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    ) : (
                      <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    )}
                    <span className={`font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                      {schedule.location_type === 'online'
                        ? '在线远程面试'
                        : schedule.location_type === 'phone'
                        ? '电话面试'
                        : '线下现场面试'}
                    </span>
                  </div>

                  {schedule.meeting_link_or_address && (
                    <div className="flex items-center space-x-1.5 max-w-full">
                      {schedule.meeting_link_or_address.startsWith('http') ||
                      schedule.meeting_link_or_address.includes('meeting') ? (
                        <div className="flex items-center space-x-1.5 truncate">
                          <a
                            href={schedule.meeting_link_or_address}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-500 hover:underline inline-flex items-center space-x-1 truncate max-w-xs"
                          >
                            <span className="truncate">{schedule.meeting_link_or_address}</span>
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(schedule.meeting_link_or_address!)}
                            title="复制会议号/链接"
                            className={`p-1 rounded transition cursor-pointer ${
                              isDark ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-200 text-gray-500'
                            }`}
                          >
                            {copiedLink === schedule.meeting_link_or_address ? (
                              <Check className="w-3 h-3 text-emerald-500" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className={`truncate ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                          {schedule.meeting_link_or_address}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* 谈薪 / 薪资 Offer */}
                {schedule.salary && (
                  <div
                    className={`p-2.5 rounded-lg border text-xs flex items-center space-x-2 ${
                      isDark ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    }`}
                  >
                    <span className="font-semibold">Offer 意向薪资：</span>
                    <span className="font-mono font-bold text-sm">{schedule.salary}</span>
                  </div>
                )}

                {/* 面试备忘 / Notes */}
                {schedule.notes && (
                  <div
                    className={`p-3 rounded-xl border text-xs leading-relaxed ${
                      isDark ? 'bg-gray-950/40 border-gray-800/80 text-gray-300' : 'bg-gray-50 border-gray-200 text-gray-700'
                    }`}
                  >
                    <div className="text-[10px] text-gray-400 font-bold mb-0.5">自定备忘 / 重点注意：</div>
                    <div>{schedule.notes}</div>
                  </div>
                )}

                {/* 关联岗位 JD (折叠) */}
                {hasJd && (
                  <div className="border-t pt-2 text-xs transition-colors border-gray-200 dark:border-gray-800/60">
                    <button
                      type="button"
                      onClick={() => setExpandedJdId(isJdExpanded ? null : schedule.id)}
                      className={`inline-flex items-center space-x-1.5 transition cursor-pointer ${
                        isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-900'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 text-blue-500" />
                      <span>关联岗位 JD {isJdExpanded ? '收起' : '展开查看'}</span>
                      {isJdExpanded ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </button>
                    {isJdExpanded && (
                      <div
                        className={`mt-2 p-3 rounded-xl border font-mono text-[11px] whitespace-pre-wrap max-h-40 overflow-y-auto leading-relaxed ${
                          isDark ? 'bg-gray-950 border-gray-800 text-gray-300' : 'bg-gray-50 border-gray-200 text-gray-800'
                        }`}
                      >
                        {schedule.jd_text}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ================= 4. 底部快捷操作组 (CTA) ================= */}
              <div
                className={`pt-3 border-t flex flex-wrap items-center justify-between gap-3 ${
                  isDark ? 'border-gray-800/80' : 'border-gray-100'
                }`}
              >
                {/* 状态快捷流转与编辑：可去往哪些状态由共享状态机决定
                    （含回退到待面试、取消一场面试、从已取消恢复），不再本地硬编码按钮 */}
                <div className="flex items-center space-x-1.5 flex-wrap">
                  <ScheduleStatusActions
                    status={schedule.status}
                    allowDecline={schedule.interview_round.includes('薪')}
                    onChange={(next, e) => onQuickStatusChange(schedule.id, next, e)}
                  />

                  <button
                    onClick={(e) => onEditSchedule(schedule, e)}
                    title="编辑此日程"
                    className={`p-1.5 rounded-lg transition cursor-pointer ${
                      isDark
                        ? 'text-gray-400 hover:text-white hover:bg-gray-800'
                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={(e) => onDeleteSchedule(schedule.id, schedule.company, e)}
                    title="删除此日程"
                    className={`p-1.5 rounded-lg transition cursor-pointer ${
                      isDark
                        ? 'text-gray-400 hover:text-red-400 hover:bg-red-950/40'
                        : 'text-gray-500 hover:text-red-600 hover:bg-red-50'
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* 核心双 CTA: 查看面试指南 + 进入模拟面试房间 */}
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => onViewGuide(schedule)}
                    className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer ${
                      isDark
                        ? 'border-gray-700 hover:border-blue-500 text-gray-300 hover:text-blue-300 bg-gray-900'
                        : 'border-gray-300 hover:border-blue-500 text-gray-700 hover:text-blue-600 bg-white'
                    }`}
                  >
                    <Compass className="w-3.5 h-3.5 text-blue-500" />
                    <span>查看面试指南</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onStartMockWithSchedule(schedule)}
                    className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow-md shadow-blue-600/20 hover:shadow-blue-600/30 transition cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>进入模拟面试房间</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
