import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Lightbulb,
  CheckCircle2,
  Bot,
  User,
  Mic,
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
  Settings2,
  ArrowLeft,
  Copy,
  Check,
  Clock,
  Code2,
  Terminal,
  X,
} from 'lucide-react';
import type { Message, SearchMetadata, SimulateAnswerResult } from '../types';
import { InterviewerPanel } from './InterviewerPanel';
import { SearchConfigModal } from './SearchConfigModal';
import { SearchSources } from './SearchSources';
import { getInterviewerMeta } from '../utils/interviewers';
import type { PersonaDisplayInfo } from '../utils/interviewers';
import { useTheme } from '../context/ThemeContext';

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
  /** 本场面试语言：zh | en，决定 STT/TTS 使用的语音 */
  language?: string;
  customPersonas?: PersonaDisplayInfo[];
  /** 本场实际出场的面试官角色 key 列表，席位只展示这些成员 */
  participantRoles?: string[];
  onSendMessage: (text: string, code?: string, codeLanguage?: string) => void;
  onRequestLifeline: () => void;
  onFinishInterview: () => void;
  onPauseInterview: () => void;
  onResumeInterview: () => void;
  onRedoTurn: () => void;
  onRestartInterview: () => void;
  onToggleWebSearch: () => void;
  onSimulateAnswer: () => Promise<SimulateAnswerResult | void>;
  /** 计时器秒数，支持外部传入 */
  elapsedSeconds?: number;
  /** 紧急退出 / 返回控制台回调 */
  onEmergencyExit?: () => void;
}

// 环节徽章双态配色（完整类名字面量，便于 Tailwind 静态提取）
const BADGE_BLUE = 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/30';
const BADGE_INDIGO = 'bg-indigo-50 text-indigo-600 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/30';
const BADGE_CYAN = 'bg-cyan-50 text-cyan-600 border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-400 dark:border-cyan-500/30';
const BADGE_EMERALD = 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30';
const BADGE_AMBER = 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30';
const BADGE_PURPLE = 'bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/30';
const BADGE_RED = 'bg-red-50 text-red-600 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30';
const BADGE_PINK = 'bg-pink-50 text-pink-600 border-pink-200 dark:bg-pink-500/10 dark:text-pink-400 dark:border-pink-500/30';

const STAGE_LABELS: Record<string, { label: string; badge: string }> = {
  opening: { label: '环节 1/6 · 开场破冰', badge: BADGE_BLUE },
  self_intro: { label: '环节 1/6 · 自我介绍', badge: BADGE_BLUE },
  resume_deep_dive: { label: '环节 2/6 · 简历深挖', badge: BADGE_INDIGO },
  technical: { label: '环节 3/6 · 技术广度与深度', badge: BADGE_CYAN },
  system_design: { label: '环节 4/6 · 架构与方案设计', badge: BADGE_EMERALD },
  coding: { label: '环节 4/6 · 现场机试与手撕代码', badge: BADGE_AMBER },
  behavioral: { label: '环节 5/6 · STAR 行为与协同', badge: BADGE_PURPLE },
  pressure: { label: '环节 5/6 · 极限挑战与高压容灾', badge: BADGE_RED },
  candidate_qa: { label: '环节 6/6 · 候选人反问', badge: BADGE_PINK },
  wrapup: { label: '尾声 · 面试复盘与结语', badge: BADGE_EMERALD },
};

const CODE_TEMPLATES: Record<string, Record<string, string>> = {
  python: {
    '二分查找 (Binary Search)': `def binary_search(nums: list[int], target: int) -> int:
    left, right = 0, len(nums) - 1
    while left <= right:
        mid = (left + right) // 2
        if nums[mid] == target:
            return mid
        elif nums[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1`,
    '广度优先搜索 (BFS)': `from collections import deque

def bfs(root) -> list[list[int]]:
    if not root:
        return []
    res, queue = [], deque([root])
    while queue:
        level = []
        for _ in range(len(queue)):
            node = queue.popleft()
            level.append(node.val)
            if node.left:
                queue.append(node.left)
            if node.right:
                queue.append(node.right)
        res.append(level)
    return res`,
    '双指针 (Two Pointers)': `def two_sum(numbers: list[int], target: int) -> list[int]:
    left, right = 0, len(numbers) - 1
    while left < right:
        s = numbers[left] + numbers[right]
        if s == target:
            return [left + 1, right + 1]
        elif s < target:
            left += 1
        else:
            right -= 1
    return [-1, -1]`,
    'LRU 缓存 (LRU Cache)': `class DLinkedNode:
    def __init__(self, key=0, value=0):
        self.key = key
        self.value = value
        self.prev = None
        self.next = None

class LRUCache:
    def __init__(self, capacity: int):
        self.cache = dict()
        self.head = DLinkedNode()
        self.tail = DLinkedNode()
        self.head.next = self.tail
        self.tail.prev = self.head
        self.capacity = capacity
        self.size = 0`,
  },
  go: {
    '二分查找 (Binary Search)': `func search(nums []int, target int) int {
    left, right := 0, len(nums)-1
    for left <= right {
        mid := left + (right-left)/2
        if nums[mid] == target {
            return mid
        } else if nums[mid] < target {
            left = mid + 1
        } else {
            right = mid - 1
        }
    }
    return -1
}`,
    '双指针 (Two Pointers)': `func twoSum(numbers []int, target int) []int {
    left, right := 0, len(numbers)-1
    for left < right {
        sum := numbers[left] + numbers[right]
        if sum == target {
            return []int{left + 1, right + 1}
        } else if sum < target {
            left++
        } else {
            right--
        }
    }
    return []int{-1, -1}
}`,
  },
  java: {
    '二分查找 (Binary Search)': `public int binarySearch(int[] nums, int target) {
    int left = 0, right = nums.length - 1;
    while (left <= right) {
        int mid = left + (right - left) / 2;
        if (nums[mid] == target) {
            return mid;
        } else if (nums[mid] < target) {
            left = mid + 1;
        } else {
            right = mid - 1;
        }
    }
    return -1;
}`,
  },
  cpp: {
    '二分查找 (Binary Search)': `int search(vector<int>& nums, int target) {
    int left = 0, right = nums.size() - 1;
    while (left <= right) {
        int mid = left + (right - left) / 2;
        if (nums[mid] == target) return mid;
        if (nums[mid] < target) left = mid + 1;
        else right = mid - 1;
    }
    return -1;
}`,
  },
  typescript: {
    '二分查找 (Binary Search)': `function search(nums: number[], target: number): number {
    let left = 0, right = nums.length - 1;
    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        if (nums[mid] === target) return mid;
        if (nums[mid] < target) left = mid + 1;
        else right = mid - 1;
    }
    return -1;
}`,
  },
  javascript: {
    '二分查找 (Binary Search)': `function search(nums, target) {
    let left = 0, right = nums.length - 1;
    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        if (nums[mid] === target) return mid;
        if (nums[mid] < target) left = mid + 1;
        else right = mid - 1;
    }
    return -1;
}`,
  },
  sql: {
    '分组统计与过滤 (Group & Having)': `SELECT department_id, COUNT(*) AS employee_count, AVG(salary) AS avg_salary
FROM employees
WHERE status = 'active'
GROUP BY department_id
HAVING COUNT(*) >= 5
ORDER BY avg_salary DESC;`,
  },
};

