export type InterviewerType =
  | 'orchestrator'
  | 'technical'
  | 'hr'
  | 'challenger'
  | 'observer'
  | 'management';

export type InterviewType =
  | 'technical'
  | 'behavioral'
  | 'hr'
  | 'management'
  | 'english'
  | 'structured'
  | 'custom';

export type IndustryType =
  | '互联网/电商'
  | '人工智能/大模型'
  | '金融科技/量化'
  | '智能制造/自动驾驶'
  | '企业服务/SaaS'
  | '游戏开发'
  | '医疗健康/生物医药'
  | '通用行业';

export type SeniorityLevel = 'intern' | 'junior' | 'senior' | 'expert' | 'director';
export type DifficultyLevel = 'easy' | 'standard' | 'hard';
export type InterviewStyle = 'gentle' | 'rigorous' | 'stress';
export type InterviewLanguage = 'zh' | 'en';

export interface LLMConfig {
  base_url: string;
  api_key: string;
  model: string;
  temperature?: number;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  name?: 'orchestrator' | 'technical' | 'hr' | 'challenger' | 'management' | 'candidate';
  content: string;
  stage?: string;
  timestamp?: string;
}

export interface ShadowObservation {
  round_index: number;
  interviewer: string;
  question: string;
  candidate_answer: string;
  strengths: string[];
  weaknesses: string[];
  depth_score: number;
  logic_score: number;
  star_compliance?: number | null;
  flags: string[];
  follow_up_hint?: string;
}

export interface RadarScores {
  technical_depth: number;
  technical_breadth: number;
  communication_logic: number;
  star_completeness: number;
  stress_resilience: number;
  job_matching: number;
}

export interface DetailedReview {
  round: number;
  interviewer: string;
  question: string;
  candidate_answer: string;
  analysis: string;
  better_answer_sample: string;
  key_takeaway: string;
}

export interface LearningPlanItem {
  topic: string;
  reason: string;
  recommended_actions: string[];
}

export interface SevenDayRoadmapItem {
  day: string;
  phase: string;
  focus_topics: string[];
  action_items: string[];
  expected_outcome: string;
}

export interface DrillCardItem {
  id: string;
  weakness_title: string;
  concept_summary: string;
  interview_tips: string;
  sample_drill_question: string;
}

export interface EvaluationReport {
  overall_summary: string;
  match_verdict: string;
  radar_scores: RadarScores;
  strengths: string[];
  weaknesses: string[];
  detailed_reviews: DetailedReview[];
  learning_plan: LearningPlanItem[];
  seven_day_roadmap?: SevenDayRoadmapItem[];
  drill_cards?: DrillCardItem[];
}

export interface CandidateProfile {
  name: string;
  experience_years: number;
  skills: string[];
  projects?: Array<{
    name: string;
    role: string;
    tech_stack: string[];
    highlights: string;
  }>;
  education?: string;
  summary_profile?: string;
}

export interface JDRequirements {
  title: string;
  level: string;
  required_skills: string[];
  preferred_skills?: string[];
  responsibilities?: string[];
  interview_focus?: string[];
}

export interface UserProfileData {
  real_name: string;
  target_role: string;
  target_industry: string;
  target_level: string;
  experience_years: number;
  skills: string[];
  bio: string;
}

export interface UserData {
  id: string;
  username: string;
  email?: string;
  is_guest: boolean;
  profile?: UserProfileData;
}

export interface HistorySessionItem {
  session_id: string;
  title: string;
  interview_type: string;
  industry: string;
  job_role: string;
  seniority: string;
  difficulty: string;
  status: 'ready' | 'in_progress' | 'waiting_user' | 'paused' | 'finished';
  round_count: number;
  elapsed_seconds: number;
  created_at: string;
  has_report: boolean;
  match_verdict?: string;
  overall_summary?: string;
  radar_scores?: RadarScores;
}

export interface RadarComparisonItem {
  dimension: string;
  dimension_key: string;
  session_1_score: number;
  session_2_score: number;
  delta: number;
}

export interface ComparisonResult {
  session_1: {
    session_id: string;
    title: string;
    match_verdict: string;
    radar_scores: RadarScores;
    weaknesses: string[];
  };
  session_2: {
    session_id: string;
    title: string;
    match_verdict: string;
    radar_scores: RadarScores;
    weaknesses: string[];
  };
  radar_comparison: RadarComparisonItem[];
  deltas: Record<string, number>;
  overall_improvement: number;
  summary: string;
}
