import type { LucideIcon } from 'lucide-react';
import { UserCheck, Code2, Terminal, Users2, Briefcase, Zap, Bot } from 'lucide-react';

/**
 * 内置面试官 + 自定义人设（persona_xxxx）的统一展示元信息。
 * InterviewRoom / InterviewerPanel / TranscriptModal 共用，避免各处 switch-case 漂移。
 */

export interface PersonaDisplayInfo {
  key: string;
  name: string;
  avatar?: string;
  description?: string;
}

export interface InterviewerMeta {
  title: string;
  sub: string;
  badgeBg: string;
  bubbleBg: string;
  gradient: string;
  icon?: LucideIcon;
  emoji?: string;
}

export const isPersonaKey = (name?: string | null): boolean =>
  !!name && name.startsWith('persona_');

const BUILTIN_META: Record<string, InterviewerMeta> = {
  orchestrator: {
    title: '主考官 · 王主持',
    sub: '主持与全流程协调',
    badgeBg: 'bg-blue-900/60 text-blue-300 border-blue-700/50',
    bubbleBg: 'bg-blue-950/20 border-blue-900/40 text-blue-100',
    gradient: 'from-blue-600 to-indigo-700',
    icon: UserCheck,
  },
  technical: {
    title: '技术面试官 · 李架构',
    sub: '高可用与底层原理深度考查',
    badgeBg: 'bg-cyan-900/60 text-cyan-300 border-cyan-700/50',
    bubbleBg: 'bg-cyan-950/20 border-cyan-900/40 text-cyan-100',
    gradient: 'from-cyan-600 to-teal-700',
    icon: Code2,
  },
  programmer: {
    title: '程序员面试官 · 吴博闻',
    sub: '项目经历 + 计算机基础 + 代码题综合考查',
    badgeBg: 'bg-orange-900/60 text-orange-300 border-orange-700/50',
    bubbleBg: 'bg-orange-950/20 border-orange-900/40 text-orange-100',
    gradient: 'from-orange-600 to-amber-700',
    icon: Terminal,
  },
  hr: {
    title: 'HR面试官 · 陈总监',
    sub: 'STAR行为、软技能与文化契合度',
    badgeBg: 'bg-purple-900/60 text-purple-300 border-purple-700/50',
    bubbleBg: 'bg-purple-950/20 border-purple-900/40 text-purple-100',
    gradient: 'from-purple-600 to-pink-700',
    icon: Users2,
  },
  management: {
    title: '管理岗考官 · 赵战略',
    sub: '团队梯队、技术债务治理与研发效能',
    badgeBg: 'bg-emerald-900/60 text-emerald-300 border-emerald-700/50',
    bubbleBg: 'bg-emerald-950/20 border-emerald-900/40 text-emerald-100',
    gradient: 'from-emerald-600 to-green-700',
    icon: Briefcase,
  },
  challenger: {
    title: '压力挑战官 · 张挑刺',
    sub: '极端容灾故障与逻辑反例施压',
    badgeBg: 'bg-amber-900/60 text-amber-300 border-amber-700/50',
    bubbleBg: 'bg-amber-950/20 border-amber-900/40 text-amber-100',
    gradient: 'from-amber-600 to-red-700',
    icon: Zap,
  },
};

// 自定义人设的稳定配色池（按 key 哈希取色，同一角色颜色恒定）
const PERSONA_PALETTE = [
  { badgeBg: 'bg-violet-900/60 text-violet-300 border-violet-700/50', bubbleBg: 'bg-violet-950/20 border-violet-900/40 text-violet-100', gradient: 'from-violet-600 to-purple-700' },
  { badgeBg: 'bg-fuchsia-900/60 text-fuchsia-300 border-fuchsia-700/50', bubbleBg: 'bg-fuchsia-950/20 border-fuchsia-900/40 text-fuchsia-100', gradient: 'from-fuchsia-600 to-pink-700' },
  { badgeBg: 'bg-rose-900/60 text-rose-300 border-rose-700/50', bubbleBg: 'bg-rose-950/20 border-rose-900/40 text-rose-100', gradient: 'from-rose-600 to-red-700' },
  { badgeBg: 'bg-teal-900/60 text-teal-300 border-teal-700/50', bubbleBg: 'bg-teal-950/20 border-teal-900/40 text-teal-100', gradient: 'from-teal-600 to-emerald-700' },
  { badgeBg: 'bg-sky-900/60 text-sky-300 border-sky-700/50', bubbleBg: 'bg-sky-950/20 border-sky-900/40 text-sky-100', gradient: 'from-sky-600 to-blue-700' },
  { badgeBg: 'bg-lime-900/60 text-lime-300 border-lime-700/50', bubbleBg: 'bg-lime-950/20 border-lime-900/40 text-lime-100', gradient: 'from-lime-600 to-green-700' },
];

function personaPalette(key: string) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return PERSONA_PALETTE[hash % PERSONA_PALETTE.length];
}

/**
 * 解析面试官展示元信息。
 * @param name 消息名 / 角色 key（内置 key 或 persona_xxxx）
 * @param personas 自定义人设信息：完整快照数组，或 {key: 显示名} 映射（如 transcript 返回的 persona_labels）
 */
export function getInterviewerMeta(
  name?: string | null,
  personas?: PersonaDisplayInfo[] | Record<string, string> | null
): InterviewerMeta {
  const key = name || '';
  if (!isPersonaKey(key)) {
    return BUILTIN_META[key] || BUILTIN_META.orchestrator;
  }

  let display: PersonaDisplayInfo | undefined;
  if (Array.isArray(personas)) {
    display = personas.find((p) => p.key === key);
  } else if (personas && typeof personas === 'object') {
    const label = (personas as Record<string, string>)[key];
    if (label) display = { key, name: label };
  }

  const palette = personaPalette(key);
  return {
    title: display?.name || '特邀面试官',
    sub: display?.description || '自定义面试官角色',
    badgeBg: palette.badgeBg,
    bubbleBg: palette.bubbleBg,
    gradient: palette.gradient,
    emoji: display?.avatar || '🎭',
  };
}

export const FALLBACK_INTERVIEWER_META: InterviewerMeta = {
  title: '主考官 · 王主持',
  sub: '面试评审席',
  badgeBg: 'bg-gray-800 text-gray-300 border-gray-700',
  bubbleBg: 'bg-gray-900 border-gray-800 text-gray-200',
  gradient: 'from-blue-600 to-indigo-700',
  icon: Bot,
};
