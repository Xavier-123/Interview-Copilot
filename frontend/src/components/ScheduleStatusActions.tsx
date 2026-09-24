import React from 'react';
import type { ScheduleStatus } from '../types';
import {
  getStatusTransitions,
  SCHEDULE_STATUS_LABEL,
  TRANSITION_TONE_CLASS,
} from '../utils/scheduleStatus';
import { useTheme } from '../context/ThemeContext';

interface ScheduleStatusActionsProps {
  /** 当前状态，决定能去哪些状态 */
  status: ScheduleStatus;
  /** 是否提供「婉拒」目标（谈薪 / Offer 轮次语义） */
  allowDecline?: boolean;
  /** sm 用于月历抽屉（10px），md 用于时间轴卡片（12px） */
  size?: 'sm' | 'md';
  onChange: (next: ScheduleStatus, e: React.MouseEvent) => void;
}

/**
 * 状态流转按钮组：时间轴与月历共用同一套规则与配色。
 *
 * 改造前时间轴只给单向推进、月历抽屉却能任意状态直接标「通过 / 未通过」（越级），
 * 同一页面两套规则。收敛到这里后，视图不可能再各自长出一套。
 */
export const ScheduleStatusActions: React.FC<ScheduleStatusActionsProps> = ({
  status,
  allowDecline = true,
  size = 'md',
  onChange,
}) => {
  const { isDark } = useTheme();
  const transitions = getStatusTransitions(status, { allowDecline });
  if (transitions.length === 0) return null;

  const dims = size === 'sm' ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1 text-xs';

  return (
    <>
      {transitions.map(({ to, label, tone }) => (
        <button
          key={to}
          type="button"
          title={`将状态从「${SCHEDULE_STATUS_LABEL(status)}」改为「${SCHEDULE_STATUS_LABEL(to)}」`}
          onClick={(e) => {
            e.stopPropagation();
            onChange(to, e);
          }}
          className={`rounded-lg font-medium border transition cursor-pointer ${dims} ${
            TRANSITION_TONE_CLASS[tone][isDark ? 'dark' : 'light']
          }`}
        >
          {label}
        </button>
      ))}
    </>
  );
};
