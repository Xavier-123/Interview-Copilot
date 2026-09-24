import React from 'react';
import { UserCheck, Code2, Users2, Zap, Eye, Radio, Briefcase, Terminal } from 'lucide-react';
import type { PersonaDisplayInfo } from '../utils/interviewers';

interface InterviewerPanelProps {
  currentInterviewer: string;
  isThinking?: boolean;
  shadowLogsCount?: number;
  customPersonas?: PersonaDisplayInfo[];
  /** 本场实际出场的面试官角色 key 列表；提供时席位只展示这些成员 */
  participantRoles?: string[];
}

interface SeatCard {
  id: string;
  name: string;
  role: string;
  icon: React.ComponentType<{ className?: string }> | null;
  emoji?: string;
  color: string;
  activeBorder: string;
  desc: string;
}

const BUILTIN_SEATS: Record<string, Omit<SeatCard, 'id'>> = {
  orchestrator: {
    name: '王主持',
    role: '主考官 / 协调主持 (Orchestrator)',
    icon: UserCheck,
    color: 'from-blue-500 to-indigo-600',
    activeBorder: 'border-blue-500 shadow-blue-500/20',
    desc: '全局节奏把控、流程推进、环节串场与总结',
  },
  technical: {
    name: '李架构',
    role: '专业技术面试官 (Technical Specialist)',
    icon: Code2,
    color: 'from-cyan-500 to-teal-600',
    activeBorder: 'border-cyan-500 shadow-cyan-500/20',
    desc: '高并发、底层原理、系统架构与方案层层深挖',
  },
  programmer: {
    name: '吴博闻',
    role: '程序员综合面试官 (Programmer)',
    icon: Terminal,
    color: 'from-orange-500 to-amber-600',
    activeBorder: 'border-orange-500 shadow-orange-500/20',
    desc: '项目经历 + 计算机基础轮转 + 代码题，大厂一二面完整流程',
  },
  hr: {
    name: '陈总监',
    role: 'HR / 行为文化面试官 (Behavioral STAR)',
    icon: Users2,
    color: 'from-purple-500 to-pink-600',
    activeBorder: 'border-purple-500 shadow-purple-500/20',
    desc: 'STAR法则、跨团队协同、自驱力与危机应对',
  },
  management: {
    name: '赵管理',
    role: '管理岗专家 (Leadership & Strategy)',
    icon: Briefcase,
    color: 'from-emerald-500 to-green-600',
    activeBorder: 'border-emerald-500 shadow-emerald-500/20',
    desc: '团队梯队、技术战略演进、技术债务治理与效能',
  },
  challenger: {
    name: '张挑刺',
    role: '高压/极限挑战官 (Challenger)',
    icon: Zap,
    color: 'from-amber-500 to-red-600',
    activeBorder: 'border-amber-500 shadow-amber-500/20',
    desc: '极端容灾故障、资源砍半高压模拟与逻辑反例',
  },
};

// 自定义人设席位统一配色
const PERSONA_SEAT_BASE = {
  icon: null,
  color: 'from-violet-500 to-fuchsia-600',
  activeBorder: 'border-violet-500 shadow-violet-500/20',
};

function buildSeat(role: string, personas: PersonaDisplayInfo[] | undefined): SeatCard {
  const builtin = BUILTIN_SEATS[role];
  if (builtin) return { id: role, ...builtin };

  const persona = (personas || []).find((p) => p.key === role);
  return {
    id: role,
    name: persona?.name || '特邀面试官',
    role: `自定义面试官 (${persona?.name || 'Persona'})`,
    ...PERSONA_SEAT_BASE,
    emoji: persona?.avatar || '🎭',
    desc: persona?.description || '用户自定义面试官角色',
  };
}

// 列数随席位数自适应（完整类名便于 Tailwind 静态提取）
const LG_COLS: Record<number, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
  6: 'lg:grid-cols-6',
};

export const InterviewerPanel: React.FC<InterviewerPanelProps> = ({
  currentInterviewer,
  isThinking = false,
  shadowLogsCount = 0,
  customPersonas,
  participantRoles,
}) => {
  const seats: SeatCard[] = participantRoles?.length
    ? participantRoles.map((role) => buildSeat(role, customPersonas))
    : // 未提供阵容时兜底展示全部内置席位 + 人设席位
      [
        ...Object.entries(BUILTIN_SEATS).map(([id, card]) => ({ id, ...card })),
        ...(customPersonas || []).map((p) => buildSeat(p.key, customPersonas)),
      ];

  const lgCols = LG_COLS[Math.min(seats.length, 6)] || 'lg:grid-cols-6';

  return (
    <div className="bg-surface border border-line-subtle rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center space-x-2">
          <Radio className="w-4 h-4 text-status-success animate-pulse" />
          <h2 className="text-sm font-semibold text-content-primary uppercase tracking-wider">
            AI 面试官席位 (Live Agent Panel)
          </h2>
        </div>

        {/* Shadow Observer pill */}
        <div className="flex items-center space-x-2 bg-surface-subtle border border-line-subtle px-2.5 py-1 rounded-full text-xs text-content-secondary">
          <Eye className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
          <span>影子观察员:</span>
          <span className="text-indigo-600 dark:text-indigo-300 font-medium font-mono">
            {shadowLogsCount} 轮实时监听评估中
          </span>
        </div>
      </div>

      <div className={`grid grid-cols-2 sm:grid-cols-3 gap-2.5 ${lgCols}`}>
        {seats.map((agent) => {
          const isActive = currentInterviewer === agent.id;
          const IconComponent = agent.icon;

          return (
            <div
              key={agent.id}
              className={`relative rounded-xl p-2.5 border transition-all duration-300 ${
                isActive
                  ? `bg-surface-hover border-2 ${agent.activeBorder} shadow-lg scale-[1.02]`
                  : 'bg-surface-subtle border-line-subtle opacity-70 hover:opacity-95'
              }`}
            >
              {isActive && (
                <div className="absolute -top-2 -right-1 px-2 py-0.5 rounded-full bg-blue-600 text-[10px] font-semibold text-white tracking-wider animate-bounce shadow">
                  正在发问
                </div>
              )}

              <div className="flex items-start space-x-2.5">
                <div
                  className={`w-8 h-8 rounded-lg bg-gradient-to-br ${agent.color} flex items-center justify-center shrink-0 shadow-md`}
                >
                  {IconComponent ? (
                    <IconComponent className="w-4 h-4 text-white" />
                  ) : (
                    <span className="text-sm leading-none">{agent.emoji}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-content-primary">{agent.name}</span>
                    {isActive && isThinking && (
                      <span className="text-[10px] text-brand-primary animate-pulse font-mono">
                        思考中...
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-content-secondary truncate">{agent.role}</div>
                </div>
              </div>

              <p className="text-[10px] text-content-muted mt-1.5 leading-snug line-clamp-2">
                {agent.desc}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
