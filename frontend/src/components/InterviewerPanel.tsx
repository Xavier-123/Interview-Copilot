import React from 'react';
import { UserCheck, Code2, Users2, Zap, Eye, Radio, Briefcase } from 'lucide-react';

interface InterviewerPanelProps {
  currentInterviewer: string;
  isThinking?: boolean;
  shadowLogsCount?: number;
}

export const InterviewerPanel: React.FC<InterviewerPanelProps> = ({
  currentInterviewer,
  isThinking = false,
  shadowLogsCount = 0,
}) => {
  const interviewers = [
    {
      id: 'orchestrator',
      name: '王主持',
      role: '主考官 / 协调主持 (Orchestrator)',
      icon: UserCheck,
      color: 'from-blue-500 to-indigo-600',
      activeBorder: 'border-blue-500 shadow-blue-500/20',
      desc: '全局节奏把控、流程推进、环节串场与总结',
    },
    {
      id: 'technical',
      name: '李架构',
      role: '专业技术面试官 (Technical Specialist)',
      icon: Code2,
      color: 'from-cyan-500 to-teal-600',
      activeBorder: 'border-cyan-500 shadow-cyan-500/20',
      desc: '高并发、底层原理、系统架构与方案层层深挖',
    },
    {
      id: 'hr',
      name: '陈总监',
      role: 'HR / 行为文化面试官 (Behavioral STAR)',
      icon: Users2,
      color: 'from-purple-500 to-pink-600',
      activeBorder: 'border-purple-500 shadow-purple-500/20',
      desc: 'STAR法则、跨团队协同、自驱力与危机应对',
    },
    {
      id: 'management',
      name: '赵管理',
      role: '管理岗专家 (Leadership & Strategy)',
      icon: Briefcase,
      color: 'from-emerald-500 to-green-600',
      activeBorder: 'border-emerald-500 shadow-emerald-500/20',
      desc: '团队梯队、技术战略演进、技术债务治理与效能',
    },
    {
      id: 'challenger',
      name: '张挑刺',
      role: '高压/极限挑战官 (Challenger)',
      icon: Zap,
      color: 'from-amber-500 to-red-600',
      activeBorder: 'border-amber-500 shadow-amber-500/20',
      desc: '极端容灾故障、资源砍半高压模拟与逻辑反例',
    },
  ];

  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4 backdrop-blur">
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center space-x-2">
          <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
          <h2 className="text-sm font-semibold text-gray-200 uppercase tracking-wider">
            AI 面试官席位 (Live Agent Panel)
          </h2>
        </div>

        {/* Shadow Observer pill */}
        <div className="flex items-center space-x-2 bg-gray-950 border border-gray-800 px-2.5 py-1 rounded-full text-xs text-gray-400">
          <Eye className="w-3.5 h-3.5 text-indigo-400" />
          <span>影子观察员:</span>
          <span className="text-indigo-300 font-medium font-mono">
            {shadowLogsCount} 轮实时监听评估中
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {interviewers.map((agent) => {
          const isActive = currentInterviewer === agent.id;
          const IconComponent = agent.icon;

          return (
            <div
              key={agent.id}
              className={`relative rounded-xl p-2.5 border transition-all duration-300 ${
                isActive
                  ? `bg-gray-800/90 border-2 ${agent.activeBorder} shadow-lg scale-[1.02]`
                  : 'bg-gray-950/40 border-gray-800/80 opacity-70 hover:opacity-90'
              }`}
            >
              {isActive && (
                <div className="absolute -top-2 -right-1 px-2 py-0.5 rounded-full bg-blue-600 text-[10px] font-semibold text-white tracking-wider animate-bounce shadow">
                  正在发问
                </div>
              )}

              <div className="flex items-start space-x-2.5">
                <div
                  className={`w-8 h-8 rounded-lg bg-gradient-to-br ${agent.color} flex items-center justify-center shrink-0 shadow-md`}
                >
                  <IconComponent className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-100">{agent.name}</span>
                    {isActive && isThinking && (
                      <span className="text-[10px] text-blue-400 animate-pulse font-mono">
                        思考中...
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-400 truncate">{agent.role}</div>
                </div>
              </div>

              <p className="text-[10px] text-gray-500 mt-1.5 leading-snug line-clamp-2">
                {agent.desc}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
