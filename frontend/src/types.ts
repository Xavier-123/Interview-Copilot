export type InterviewerType = 'orchestrator' | 'technical' | 'hr' | 'challenger' | 'observer';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  name?: 'orchestrator' | 'technical' | 'hr' | 'challenger' | 'candidate';
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

export interface EvaluationReport {
  overall_summary: string;
  match_verdict: string;
  radar_scores: RadarScores;
  strengths: string[];
  weaknesses: string[];
  detailed_reviews: DetailedReview[];
  learning_plan: LearningPlanItem[];
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

export interface InterviewSession {
  session_id: string;
  user_id: string;
  stage: string;
  current_interviewer: string;
  round_count: number;
  max_rounds: number;
  candidate_profile: CandidateProfile;
  jd_requirements: JDRequirements;
  messages: Message[];
  status: 'ready' | 'in_progress' | 'waiting_user' | 'finished';
  lifelines_used: number;
}
