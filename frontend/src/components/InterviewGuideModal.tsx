import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Target,
  Compass,
  ShieldCheck,
  MessageSquare,
  Award,
} from 'lucide-react';
import type { InterviewScheduleItem } from '../types';
import { useTheme } from '../context/ThemeContext';

interface InterviewGuideModalProps {
  schedule: InterviewScheduleItem;
  open: boolean;
  onClose: () => void;
  onStartMock: () => void;
}

export const InterviewGuideModal: React.FC<InterviewGuideModalProps> = ({
  schedule,
  open,
  onClose,
  onStartMock,
}) => {
  const { isDark } = useTheme();
  const [activeTab, setActiveTab] = useState<'round' | 'star' | 'questions'>('round');

  if (!open) return null;

  const round = schedule.interview_round || '一面';

  // 针对不同轮次的专属攻防战术
  const getRoundStrategies = () => {
    if (round.includes('笔试') || round.includes('机试') || round.includes('测评') || round.toUpperCase().includes('OA')) {
      return {
        title: '在线笔试 / 机试测评：算法功底与快速实现',
        focus: '核心算法与数据结构、边界处理、时空复杂度控制、ACM/核心代码模式规范',
        tips: [
          {
            tag: '用例边界',
            title: '注重极端测试用例与边界特判',
            desc: '自动判题系统常覆盖大规模极限数据、空值、越界溢出（如整型溢出需转 long long/BigInt）。先通读题目约束条件，再动手编码。',
          },
          {
            tag: '限时管理',
            title: '先做高把握题，切忌单题卡死',
            desc: '笔试通常为限时 60~120 分钟，建议先快速完成选择题或基础题锁定得分；对高难算法题先写出暴力解通过部分测试用例，再尝试优化。',
          },
          {
            tag: '编码规范',
            title: '熟悉输入输出与常见算法模板',
            desc: '注意区分 ACM 模式（自主处理 Scanner / stdin）与核心代码模式（LeetCode 接口型），熟练掌握常用的快读、排序、二分、DFS/BFS与动态规划骨架。',
          },
        ],
      };
    }
    if (round.includes('一') || round.includes('技术') || round.includes('初试')) {
      return {
        title: '技术一面：硬实力与深度摸底',
        focus: '核心语言特性、计算机基础、项目底层原理、代码实现规范',
        tips: [
          {
            tag: '底层原理',
            title: '知其然，更要知其所以然',
            desc: '面试官常从常用 API 追问至底层实现（如 React Fiber 调度机制、浏览器渲染管线、并发控制等）。切忌背死答案，尝试结合自己在项目中的应用场景阐述。',
          },
          {
            tag: '代码表达',
            title: '白板手写：先沟通思路，再动笔编码',
            desc: '面对手写题或算法设计，先向面试官确认边界条件（数据规模、空值处理），用 1-2 分钟简述核心思路并获得认可后再落笔，展现工程素养。',
          },
          {
            tag: '量化项目',
            title: '项目介绍控制在 2-3 分钟',
            desc: '提炼项目核心定位、你承担的主导角色以及最终业务产出指标（如首屏从 3s 优化至 0.8s），引导面试官顺着你最擅长的模块提问。',
          },
        ],
      };
    }
    if (round.includes('二') || round.includes('三') || round.includes('架构') || round.includes('主管') || round.includes('Leader')) {
      return {
        title: '技术复试 / Leader 面：系统架构与技术选型权衡',
        focus: '复杂系统设计、技术选型背后的 Trade-offs、跨团队协同与业务思考',
        tips: [
          {
            tag: '选型权衡',
            title: '没有完美架构，只有权衡取舍',
            desc: '重点回答“为什么选 A 而不是 B？”，剖析开发成本、性能上限、团队学习曲线以及迁移维护代价，展现全局视野。',
          },
          {
            tag: '业务体感',
            title: '将技术指标与业务价值紧密链接',
            desc: 'Leader 更加关注技术对业务赋能。例如：工程脚手架重构不仅提升代码质量，更将新业务模块交付周期从 2 周压缩到 3 天。',
          },
          {
            tag: '故障复盘',
            title: '展现抗压与系统性复盘能力',
            desc: '准备 1-2 个真实解决过的线上高危 Bug 或高并发瓶颈案例，按照“发现机制 ➔ 应急止损 ➔ 根因定位 ➔ 长期防范”四步法沉着作答。',
          },
        ],
      };
    }
    if (round.includes('HR') || round.includes('人事') || round.includes('终面') || round.includes('高管')) {
      return {
        title: 'HR 终面 / 综合素质面：文化契合度与职业稳定性',
        focus: '自驱力、职业规划、离职真实动机、团队协作风格与薪资谈判',
        tips: [
          {
            tag: '离职动机',
            title: '积极归因，面向未来',
            desc: '避免负面抱怨前司或前同事。应聚焦于寻找更大的业务挑战舞台、期望深入技术方向或职业成长通道受限，语气诚恳真挚。',
          },
          {
            tag: '自驱与成长',
            title: '展示你如何保持技术敏锐度',
            desc: '分享近期学习并实践的新技术（如 AI Agent 落地、新型编译器工具链、性能剖析工具），表明你有持续自驱更新知识结构的能力。',
          },
          {
            tag: '团队协同',
            title: '突出换位思考与冲突化解',
            desc: '当面对与产品经理或后端意见不一致时，阐述你是如何基于“用户体验与业务优先级”达成共识的，而非情绪对抗。',
          },
        ],
      };
    }
    // 谈薪 / 默认
    return {
      title: 'Offer 谈判与综合决策阶段',
      focus: '全面薪酬构成（Base/年终/期权）、职级定位、未来团队空间',
      tips: [
        {
          tag: '薪酬锚定',
          title: '明确 Package 整体构成',
          desc: '不只看月薪 Base，详细了解年终考核系数、社保公积金基数与比例、发薪日、补贴及晋升调薪机制。',
        },
        {
          tag: '决策维度',
          title: '综合考量业务赛道与导师带教',
          desc: '初创公司看成长跨度，成熟大厂看平台背书与规范工程体系。评估直属 Leader 的技术沉淀对你未来 2-3 年职业发展的助推力。',
        },
      ],
    };
  };

  const strategy = getRoundStrategies();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div
        className={`w-full max-w-2xl max-h-[90vh] rounded-2xl border flex flex-col shadow-2xl overflow-hidden transition-all ${
          isDark
            ? 'bg-gray-900 border-gray-800 text-gray-100'
            : 'bg-white border-gray-200 text-gray-900'
        }`}
      >
        {/* Header */}
        <div
          className={`px-5 py-4 border-b flex items-center justify-between shrink-0 ${
            isDark ? 'border-gray-800 bg-gray-950/60' : 'border-gray-200 bg-gray-50/70'
          }`}
        >
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-500 shrink-0">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold">备战指南与应答战术</h3>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20 font-medium">
                  {schedule.company} · {schedule.interview_round}
                </span>
              </div>
              <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                针对目标岗位【{schedule.job_role}】定制的高频攻防策略
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg border transition cursor-pointer ${
              isDark
                ? 'border-gray-800 hover:bg-gray-800 text-gray-400 hover:text-white'
                : 'border-gray-200 hover:bg-gray-100 text-gray-500 hover:text-gray-900'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div
          className={`px-5 pt-3 border-b flex items-center space-x-4 shrink-0 ${
            isDark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'
          }`}
        >
          <button
            onClick={() => setActiveTab('round')}
            className={`pb-2.5 text-xs font-medium border-b-2 transition flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'round'
                ? 'border-blue-500 text-blue-500 font-semibold'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Target className="w-3.5 h-3.5" />
            <span>本轮专属攻防</span>
          </button>

          <button
            onClick={() => setActiveTab('star')}
            className={`pb-2.5 text-xs font-medium border-b-2 transition flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'star'
                ? 'border-blue-500 text-blue-500 font-semibold'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>STAR 金牌表达公式</span>
          </button>

          <button
            onClick={() => setActiveTab('questions')}
            className={`pb-2.5 text-xs font-medium border-b-2 transition flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'questions'
                ? 'border-blue-500 text-blue-500 font-semibold'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>反问面试官加分题</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTab === 'round' && (
            <div className="space-y-4 animate-fade-in">
              <div
                className={`p-3.5 rounded-xl border ${
                  isDark ? 'bg-blue-950/20 border-blue-800/40 text-blue-200' : 'bg-blue-50/70 border-blue-200 text-blue-900'
                }`}
              >
                <div className="flex items-center space-x-2 text-xs font-bold mb-1">
                  <Sparkles className="w-4 h-4 text-blue-500" />
                  <span>{strategy.title}</span>
                </div>
                <p className={`text-xs leading-relaxed ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  <strong className="text-blue-500">考察重心：</strong>
                  {strategy.focus}
                </p>
              </div>

              <div className="space-y-3">
                {strategy.tips.map((tip, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-xl border transition ${
                      isDark ? 'bg-gray-950/60 border-gray-800' : 'bg-gray-50 border-gray-200/90'
                    }`}
                  >
                    <div className="flex items-center space-x-2 mb-1.5">
                      <span className="text-[10px] px-2 py-0.5 rounded-md font-semibold bg-blue-500/15 text-blue-500 border border-blue-500/30">
                        {tip.tag}
                      </span>
                      <h4 className="text-xs font-bold">{tip.title}</h4>
                    </div>
                    <p className={`text-xs leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      {tip.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'star' && (
            <div className="space-y-4 animate-fade-in">
              <div
                className={`p-3 rounded-xl border text-xs leading-relaxed ${
                  isDark ? 'bg-indigo-950/20 border-indigo-800/40 text-indigo-300' : 'bg-indigo-50/70 border-indigo-200 text-indigo-900'
                }`}
              >
                💡 面试官最反感逻辑混乱的流水账。回答任何项目难点或主导经历时，严格套用以下 4 步逻辑结构：
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div
                  className={`p-3.5 rounded-xl border space-y-1.5 ${
                    isDark ? 'bg-gray-950/50 border-gray-800' : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex items-center space-x-1.5 font-bold text-blue-500">
                    <span className="w-5 h-5 rounded-md bg-blue-500/15 flex items-center justify-center text-[11px]">S</span>
                    <span>Situation · 背景与痛点</span>
                  </div>
                  <p className={`text-[11px] leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    当时面临怎样的业务挑战？（如业务爆发期 QPS 激增 10 倍、首屏严重卡顿流失率高）。
                  </p>
                </div>

                <div
                  className={`p-3.5 rounded-xl border space-y-1.5 ${
                    isDark ? 'bg-gray-950/50 border-gray-800' : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex items-center space-x-1.5 font-bold text-indigo-500">
                    <span className="w-5 h-5 rounded-md bg-indigo-500/15 flex items-center justify-center text-[11px]">T</span>
                    <span>Task · 职责与核心目标</span>
                  </div>
                  <p className={`text-[11px] leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    作为负责人/核心研发，你需要攻克的硬指标是什么？（如首屏必须压降至 1s 内，CPU 峰值占用下降 40%）。
                  </p>
                </div>

                <div
                  className={`p-3.5 rounded-xl border space-y-1.5 ${
                    isDark ? 'bg-gray-950/50 border-gray-800' : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex items-center space-x-1.5 font-bold text-emerald-500">
                    <span className="w-5 h-5 rounded-md bg-emerald-500/15 flex items-center justify-center text-[11px]">A</span>
                    <span>Action · 关键行动与技术方案</span>
                  </div>
                  <p className={`text-[11px] leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    你具体主导了什么？（如虚拟列表调优、Web Worker 离线计算解耦、按需分包预加载）。
                  </p>
                </div>

                <div
                  className={`p-3.5 rounded-xl border space-y-1.5 ${
                    isDark ? 'bg-gray-950/50 border-gray-800' : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex items-center space-x-1.5 font-bold text-amber-500">
                    <span className="w-5 h-5 rounded-md bg-amber-500/15 flex items-center justify-center text-[11px]">R</span>
                    <span>Result · 量化成效与沉淀</span>
                  </div>
                  <p className={`text-[11px] leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    最终数字化指标是？（如首屏达标 0.8s，客户转化率提升 14%，沉淀并开源了团队公共组件库）。
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'questions' && (
            <div className="space-y-3 animate-fade-in">
              <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                面试尾声当被问到“你还有什么想问我的？”时，提问能直接展示你的专业追求与求职意向：
              </p>

              <div className="space-y-2.5">
                {[
                  {
                    q: '“如果我有幸加入，入职前 3 个月最关键的产出期待和挑战会是什么？”',
                    intent: '展现极强的结果导向意识与快速融入团队的积极心态。',
                  },
                  {
                    q: '“目前团队在面对该技术架构升级时，遇到最主要的阻碍或技术债务主要集中在哪些方面？”',
                    intent: '展现对业务深水区与现实工程复杂度的务实关注。',
                  },
                  {
                    q: '“团队平时的技术氛围是怎样的？有定期 Code Review、技术分享或架构研讨机制吗？”',
                    intent: '表明你追求高质量工程文化与团队共同进步。',
                  },
                ].map((item, i) => (
                  <div
                    key={i}
                    className={`p-3.5 rounded-xl border ${
                      isDark ? 'bg-gray-950/50 border-gray-800' : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="text-xs font-semibold text-blue-500 mb-1">
                      {item.q}
                    </div>
                    <div className={`text-[11px] ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      🎯 面试官心理：{item.intent}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className={`px-5 py-3.5 border-t flex items-center justify-between shrink-0 ${
            isDark ? 'border-gray-800 bg-gray-950/60' : 'border-gray-200 bg-gray-50/70'
          }`}
        >
          <div className="flex items-center space-x-1.5 text-xs text-emerald-500">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span className="font-medium">自信准备，放平心态</span>
          </div>

          <div className="flex items-center space-x-2.5">
            <button
              onClick={onClose}
              className={`px-3.5 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer ${
                isDark
                  ? 'border-gray-800 hover:bg-gray-800 text-gray-300'
                  : 'border-gray-300 hover:bg-gray-100 text-gray-700'
              }`}
            >
              关闭
            </button>
            <button
              onClick={() => {
                onClose();
                onStartMock();
              }}
              className="inline-flex items-center space-x-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow-md shadow-blue-600/20 hover:shadow-blue-600/30 transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>以此针对性开启模拟对练</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
