import { Clock, CheckCircle2, XCircle, Handshake, Ban, type LucideIcon } from 'lucide-react';
import type { ScheduleStatus } from '../types';

/**
 * 面试日程状态的单点定义。
 *
 * 为什么要有这个文件：改造前状态元数据分散在四处各写一份 switch
 * （时间轴徽章 / 月历徽章 / 月历条目配色 / 月历状态点），加上筛选 pill 与表单下拉里的
 * 手写列表，一共六份。任何一处漏改都会造成「同一状态在两个视图里长得不一样」。
 * 这里收敛成唯一来源，视图只负责渲染。
 */

export interface ScheduleStatusMeta {
  /** 徽章 / 筛选 pill 上的短标签 */
  label: string;
  /** 登记表单下拉里的标签（带英文对照，与后端字段对齐） */
  formLabel: string;
  icon: LucideIcon;
  /** 月历格子里的状态点 */
  dotClass: string;
  /** 徽章（pill）配色 */
  badgeClass: string;
  /** 月历当日摘要条目的配色 */
  chipClass: string;
}

/** 展示顺序即此数组顺序：筛选 pill、表单下拉、月历图例共用。 */
export const SCHEDULE_STATUS_ORDER: ScheduleStatus[] = [
  'upcoming',
  'completed',
  'passed',
  'declined',
  'failed',
  'cancelled',
];

export const SCHEDULE_STATUS_META: Record<ScheduleStatus, ScheduleStatusMeta> = {
  upcoming: {
    label: '待面试',
    formLabel: '待面试 (Upcoming)',
    icon: Clock,
    dotClass: 'bg-status-warning',
    badgeClass: 'bg-status-warning-bg border-status-warning-border text-status-warning',
    chipClass:
      'bg-status-warning-bg border-status-warning-border text-status-warning hover:border-status-warning',
  },
  completed: {
    label: '已面完',
    formLabel: '已面完 (Completed)',
    icon: CheckCircle2,
    dotClass: 'bg-status-info',
    badgeClass: 'bg-status-info-bg border-status-info-border text-status-info',
    chipClass:
      'bg-status-info-bg border-status-info-border text-status-info hover:border-status-info',
  },
  passed: {
    label: '已通过',
    formLabel: '已通过 / Offer (Passed)',
    icon: CheckCircle2,
    dotClass: 'bg-status-success',
    badgeClass: 'bg-status-success-bg border-status-success-border text-status-success',
    chipClass:
      'bg-status-success-bg border-status-success-border text-status-success hover:border-status-success',
  },
  declined: {
    label: '已婉拒',
    formLabel: '已婉拒 (Declined)',
    icon: Handshake,
    dotClass: 'bg-content-muted',
    badgeClass: 'bg-surface-hover border-line-default text-content-secondary',
    chipClass:
      'bg-surface-hover border-line-default text-content-secondary hover:border-line-focus',
  },
  failed: {
    label: '未通过',
    formLabel: '未通过 (Failed)',
    icon: XCircle,
    dotClass: 'bg-status-danger',
    badgeClass: 'bg-status-danger-bg border-status-danger-border text-status-danger',
    chipClass:
      'bg-status-danger-bg border-status-danger-border text-status-danger hover:border-status-danger',
  },
  cancelled: {
    label: '已取消',
    formLabel: '已取消 (Cancelled)',
    icon: Ban,
    dotClass: 'bg-content-muted',
    badgeClass: 'bg-surface-hover border-line-subtle text-content-muted',
    chipClass: 'bg-surface-hover border-line-subtle text-content-muted hover:border-line-default',
  },
};

export const SCHEDULE_STATUS_LABEL = (status: ScheduleStatus): string =>
  SCHEDULE_STATUS_META[status]?.label ?? status;

/**
 * 状态流转规则（唯一来源）。
 *
 * 已确认的产品决策：
 * - 「自由互转」：已面完 / 已通过 / 未通过 / 已婉拒 之间可任意切换（误点、改主意都能救），
 *   且每一个都能回退到「待面试」。
 * - 「必经已面完」：待面试**不允许**直接跳到三种结果态 —— 面试还没发生，结果无从谈起。
 * - 「取消语义」：只有待面试可以取消（= 这场面试没发生）；已取消只能恢复到待面试。
 */
