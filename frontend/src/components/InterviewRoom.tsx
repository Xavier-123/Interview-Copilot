import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Lightbulb,
  CheckCircle2,
  Bot,
  User,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  Pause,
  Play,
  RotateCcw,
  RefreshCw,
  Tv,
  MessageSquare,
  Sparkles,
  Globe,
  Settings2
} from 'lucide-react';
import type { Message, SearchMetadata, SimulateAnswerResult } from '../types';
import { InterviewerPanel } from './InterviewerPanel';
import { SearchConfigModal } from './SearchConfigModal';
import { SearchSources } from './SearchSources';
import { getInterviewerMeta } from '../utils/interviewers';
import type { PersonaDisplayInfo } from '../utils/interviewers';

interface InterviewRoomProps {
  sessionId: string;
  stage: string;
  currentInterviewer: string;
  messages: Message[];
  status: string;
  lifelinesUsed: number;
  isThinking: boolean;
  shadowLogsCount: number;
  webSearchEnabled: boolean;
  customPersonas?: PersonaDisplayInfo[];
  /** 本场实际出场的面试官角色 key 列表，席位只展示这些成员 */
  participantRoles?: string[];
  onSendMessage: (text: string) => void;
  onRequestLifeline: () => void;
  onFinishInterview: () => void;
  onPauseInterview: () => void;
  onResumeInterview: () => void;
  onRedoTurn: () => void;
  onRestartInterview: () => void;
  onToggleWebSearch: () => void;
  onSimulateAnswer: () => Promise<SimulateAnswerResult | void>;
}

