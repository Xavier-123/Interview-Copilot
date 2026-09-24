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
  /** 会话创建时的引用形式（persona:<人设ID>），用于把阵容条目映射回稳定 key */
  ref?: string;
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
  !!name && (name.startsWith('persona_') || name.startsWith('preset_'));

const BUILTIN_META: Record<string, InterviewerMeta> = {
  orchestrator: {
    title: '主考官 · 王主持',
    sub: '主持与全流程协调',
    badgeBg: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/60 dark:text-blue-300 dark:border-blue-700/50',
    bubbleBg: 'bg-blue-50/80 border-blue-200 text-slate-800 dark:bg-blue-950/20 dark:border-blue-900/40 dark:text-blue-100',
    gradient: 'from-blue-600 to-indigo-700',
    icon: UserCheck,
  },
  technical: {
    title: '技术面试官 · 李架构',
    sub: '高可用与底层原理深度考查',
    badgeBg: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-900/60 dark:text-cyan-300 dark:border-cyan-700/50',
    bubbleBg: 'bg-cyan-50/80 border-cyan-200 text-slate-800 dark:bg-cyan-950/20 dark:border-cyan-900/40 dark:text-cyan-100',
    gradient: 'from-cyan-600 to-teal-700',
    icon: Code2,
  },
  programmer: {
    title: '程序员面试官 · 吴博闻',
    sub: '项目经历 + 计算机基础 + 代码题综合考查',
    badgeBg: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/60 dark:text-orange-300 dark:border-orange-700/50',
    bubbleBg: 'bg-orange-50/80 border-orange-200 text-slate-800 dark:bg-orange-950/20 dark:border-orange-900/40 dark:text-orange-100',
    gradient: 'from-orange-600 to-amber-700',
    icon: Terminal,
  },
  hr: {
    title: 'HR面试官 · 陈总监',
    sub: 'STAR行为、软技能与文化契合度',
    badgeBg: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/60 dark:text-purple-300 dark:border-purple-700/50',
    bubbleBg: 'bg-purple-50/80 border-purple-200 text-slate-800 dark:bg-purple-950/20 dark:border-purple-900/40 dark:text-purple-100',
    gradient: 'from-purple-600 to-pink-700',
    icon: Users2,
  },
  management: {
    title: '管理岗考官 · 赵战略',
    sub: '团队梯队、技术债务治理与研发效能',
    badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/60 dark:text-emerald-300 dark:border-emerald-700/50',
    bubbleBg: 'bg-emerald-50/80 border-emerald-200 text-slate-800 dark:bg-emerald-950/20 dark:border-emerald-900/40 dark:text-emerald-100',
    gradient: 'from-emerald-600 to-green-700',
    icon: Briefcase,
  },
  challenger: {
    title: '压力挑战官 · 张挑刺',
    sub: '极端容灾故障与逻辑反例施压',
    badgeBg: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/60 dark:text-amber-300 dark:border-amber-700/50',
    bubbleBg: 'bg-amber-50/80 border-amber-200 text-slate-800 dark:bg-amber-950/20 dark:border-amber-900/40 dark:text-amber-100',
    gradient: 'from-amber-600 to-red-700',
    icon: Zap,
  },
};

// 自定义人设的稳定配色池（按 key 哈希取色，同一角色颜色恒定）
const PERSONA_PALETTE = [
  { badgeBg: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/60 dark:text-violet-300 dark:border-violet-700/50', bubbleBg: 'bg-violet-50/80 border-violet-200 text-slate-800 dark:bg-violet-950/20 dark:border-violet-900/40 dark:text-violet-100', gradient: 'from-violet-600 to-purple-700' },
  { badgeBg: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-900/60 dark:text-fuchsia-300 dark:border-fuchsia-700/50', bubbleBg: 'bg-fuchsia-50/80 border-fuchsia-200 text-slate-800 dark:bg-fuchsia-950/20 dark:border-fuchsia-900/40 dark:text-fuchsia-100', gradient: 'from-fuchsia-600 to-pink-700' },
  { badgeBg: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/60 dark:text-rose-300 dark:border-rose-700/50', bubbleBg: 'bg-rose-50/80 border-rose-200 text-slate-800 dark:bg-rose-950/20 dark:border-rose-900/40 dark:text-rose-100', gradient: 'from-rose-600 to-red-700' },
  { badgeBg: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/60 dark:text-teal-300 dark:border-teal-700/50', bubbleBg: 'bg-teal-50/80 border-teal-200 text-slate-800 dark:bg-teal-950/20 dark:border-teal-900/40 dark:text-teal-100', gradient: 'from-teal-600 to-emerald-700' },
  { badgeBg: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/60 dark:text-sky-300 dark:border-sky-700/50', bubbleBg: 'bg-sky-50/80 border-sky-200 text-slate-800 dark:bg-sky-950/20 dark:border-sky-900/40 dark:text-sky-100', gradient: 'from-sky-600 to-blue-700' },
  { badgeBg: 'bg-lime-50 text-lime-700 border-lime-200 dark:bg-lime-900/60 dark:text-lime-300 dark:border-lime-700/50', bubbleBg: 'bg-lime-50/80 border-lime-200 text-slate-800 dark:bg-lime-950/20 dark:border-lime-900/40 dark:text-lime-100', gradient: 'from-lime-600 to-green-700' },
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
  badgeBg: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
  bubbleBg: 'bg-white text-slate-800 border-gray-200 dark:bg-gray-900 dark:border-gray-800 dark:text-gray-200',
  gradient: 'from-blue-600 to-indigo-700',
  icon: Bot,
};

/**
 * 解析本场面试实际出场的面试官阵容（角色 key 有序列表），面试官席位只展示这些成员。
 * 规则与后端 graph.py 的 entry_router / after_observer_route 路由保持一致：
 * - 所有面试类型均由主考官（orchestrator）开场；
 * - 压力风格（style === 'stress'）会在技术/程序员/管理岗面试中途插入挑战官；
 * - custom 类型按 custom_config.selected_interviewers 的顺序轮转出场。
 * persona:<id> 引用条目原样返回，调用方负责映射为消息中的稳定 key（persona_xxxx）。
 */
export function resolveInterviewerLineup(
  interviewType?: string | null,
  style?: string | null,
  customSelected?: string[] | null
): string[] {
  const withChallenger = style === 'stress' ? ['challenger'] : [];
  switch (interviewType) {
    case 'technical':
      return ['orchestrator', 'technical', ...withChallenger];
    case 'programmer':
      return ['orchestrator', 'programmer', ...withChallenger];
    case 'behavioral':
    case 'hr':
      return ['orchestrator', 'hr'];
    case 'management':
      return ['orchestrator', 'management', ...withChallenger];
    case 'custom': {
      const entries = (customSelected || []).filter((e): e is string => !!e);
      if (!entries.length) return ['orchestrator', 'technical', 'hr'];
      return ['orchestrator', ...entries];
    }
    case 'structured':
    case 'english':
    default:
      return ['orchestrator', 'technical', 'hr', ...withChallenger];
  }
}
