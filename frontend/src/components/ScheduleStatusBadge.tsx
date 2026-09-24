import React from 'react';
import type { ScheduleStatus } from '../types';
import { SCHEDULE_STATUS_META } from '../utils/scheduleStatus';

interface ScheduleStatusBadgeProps {
  status: ScheduleStatus;
  /** sm 用于月历抽屉（10px），md 用于时间轴卡片（12px） */
  size?: 'sm' | 'md';
}

/**
 * 状态徽章：时间轴与月历共用。
 * 改造前两个视图各自维护一份 switch，导致同一状态两边长得不一样（例如 cancelled 只在月历有徽章）。
 */
export const ScheduleStatusBadge: React.FC<ScheduleStatusBadgeProps> = ({ status, size = 'md' }) => {
  const meta = SCHEDULE_STATUS_META[status];
  if (!meta) return null;

  const Icon = meta.icon;
  const wrap = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-xs';
  const iconCls = size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3';

  return (
    <span
      className={`inline-flex items-center space-x-1 rounded-full font-medium border ${wrap} ${meta.badgeClass}`}
    >
      <Icon className={iconCls} />
      <span>{meta.label}</span>
    </span>
  );
};