export const InterviewRoom: React.FC<InterviewRoomProps> = ({
  sessionId: _sessionId,
  stage: _stage,
  currentInterviewer,
  messages,
  status,
  lifelinesUsed,
  isThinking,
  shadowLogsCount,
  webSearchEnabled,
  customPersonas,
  participantRoles,
  onSendMessage,
  onRequestLifeline,
  onFinishInterview,
  onPauseInterview,
  onResumeInterview,
  onRedoTurn,
  onRestartInterview,
  onToggleWebSearch,
  onSimulateAnswer,
}) => {
  const [inputText, setInputText] = useState('');
  const [viewMode, setViewMode] = useState<'meeting' | 'chat'>('meeting');
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(false);
  const [isTTSActive, setIsTTSActive] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isGeneratingAnswer, setIsGeneratingAnswer] = useState(false);
  const [simulateAnswerNotification, setSimulateAnswerNotification] = useState<string | null>(null);
  const [simulateSearchMetadata, setSimulateSearchMetadata] = useState<SearchMetadata | null>(null);
  const [searchConfigOpen, setSearchConfigOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);

  // Initialize Speech Recognition (STT)
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'zh-CN';

      recognition.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            setInputText((prev) => prev + event.results[i][0].transcript);
          } else {
            currentTranscript += event.results[i][0].transcript;
          }
        }
      };

      recognition.onerror = (e: any) => {
        console.warn('Speech recognition error:', e);
        setIsMicOn(false);
      };

      recognition.onend = () => {
        setIsMicOn(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  // Toggle STT Microphone
  const toggleMic = () => {
    if (!recognitionRef.current) {
      alert('您的浏览器暂不支持原生语音识别，请使用 Chrome 或 Edge 浏览器。');
      return;
    }

    if (isMicOn) {
      recognitionRef.current.stop();
      setIsMicOn(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsMicOn(true);
      } catch (err) {
        console.error('Failed to start speech recognition:', err);
      }
    }
  };

  // Text-To-Speech (TTS) for latest interviewer message
  const speakText = (text: string, interviewerName?: string) => {
    if (!('speechSynthesis' in window) || !isTTSActive) return;

    window.speechSynthesis.cancel();
    const cleanText = text.replace(/[*#`_\[\]()]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);

    switch (interviewerName) {
      case 'orchestrator':
        utterance.pitch = 1.0;
        utterance.rate = 1.05;
        break;
      case 'technical':
        utterance.pitch = 0.95;
        utterance.rate = 1.1;
        break;
      case 'programmer':
        utterance.pitch = 1.05;
        utterance.rate = 1.05;
        break;
      case 'hr':
        utterance.pitch = 1.15;
        utterance.rate = 1.0;
        break;
      case 'management':
        utterance.pitch = 0.9;
        utterance.rate = 1.0;
        break;
      case 'challenger':
        utterance.pitch = 0.85;
        utterance.rate = 1.1;
        break;
      default:
        utterance.pitch = 1.0;
        utterance.rate = 1.0;
    }

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  // Auto-speak new interviewer responses
  useEffect(() => {
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'assistant') {
        speakText(lastMsg.content, lastMsg.name);
      }
    }
  }, [messages.length]);

  // Webcam stream management
  useEffect(() => {
    const startCamera = async () => {
      if (isCameraOn && viewMode === 'meeting') {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480 },
            audio: false,
          });
          mediaStreamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        } catch (err) {
          console.warn('Webcam permission denied or camera not available:', err);
          setIsCameraOn(false);
        }
      } else {
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop());
          mediaStreamRef.current = null;
        }
      }
    };

    startCamera();

    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [isCameraOn, viewMode]);

  // Scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isThinking]);

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isThinking || status === 'paused') return;
    onSendMessage(inputText.trim());
    setInputText('');
    if (isMicOn && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsMicOn(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSimulateAnswer = async () => {
    if (isThinking || isGeneratingAnswer || status === 'paused') return;
    setIsGeneratingAnswer(true);
    setSimulateAnswerNotification(null);
    try {
      const generated = await onSimulateAnswer();
      if (generated?.answer) {
        setInputText(generated.answer);
        setSimulateSearchMetadata(generated.searchMetadata ?? null);
        setSimulateAnswerNotification('✨ AI 已根据上下文与简历为您生成第一人称金牌回答，您可直接微调或点击【提交回答】！');
      }
    } catch (err) {
      console.error('Failed to simulate answer:', err);
    } finally {
      setIsGeneratingAnswer(false);
    }
  };

  // Get interviewer visual meta（内置角色 + 自定义人设统一查表）
  const resolveInterviewerMeta = (name?: string) => getInterviewerMeta(name, customPersonas);

  const activeInterviewerMeta = resolveInterviewerMeta(currentInterviewer);
  const latestAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant');
  const latestSearchMetadata = [...messages]
    .reverse()
    .find((message) => message.search_metadata)?.search_metadata;
  const searchStatusLabel = !webSearchEnabled
    ? '关闭'
    : latestSearchMetadata?.status === 'success'
      ? '搜索成功'
      : latestSearchMetadata?.status === 'failed'
        ? '搜索失败'
        : '已开启';

  return (
    <div className="max-w-6xl mx-auto py-3 px-4 flex flex-col h-[calc(100vh-4.5rem)] relative">
      {/* 0. Paused Overlay */}
      {status === 'paused' && (
        <div className="absolute inset-0 z-40 bg-gray-950/85 backdrop-blur-md rounded-3xl flex flex-col items-center justify-center p-6 text-center animate-fadeIn">
          <div className="w-16 h-16 rounded-3xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 mb-4 shadow-xl">
            <Pause className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">模拟面试已暂停</h2>
          <p className="text-xs text-gray-400 max-w-sm mb-6">
            面试计时已冻结，会话进度已完整保存到数据库中。您可以稍作休息或调整状态，随时继续。
          </p>
          <button
            onClick={onResumeInterview}
            className="inline-flex items-center space-x-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-lg transition"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>继续进行面试</span>
          </button>
        </div>
      )}

      {/* Top Toolbar: Mode Switch & Status Control */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-gray-800 bg-gray-900/80 px-4 py-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Dual-mode Switch */}
          <div className="flex bg-gray-950 p-1 rounded-xl border border-gray-800">
            <button
              type="button"
              onClick={() => setViewMode('meeting')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-medium transition ${
                viewMode === 'meeting'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Tv className="w-3.5 h-3.5" />
              <span>视频会议模式</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('chat')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-medium transition ${
                viewMode === 'chat'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>经典对话流模式</span>
            </button>
          </div>

          {/* TTS Toggle Button */}
          <button
            type="button"
            onClick={() => {
              setIsTTSActive(!isTTSActive);
              if (isTTSActive) window.speechSynthesis.cancel();
            }}
            title={isTTSActive ? '面试官语音朗读已开启' : '面试官语音已静音'}
            className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border text-xs transition ${
              isTTSActive
                ? 'bg-blue-950/60 border-blue-600/40 text-blue-300'
                : 'bg-gray-800 border-gray-700 text-gray-400'
            }`}
          >
            {isTTSActive ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isTTSActive ? '语音开启' : '静音'}</span>
          </button>

          {/* Web Search Toggle Button */}
          <div className="flex items-center">
            <button
              type="button"
              onClick={onToggleWebSearch}
              title={webSearchEnabled ? '联网搜索已开启：实时检索最新技术考点与方案' : '联网搜索已关闭：点击开启'}
              className={`flex items-center space-x-1.5 rounded-l-lg border px-2.5 py-1.5 text-xs transition ${
                webSearchEnabled
                  ? latestSearchMetadata?.status === 'failed'
                    ? 'border-amber-600/60 bg-amber-950/60 text-amber-300'
                    : 'border-emerald-600/50 bg-emerald-950/50 text-emerald-300'
                  : 'border-gray-700 bg-gray-800/80 text-gray-400 hover:text-gray-200'
              }`}
            >
              <Globe className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">联网搜索: {searchStatusLabel}</span>
              <span className={`h-2 w-2 rounded-full ${
                !webSearchEnabled
                  ? 'bg-gray-500'
                  : latestSearchMetadata?.status === 'failed'
                    ? 'bg-amber-400'
                    : 'bg-emerald-400'
              }`} />
            </button>
            <button
              type="button"
              onClick={() => setSearchConfigOpen(true)}
              title="配置 Tavily 搜索"
              className="rounded-r-lg border border-l-0 border-gray-700 bg-gray-800 px-2 py-1.5 text-gray-400 transition hover:text-emerald-300"
            >
              <Settings2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Action Controls: Pause, Redo, Restart, Finish */}
        <div className="flex items-center space-x-2 text-xs">
          {/* Redo Turn */}
          <button
            type="button"
            onClick={() => {
              if (confirm('确认撤销上一轮问答并重答本题吗？')) {
                onRedoTurn();
              }
            }}
            disabled={isThinking || messages.length < 2}
            title="撤销上一轮作答，重新回答当前问题"
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 transition disabled:opacity-40"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">重答本题</span>
          </button>

          {/* Pause */}
          <button
            type="button"
            onClick={onPauseInterview}
            disabled={isThinking}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-amber-950/50 hover:bg-amber-900/60 border border-amber-800/50 text-amber-300 transition disabled:opacity-40"
          >
            <Pause className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">暂停面试</span>
          </button>

          {/* Restart */}
          <button
            type="button"
            onClick={() => {
              if (confirm('确认重新开始整场面试吗？当前记录将被重置。')) {
                onRestartInterview();
              }
            }}
            disabled={isThinking}
            title="清空当前问答，重新从开场破冰开始"
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-red-950/50 border border-gray-700 hover:border-red-700/50 text-gray-400 hover:text-red-300 transition disabled:opacity-40"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden md:inline">重新开始</span>
          </button>

          {/* Finish */}
          <button
            type="button"
            onClick={onFinishInterview}
            disabled={isThinking}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-300 transition font-medium"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>交卷评估</span>
          </button>
        </div>
      </div>

      {/* Main Panel */}
      {viewMode === 'meeting' ? (
        /* Video Conference Layout */
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-0">
          {/* Main Stage (Left / Top): Active AI Interviewer Feed */}
          <div className="lg:col-span-8 bg-gray-950/80 border border-gray-800 rounded-3xl p-6 relative overflow-hidden flex flex-col justify-between shadow-2xl">
            {/* Background Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

            {/* Stage Header */}
            <div className="flex items-center justify-between z-10">
              <div className="flex items-center space-x-2">
                <span className="text-[10px] uppercase tracking-wider font-mono px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-700/60 text-emerald-400 flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  <span>实时视频面试中</span>
                </span>
                <span
                  className={`text-[11px] px-2.5 py-0.5 rounded-full border font-medium ${activeInterviewerMeta.badgeBg}`}
                >
                  {activeInterviewerMeta.title}
                </span>
              </div>

              <div className="text-[11px] text-gray-500">
                影子观察员静默监听中 ({shadowLogsCount} 轮)
              </div>
            </div>

            {/* Virtual Interviewer Avatar Center Stage */}
            <div className="my-auto flex flex-col items-center justify-center text-center z-10 py-6">
              {/* Dynamic Sound Wave Ring */}
              <div className="relative">
                <div
                  className={`w-28 h-28 sm:w-32 sm:h-32 rounded-3xl bg-gradient-to-tr ${
                    activeInterviewerMeta.gradient
                  } flex items-center justify-center shadow-2xl transition-transform duration-300 ${
                    isSpeaking ? 'scale-105 shadow-blue-500/40 ring-4 ring-blue-500/40' : ''
                  }`}
                >
                  <Bot className="w-14 h-14 sm:w-16 sm:h-16 text-white" />
                </div>

                {/* Animated speech ripple */}
                {isSpeaking && (
                  <div className="absolute inset-0 rounded-3xl border-2 border-blue-400 animate-ping pointer-events-none opacity-50" />
                )}
              </div>

              <h3 className="text-lg font-bold text-white mt-4">{activeInterviewerMeta.title}</h3>
              <p className="text-xs text-gray-400 max-w-sm mt-1 leading-snug">
                {activeInterviewerMeta.sub}
              </p>

              {/* Speaking / Listening State indicator */}
              <div className="mt-3 flex items-center space-x-2 text-xs">
                {isThinking ? (
                  <span className="px-3 py-1 rounded-full bg-blue-900/50 border border-blue-700/50 text-blue-300 animate-pulse">
                    🤔 面试官正在斟酌考题与追问方向...
                  </span>
                ) : isSpeaking ? (
                  <span className="px-3 py-1 rounded-full bg-emerald-900/50 border border-emerald-700/50 text-emerald-300 flex items-center space-x-1.5">
                    <Volume2 className="w-3.5 h-3.5 animate-bounce" />
                    <span>正在语音提问...</span>
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full bg-gray-900 border border-gray-800 text-gray-400 flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    <span>正在倾听候选人作答</span>
                  </span>
                )}
              </div>
            </div>

            {/* Live Floating Subtitles Window */}
            <div className="z-10 bg-gray-900/90 border border-gray-800 rounded-2xl p-3.5 shadow-lg backdrop-blur">
              <div className="text-[10px] text-gray-400 font-semibold mb-1 flex items-center justify-between">
                <span>实时字幕 · 最新提问</span>
                {latestAssistantMessage && (
                  <button
                    onClick={() =>
                      speakText(latestAssistantMessage.content, latestAssistantMessage.name)
                    }
                    className="text-[10px] text-blue-400 hover:underline flex items-center space-x-1"
                  >
                    <Volume2 className="w-3 h-3" />
                    <span>重新朗读</span>
                  </button>
                )}
              </div>
              <div className="text-xs text-gray-100 font-sans leading-relaxed max-h-24 overflow-y-auto whitespace-pre-wrap">
                {latestAssistantMessage?.content || '面试准备就绪，即将开始...'}
              </div>
            </div>

            {/* Candidate PiP Webcam Preview (Bottom-Right) */}
            <div className="absolute bottom-4 right-4 z-20 w-40 h-28 sm:w-48 sm:h-36 bg-gray-900 border-2 border-gray-700 rounded-2xl overflow-hidden shadow-2xl flex flex-col justify-between">
              {isCameraOn ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover transform -scale-x-100"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-gray-950 text-gray-500 text-xs">
                  <User className="w-8 h-8 mb-1" />
                  <span>摄像头已关闭</span>
                </div>
              )}

              {/* Overlay controls on camera PiP */}
              <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between px-2 py-1 rounded-lg bg-black/60 backdrop-blur text-[10px] text-white">
                <span className="truncate">候选人 (你)</span>
                <div className="flex items-center space-x-1">
                  <button
                    type="button"
                    onClick={() => setIsCameraOn(!isCameraOn)}
                    className="p-1 hover:text-blue-400"
                    title={isCameraOn ? '关闭摄像头' : '打开摄像头'}
                  >
                    {isCameraOn ? <Video className="w-3 h-3" /> : <VideoOff className="w-3 h-3 text-red-400" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Dialogue History Log Stream */}
          <div className="lg:col-span-4 bg-gray-950/70 border border-gray-800 rounded-3xl p-3 flex flex-col min-h-0">
            <div className="text-xs font-semibold text-gray-400 mb-2 px-2 flex items-center justify-between">
              <span>问答历史纪录</span>
              <span className="text-[10px] text-gray-500">{messages.length} 条互动</span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {messages.map((msg, index) => {
                const isCandidate = msg.role === 'user';
                const meta = resolveInterviewerMeta(msg.name);
                return (
                  <div
                    key={index}
                    className={`p-3 rounded-xl border text-xs leading-relaxed ${
                      isCandidate
                        ? 'bg-indigo-950/30 border-indigo-800/40 text-indigo-100 ml-4'
                        : `${meta.bubbleBg} mr-4`
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] mb-1 opacity-80">
                      <span className="font-semibold">{isCandidate ? '你 (候选人)' : meta.title}</span>
                      {msg.timestamp && (
                        <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      )}
                    </div>
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                    <SearchSources metadata={msg.search_metadata} compact />
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </div>
        </div>
      ) : (
        /* Classic Chat Feed Layout */
        <div className="flex-1 flex flex-col min-h-0 space-y-3">
          <InterviewerPanel
            currentInterviewer={currentInterviewer}
            isThinking={isThinking}
            shadowLogsCount={shadowLogsCount}
            customPersonas={customPersonas}
            participantRoles={participantRoles}
          />

          <div className="flex-1 bg-gray-950/70 border border-gray-800/80 rounded-2xl p-4 overflow-y-auto space-y-4">
            {messages.map((msg, index) => {
              const isCandidate = msg.role === 'user';
              const meta = resolveInterviewerMeta(msg.name);

              return (
                <div
                  key={index}
                  className={`flex items-start space-x-3 ${
                    isCandidate ? 'flex-row-reverse space-x-reverse' : 'flex-row'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-md ${
                      isCandidate ? 'bg-indigo-600 text-white' : 'bg-gray-800 border border-gray-700 text-gray-300'
                    }`}
                  >
                    {isCandidate ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                  </div>

                  <div
                    className={`max-w-2xl rounded-2xl p-4 border text-sm leading-relaxed ${
                      isCandidate
                        ? 'bg-indigo-950/40 border-indigo-800/50 text-indigo-100 rounded-tr-none'
                        : `${meta.bubbleBg} rounded-tl-none`
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5 space-x-3">
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-md border font-medium ${
                          isCandidate ? 'bg-indigo-900/60 text-indigo-300 border-indigo-700/40' : meta.badgeBg
                        }`}
                      >
                        {isCandidate ? '候选人 (你)' : meta.title}
                      </span>
                      <div className="flex items-center space-x-2">
                        {!isCandidate && (
                          <button
                            type="button"
                            onClick={() => speakText(msg.content, msg.name)}
                            title="语音朗读"
                            className="text-gray-400 hover:text-blue-400 transition"
                          >
                            <Volume2 className="w-3 h-3" />
                          </button>
                        )}
                        {msg.timestamp && (
                          <span className="text-[10px] text-gray-500">
                            {new Date(msg.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="whitespace-pre-wrap font-sans text-[13px]">{msg.content}</div>
                    <SearchSources metadata={msg.search_metadata} />
                  </div>
                </div>
              );
            })}

            {isThinking && (
              <div className="flex items-center space-x-3 text-xs text-gray-400 py-2 px-1 animate-pulse">
                <div className="w-8 h-8 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-blue-400" />
                </div>
                <div className="flex items-center space-x-2 bg-gray-900 border border-gray-800 px-3 py-1.5 rounded-xl">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
                  <span>面试官正在倾听并研讨下一轮提问与评估...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
      )}

      {/* Interactive Input & Multi-modal Action Bar */}
      <div className="mt-3 bg-gray-900/90 border border-gray-800 rounded-3xl p-3 shadow-xl">
        <div className="flex items-center justify-between mb-2 text-xs">
          <div className="flex items-center space-x-2">
            {/* Lifeline Button */}
            <button
              type="button"
              onClick={onRequestLifeline}
              disabled={isThinking || status === 'paused'}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-amber-950/40 hover:bg-amber-900/50 border border-amber-800/40 text-amber-300 transition disabled:opacity-50"
            >
              <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
              <span>求助提示 Lifeline</span>
              {lifelinesUsed > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded bg-amber-900/80 text-[10px] text-amber-200">
                  {lifelinesUsed}次
                </span>
              )}
            </button>

            {/* STT Mic Voice Input Button */}
            <button
              type="button"
              onClick={toggleMic}
              disabled={isThinking || status === 'paused'}
              title={isMicOn ? '点击停止录音' : '点击开启语音识别，边说边转文字'}
              className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border transition ${
                isMicOn
                  ? 'bg-red-950/80 border-red-500 text-red-300 shadow-md shadow-red-950/50 animate-pulse'
                  : 'bg-gray-800 hover:bg-gray-700 border-gray-700 text-gray-300'
              }`}
            >
              {isMicOn ? <Mic className="w-3.5 h-3.5 text-red-400" /> : <MicOff className="w-3.5 h-3.5 text-gray-400" />}
              <span>{isMicOn ? '正在实时录音输入...' : '语音作答 (STT)'}</span>
            </button>

            {/* Simulate Standard Answer Button */}
            <button
              type="button"
              onClick={handleSimulateAnswer}
              disabled={isThinking || isGeneratingAnswer || status === 'paused'}
              title="如果不知道如何回答，点击此按钮让大模型根据上下文与岗位要求构思标准示范回答并填入输入框"
              className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border transition shadow-sm ${
                isGeneratingAnswer
                  ? 'bg-indigo-900/80 border-indigo-500 text-indigo-200 animate-pulse'
                  : 'bg-indigo-950/40 hover:bg-indigo-900/60 border-indigo-700/50 text-indigo-300 hover:text-indigo-100'
              } disabled:opacity-50`}
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>{isGeneratingAnswer ? '正在构思金牌回答...' : '模拟标准回答'}</span>
            </button>
          </div>

          <div className="text-[11px] text-gray-500 hidden md:inline">
            按 <kbd className="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700">Enter</kbd> 发送，
            <kbd className="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700">Shift+Enter</kbd> 换行
          </div>
        </div>

        {/* Simulate Answer Notification Banner */}
        {simulateAnswerNotification && (
          <div className="mb-2 rounded-xl border border-indigo-700/50 bg-indigo-950/70 px-3 py-2 text-xs text-indigo-200 shadow-md animate-fadeIn">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                <span className="leading-snug">{simulateAnswerNotification}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSimulateAnswerNotification(null);
                  setSimulateSearchMetadata(null);
                }}
                className="ml-2 rounded px-1.5 py-0.5 text-xs text-indigo-400 hover:text-indigo-100"
                title="关闭提示"
              >
                ✕
              </button>
            </div>
            <SearchSources metadata={simulateSearchMetadata} compact />
          </div>
        )}

        {/* Text Input Area */}
        <div className="relative">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              status === 'paused'
                ? '面试已暂停，请点击顶部“继续面试”...'
                : isThinking
                ? '面试官正在发言或评估中，请稍候...'
                : isMicOn
                ? '正在聆听您的声音，将自动转为文字输入...'
                : '输入你的回答或方案阐述... (支持语音输入)'
            }
            disabled={isThinking || status === 'paused'}
            rows={3}
            className="w-full bg-gray-950 border border-gray-800 rounded-2xl p-3 pr-24 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none font-sans leading-relaxed disabled:opacity-50"
          />

          <button
            type="button"
            onClick={() => handleSend()}
            disabled={!inputText.trim() || isThinking || status === 'paused'}
            className="absolute bottom-3 right-3 inline-flex items-center space-x-1 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
          >
            <span>提交回答</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <SearchConfigModal open={searchConfigOpen} onClose={() => setSearchConfigOpen(false)} />
    </div>
  );
};