export const ALLOWED_TRANSITIONS: Record<ScheduleStatus, ScheduleStatus[]> = {
  upcoming: ['completed', 'cancelled'],
  completed: ['passed', 'failed', 'declined', 'upcoming'],
  passed: ['completed', 'failed', 'declined', 'upcoming'],
  failed: ['completed', 'passed', 'declined', 'upcoming'],
  declined: ['completed', 'passed', 'failed', 'upcoming'],
  cancelled: ['upcoming'],
};

export type TransitionTone = 'primary' | 'success' | 'danger' | 'violet' | 'neutral';

/** 目标态决定按钮配色，保证「通过」在时间轴和月历里是同一个颜色。 */
const TARGET_TONE: Record<ScheduleStatus, TransitionTone> = {
  upcoming: 'neutral',
  completed: 'primary',
  passed: 'success',
  failed: 'danger',
  declined: 'violet',
  cancelled: 'neutral',
};

/** 流转按钮的双主题配色（Tailwind 按字面量扫描，必须写完整类名，不能拼接）。 */
export const TRANSITION_TONE_CLASS: Record<TransitionTone, { dark: string; light: string }> = {
  primary: {
    dark: 'bg-blue-950/60 hover:bg-blue-900 border-blue-800/50 text-blue-300',
    light: 'bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700',
  },
  success: {
    dark: 'bg-emerald-950/60 hover:bg-emerald-900 border-emerald-800/50 text-emerald-300',
    light: 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-700',
  },
  danger: {
    dark: 'bg-red-950/60 hover:bg-red-900 border-red-800/50 text-red-300',
    light: 'bg-red-50 hover:bg-red-100 border-red-200 text-red-700',
  },
  violet: {
    dark: 'bg-violet-950/60 hover:bg-violet-900 border-violet-800/50 text-violet-300',
    light: 'bg-violet-50 hover:bg-violet-100 border-violet-200 text-violet-700',
  },
  neutral: {
    dark: 'bg-gray-900 hover:bg-gray-800 border-gray-700 text-gray-300',
    light: 'bg-white hover:bg-gray-100 border-gray-300 text-gray-700',
  },
};

export interface StatusTransition {
  to: ScheduleStatus;
  /** 按钮文案：动词化，并区分「推进」「改为」「恢复」 */
  label: string;
  tone: TransitionTone;
}

function transitionLabel(from: ScheduleStatus, to: ScheduleStatus): string {
  switch (to) {
    case 'upcoming':
      return '恢复待面试';
    case 'completed':
      // 从结果态回到「已面完」是往回退，措辞要能读出来
      return from === 'upcoming' ? '标记已面完' : '改回已面完';
    case 'cancelled':
      return '取消面试';
    case 'passed':
      return from === 'completed' ? '标记通过' : '改为通过';
    case 'failed':
      return from === 'completed' ? '标记未通过' : '改为未通过';
    case 'declined':
      return from === 'completed' ? '婉拒 Offer' : '改为婉拒';
  }
}

export interface StatusTransitionOptions {
  /**
   * 「婉拒」是 Offer 阶段语义：非谈薪轮次不提供该目标，
   * 但已处于婉拒态时仍允许改出去（否则会把人锁死在一个改不掉的终态）。
   */
  allowDecline?: boolean;
}

export function getStatusTransitions(
  from: ScheduleStatus,
  { allowDecline = true }: StatusTransitionOptions = {}
): StatusTransition[] {
  const targets = ALLOWED_TRANSITIONS[from] ?? [];
  return targets
    .filter((to) => to !== 'declined' || allowDecline || from === 'declined')
    .map((to) => ({ to, label: transitionLabel(from, to), tone: TARGET_TONE[to] }));
}

/**
 * 已过期但仍停在「待面试」的日程：面试时间已过，状态没人更新。
 * 这类日程既不会被通知（提醒逻辑对 diffMs <= 0 直接跳过），也没有任何视觉提示。
 */
export function isExpiredUnmarked(
  item: { status: ScheduleStatus; scheduled_at: string },
  now: number = Date.now()
): boolean {
  if (item.status !== 'upcoming') return false;
  const t = new Date(item.scheduled_at).getTime();
  if (Number.isNaN(t)) return false;
  return t < now;
}
