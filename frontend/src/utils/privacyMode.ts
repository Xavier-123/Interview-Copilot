/**
 * Privacy Mode (摸鱼与防偷窥模式) DOM Engine
 *
 * 功能说明：
 * 1. 底层 DOM 节点脱敏替换：将全站所有敏感求职词汇替换为代号 (面试→MS, 求职→QZ, 简历→JL, 岗位→GW, 投递→TD, 薪资→XZ 等)。
 * 2. 标签页伪装：浏览器 Title 自动伪装为 Dev Copilot。
 * 3. 实时响应：通过 MutationObserver 监控动态 DOM 变化（定时器跳动、实时对话推送等）并实时脱敏。
 * 4. 无损切换：基于 WeakMap 缓存原始文本，退出时瞬时还原真实文本，不污染底层 React 状态与存储数据。
 */

export const SENSITIVE_WORD_MAP: Array<[RegExp, string]> = [
  // 英文与系统标识（优先长词）
  [/Interview-Copilot/g, 'Dev-Copilot'],
  [/Interview/g, 'Dev'],
  [/interview/g, 'dev'],
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

  // 中文长词优先匹配
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
  [/求职/g, 'QZ'],
  [/简历/g, 'JL'],
  [/岗位/g, 'GW'],
  [/投递/g, 'TD'],
  [/薪资/g, 'XZ'],
  [/薪酬/g, 'XC'],
  [/谈薪/g, 'TX'],
  [/招聘/g, 'ZP'],
  [/面经/g, 'MJ'],
  [/跳槽/g, 'TC'],
  [/离职/g, 'LZ'],
  [/录用/g, 'LY'],
  [/猎头/g, 'LT'],
  [/内推/g, 'NT'],
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
const originalValueMap = new WeakMap<HTMLInputElement | HTMLTextAreaElement, string>();

let observer: MutationObserver | null = null;
let isMutating = false;
let isEnabled = false;
let originalTitle = '';

const DISGUISE_TITLE = 'Dev Copilot';
const DEFAULT_ORIGINAL_TITLE = 'Interview-Copilot - 多 Agent 模拟面试与持续训练闭环';

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
 * 处理输入框与文本域的 placeholder 及显示 value
 */
function processInputElement(el: HTMLInputElement | HTMLTextAreaElement) {
  // 处理 placeholder
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

  // 处理显示 value
  if (el.value) {
    if (!originalValueMap.has(el)) {
      originalValueMap.set(el, el.value);
    }
    const orig = originalValueMap.get(el) || el.value;
    const desensitizedVal = desensitizeText(orig);
    if (el.value !== desensitizedVal) {
      el.value = desensitizedVal;
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

  // 3. 启动 MutationObserver 实现实时脱敏
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

    // 3. 还原 input / textarea 的 placeholder 与 value
    const inputs = document.body.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
    inputs.forEach((el) => {
      const attrs = originalAttrMap.get(el);
      if (attrs && 'placeholder' in attrs) {
        el.placeholder = attrs.placeholder;
      }
      if (originalValueMap.has(el)) {
        const orig = originalValueMap.get(el);
        if (orig !== undefined) {
          el.value = orig;
        }
      }
    });

    // 4. 还原标签页 Title
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
