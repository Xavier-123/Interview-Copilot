export type InterviewerType =
  | 'orchestrator'
  | 'technical'
  | 'programmer'
  | 'hr'
  | 'challenger'
  | 'observer'
  | 'management';

export type InterviewType =
  | 'technical'
  | 'programmer'
  | 'behavioral'
  | 'hr'
  | 'management'
  | 'english'
  | 'structured'
  | 'custom';

export type RoundsMode = 'fixed' | 'adaptive';

// 面试类型中文标签（历史记录、对话导出等展示场景）
export const INTERVIEW_TYPE_LABELS: Record<string, string> = {
  structured: '结构化全流程',
  technical: '技术深度面',
  programmer: '程序员综合面',
  behavioral: 'STAR行为面',
  hr: 'HR综合面',
  management: '管理岗面',
  english: '英语面试',
  custom: '自选定制面',
};

export const interviewTypeLabel = (type?: string | null): string =>
  (type && INTERVIEW_TYPE_LABELS[type]) || type || '-';

export type IndustryType =
  | '互联网/电商'
  | '人工智能/大模型'
  | '云计算/大数据'
  | '金融科技/量化'
  | '银行/证券/保险'
  | '企业服务/SaaS'
  | '游戏开发'
  | '文化传媒/直播社交'
  | '教育/在线教育'
  | '智能制造/自动驾驶'
  | '汽车/新能源车'
  | '通信/芯片/半导体'
  | '安防/物联网'
  | '区块链/Web3'
  | '新能源/电力/储能'
  | '能源/化工/环保'
  | '医疗健康/生物医药'
  | '物流/供应链'
  | '消费品/零售'
  | '生活服务/文旅酒店'
  | '地产/建筑/智慧城市'
  | '航空航天/国防'
  | '政府/公共事业'
  | '法律/咨询/人力资源'
  | '农业/食品科技'
  | '通用行业';

// 全量行业选项（SetupView 使用，避免多处列表漂移）
export const INDUSTRY_OPTIONS: IndustryType[] = [
  '互联网/电商',
  '人工智能/大模型',
  '云计算/大数据',
  '金融科技/量化',
  '银行/证券/保险',
  '企业服务/SaaS',
  '游戏开发',
  '文化传媒/直播社交',
  '教育/在线教育',
  '智能制造/自动驾驶',
  '汽车/新能源车',
  '通信/芯片/半导体',
  '安防/物联网',
  '区块链/Web3',
  '新能源/电力/储能',
  '能源/化工/环保',
  '医疗健康/生物医药',
  '物流/供应链',
  '消费品/零售',
  '生活服务/文旅酒店',
  '地产/建筑/智慧城市',
  '航空航天/国防',
  '政府/公共事业',
  '法律/咨询/人力资源',
  '农业/食品科技',
  '通用行业',
];

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

export interface SearchConfig {
  provider: 'tavily';
  api_key: string;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  score?: number | null;
}

export interface SearchMetadata {
  provider: string;
  query: string;
  status: 'success' | 'failed';
  results: SearchResult[];
  error_code?: string | null;
  error_message?: string | null;
  latency_ms: number;
}

export interface SimulateAnswerResult {
  answer: string;
  searchMetadata?: SearchMetadata | null;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  name?: string; // 内置角色 key 或自定义人设 key（persona_xxxx）
  content: string;
  code?: string;
  code_language?: string;
  stage?: string;
  timestamp?: string;
  search_metadata?: SearchMetadata;
  turn_id?: string;
  trace_id?: string;
  prompt_log_id?: string;
}

export interface QuestionIntent {
  goal?: string;
  topic?: string | null;
  action?: string;
  difficulty?: string;
  required_evidence?: string[];
  question_count?: number;
  interviewer?: string;
}

export interface DirectorDecision {
  next_node?: string;
  stage?: string;
  reason?: string | null;
  remaining_rounds?: number;
}

export interface TranscriptMessage {
  role: 'user' | 'assistant' | 'system';
  name?: string;
  content: string;
  code?: string;
  code_language?: string;
  stage?: string;
  timestamp?: string;
  search_metadata?: SearchMetadata;
  prompt_log_id?: string;
}

export interface PromptLogItem {
  id: string;
  session_id?: string;
  turn_id?: string;
  round_index: number;
  stage?: string;
  node: string;
  call_type: string;
  system_prompt: string;
  user_prompt: string;
  model?: string;
  response: string;
  timestamp?: string;
  metadata?: Record<string, any>;
}

export interface TranscriptObservation {
  round_index?: number;
  interviewer?: string;
  question?: string;
  topic?: string;
  satisfaction_score?: number;
  answer_status?: string;
  strengths?: string[];
  weaknesses?: string[];
}

