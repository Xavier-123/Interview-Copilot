import { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { SetupView } from './components/SetupView';
import { InterviewRoom } from './components/InterviewRoom';
import { ReportView } from './components/ReportView';
import { PrivacyModeProvider } from './context/PrivacyModeContext';
import type { Message, EvaluationReport } from './types';

export function App() {
  const [view, setView] = useState<'setup' | 'interview' | 'report'>('setup');
  const [sessionId, setSessionId] = useState<string>('');
  const [stage, setStage] = useState<string>('setup');
  const [currentInterviewer, setCurrentInterviewer] = useState<string>('orchestrator');
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<string>('ready');
  const [lifelinesUsed, setLifelinesUsed] = useState<number>(0);
  const [shadowLogsCount, setShadowLogsCount] = useState<number>(0);
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  // Timer effect during interview
  useEffect(() => {
    let interval: number | null = null;
    if (view === 'interview') {
      interval = window.setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) window.clearInterval(interval);
    };
  }, [view]);

  // 1. Start Interview handler
  const handleStartInterview = async (config: {
    resumeText: string;
    jdText: string;
    difficulty: string;
    style: string;
    language: string;
  }) => {
    setIsThinking(true);
    try {
      // 1. Create Session
      const sessionRes = await fetch('/api/v1/interviews/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume_text: config.resumeText,
          jd_text: config.jdText,
          difficulty: config.difficulty,
          style: config.style,
          language: config.language,
        }),
      });
      const sessionData = await sessionRes.json();
      const newSessionId = sessionData.session_id;
      setSessionId(newSessionId);

      // 2. Start Interview (Icebreak from Orchestrator)
      const startRes = await fetch(`/api/v1/interviews/${newSessionId}/start`, {
        method: 'POST',
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
      alert('启动面试失败，请检查网络或后端服务。');
    } finally {
      setIsThinking(false);
    }
  };

  // 2. Send Candidate Answer handler
  const handleSendMessage = async (text: string) => {
    if (!sessionId || isThinking) return;

    // Optimistically append user message
    const tempUserMsg: Message = {
      role: 'user',
      name: 'candidate',
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setIsThinking(true);

    try {
      const res = await fetch(`/api/v1/interviews/${sessionId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();

      setStage(data.stage);
      setCurrentInterviewer(data.current_interviewer);
      setMessages(data.messages);
      setStatus(data.status);
      setShadowLogsCount((prev) => prev + 1);

      // If status is finished, automatically transition to report
      if (data.status === 'finished') {
        handleFinishInterview();
      }
    } catch (error) {
      console.error('Failed to send answer:', error);
      alert('提交回答失败，请稍后重试。');
    } finally {
      setIsThinking(false);
    }
  };

  // 3. Request Lifeline handler
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

  // 4. Finish Interview & Generate Report
  const handleFinishInterview = async () => {
    if (!sessionId) return;
    setIsThinking(true);
    try {
      const res = await fetch(`/api/v1/interviews/${sessionId}/finish`, {
        method: 'POST',
      });
      const data = await res.json();
      setReport(data.report);
      setStage('report');
      setView('report');
    } catch (error) {
      console.error('Failed to generate report:', error);
      alert('生成报告失败，请重试。');
    } finally {
      setIsThinking(false);
    }
  };

  // 5. Restart
  const handleRestart = () => {
    setSessionId('');
    setStage('setup');
    setCurrentInterviewer('orchestrator');
    setMessages([]);
    setReport(null);
    setLifelinesUsed(0);
    setShadowLogsCount(0);
    setElapsedSeconds(0);
    setView('setup');
  };

  return (
    <PrivacyModeProvider>
      <div className="min-h-screen bg-[#0b0f19] text-gray-100 flex flex-col font-sans">
        <Navbar currentStage={stage} elapsedSeconds={elapsedSeconds} status={status} />

        <main className="flex-1">
          {view === 'setup' && (
            <SetupView onStartInterview={handleStartInterview} isLoading={isThinking} />
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
              onSendMessage={handleSendMessage}
              onRequestLifeline={handleRequestLifeline}
              onFinishInterview={handleFinishInterview}
            />
          )}

          {view === 'report' && report && (
            <ReportView report={report} onRestart={handleRestart} />
          )}
        </main>
      </div>
    </PrivacyModeProvider>
  );
}

export default App;
