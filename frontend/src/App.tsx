import { useState, useEffect, useRef } from 'react';
import { Navbar } from './components/Navbar';
import { HomeView } from './components/HomeView';
import { ResumeManagementView } from './components/ResumeManagementView';
import { InterviewManagementView } from './components/InterviewManagementView';
import { SetupView } from './components/SetupView';
import { InterviewRoom } from './components/InterviewRoom';
import { ReportView } from './components/ReportView';
import { PersonaLibraryView } from './components/PersonaLibraryView';
import { PrivacyModeProvider } from './context/PrivacyModeContext';
import { loadLLMConfig } from './utils/llmConfig';
import { loadSearchConfig } from './utils/searchConfig';
import { resolveInterviewerLineup } from './utils/interviewers';
import type { PersonaDisplayInfo } from './utils/interviewers';
import { checkAndNotifyUpcomingSchedules } from './utils/browserNotification';
import type {
  Message,
  EvaluationReport,
  InterviewType,
  IndustryType,
  SeniorityLevel,
  DifficultyLevel,
  SimulateAnswerResult,
  AppView,
  InterviewScheduleItem,
  RoundsMode,
} from './types';

export function App() {
  const [view, setView] = useState<AppView>('home');
  const [sessionId, setSessionId] = useState<string>('');
  const [stage, setStage] = useState<string>('setup');
  const [currentInterviewer, setCurrentInterviewer] = useState<string>('orchestrator');
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<string>('ready');
  const [lifelinesUsed, setLifelinesUsed] = useState<number>(0);
  const [shadowLogsCount, setShadowLogsCount] = useState<number>(0);
  const [isThinking, setIsThinking] = useState<boolean>(false);
  // 报告生成进行中标记（ref 同步读写，避免 React 批处理下读到 stale state 漏判）
  const finishInFlightRef = useRef<boolean>(false);
  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [webSearchEnabled, setWebSearchEnabled] = useState<boolean>(false);
  // 本场面试语言（zh | en），传给 InterviewRoom 决定 STT/TTS 语音
  const [interviewLanguage, setInterviewLanguage] = useState<string>('zh');
  const [activePersonas, setActivePersonas] = useState<PersonaDisplayInfo[]>([]);
  // 本场实际出场的面试官角色 key（含主考官），面试官席位只展示这些成员
  const [participantRoles, setParticipantRoles] = useState<string[]>([]);

  // 跨页面传递的模拟面试预填数据（来自简历管理或面试日程）
  const [setupPrefill, setSetupPrefill] = useState<{
    resumeText?: string;
    resumeTitle?: string;
    jobRole?: string;
    jdText?: string;
    company?: string;
    interviewRound?: string;
  } | undefined>(undefined);


  // Timer during interview (freeze when paused)
  useEffect(() => {
    let interval: number | null = null;
    if (view === 'interview' && status !== 'paused') {
      interval = window.setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) window.clearInterval(interval);
    };
  }, [view, status]);

  // 全局定时扫描待面试日程（每 60 秒），若开启桌面弹窗则无论处于系统哪个页面均可收到原生桌面提醒
  useEffect(() => {
    const scanUpcomingSchedules = async () => {
      try {
        const res = await fetch('/api/v1/schedules');
        if (res.ok) {
          const data = await res.json();
          checkAndNotifyUpcomingSchedules(data.schedules || [], () => {
            setView('interviews');
          });
        }
      } catch {
        // silent background failure
      }
    };

    scanUpcomingSchedules();
    const timer = setInterval(scanUpcomingSchedules, 60000);
    return () => clearInterval(timer);
  }, []);

  // 1. Start Interview handler
  const handleStartInterview = async (config: {
    resumeText: string;
    jdText: string;
    interviewType: InterviewType;
    industry: IndustryType;
    jobRole: string;
    seniority: SeniorityLevel;
    difficulty: DifficultyLevel;
    style: string;
    language: string;
    webSearchEnabled: boolean;
    roundsMode?: RoundsMode;
    maxRounds?: number;
    customConfig?: any;
    /** 本场出场自定义人设的展示信息（含 persona:<id> 引用） */
    customPersonas?: PersonaDisplayInfo[];
  }) => {
    setIsThinking(true);
    setWebSearchEnabled(config.webSearchEnabled);
    setInterviewLanguage(config.language || 'zh');
    const personaDisplay = config.customPersonas || [];
    setActivePersonas(personaDisplay);
    setParticipantRoles(
      resolveInterviewerLineup(config.interviewType, config.style, config.customConfig?.selected_interviewers).flatMap(
        (entry) => {
          if (!entry.startsWith('persona:')) return [entry];
          // 无法解析的人设引用（如人设已被删除）与后端行为一致：直接剔除
          const matched = personaDisplay.find((p) => p.ref === entry);
          return matched ? [matched.key] : [];
        }
      )
    );
    try {
      const llmConfig = loadLLMConfig();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      // Create session
      const sessionRes = await fetch('/api/v1/interviews/session', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          resume_text: config.resumeText,
          jd_text: config.jdText,
          interview_type: config.interviewType,
          industry: config.industry,
          job_role: config.jobRole,
          seniority: config.seniority,
          difficulty: config.difficulty,
          style: config.style,
          language: config.language,
          web_search_enabled: config.webSearchEnabled,
          custom_config: config.customConfig,
          max_rounds: config.maxRounds,
          rounds_mode: config.roundsMode || 'fixed',
          ...(llmConfig ? { llm_config: llmConfig } : {}),
        }),
      });

      if (!sessionRes.ok) {
        throw new Error('创建面试会话失败');
      }

      const sessionData = await sessionRes.json();
      const newSessionId = sessionData.session_id;
      setSessionId(newSessionId);

      // Start interview (Icebreak / First Question)
      const startRes = await fetch(`/api/v1/interviews/${newSessionId}/start`, {
        method: 'POST',
        headers,
      });
      const startData = await startRes.json();

      setStage(startData.stage || 'self_intro');
      setCurrentInterviewer(startData.current_interviewer || 'orchestrator');
      setMessages(startData.messages || []);
      setStatus(startData.status || 'waiting_user');
      setElapsedSeconds(0);
      setShadowLogsCount(0);
      setLifelinesUsed(0);
      setView('interview');
    } catch (error) {
      console.error('Failed to start interview:', error);
      alert('启动面试失败，请检查网络或后端服务连接。');
    } finally {
      setIsThinking(false);
    }
  };

  // 2. Submit Candidate Answer
  const handleSendMessage = async (text: string) => {
    if (!sessionId || isThinking || status === 'paused' || status === 'finished') return;

    const tempUserMsg: Message = {
      role: 'user',
      name: 'candidate',
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setIsThinking(true);

    try {
      const searchConfig = loadSearchConfig();
      const res = await fetch(`/api/v1/interviews/${sessionId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          ...(searchConfig ? { search_config: searchConfig } : {}),
        }),
      });
      const data = await res.json();

      setStage(data.stage);
      setCurrentInterviewer(data.current_interviewer);
      setMessages(data.messages);
      setStatus(data.status);
      setShadowLogsCount((prev) => prev + 1);

      if (data.status === 'finished') {
        // 等待报告生成完成后再解除 loading，否则 finally 会提前恢复输入框，
        // 导致用户重复提交答案或重复触发报告请求
        await handleFinishInterview();
      }
    } catch (error) {
      console.error('Failed to send answer:', error);
      alert('提交回答失败，请稍后重试。');
    } finally {
      setIsThinking(false);
    }
  };

  // 3. Pause Interview
  const handlePauseInterview = async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/v1/interviews/${sessionId}/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elapsed_seconds: elapsedSeconds }),
      });
      if (res.ok) {
        setStatus('paused');
      }
    } catch (err) {
      console.error('Failed to pause interview:', err);
    }
  };

  // 4. Resume Interview
  const handleResumeInterview = async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/v1/interviews/${sessionId}/resume`, {
        method: 'POST',
      });
      if (res.ok) {
        setStatus('waiting_user');
      }
    } catch (err) {
      console.error('Failed to resume interview:', err);
    }
  };

  // 5. Redo Turn
  const handleRedoTurn = async () => {
    if (!sessionId || isThinking) return;
    setIsThinking(true);
    try {
      const res = await fetch(`/api/v1/interviews/${sessionId}/redo`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.state) {
        setMessages(data.state.messages || []);
        setStage(data.state.stage);
        setCurrentInterviewer(data.state.current_interviewer);
        setStatus(data.state.status || 'waiting_user');
        setShadowLogsCount((prev) => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('Failed to redo turn:', err);
    } finally {
      setIsThinking(false);
    }
  };

  // 6. Restart Interview
  const handleRestartInterview = async () => {
    if (!sessionId || isThinking) return;
    setIsThinking(true);
    try {
      const res = await fetch(`/api/v1/interviews/${sessionId}/restart`, {
        method: 'POST',
      });
      const data = await res.json();
      setStage(data.stage || 'self_intro');
      setCurrentInterviewer(data.current_interviewer || 'orchestrator');
      setMessages(data.messages || []);
      setStatus(data.status || 'waiting_user');
      setElapsedSeconds(0);
      setShadowLogsCount(0);
      setLifelinesUsed(0);
    } catch (err) {
      console.error('Failed to restart interview:', err);
    } finally {
      setIsThinking(false);
    }
  };

  // 7. Request Lifeline
  const handleRequestLifeline = async () => {
    if (!sessionId || isThinking) return;
    setIsThinking(true);
    try {
      const res = await fetch(`/api/v1/interviews/${sessionId}/lifeline`, {
        method: 'POST',
      });
      const data = await res.json();
      setLifelinesUsed(data.lifelines_used);
      setMessages(data.state.messages);
    } catch (error) {
      console.error('Failed to request lifeline:', error);
    } finally {
      setIsThinking(false);
    }
  };

  // 7.1 Toggle Web Search
  const handleToggleWebSearch = async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/v1/interviews/${sessionId}/toggle-web-search`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        setWebSearchEnabled(data.web_search_enabled);
      }
    } catch (err) {
      console.error('Failed to toggle web search:', err);
    }
  };

  // 7.2 Simulate Standard Answer
  const handleSimulateAnswer = async (): Promise<SimulateAnswerResult | void> => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/v1/interviews/${sessionId}/simulate-answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ search_config: loadSearchConfig() }),
      });
      if (res.ok) {
        const data = await res.json();
        return {
          answer: data.standard_answer,
          searchMetadata: data.search_metadata,
        };
      } else {
        const err = await res.json();
        alert(err.detail || '构思标准回答失败');
      }
    } catch (err) {
      console.error('Failed to simulate answer:', err);
      alert('构思标准回答失败，请检查服务状态');
    }
  };

  // 8. Finish Interview & Generate Report
  const handleFinishInterview = async () => {
    if (!sessionId || finishInFlightRef.current) return;
    finishInFlightRef.current = true;
    setIsThinking(true);
    try {
      const res = await fetch(`/api/v1/interviews/${sessionId}/finish`, {
        method: 'POST',
      });
      const data = await res.json();
      setReport(data.report);
      setStage('report');
      setStatus('finished');
      setView('report');
    } catch (error) {
      console.error('Failed to generate report:', error);
      alert('生成复盘报告失败，请重试。');
    } finally {
      finishInFlightRef.current = false;
      setIsThinking(false);
    }
  };

  // 9. View Report from History
  const handleViewReportFromHistory = async (targetSessionId: string) => {
    setIsThinking(true);
    try {
      const res = await fetch(`/api/v1/interviews/${targetSessionId}/report`);
      if (res.ok) {
        const data = await res.json();
        setReport(data);
        setSessionId(targetSessionId);
        setStage('report');
        setView('report');
      } else {
        alert('未找到该场面试的评估报告');
      }
    } catch (err) {
      console.error('Failed to load past report:', err);
    } finally {
      setIsThinking(false);
    }
  };

  // 从简历管理挑选简历开启模拟
  const handleSelectResumeForMock = (resumeText: string, resumeTitle?: string) => {
    setSetupPrefill({ resumeText, resumeTitle });
    setView('setup');
  };

  // 从日程卡片针对岗位开启模拟
  const handlePrepareForSchedule = (schedule: InterviewScheduleItem) => {
    setSetupPrefill({
      company: schedule.company,
      jobRole: schedule.job_role,
      jdText: schedule.jd_text,
      interviewRound: schedule.interview_round,
    });
    setView('setup');
  };

  // 10. Restart / Return to Home
  const handleRestart = () => {
    setSessionId('');
    setStage('setup');
    setCurrentInterviewer('orchestrator');
    setMessages([]);
    setReport(null);
    setLifelinesUsed(0);
    setShadowLogsCount(0);
    setElapsedSeconds(0);
    setStatus('ready');
    setActivePersonas([]);
    setParticipantRoles([]);
    setSetupPrefill(undefined);
    setView('home');
  };

  return (
    <PrivacyModeProvider>
      <div className="min-h-screen bg-[#0b0f19] text-gray-100 flex flex-col font-sans">
          <Navbar
            currentStage={stage}
            elapsedSeconds={elapsedSeconds}
            status={status}
            currentView={view}
            onNavigate={(v) => {
              if (v === 'setup') setSetupPrefill(undefined);
              setView(v);
            }}
            inInterview={view === 'interview' || view === 'report'}
            onNavigateHistory={() => setView('interviews')}
            onNavigatePersonas={() => setView('personas')}
            onNavigateHome={handleRestart}
          />

          <main className="flex-1">
            {view === 'home' && (
              <HomeView
                onNavigate={(v) => {
                  if (v === 'setup') setSetupPrefill(undefined);
                  setView(v);
                }}
                onStartQuickMock={() => {
                  setSetupPrefill(undefined);
                  setView('setup');
                }}
                onPrepareForSchedule={handlePrepareForSchedule}
              />
            )}

            {view === 'resumes' && (
              <ResumeManagementView
                onBack={() => setView('home')}
                onSelectResumeForMock={handleSelectResumeForMock}
              />
            )}

            {view === 'interviews' && (
              <InterviewManagementView
                onBack={() => setView('home')}
                onViewReport={handleViewReportFromHistory}
                onStartMockWithSchedule={handlePrepareForSchedule}
              />
            )}

            {view === 'setup' && (
              <SetupView
                onStartInterview={handleStartInterview}
                isLoading={isThinking}
                prefillConfig={setupPrefill}
              />
            )}

            {view === 'interview' && (
              <InterviewRoom
                sessionId={sessionId}
                stage={stage}
                currentInterviewer={currentInterviewer}
                messages={messages}
                status={status}
                lifelinesUsed={lifelinesUsed}
                isThinking={isThinking}
                shadowLogsCount={shadowLogsCount}
                customPersonas={activePersonas}
                participantRoles={participantRoles}
                onSendMessage={handleSendMessage}
                onRequestLifeline={handleRequestLifeline}
                onFinishInterview={handleFinishInterview}
                onPauseInterview={handlePauseInterview}
                onResumeInterview={handleResumeInterview}
                onRedoTurn={handleRedoTurn}
                onRestartInterview={handleRestartInterview}
                webSearchEnabled={webSearchEnabled}
                language={interviewLanguage}
                onToggleWebSearch={handleToggleWebSearch}
                onSimulateAnswer={handleSimulateAnswer}
              />
            )}

            {view === 'personas' && (
              <PersonaLibraryView onBack={() => setView('home')} />
            )}

            {view === 'report' && report && (
              <ReportView
                report={report}
                onRestart={handleRestart}
                sessionId={sessionId}
                onBack={() => setView('interviews')}
                backLabel="返回面试管理"
              />
            )}
          </main>
      </div>
    </PrivacyModeProvider>
  );
}

export default App;