export const InterviewRoom: React.FC<InterviewRoomProps> = ({
  sessionId: _sessionId,
  stage,
  currentInterviewer,
  messages,
  status,
  lifelinesUsed,
  isThinking,
  shadowLogsCount,
  webSearchEnabled,
  language = 'zh',
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
  elapsedSeconds,
  onEmergencyExit,
}) => {
  const { isDark } = useTheme();
  const [inputText, setInputText] = useState('');
  const [viewMode, setViewMode] = useState<'meeting' | 'chat'>('chat');
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [isTTSActive, setIsTTSActive] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isGeneratingAnswer, setIsGeneratingAnswer] = useState(false);
  const [simulateAnswerNotification, setSimulateAnswerNotification] = useState<string | null>(null);
  const [simulateSearchMetadata, setSimulateSearchMetadata] = useState<SearchMetadata | null>(null);
  const [searchConfigOpen, setSearchConfigOpen] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // 现场机试 / 手撕代码工作台状态
  const [isCodingOpen, setIsCodingOpen] = useState(false);
  const [codingLanguage, setCodingLanguage] = useState('python');
  const [codingThoughts, setCodingThoughts] = useState('');
  const [timeComplexity, setTimeComplexity] = useState('O(N)');
  const [spaceComplexity, setSpaceComplexity] = useState('O(1)');
  const [codingSnippet, setCodingSnippet] = useState(
    CODE_TEMPLATES.python['二分查找 (Binary Search)']
  );
  const [selectedTemplateKey, setSelectedTemplateKey] = useState('二分查找 (Binary Search)');

  // Fallback internal timer if elapsedSeconds is not supplied
  const [localElapsed, setLocalElapsed] = useState(0);
  useEffect(() => {
    if (elapsedSeconds !== undefined) return;
    if (status === 'paused') return;
    const timer = setInterval(() => {
      setLocalElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [status, elapsedSeconds]);

  const currentElapsed = elapsedSeconds !== undefined ? elapsedSeconds : localElapsed;

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${remMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStageMeta = (s: string) => {
    return STAGE_LABELS[s] || { label: `当前环节 · ${s}`, badge: BADGE_BLUE };
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);

  // 语音语言跟随面试语言：英语面试用 en-US，其余用 zh-CN
  const sttLang = language === 'en' ? 'en-US' : 'zh-CN';

  // Initialize Speech Recognition (STT)
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = sttLang;

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

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore
        }
        recognitionRef.current = null;
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    if (recognitionRef.current) {
      recognitionRef.current.lang = sttLang;
    }
  }, [sttLang]);

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
    const cleanText = text.replace(/[*#`_[\]()]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = sttLang;

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
        setSimulateAnswerNotification('✨ AI 已根据上下文与岗位要求为您构思了金牌回答，您可直接微调或点击【提交回答】！');
      }
    } catch (err) {
      console.error('Failed to simulate answer:', err);
    } finally {
      setIsGeneratingAnswer(false);
    }
  };

  const handleCopyText = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 1800);
  };

  // Get interviewer visual meta
  const resolveInterviewerMeta = (name?: string) => getInterviewerMeta(name, customPersonas);

  const activeInterviewerMeta = resolveInterviewerMeta(currentInterviewer);
  const latestAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant');
  const latestSearchMetadata = [...messages]
    .reverse()
    .find((message) => message.search_metadata)?.search_metadata;
  const searchStatusLabel = !webSearchEnabled
    ? '关闭'
    : latestSearchMetadata?.status === 'success'
      ? '成功'
      : latestSearchMetadata?.status === 'failed'
        ? '失败'
        : '开启';

  // 现场机试与手撕代码辅助处理函数
  const handleCodeKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const value = textarea.value;
      const newValue = value.substring(0, start) + '    ' + value.substring(end);
      setCodingSnippet(newValue);
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 4;
      }, 0);
    }
  };

  const handleLanguageChange = (newLang: string) => {
    setCodingLanguage(newLang);
    const templates = CODE_TEMPLATES[newLang];
    if (templates) {
      const firstKey = Object.keys(templates)[0];
      setSelectedTemplateKey(firstKey);
      setCodingSnippet(templates[firstKey]);
    } else {
      setSelectedTemplateKey('');
      setCodingSnippet('// 在此编写你的核心实现代码\n');
    }
  };

  const handleApplyTemplate = (tplKey: string) => {
    setSelectedTemplateKey(tplKey);
    const tpl = CODE_TEMPLATES[codingLanguage]?.[tplKey];
    if (tpl) {
      setCodingSnippet(tpl);
    }
  };

  const buildFormattedAnswer = () => {
    const parts: string[] = [];
    if (codingThoughts.trim()) {
      parts.push(`【解题思路】：\n${codingThoughts.trim()}`);
    }
    const complexities: string[] = [];
    if (timeComplexity.trim()) complexities.push(`时间复杂度：${timeComplexity.trim()}`);
    if (spaceComplexity.trim()) complexities.push(`空间复杂度：${spaceComplexity.trim()}`);
    if (complexities.length > 0) {
      parts.push(`【复杂度分析】：\n${complexities.join('，')}`);
    }
    parts.push(`【核心实现代码 (${codingLanguage})】：\n\`\`\`${codingLanguage}\n${codingSnippet.trim()}\n\`\`\``);
    return parts.join('\n\n');
  };

  const handleCodingFillToInput = () => {
    const formatted = buildFormattedAnswer();
    setInputText(formatted);
    setIsCodingOpen(false);
  };

  const handleCodingDirectSubmit = () => {
    if (!codingSnippet.trim() || isThinking || status === 'paused') return;
    const formatted = buildFormattedAnswer();
    onSendMessage(formatted, codingSnippet.trim(), codingLanguage);
    setIsCodingOpen(false);
  };

  const isCodingSuggested =
    stage === 'coding' ||
    Boolean(
      latestAssistantMessage?.content &&
        /(代码|算法|手撕|编程|实现|复杂度|函数|LeetCode|白板|写一段|手写)/i.test(
          latestAssistantMessage.content
        )
    );

  const renderMessageContent = (content: string, code?: string, codeLang?: string) => {
    if (code) {
      return (
        <div className="space-y-3">
          {content && <div className="whitespace-pre-wrap font-sans text-[13px]">{content}</div>}
          <div className="rounded-xl overflow-hidden border border-line-default bg-[#0d1117] text-gray-200">
            <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-gray-800 text-[11px] text-gray-400 font-mono">
              <span className="font-semibold text-amber-400 uppercase flex items-center space-x-1.5">
                <Code2 className="w-3.5 h-3.5 text-amber-400" />
                <span>{codeLang || 'CODE'}</span>
              </span>
              <button
                type="button"
                onClick={() => handleCopyText(code, -99)}
                className="flex items-center space-x-1 hover:text-white transition cursor-pointer"
              >
                {copiedIndex === -99 ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedIndex === -99 ? '已复制' : '复制代码'}</span>
              </button>
            </div>
            <pre className="p-3 text-xs font-mono overflow-x-auto leading-relaxed text-emerald-300 selection:bg-blue-600">
              <code>{code}</code>
            </pre>
          </div>
        </div>
      );
    }

    if (content.includes('```')) {
      const parts = content.split(/(```[\s\S]*?```)/g);
      return (
        <div className="space-y-2">
          {parts.map((part, pIdx) => {
            if (part.startsWith('```') && part.endsWith('```')) {
              const lines = part.slice(3, -3).trimStart();
              const firstNewline = lines.indexOf('\n');
              const lang = firstNewline !== -1 ? lines.slice(0, firstNewline).trim() : '';
              const codeBody = firstNewline !== -1 ? lines.slice(firstNewline + 1) : lines;
              return (
                <div key={pIdx} className="rounded-xl overflow-hidden border border-line-default bg-[#0d1117] text-gray-200 my-2">
                  <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-gray-800 text-[11px] text-gray-400 font-mono">
                    <span className="font-semibold text-amber-400 uppercase flex items-center space-x-1.5">
                      <Code2 className="w-3.5 h-3.5 text-amber-400" />
                      <span>{lang || 'CODE'}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyText(codeBody, -100 - pIdx)}
                      className="flex items-center space-x-1 hover:text-white transition cursor-pointer"
                    >
                      {copiedIndex === -100 - pIdx ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedIndex === -100 - pIdx ? '已复制' : '复制代码'}</span>
                    </button>
                  </div>
                  <pre className="p-3 text-xs font-mono overflow-x-auto leading-relaxed text-emerald-300 selection:bg-blue-600">
                    <code>{codeBody}</code>
                  </pre>
                </div>
              );
            }
            return part.trim() ? (
              <div key={pIdx} className="whitespace-pre-wrap font-sans text-[13px]">{part}</div>
            ) : null;
          })}
        </div>
      );
    }

    return <div className="whitespace-pre-wrap font-sans text-[13px]">{content}</div>;
  };

  return (
    <div className="h-screen w-full flex flex-col bg-app text-content-primary overflow-hidden relative selection:bg-blue-600 selection:text-white">
      {/* Ambient tech glow & dot grid texture: dark keeps immersive layers, light uses a barely-there grid */}
      {isDark ? (
        <>
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/15 via-slate-950/60 to-[#080B11] -z-10" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#3b82f608_1px,transparent_1px),linear-gradient(to_bottom,#3b82f608_1px,transparent_1px)] bg-[size:3rem_3rem] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none -z-10" />
        </>
      ) : (
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(37,99,235,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(37,99,235,0.04)_1px,transparent_1px)] bg-[size:3rem_3rem] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none -z-10" />
      )}

      {/* 0. Paused Overlay */}
      {status === 'paused' && (
        <div className="absolute inset-0 z-50 bg-app/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-fadeIn">
          <div className="w-16 h-16 rounded-3xl bg-status-warning-bg border border-status-warning-border flex items-center justify-center text-status-warning mb-4 shadow-xl">
            <Pause className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-content-primary mb-2">模拟面试已暂停</h2>
          <p className="text-xs text-content-secondary max-w-sm mb-6 leading-relaxed">
            面试计时已冻结，会话上下文已完整留存。您可以稍作深呼吸或梳理思路，随时继续作答。
          </p>
          <button
            onClick={onResumeInterview}
            className="inline-flex items-center space-x-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-lg transition active:scale-95 cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>继续进行面试</span>
          </button>
        </div>
      )}

      {/* 1. Floating Top Focus Bar */}
      <header className="w-full shrink-0 z-30 px-3 pt-2 pb-1">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 px-4 py-2 rounded-2xl bg-surface-header backdrop-blur-xl border border-line-default shadow-lg">
          {/* Left: Exit/Back + Stage & Status badge */}
          <div className="flex items-center space-x-2.5">
            {onEmergencyExit && (
              <button
                type="button"
                onClick={() => {
                  if (confirm('确认暂时退出模拟面试并返回工作台吗？面试进度将自动保留。')) {
                    onEmergencyExit();
                  }
                }}
                title="退出沉浸模式并返回控制台"
                className="p-1.5 rounded-xl text-content-secondary hover:text-content-primary hover:bg-surface-hover transition cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}

            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold tracking-tight text-content-primary flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                <span>模拟面试</span>
              </span>
              <span className={`text-[11px] px-2.5 py-0.5 rounded-full border font-medium ${getStageMeta(stage).badge}`}>
                {getStageMeta(stage).label}
              </span>
            </div>
          </div>

          {/* Center: Monospace Timer with Pulsing Status */}
          <div className="hidden sm:flex items-center space-x-2 px-3 py-1 rounded-xl bg-surface-subtle border border-line-subtle">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <Clock className="w-3.5 h-3.5 text-content-muted" />
            <span className="font-mono text-sm font-semibold tracking-wider text-content-primary">
              {formatTimer(currentElapsed)}
            </span>
            <span className="text-[10px] text-content-muted border-l border-line-default pl-2">
              {status === 'paused' ? '已暂停' : '对练中'}
            </span>
          </div>

          {/* Right Controls: Mode Toggle, TTS, Web Search, Actions */}
          <div className="flex items-center space-x-1.5 sm:space-x-2">
            {/* Dual-mode Switch */}
            <div className="flex bg-surface-subtle p-0.5 rounded-xl border border-line-subtle">
              <button
                type="button"
                onClick={() => setViewMode('meeting')}
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                  viewMode === 'meeting'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-content-secondary hover:text-content-primary'
                }`}
              >
                <Tv className="w-3.5 h-3.5" />
                <span className="hidden md:inline">视频会议</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('chat')}
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                  viewMode === 'chat'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-content-secondary hover:text-content-primary'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span className="hidden md:inline">经典对话</span>
              </button>
            </div>

            {/* TTS Toggle */}
            <button
              type="button"
              onClick={() => {
                setIsTTSActive(!isTTSActive);
                if (isTTSActive) window.speechSynthesis.cancel();
              }}
              title={isTTSActive ? '面试官语音朗读已开启' : '面试官语音已静音'}
              className={`flex items-center space-x-1 px-2 py-1 rounded-lg border text-xs transition cursor-pointer ${
                isTTSActive
                  ? 'bg-brand-subtle border-line-focus text-brand-primary'
                  : 'bg-surface-hover border-line-default text-content-secondary'
              }`}
            >
              {isTTSActive ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </button>

            {/* Web Search */}
            <div className="flex items-center">
              <button
                type="button"
                onClick={onToggleWebSearch}
                title={webSearchEnabled ? `联网搜索已开启 (${searchStatusLabel})：实时检索最新技术考点与方案` : '联网搜索已关闭：点击开启'}
                className={`flex items-center space-x-1.5 rounded-l-lg border px-2 py-1 text-xs transition cursor-pointer ${
                  webSearchEnabled
                    ? latestSearchMetadata?.status === 'failed'
                      ? 'border-status-warning-border bg-status-warning-bg text-status-warning'
                      : 'border-status-success-border bg-status-success-bg text-status-success'
                    : 'border-line-default bg-surface-hover text-content-secondary hover:text-content-primary'
                }`}
              >
                <Globe className="h-3.5 w-3.5" />
                <span className={`h-1.5 w-1.5 rounded-full ${
                  !webSearchEnabled
                    ? 'bg-slate-400 dark:bg-slate-500'
                    : latestSearchMetadata?.status === 'failed'
                      ? 'bg-amber-500 dark:bg-amber-400'
                      : 'bg-emerald-500 dark:bg-emerald-400'
                }`} />
              </button>
              <button
                type="button"
                onClick={() => setSearchConfigOpen(true)}
                title="配置 Tavily 搜索"
                className="rounded-r-lg border border-l-0 border-line-default bg-surface-hover px-1.5 py-1 text-content-secondary transition hover:text-status-success cursor-pointer"
              >
                <Settings2 className="h-3.5 w-3.5" />
              </button>
            </div>

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
              className="p-1.5 rounded-lg bg-surface-hover hover:bg-surface-active border border-line-default text-content-secondary hover:text-content-primary transition disabled:opacity-40 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            {/* Pause/Resume */}
            <button
              type="button"
              onClick={status === 'paused' ? onResumeInterview : onPauseInterview}
              disabled={isThinking}
              title={status === 'paused' ? '继续面试' : '暂停面试'}
              className="p-1.5 rounded-lg bg-status-warning-bg hover:bg-amber-500/25 border border-status-warning-border text-status-warning transition disabled:opacity-40 cursor-pointer"
            >
              {status === 'paused' ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5" />}
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
              className="p-1.5 rounded-lg bg-surface-hover border border-line-default text-content-secondary transition hover:bg-red-500/10 hover:border-status-danger-border hover:text-status-danger disabled:opacity-40 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            {/* Finish CTA */}
            <button
              type="button"
              onClick={onFinishInterview}
              disabled={isThinking}
              className="flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20 transition active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>交卷评估</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. Main Stage Area */}
      <main className="flex-1 min-h-0 w-full max-w-7xl mx-auto px-3 py-1 flex flex-col overflow-hidden">
        {viewMode === 'meeting' ? (
          /* Video Conference Layout */
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-0">
            {/* Main Stage (Left / Top): Active AI Interviewer Feed */}
            <div className="lg:col-span-8 bg-surface border border-line-subtle rounded-3xl p-5 relative overflow-hidden flex flex-col justify-between shadow-lg">
              {/* Background Glow (dark only) */}
              {isDark && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
              )}

              {/* Stage Header */}
              <div className="flex items-center justify-between z-10">
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] uppercase tracking-wider font-mono px-2.5 py-1 rounded-full bg-status-success-bg border border-status-success-border text-status-success flex items-center space-x-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    <span>实时连线中</span>
                  </span>
                  <span
                    className={`text-[11px] px-2.5 py-0.5 rounded-full border font-medium ${activeInterviewerMeta.badgeBg}`}
                  >
                    {activeInterviewerMeta.title}
                  </span>
                </div>

                <div className="text-[11px] text-content-muted">
                  影子观察员静默监听中 ({shadowLogsCount} 轮)
                </div>
              </div>

              {/* Virtual Interviewer Avatar Center Stage */}
              <div className="my-auto flex flex-col items-center justify-center text-center z-10 py-4">
                {/* Dynamic Sound Wave Ring */}
                <div className="relative">
                  <div
                    className={`w-32 h-32 sm:w-36 sm:h-36 rounded-3xl bg-gradient-to-tr ${
                      activeInterviewerMeta.gradient
                    } flex items-center justify-center shadow-2xl transition-all duration-300 ${
                      isSpeaking ? 'scale-105 shadow-blue-500/40 ring-4 ring-blue-500/50' : ''
                    }`}
                  >
                    <Bot className="w-16 h-16 sm:w-20 sm:h-20 text-white drop-shadow-md" />
                  </div>

                  {/* Animated speech ripple */}
                  {isSpeaking && (
                    <>
                      <div className="absolute -inset-2 rounded-3xl border-2 border-blue-400/60 animate-ping pointer-events-none" />
                      <div className="absolute -inset-5 rounded-3xl border border-blue-500/30 animate-pulse pointer-events-none" />
                    </>
                  )}
                </div>

                <h3 className="text-lg font-bold text-content-primary mt-4">{activeInterviewerMeta.title}</h3>
                <p className="text-xs text-content-secondary max-w-md mt-1 leading-snug">
                  {activeInterviewerMeta.sub}
                </p>

                {/* Speaking / Listening State indicator */}
                <div className="mt-3.5 flex items-center space-x-2 text-xs">
                  {isThinking ? (
                    <span className="px-3.5 py-1.5 rounded-full bg-brand-subtle border border-line-focus text-brand-primary flex items-center space-x-2 shadow-lg shadow-blue-900/10">
                      <div className="flex items-center space-x-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 dot-bounce-1" />
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 dot-bounce-2" />
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 dot-bounce-3" />
                      </div>
                      <span>面试官正在斟酌考题与追问方向...</span>
                    </span>
                  ) : isSpeaking ? (
                    <span className="px-3.5 py-1.5 rounded-full bg-status-success-bg border border-status-success-border text-status-success flex items-center space-x-2 shadow-lg shadow-emerald-900/10">
                      <div className="flex items-center space-x-0.5 h-3">
                        <span className="w-0.5 h-full bg-emerald-400 rounded-full wave-bar-1" />
                        <span className="w-0.5 h-full bg-emerald-400 rounded-full wave-bar-2" />
                        <span className="w-0.5 h-full bg-emerald-400 rounded-full wave-bar-3" />
                        <span className="w-0.5 h-full bg-emerald-400 rounded-full wave-bar-4" />
                        <span className="w-0.5 h-full bg-emerald-400 rounded-full wave-bar-5" />
                      </div>
                      <span>正在语音提问中...</span>
                    </span>
                  ) : (
                    <span className="px-3.5 py-1.5 rounded-full bg-surface-elevated border border-line-default text-content-secondary flex items-center space-x-2">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                      </span>
                      <span>正在倾听候选人作答</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Live Floating Subtitles Window */}
              <div className="z-10 bg-surface-subtle border border-line-subtle rounded-2xl p-3.5 shadow-sm">
                <div className="text-[10px] text-content-secondary font-semibold mb-1 flex items-center justify-between">
                  <span className="flex items-center space-x-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    <span>实时字幕 · 最新提问</span>
                  </span>
                  {latestAssistantMessage && (
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleCopyText(latestAssistantMessage.content, -1)}
                        className="text-[10px] text-content-muted hover:text-content-primary flex items-center space-x-1 transition cursor-pointer"
                      >
                        {copiedIndex === -1 ? <Check className="w-3 h-3 text-emerald-500 dark:text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedIndex === -1 ? '已复制' : '复制题目'}</span>
                      </button>
                      <button
                        onClick={() =>
                          speakText(latestAssistantMessage.content, latestAssistantMessage.name)
                        }
                        className="text-[10px] text-brand-primary hover:opacity-80 flex items-center space-x-1 transition cursor-pointer"
                      >
                        <Volume2 className="w-3 h-3" />
                        <span>重新朗读</span>
                      </button>
                    </div>
                  )}
                </div>
                <div className="text-xs text-content-primary font-sans leading-relaxed max-h-24 overflow-y-auto whitespace-pre-wrap selection:bg-blue-600">
                  {latestAssistantMessage?.content || '面试准备就绪，即将开始...'}
                </div>
              </div>

              {/* Candidate PiP Webcam Preview (Bottom-Right) */}
              <div className="absolute bottom-4 right-4 z-20 w-40 h-28 sm:w-48 sm:h-36 bg-surface-subtle border-2 border-line-default rounded-2xl overflow-hidden shadow-2xl flex flex-col justify-between">
                {isCameraOn ? (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover transform -scale-x-100"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-surface-subtle text-content-muted text-xs">
                    <User className="w-8 h-8 mb-1" />
                    <span>摄像头已关闭</span>
                  </div>
                )}

                {/* Overlay controls on camera PiP */}
                <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between px-2 py-1 rounded-lg bg-black/70 backdrop-blur text-[10px] text-white">
                  <span className="truncate">候选人 (你)</span>
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => setIsCameraOn(!isCameraOn)}
                      className="p-1 hover:text-blue-400 transition cursor-pointer"
                      title={isCameraOn ? '关闭摄像头' : '打开摄像头'}
                    >
                      {isCameraOn ? <Video className="w-3 h-3" /> : <VideoOff className="w-3 h-3 text-red-400" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Dialogue History Log Stream */}
            <div className="lg:col-span-4 bg-surface border border-line-subtle rounded-3xl p-3.5 flex flex-col min-h-0 shadow-lg">
              <div className="text-xs font-semibold text-content-secondary mb-2 px-1 flex items-center justify-between">
                <span>问答历史纪录</span>
                <span className="text-[10px] text-content-muted">{messages.length} 条互动</span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {messages.map((msg, index) => {
                  const isCandidate = msg.role === 'user';
                  const meta = resolveInterviewerMeta(msg.name);
                  return (
                    <div
                      key={index}
                      className={`p-3 rounded-xl border text-xs leading-relaxed transition ${
                        isCandidate
                          ? 'bg-blue-50 border-blue-200 text-slate-800 ml-4 dark:bg-blue-600/10 dark:border-blue-500/30 dark:text-blue-100'
                          : `${meta.bubbleBg} mr-4`
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] mb-1 opacity-80">
                        <span className="font-semibold">{isCandidate ? '你 (候选人)' : meta.title}</span>
                        <div className="flex items-center space-x-1.5">
                          <button
                            type="button"
                            onClick={() => handleCopyText(msg.content, index)}
                            title="复制内容"
                            className="text-content-muted hover:text-content-primary transition cursor-pointer"
                          >
                            {copiedIndex === index ? <Check className="w-2.5 h-2.5 text-emerald-500 dark:text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                          </button>
                          {msg.timestamp && (
                            <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          )}
                        </div>
                      </div>
                      {renderMessageContent(msg.content, msg.code, msg.code_language)}
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
          <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col min-h-0 space-y-2">
            <InterviewerPanel
              currentInterviewer={currentInterviewer}
              isThinking={isThinking}
              shadowLogsCount={shadowLogsCount}
              customPersonas={customPersonas}
              participantRoles={participantRoles}
            />

            <div className="flex-1 bg-surface border border-line-subtle rounded-2xl p-4 overflow-y-auto space-y-4 shadow-lg">
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
                        isCandidate ? 'bg-blue-600 text-white' : 'bg-surface-hover border border-line-default text-content-secondary'
                      }`}
                    >
                      {isCandidate ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                    </div>

                    <div
                      className={`max-w-2xl rounded-2xl p-4 border text-sm leading-relaxed ${
                        isCandidate
                          ? 'bg-blue-50 border-blue-200 text-slate-800 rounded-tr-none dark:bg-blue-600/15 dark:border-blue-500/30 dark:text-slate-100'
                          : `${meta.bubbleBg} rounded-tl-none`
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5 space-x-3">
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-md border font-medium ${
                            isCandidate
                              ? 'bg-blue-100/80 text-blue-700 border-blue-200 dark:bg-blue-900/60 dark:text-blue-300 dark:border-blue-700/40'
                              : meta.badgeBg
                          }`}
                        >
                          {isCandidate ? '候选人 (你)' : meta.title}
                        </span>
                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => handleCopyText(msg.content, index)}
                            title="复制内容"
                            className="text-content-muted hover:text-content-primary transition cursor-pointer"
                          >
                            {copiedIndex === index ? (
                              <Check className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                          {!isCandidate && (
                            <button
                              type="button"
                              onClick={() => speakText(msg.content, msg.name)}
                              title="语音朗读"
                              className="text-content-muted hover:text-brand-primary transition cursor-pointer"
                            >
                              <Volume2 className="w-3 h-3" />
                            </button>
                          )}
                          {msg.timestamp && (
                            <span className="text-[10px] text-content-muted">
                              {new Date(msg.timestamp).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })}
                            </span>
                          )}
                        </div>
                      </div>

                      {renderMessageContent(msg.content, msg.code, msg.code_language)}
                      <SearchSources metadata={msg.search_metadata} />
                    </div>
                  </div>
                );
              })}

              {/* AI Thinking Animation with 3 Bouncing Dots */}
              {isThinking && (
                <div className="flex items-center space-x-3 py-2 px-1 animate-fadeIn">
                  <div className="w-9 h-9 rounded-xl bg-surface-hover border border-line-default flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-brand-primary" />
                  </div>
                  <div className="bg-surface-elevated border border-line-subtle rounded-2xl rounded-tl-none px-4 py-3 shadow-lg flex items-center space-x-3">
                    <div className="flex items-center space-x-1">
                      <span className="w-2 h-2 rounded-full bg-blue-400 dot-bounce-1" />
                      <span className="w-2 h-2 rounded-full bg-indigo-400 dot-bounce-2" />
                      <span className="w-2 h-2 rounded-full bg-cyan-400 dot-bounce-3" />
                    </div>
                    <span className="text-xs text-content-secondary font-medium">
                      {activeInterviewerMeta.title} 正在评估上一轮作答并组织针对性提问...
                    </span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>
        )}
      </main>

      {/* 3. Interactive Input & Multi-modal Action Bar */}
      <footer className="w-full shrink-0 z-30 px-3 pb-3">
        <div className="max-w-4xl mx-auto bg-surface-header backdrop-blur-xl border border-line-default rounded-3xl p-3 shadow-lg">
          <div className="flex items-center justify-between mb-2 text-xs">
            <div className="flex items-center space-x-2">
              {/* Lifeline Button */}
              <button
                type="button"
                onClick={onRequestLifeline}
                disabled={isThinking || status === 'paused'}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-status-warning-bg hover:bg-amber-500/25 border border-status-warning-border text-status-warning transition disabled:opacity-50 cursor-pointer"
              >
                <Lightbulb className="w-3.5 h-3.5 text-status-warning" />
                <span>求助提示 Lifeline</span>
                {lifelinesUsed > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded bg-amber-100 text-amber-700 text-[10px] dark:bg-amber-900/80 dark:text-amber-200">
                    {lifelinesUsed}次
                  </span>
                )}
              </button>

              {/* STT Mic Voice Input Button with Pulsing Wave Indicator */}
              <button
                type="button"
                onClick={toggleMic}
                disabled={isThinking || status === 'paused'}
                title={isMicOn ? '点击停止录音' : '点击开启语音识别，边说边转文字'}
                className={`relative inline-flex items-center space-x-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition cursor-pointer ${
                  isMicOn
                    ? 'bg-red-50 border-red-300 text-red-600 shadow-lg shadow-red-500/10 dark:bg-red-950/80 dark:border-red-500/80 dark:text-red-200 dark:shadow-red-900/30'
                    : 'bg-surface-hover hover:bg-surface-active border-line-default text-content-secondary'
                }`}
              >
                {isMicOn ? (
                  <>
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-80" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                    </span>
                    <div className="flex items-center space-x-0.5 h-3">
                      <span className="w-0.5 h-full bg-red-400 rounded-full wave-bar-1" />
                      <span className="w-0.5 h-full bg-red-400 rounded-full wave-bar-2" />
                      <span className="w-0.5 h-full bg-red-400 rounded-full wave-bar-3" />
                      <span className="w-0.5 h-full bg-red-400 rounded-full wave-bar-4" />
                    </div>
                    <span>录音中 (点击停止)</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-3.5 h-3.5 text-content-muted" />
                    <span>语音作答 (STT)</span>
                  </>
                )}
              </button>

              {/* Simulate Standard Answer Button */}
              <button
                type="button"
                onClick={handleSimulateAnswer}
                disabled={isThinking || isGeneratingAnswer || status === 'paused'}
                title="如果不知道如何回答，点击此按钮让大模型根据上下文与岗位要求构思标准示范回答并填入输入框"
                className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border transition shadow-sm cursor-pointer ${
                  isGeneratingAnswer
                    ? 'bg-indigo-100 border-indigo-400 text-indigo-700 animate-pulse dark:bg-indigo-900/80 dark:border-indigo-500 dark:text-indigo-200'
                    : 'bg-indigo-50 hover:bg-indigo-100 border-indigo-200 text-indigo-600 hover:text-indigo-700 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 dark:border-indigo-700/50 dark:text-indigo-300 dark:hover:text-indigo-100'
                } disabled:opacity-50`}
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                <span>{isGeneratingAnswer ? '正在构思金牌回答...' : '模拟标准回答'}</span>
              </button>

              {/* Live Coding Button */}
              <button
                type="button"
                onClick={() => setIsCodingOpen(true)}
                disabled={isThinking || status === 'paused'}
                title="打开现场手撕代码与机试工作台，支持多语言编辑、复杂度分析与算法模板"
                className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition cursor-pointer ${
                  isCodingSuggested
                    ? 'bg-amber-500/15 text-amber-600 border-amber-400 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-500/60 shadow-sm ring-2 ring-amber-400/30'
                    : 'bg-surface-hover hover:bg-surface-active border-line-default text-content-secondary'
                } disabled:opacity-50`}
              >
                <Code2 className="w-3.5 h-3.5 text-amber-500" />
                <span>手撕代码 / 机试</span>
                {isCodingSuggested && (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                  </span>
                )}
              </button>
            </div>

            <div className="text-[11px] text-content-muted hidden md:inline">
              按 <kbd className="bg-surface-hover px-1.5 py-0.5 rounded border border-line-default text-content-secondary">Enter</kbd> 发送，
              <kbd className="bg-surface-hover px-1.5 py-0.5 rounded border border-line-default text-content-secondary">Shift+Enter</kbd> 换行
            </div>
          </div>

          {/* Simulate Answer Notification Banner */}
          {simulateAnswerNotification && (
            <div className="mb-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-700 shadow-md animate-fadeIn dark:border-indigo-700/50 dark:bg-indigo-950/70 dark:text-indigo-200">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-indigo-500 dark:text-indigo-400 flex-shrink-0" />
                  <span className="leading-snug">{simulateAnswerNotification}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSimulateAnswerNotification(null);
                    setSimulateSearchMetadata(null);
                  }}
                  className="ml-2 rounded px-1.5 py-0.5 text-xs text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-100 cursor-pointer"
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
                  ? '面试官正在组织考题或评估中，请稍候...'
                  : isMicOn
                  ? '正在聆听您的声音，将自动转为文字输入...'
                  : '在此输入你的回答或阐述思路... (支持原生语音输入)'
              }
              disabled={isThinking || status === 'paused'}
              rows={3}
              className={`w-full bg-surface-subtle border rounded-2xl p-3 pr-28 text-xs text-content-primary placeholder-content-placeholder focus:outline-none resize-none font-sans leading-relaxed disabled:opacity-50 transition-all ${
                isMicOn
                  ? 'border-red-400 ring-2 ring-red-500/30 shadow-lg shadow-red-500/10 dark:border-red-500/80'
                  : 'border-line-default focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/40'
              }`}
            />

            <button
              type="button"
              onClick={() => handleSend()}
              disabled={!inputText.trim() || isThinking || status === 'paused'}
              className="absolute bottom-3 right-3 inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-md cursor-pointer"
            >
              <span>提交回答</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </footer>

      {/* 4. Live Coding Workbench Modal */}
      {isCodingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div
            className={`w-full max-w-4xl max-h-[92vh] flex flex-col rounded-3xl border shadow-2xl transition-all overflow-hidden ${
              isDark ? 'bg-[#0f172a] border-gray-800 text-white' : 'bg-white border-gray-200 text-gray-900'
            }`}
          >
            {/* Modal Header */}
            <div
              className={`flex items-center justify-between px-5 py-3.5 border-b shrink-0 ${
                isDark ? 'border-gray-800 bg-[#1e293b]/70' : 'border-gray-200 bg-gray-50'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-500">
                  <Terminal className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-sm font-bold tracking-tight">现场机试 · 手撕代码工作台</h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      Live Coding
                    </span>
                  </div>
                  <p className="text-[11px] text-content-muted">
                    支持现场手写核心算法、时空复杂度归纳与思路对齐
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {/* 语言选择 */}
                <div className="flex items-center space-x-1.5">
                  <span className="text-[11px] text-content-muted">语言:</span>
                  <select
                    value={codingLanguage}
                    onChange={(e) => handleLanguageChange(e.target.value)}
                    className={`text-xs px-2.5 py-1.5 rounded-xl border font-mono transition focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer ${
                      isDark ? 'bg-gray-900 border-gray-700 text-amber-300' : 'bg-white border-gray-300 text-amber-700'
                    }`}
                  >
                    <option value="python">Python 3</option>
                    <option value="go">Go</option>
                    <option value="java">Java</option>
                    <option value="cpp">C++</option>
                    <option value="typescript">TypeScript</option>
                    <option value="javascript">JavaScript</option>
                    <option value="sql">SQL</option>
                  </select>
                </div>

                {/* 模板快速填充 */}
                {CODE_TEMPLATES[codingLanguage] && (
                  <div className="flex items-center space-x-1">
                    <select
                      value={selectedTemplateKey}
                      onChange={(e) => handleApplyTemplate(e.target.value)}
                      className={`text-xs px-2.5 py-1.5 rounded-xl border transition focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer ${
                        isDark ? 'bg-gray-900 border-gray-700 text-gray-200' : 'bg-white border-gray-300 text-gray-700'
                      }`}
                    >
                      <option value="" disabled>-- 常用算法模板 --</option>
                      {Object.keys(CODE_TEMPLATES[codingLanguage]).map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setIsCodingOpen(false)}
                  className={`p-1.5 rounded-xl transition cursor-pointer ${
                    isDark ? 'hover:bg-gray-800 text-gray-400 hover:text-white' : 'hover:bg-gray-200 text-gray-500 hover:text-gray-900'
                  }`}
                  title="关闭手撕代码窗口"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {/* 1. 思路与复杂度分析区 */}
              <div
                className={`p-3.5 rounded-2xl border ${
                  isDark ? 'bg-[#1e293b]/40 border-gray-800' : 'bg-amber-50/50 border-amber-200/60'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-amber-500 flex items-center space-x-1.5">
                    <span>💡 解题思路与时空复杂度（Think-Out-Loud 表达）</span>
                  </span>
                  <span className="text-[10px] text-content-muted">建议向面试官先汇报思路与复杂度，再展示实现</span>
                </div>

                <textarea
                  value={codingThoughts}
                  onChange={(e) => setCodingThoughts(e.target.value)}
                  placeholder="简述解题思路：核心数据结构、算法切入点、边界特殊值处理等..."
                  rows={2}
                  className={`w-full text-xs p-2.5 rounded-xl border transition focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none ${
                    isDark
                      ? 'bg-gray-900/90 border-gray-800 text-white placeholder-gray-500'
                      : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'
                  }`}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2.5">
                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] font-semibold text-content-secondary shrink-0">时间复杂度:</span>
                    <input
                      type="text"
                      value={timeComplexity}
                      onChange={(e) => setTimeComplexity(e.target.value)}
                      placeholder="例如: O(N log N)"
                      className={`flex-1 text-xs px-2.5 py-1.5 rounded-lg border font-mono transition focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                        isDark ? 'bg-gray-900 border-gray-800 text-white' : 'bg-white border-gray-200 text-gray-900'
                      }`}
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] font-semibold text-content-secondary shrink-0">空间复杂度:</span>
                    <input
                      type="text"
                      value={spaceComplexity}
                      onChange={(e) => setSpaceComplexity(e.target.value)}
                      placeholder="例如: O(1)"
                      className={`flex-1 text-xs px-2.5 py-1.5 rounded-lg border font-mono transition focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                        isDark ? 'bg-gray-900 border-gray-800 text-white' : 'bg-white border-gray-200 text-gray-900'
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* 2. 代码编写核心工作区 */}
              <div className="flex flex-col rounded-2xl border border-gray-800 overflow-hidden bg-[#0d1117] shadow-inner">
                <div className="flex items-center justify-between px-3.5 py-2 bg-[#161b22] border-b border-gray-800 text-xs text-gray-400">
                  <span className="flex items-center space-x-2 font-mono">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500/80 inline-block" />
                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80 inline-block" />
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500/80 inline-block" />
                    <span className="ml-1 text-[11px] uppercase tracking-wider text-amber-400 font-bold">
                      {codingLanguage} 编辑区 (支持按 Tab 缩进 4 空格)
                    </span>
                  </span>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setCodingSnippet('')}
                      className="text-[11px] text-gray-400 hover:text-white px-2 py-0.5 rounded transition cursor-pointer hover:bg-gray-800"
                    >
                      清空代码
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const tpl = CODE_TEMPLATES[codingLanguage]?.[selectedTemplateKey];
                        if (tpl) setCodingSnippet(tpl);
                      }}
                      className="text-[11px] text-amber-400 hover:text-amber-300 px-2 py-0.5 rounded transition cursor-pointer hover:bg-gray-800"
                    >
                      还原模板
                    </button>
                  </div>
                </div>

                <div className="p-3">
                  <textarea
                    value={codingSnippet}
                    onChange={(e) => setCodingSnippet(e.target.value)}
                    onKeyDown={handleCodeKeyDown}
                    placeholder="// 在此编写代码实现..."
                    rows={13}
                    spellCheck={false}
                    className="w-full bg-transparent font-mono text-xs text-emerald-300 placeholder-gray-600 focus:outline-none leading-relaxed resize-y selection:bg-blue-600"
                  />
                </div>

                <div className="flex items-center justify-between px-3.5 py-1.5 bg-[#161b22] border-t border-gray-800 text-[10px] text-gray-400 font-mono">
                  <span>行数: {codingSnippet.split('\n').length} 行 · 字符: {codingSnippet.length} 字符</span>
                  <span className="text-gray-400">已启用等宽字体与智能缩进</span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div
              className={`flex items-center justify-between px-5 py-3.5 border-t shrink-0 ${
                isDark ? 'border-gray-800 bg-[#1e293b]/70' : 'border-gray-200 bg-gray-50'
              }`}
            >
              <div className="text-[11px] text-content-muted">
                点击“直接提交作答”将思路与代码打包发送给考官，并进入代码评审
              </div>
              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={handleCodingFillToInput}
                  disabled={!codingSnippet.trim()}
                  className={`px-3.5 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                    isDark
                      ? 'border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
                  } disabled:opacity-40`}
                >
                  填入主输入框预览
                </button>
                <button
                  type="button"
                  onClick={handleCodingDirectSubmit}
                  disabled={!codingSnippet.trim() || isThinking || status === 'paused'}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold shadow-lg shadow-amber-600/20 active:scale-95 transition disabled:opacity-40 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>直接提交作答 (Submit Code)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tavily Web Search Config Modal */}
      <SearchConfigModal open={searchConfigOpen} onClose={() => setSearchConfigOpen(false)} />
    </div>
  );
};
