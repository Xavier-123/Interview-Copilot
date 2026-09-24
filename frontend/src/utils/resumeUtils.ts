import type { ResumeProfile } from '../types';

export interface CompletenessFeedback {
  tier: 'low' | 'medium' | 'high' | 'expert';
  badgeText: string;
  tip: string;
  color: string;
  bgGradient: string;
}

export interface CompletenessResult {
  score: number;
  label: string;
  level: 'low' | 'medium' | 'high' | 'expert';
  feedback: CompletenessFeedback;
  details: {
    basic: boolean;
    skills: boolean;
    summary: boolean;
    projects: boolean;
    education: boolean;
  };
}

/**
 * 计算简历的完整度评分 (0 - 100) 并提供情感化反馈文案
 */
export function calculateResumeCompleteness(
  profile?: ResumeProfile,
  rawText?: string
): CompletenessResult {
  const p = profile || {};
  let score = 0;

  // 1. 基础画像 (25分): 姓名 (10分) + 目标岗位 (10分) + 工作年限 (5分)
  const hasName = Boolean(p.name && p.name.trim() && p.name.trim() !== '候选人');
  const hasRole = Boolean((p.job_role && p.job_role.trim()) || (p.title && p.title.trim()));
  const hasExp = p.experience_years != null && p.experience_years !== undefined;
  let basicScore = 0;
  if (hasName) basicScore += 10;
  if (hasRole) basicScore += 10;
  if (hasExp) basicScore += 5;
  score += basicScore;
  const basic = basicScore >= 15;

  // 2. 核心技术栈 (20分): >=3个技能满分 20，>=1个技能 10分
  const skillsCount = (p.skills || []).length;
  let skillsScore = 0;
  if (skillsCount >= 3) {
    skillsScore = 20;
  } else if (skillsCount >= 1) {
    skillsScore = 10;
  }
  score += skillsScore;
  const skills = skillsScore >= 20;

  // 3. 个人核心竞争优势 (15分): 自述字数 >= 25 字符
  const summaryLength = (p.summary_profile || p.summary || '').trim().length;
  let summaryScore = 0;
  if (summaryLength >= 40) {
    summaryScore = 15;
  } else if (summaryLength >= 15) {
    summaryScore = 8;
  }
  score += summaryScore;
  const summary = summaryScore >= 15;

  // 4. 重点项目经历 (30分): 项目数与内容饱满度
  const projects = (p.projects || []).filter(
    (proj) => (proj.name && proj.name.trim()) || (proj.highlights && proj.highlights.trim())
  );
  let projectsScore = 0;
  if (projects.length >= 2) {
    const hasDetailedHighlights = projects.some(
      (proj) => (proj.highlights || '').trim().length > 30
    );
    projectsScore = hasDetailedHighlights ? 30 : 25;
  } else if (projects.length === 1) {
    projectsScore = 18;
  }
  score += projectsScore;
  const projectsDone = projectsScore >= 25;

  // 5. 教育经历 (10分)
  const hasEducation = Boolean(p.education && p.education.trim());
  if (hasEducation) {
    score += 10;
  }

  // 兜底补正：若解析画像较少但有充分的 raw_text，给予基础底分
  if (score < 40 && rawText && rawText.trim().length > 100) {
    score = Math.max(score, Math.min(65, Math.round(rawText.trim().length / 20)));
  }

  score = Math.min(100, Math.max(0, score));

  // 情感化等级与文案反馈
  let label = '🌱 刚刚起步，先填好基本信息吧';
  let level: CompletenessResult['level'] = 'low';
  let badgeText = '初步起步';
  let tip = '建议优先补充姓名、求职意向及核心技能';
  let color = 'text-amber-500';
  let bgGradient = 'from-amber-500 to-orange-500';

  if (score >= 90) {
    label = '✨ 极度专业！已达大厂标准简历';
    level = 'expert';
    badgeText = '卓越专家';
    tip = '简历要素极为完整，各项量化指标出众';
    color = 'text-emerald-500';
    bgGradient = 'from-blue-600 via-indigo-500 to-emerald-500';
  } else if (score >= 70) {
    label = '🔥 表现出色！再补充几项量化成果';
    level = 'high';
    badgeText = '极具竞争力';
    tip = '结构饱满，可进一步打磨项目 STAR 数据支撑';
    color = 'text-blue-500';
    bgGradient = 'from-blue-600 to-indigo-600';
  } else if (score >= 40) {
    label = '⚡ 初具雏形，项目亮点是关键加分项';
    level = 'medium';
    badgeText = '基础完备';
    tip = '已具备基本要素，建议继续补充重点项目与技术栈';
    color = 'text-indigo-500';
    bgGradient = 'from-indigo-500 to-blue-500';
  }

  return {
    score,
    label,
    level,
    feedback: {
      tier: level,
      badgeText,
      tip,
      color,
      bgGradient,
    },
    details: {
      basic,
      skills,
      summary,
      projects: projectsDone,
      education: hasEducation,
    },
  };
}
