/**
 * Privacy Mode (摸鱼与防偷窥模式) DOM Engine
 *
 * 功能说明：
 * 1. 底层 DOM 节点脱敏替换：将全站所有敏感求职词汇替换为代号 (面试→MS, 求职→QZ, 简历→JL, 岗位→GW, 投递→TD, 薪资→XZ 等)。
 * 2. 标签页伪装：浏览器 Title 自动伪装为 Dev Copilot。
 * 3. 实时响应：通过 MutationObserver 监控动态 DOM 变化（定时器跳动、实时对话推送等）并实时脱敏。
 * 4. 无损切换：基于 WeakMap 缓存原始文本，退出时瞬时还原真实文本，不污染底层 React 状态与存储数据。
 *
 * 输入框策略：受控 input/textarea 的 value 完全交给 React state 管理，本引擎只脱敏
 * placeholder，绝不改写 value；未聚焦输入框的视觉遮蔽由 CSS 模糊（body.privacy-mode-active）承担，
 * 聚焦编辑时正常显示原文，保证受控组件数据始终无损。
 */

export const SENSITIVE_WORD_MAP: Array<[RegExp, string]> = [
  // 英文与系统标识（优先长词）
  [/Interview-Copilot/g, 'Dev-Copilot'],
  [/Interview/g, 'Dev'],
  [/interview/g, 'dev'],
  [/\bHiring\b/g, 'Staffing'],
  [/\bJD\b/g, 'GW'],
  [/\bjd\b/g, 'gw'],
  [/Candidate/g, 'Developer'],
  [/candidate/g, 'developer'],
  [/Resume/g, 'Doc'],
  [/resume/g, 'doc'],
  [/Salary/g, 'Budget'],
  [/salary/g, 'budget'],
  [/Offer/g, 'OF'],
  [/offer/g, 'of'],
  [/Job/g, 'Task'],
  [/job/g, 'task'],

  // HR 系列（必须排在 面试官/面试 之前：否则 HR面试官 先被拼成 HRMSG 后，
  // 词边界规则无法再命中其中的 HR）
  [/HR面试官/g, 'RSMSG'],
  [/HR面试/g, 'RSMS'],
  [/HR面/g, 'RSM'],
  [/\bHR\b/g, 'RS'],
  [/\bhr\b/g, 'rs'],
  [/专业技术面试官/g, '专业技术MSG'],
  [/行为文化面试官/g, '行为文化MSG'],
  [/技术面试官/g, '技术MSG'],
  [/模拟面试/g, '模拟MS'],
  [/主考官/g, 'ZKG'],
  [/面试官/g, 'MSG'],
  [/考官/g, 'KG'],
  [/候选人/g, 'HXR'],

  // 核心敏感求职词汇
  [/面试/g, 'MS'],
  // 轮次与考核环节（技术一面、业务终面、HR综合面、在线笔试等）。
  // 必须排在 面试 之后：避免「综合面试」被拆成「综合M试」这类残缺文本
  [/一面/g, '1M'],
  [/二面/g, '2M'],
  [/三面/g, '3M'],
  [/四面/g, '4M'],
  [/五面/g, '5M'],
  [/终面/g, 'ZM'],
  [/复试/g, 'FS'],
  [/笔试/g, 'BS'],
  [/机试/g, 'JS'],
  [/技术面/g, '技术M'],
  [/综合面/g, '综合M'],
  [/行为面/g, '行为M'],
  [/深度面/g, '深度M'],
  [/高管面/g, '高管M'],
  [/岗面/g, '岗M'],
  [/Leader\s?面/g, 'LeaderM'],
  // 求职流程词汇
  [/求职/g, 'QZ'],
  [/简历/g, 'JL'],
  [/岗位/g, 'GW'],
  [/投递/g, 'TD'],
  [/校招/g, 'XZ'],
  [/社招/g, 'SZ'],
  [/秋招/g, 'QZ'],
  [/春招/g, 'CZ'],
  [/到岗/g, 'DG'],
  [/入职/g, 'RZ'],
  [/招聘/g, 'ZP'],
  [/面经/g, 'MJ'],
  [/跳槽/g, 'TC'],
  [/离职/g, 'LZ'],
  [/录用/g, 'LY'],
  [/猎头/g, 'LT'],
  [/内推/g, 'NT'],
  // 薪资家族（与 薪资/薪酬/谈薪 互补，覆盖「月薪 Base」「调薪机制」「发薪日」等表述）
  [/薪资/g, 'XZ'],
  [/薪酬/g, 'XC'],
  [/谈薪/g, 'TX'],
  [/调薪/g, 'DX'],
  [/月薪/g, 'YX'],
  [/年薪/g, 'NX'],
  [/底薪/g, 'DX'],
  [/发薪/g, 'FX'],
];

