import React, { useEffect, useState } from 'react';
import {
  Bot,
  FileText,
  Calendar,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
} from 'lucide-react';
import type { AppView, InterviewScheduleItem, SavedResumeItem, HistorySessionItem } from '../types';
import { apiFetch } from '../utils/api';

interface HomeViewProps {
  onNavigate: (view: AppView) => void;
  onStartQuickMock: () => void;
  onPrepareForSchedule: (schedule: InterviewScheduleItem) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  onNavigate,
  onStartQuickMock,
  onPrepareForSchedule,
}) => {
  const [resumes, setResumes] = useState<SavedResumeItem[]>([]);
  const [schedules, setSchedules] = useState<InterviewScheduleItem[]>([]);
  const [history, setHistory] = useState<HistorySessionItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchAllData = async () => {
      setLoading(true);
      try {
        const [resResume, resSchedule, resHistory] = await Promise.all([
          apiFetch<{ resumes?: SavedResumeItem[] }>('/api/v1/profiles/resumes').catch(() => null),
          apiFetch<{ schedules?: InterviewScheduleItem[] }>('/api/v1/schedules').catch(() => null),
          apiFetch<{ history?: HistorySessionItem[] }>('/api/v1/interviews/history').catch(() => null),
        ]);

        if (resResume) {
          setResumes(resResume.resumes || []);
        }
        if (resSchedule) {
          setSchedules(resSchedule.schedules || []);
        }
        if (resHistory) {
          setHistory(resHistory.history || []);
        }
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAllData();
  }, []);

  // Upcoming schedules (sorted by time asc)
  const upcomingSchedules = schedules.filter((s) => s.status === 'upcoming');
  const nextInterview = upcomingSchedules.length > 0 ? upcomingSchedules[0] : null;

  // Average radar score calculation from history with radar_scores
  const validScores = history
    .filter((h) => h.radar_scores)
    .map((h) => {
      const s = h.radar_scores!;
      const total =
        (s.technical_depth || 0) +
        (s.technical_breadth || 0) +
        (s.communication_logic || 0) +
        (s.star_completeness || 0) +
        (s.stress_resilience || 0) +
        (s.job_matching || 0);
      return Math.round(total / 6);
    });
  const avgScore = validScores.length > 0
    ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
    : null;

  // Format date helper
  const formatTimeStr = (isoStr?: string) => {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      const m = d.getMonth() + 1;
      const date = d.getDate();
      const hours = d.getHours().toString().padStart(2, '0');
      const mins = d.getMinutes().toString().padStart(2, '0');
      return `${m}月${date}日 ${hours}:${mins}`;
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 space-y-8 animate-fade-in">
      {/* 1. Hero & Quick CTA */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-950/70 via-indigo-950/60 to-purple-950/50 border border-blue-800/40 p-6 sm:p-10 shadow-2xl backdrop-blur-sm">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-900/60 border border-blue-700/60 text-xs text-blue-300 font-medium">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span>智能多 Agent 驱动 · 个人求职作战中枢</span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight">
              全方位打磨简历，全真模拟对练，
              <br />
              <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-300 bg-clip-text text-transparent">
                从容应对每一场真实面试
              </span>
            </h1>
            <p className="text-sm sm:text-base text-gray-300">
              覆盖从简历管理与解析、AI 多面试官协同全真推演，到真实日程追踪与复盘提升的完整闭环。
            </p>
          </div>

          <div className="flex flex-wrap sm:flex-col gap-3 min-w-[200px]">
            <button
              onClick={onStartQuickMock}
              className="flex-1 inline-flex items-center justify-center space-x-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-sm shadow-lg shadow-blue-600/30 hover:shadow-blue-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
            >
              <Bot className="w-4 h-4" />
              <span>快速开启模拟面试</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => onNavigate('interviews')}
              className="flex-1 inline-flex items-center justify-center space-x-2 px-5 py-2.5 rounded-xl bg-gray-900/80 hover:bg-gray-800 border border-gray-700 hover:border-gray-600 text-gray-300 hover:text-white text-xs font-medium transition cursor-pointer"
            >
              <PlusCircle className="w-4 h-4 text-emerald-400" />
              <span>登记面试日程</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Key Metrics Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-gray-900/60 border border-gray-800/80 backdrop-blur flex items-center space-x-4">
          <div className="w-11 h-11 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{loading ? '-' : resumes.length}</div>
            <div className="text-xs text-gray-400">已沉淀简历版本</div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-gray-900/60 border border-gray-800/80 backdrop-blur flex items-center space-x-4">
          <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-white flex items-center space-x-2">
              <span>{loading ? '-' : upcomingSchedules.length}</span>
              {upcomingSchedules.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-normal">
                  待面试
                </span>
              )}
            </div>
            <div className="text-xs text-gray-400">近期真实面试安排</div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-gray-900/60 border border-gray-800/80 backdrop-blur flex items-center space-x-4">
          <div className="w-11 h-11 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{loading ? '-' : history.length}</div>
            <div className="text-xs text-gray-400">已完成模拟对练</div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-gray-900/60 border border-gray-800/80 backdrop-blur flex items-center space-x-4">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-white">
              {loading ? '-' : avgScore ? `${avgScore} 分` : '--'}
            </div>
            <div className="text-xs text-gray-400">模拟综合平均分</div>
          </div>
        </div>
      </div>

      {/* 3. Urgent Upcoming Interview Banner (if exists) */}
      {nextInterview && (
        <div className="p-4 sm:p-5 rounded-xl bg-amber-950/30 border border-amber-800/40 backdrop-blur flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center space-x-3.5">
            <div className="p-2.5 rounded-lg bg-amber-500/20 text-amber-300">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
                  最近一场面试
                </span>
                <span className="text-xs text-gray-400 flex items-center space-x-1">
                  <Clock className="w-3 h-3 text-amber-400" />
                  <span>{formatTimeStr(nextInterview.scheduled_at)}</span>
                </span>
              </div>
              <div className="text-sm sm:text-base font-bold text-white mt-1">
                {nextInterview.company} · {nextInterview.job_role}（{nextInterview.interview_round}）
              </div>
              {nextInterview.notes && (
                <div className="text-xs text-gray-400 mt-0.5 line-clamp-1">
                  备忘：{nextInterview.notes}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            <button
              onClick={() => onPrepareForSchedule(nextInterview)}
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs shadow-md shadow-amber-900/30 transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>针对此岗位一键模拟</span>
            </button>
            <button
              onClick={() => onNavigate('interviews')}
              className="inline-flex items-center space-x-1 px-3 py-2 rounded-lg bg-gray-900 hover:bg-gray-800 border border-gray-700 text-xs text-gray-300 transition cursor-pointer"
            >
              <span>查看全部日程</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* 4. Three Core Modules Cards */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-white flex items-center space-x-2">
          <span>三大核心功能模块</span>
          <span className="text-xs text-gray-400 font-normal">点击卡片直达对应功能</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: 简历管理 */}
          <div
            onClick={() => onNavigate('resumes')}
            className="group relative rounded-2xl bg-gray-900/70 border border-gray-800 hover:border-purple-600/60 p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-purple-950/20 cursor-pointer flex flex-col justify-between"
          >
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 group-hover:scale-110 group-hover:bg-purple-500/20 transition">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white group-hover:text-purple-300 transition flex items-center justify-between">
                  <span>简历管理</span>
                  <span className="text-xs font-normal text-purple-400 bg-purple-950/60 px-2 py-0.5 rounded-full border border-purple-800/40">
                    {resumes.length} 份
                  </span>
                </h3>
                <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                  多版本简历集中管理，支持 PDF/Word 智能解析、技能标签自动提取，可随时一键选入开展模拟。
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-gray-800/60 text-xs text-gray-400">
                <div className="flex items-center space-x-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
                  <span>支持 PDF / DOCX / TXT / Markdown 上传解析</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
                  <span>一键以此简历快速发起定制面试</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-800/60 flex items-center justify-between text-xs text-purple-400 font-medium group-hover:translate-x-1 transition-transform">
              <span>进入简历管理中心</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>

          {/* Card 2: 模拟面试 */}
          <div
            onClick={() => onNavigate('setup')}
            className="group relative rounded-2xl bg-gray-900/70 border border-blue-700/50 hover:border-blue-500 p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-950/30 cursor-pointer flex flex-col justify-between"
          >
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 group-hover:scale-110 group-hover:bg-blue-500/20 transition">
                <Bot className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white group-hover:text-blue-300 transition flex items-center justify-between">
                  <span>模拟面试</span>
                  <span className="text-xs font-normal text-blue-400 bg-blue-950/60 px-2 py-0.5 rounded-full border border-blue-800/40">
                    多 Agent
                  </span>
                </h3>
                <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                  主考官、技术专家、HR与压力挑战官协同发问。具备实时答题求助 (Lifeline) 与联网知识核查。
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-gray-800/60 text-xs text-gray-400">
                <div className="flex items-center space-x-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                  <span>多流派专家阵容（架构/算法/行为STAR/压力）</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                  <span>生成六维雷达图与逐题“黄金优化示范”</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-800/60 flex items-center justify-between text-xs text-blue-400 font-medium group-hover:translate-x-1 transition-transform">
              <span>开始全真模拟对练</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>

          {/* Card 3: 面试管理 */}
          <div
            onClick={() => onNavigate('interviews')}
            className="group relative rounded-2xl bg-gray-900/70 border border-gray-800 hover:border-emerald-600/60 p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-emerald-950/20 cursor-pointer flex flex-col justify-between"
          >
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-110 group-hover:bg-emerald-500/20 transition">
                <Calendar className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white group-hover:text-emerald-300 transition flex items-center justify-between">
                  <span>面试管理</span>
                  <span className="text-xs font-normal text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800/40">
                    日程 + 复盘
                  </span>
                </h3>
                <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                  双轮驱动：跟踪真实求职日程与进度（待面试/已完成/面经），并沉淀历次 AI 模拟战报与双场对比。
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-gray-800/60 text-xs text-gray-400">
                <div className="flex items-center space-x-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>真实求职面试日程管理与状态追踪</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>历史对练报告回放与双场次能力对比</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-800/60 flex items-center justify-between text-xs text-emerald-400 font-medium group-hover:translate-x-1 transition-transform">
              <span>查看面试日程与战报</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