export interface TranscriptData {
  session: {
    session_id?: string;
    title?: string;
    interview_type?: string;
    industry?: string;
    job_role?: string;
    seniority?: string;
    difficulty?: string;
    style?: string;
    language?: string;
    status?: string;
    round_count?: number;
    elapsed_seconds?: number;
    created_at?: string;
  };
  messages: TranscriptMessage[];
  observations?: TranscriptObservation[];
  prompt_logs?: PromptLogItem[];
  persona_labels?: Record<string, string>;
  report?: EvaluationReport | null;
}

// 自定义面试官角色（人设）
export interface Persona {
  id: string;
  key: string;
  name: string;
  avatar: string;
  description: string;
  system_prompt: string;
  focus_topics: string[];
  opening_hint?: string;
  deep_dive_hint?: string;
  probe_hint?: string;
  switch_hint?: string;
  enabled?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
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

export interface HistorySessionItem {
  session_id: string;
  title: string;
  interview_type: string;
  industry: string;
  job_role: string;
  seniority: string;
  difficulty: string;
  status: 'ready' | 'in_progress' | 'waiting_user' | 'paused' | 'finished';
  web_search_enabled?: boolean;
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

// 全局主视图路由类型
export type AppView =
  | 'home'
  | 'resumes'
  | 'interviews'
  | 'setup'
  | 'interview'
  | 'report'
  | 'personas';

// 简历相关数据类型
export interface ResumeProfileProject {
  name?: string;
  role?: string;
  tech_stack?: string[];
  highlights?: string;
}

// AI 解析出的候选人结构化画像（LLM 输出可能存在字段漂移，索引签名兜底）
export interface ResumeProfile {
  name?: string;
  experience_years?: number;
  skills?: string[];
  projects?: ResumeProfileProject[];
  education?: string;
  summary_profile?: string;
  [key: string]: any;
}

export interface SavedResumeItem {
  id: string;
  filename: string;
  created_at?: string;
  updated_at?: string;
  parsed_profile?: ResumeProfile;
  source_resume_id?: string | null;
  raw_text_preview: string;
}

export interface SavedResumeDetail {
  id: string;
  filename: string;
  created_at?: string;
  updated_at?: string;
  parsed_profile?: ResumeProfile;
  source_resume_id?: string | null;
  raw_text: string;
}

// 简历打磨（AI 体检）数据契约
export interface ResumePolishGap {
  requirement: string;
  status: 'missing' | 'weak' | 'covered' | string;
  evidence?: string;
  advice?: string;
}

export interface ResumePolishIssue {
  quote: string;
  type?: string;
  severity?: 'high' | 'medium' | 'low' | string;
  problem?: string;
  rewritten?: string;
  reason?: string;
  // 后端标记该条能否在原文中精确定位；false 时禁止采纳
  applicable?: boolean;
}

export interface ResumePolishRisk {
  quote?: string;
  likely_question?: string;
  advice?: string;
}

export interface ResumePolishReport {
  match_score?: number | null;
  overall_comment?: string;
  gaps?: ResumePolishGap[];
  issues?: ResumePolishIssue[];
  challenge_risks?: ResumePolishRisk[];
  general_tips?: string[];
}

export interface ResumePolishApplyResult {
  status: string;
  message?: string;
  applied: { quote: string; rewritten: string }[];
  skipped: { quote: string; rewritten: string }[];
  resume: SavedResumeDetail;
}

// 真实面试日程状态与数据契约
export type ScheduleStatus = 'upcoming' | 'completed' | 'passed' | 'declined' | 'failed' | 'cancelled';

export interface InterviewScheduleItem {
  id: string;
  company: string;
  job_role: string;
  interview_round: string;
  scheduled_at: string;
  location_type: string; // online | offline | phone
  meeting_link_or_address?: string;
  salary?: string; // 谈薪阶段的 Offer 薪资（自由文本）
  status: ScheduleStatus;
  jd_text?: string;
  resume_id?: string;
  notes?: string;
  email_reminded_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CreateScheduleRequest {
  company: string;
  job_role: string;
  interview_round: string;
  scheduled_at: string;
  location_type: string;
  meeting_link_or_address?: string;
  salary?: string;
  status?: ScheduleStatus;
  jd_text?: string;
  resume_id?: string;
  notes?: string;
}

export interface UpdateScheduleRequest {
  company?: string;
  job_role?: string;
  interview_round?: string;
  scheduled_at?: string;
  location_type?: string;
  meeting_link_or_address?: string;
  salary?: string;
  status?: ScheduleStatus;
  jd_text?: string;
  resume_id?: string;
  notes?: string;
}

// 邮件通知与系统设置契约
export interface NotificationSettings {
  email_enabled: boolean;
  receiver_email: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password?: string;
  smtp_use_ssl: boolean;
  smtp_from_name: string;
  remind_advance_hours: number;
  has_password?: boolean;
  updated_at?: string;
}

export interface BrowserNotificationConfig {
  enabled: boolean;
  /** 提前提醒档位（分钟），可多选；空数组表示不弹窗 */
  advanceMinutes: number[];
}