// 脱敏单段文本
export function desensitizeText(text: string): string {
  if (!text) return text;
  let result = text;
  for (const [pattern, replacement] of SENSITIVE_WORD_MAP) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// 缓存原始文本与属性的 WeakMap，无任何内存泄漏风险
const originalTextMap = new WeakMap<Node, string>();
const originalAttrMap = new WeakMap<Element, Record<string, string>>();

let observer: MutationObserver | null = null;
let isMutating = false;
let isEnabled = false;
let originalTitle = '';

const DISGUISE_TITLE = 'Dev Copilot';
const DEFAULT_ORIGINAL_TITLE = 'Interview-Copilot - 多 Agent 模拟面试与持续训练闭环';

// 非聚焦的文本输入框用 CSS 模糊遮蔽（不修改 value，避免污染 React 受控状态）
const PRIVACY_BLUR_STYLE_ID = 'privacy-mode-input-blur';
const PRIVACY_BLUR_CSS = `
body.privacy-mode-active input:not(:focus):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=reset]):not([type=range]):not([type=color]):not([type=file]):not([type=image]),
body.privacy-mode-active textarea:not(:focus) {
  filter: blur(5px);
  transition: filter 150ms ease;
}
`;

function injectPrivacyBlurStyle() {
  if (document.getElementById(PRIVACY_BLUR_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = PRIVACY_BLUR_STYLE_ID;
  style.textContent = PRIVACY_BLUR_CSS;
  document.head.appendChild(style);
  document.body.classList.add('privacy-mode-active');
}

function removePrivacyBlurStyle() {
  document.getElementById(PRIVACY_BLUR_STYLE_ID)?.remove();
  document.body.classList.remove('privacy-mode-active');
}

/**
 * 遍历并脱敏单个文本节点
 */
function processTextNode(node: Text) {
  const current = node.nodeValue;
  if (!current || !current.trim()) return;

  const parent = node.parentElement;
  if (parent) {
    const tag = parent.tagName.toUpperCase();
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') {
      return;
    }
  }

  // 若尚未记录原文本，则记录真实原文
  if (!originalTextMap.has(node)) {
    originalTextMap.set(node, current);
  }

  const orig = originalTextMap.get(node) || current;
  const desensitized = desensitizeText(orig);
  if (node.nodeValue !== desensitized) {
    node.nodeValue = desensitized;
  }
}

/**
 * 处理输入框与文本域的 placeholder
 *
 * 注意：刻意不修改 el.value —— 受控 input/textarea 的 value 由 React state 驱动，
 * 直接改 DOM value 会在用户继续输入时把脱敏文本（MS/JL/GW 等代号）写回 state，
 * 造成原始数据被永久污染。未聚焦输入框的视觉遮蔽由 CSS 模糊（privacy-mode-active）承担。
 */
function processInputElement(el: HTMLInputElement | HTMLTextAreaElement) {
  if (el.placeholder) {
    let attrs = originalAttrMap.get(el);
    if (!attrs) {
      attrs = {};
      originalAttrMap.set(el, attrs);
    }
    if (!('placeholder' in attrs)) {
      attrs.placeholder = el.placeholder;
    }
    const desensitizedPlaceholder = desensitizeText(attrs.placeholder);
    if (el.placeholder !== desensitizedPlaceholder) {
      el.placeholder = desensitizedPlaceholder;
    }
  }
}

/**
 * 递归应用脱敏至指定根节点
 */
export function applyPrivacyToSubtree(root: Node) {
  if (typeof document === 'undefined') return;

  isMutating = true;
  try {
    if (root.nodeType === Node.TEXT_NODE) {
      processTextNode(root as Text);
      return;
    }

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (parent) {
            const tag = parent.tagName.toUpperCase();
            if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') {
              return NodeFilter.FILTER_REJECT;
            }
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    let currentNode = walker.nextNode();
    while (currentNode) {
      processTextNode(currentNode as Text);
      currentNode = walker.nextNode();
    }

    if (root instanceof Element) {
      const inputs = root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
      inputs.forEach((input) => processInputElement(input));
    }
  } finally {
    isMutating = false;
  }
}

/**
 * 启动防偷窥模式
 */
export function enablePrivacyMode() {
  if (typeof document === 'undefined' || isEnabled) return;
  isEnabled = true;

  // 1. 标签页伪装
  if (document.title !== DISGUISE_TITLE) {
    originalTitle = document.title || DEFAULT_ORIGINAL_TITLE;
    document.title = DISGUISE_TITLE;
  }

  // 2. 底层 DOM 节点脱敏
  applyPrivacyToSubtree(document.body);

  // 3. 非聚焦输入框 CSS 模糊遮蔽
  injectPrivacyBlurStyle();

  // 4. 启动 MutationObserver 实现实时脱敏
  if (!observer) {
    observer = new MutationObserver((mutations) => {
      if (isMutating || !isEnabled) return;
      isMutating = true;
      try {
        for (const mutation of mutations) {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((addedNode) => {
              if (addedNode.nodeType === Node.TEXT_NODE) {
                processTextNode(addedNode as Text);
              } else if (addedNode.nodeType === Node.ELEMENT_NODE) {
                applyPrivacyToSubtree(addedNode);
              }
            });
          } else if (mutation.type === 'characterData') {
            const target = mutation.target;
            if (target.nodeType === Node.TEXT_NODE) {
              const textNode = target as Text;
              const currentVal = textNode.nodeValue || '';
              const orig = originalTextMap.get(textNode);
              const expectedDesensitized = desensitizeText(orig || '');

              // 若由 React 更新了新的原文本内容
              if (currentVal !== expectedDesensitized) {
                originalTextMap.set(textNode, currentVal);
                textNode.nodeValue = desensitizeText(currentVal);
              }
            }
          }
        }
      } finally {
        isMutating = false;
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }
}

/**
 * 退出防偷窥模式并瞬时无损还原
 */
export function disablePrivacyMode() {
  if (typeof document === 'undefined' || !isEnabled) return;
  isEnabled = false;

  // 1. 停止 MutationObserver
  if (observer) {
    observer.disconnect();
    observer = null;
  }

  isMutating = true;
  try {
    // 2. 瞬时还原所有 TextNode
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    let currentNode = walker.nextNode();
    while (currentNode) {
      if (originalTextMap.has(currentNode)) {
        const orig = originalTextMap.get(currentNode);
        if (orig !== undefined && currentNode.nodeValue !== orig) {
          currentNode.nodeValue = orig;
        }
      }
      currentNode = walker.nextNode();
    }

    // 3. 还原 input / textarea 的 placeholder
    const inputs = document.body.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
    inputs.forEach((el) => {
      const attrs = originalAttrMap.get(el);
      if (attrs && 'placeholder' in attrs) {
        el.placeholder = attrs.placeholder;
      }
    });

    // 4. 移除输入框模糊遮蔽
    removePrivacyBlurStyle();

    // 5. 还原标签页 Title
    document.title = originalTitle && originalTitle !== DISGUISE_TITLE ? originalTitle : DEFAULT_ORIGINAL_TITLE;
  } finally {
    isMutating = false;
  }
}

/**
 * 获取当前是否处于防偷窥模式
 */
export function getPrivacyModeStatus(): boolean {
  return isEnabled;
}
