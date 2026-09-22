import os
import json
import uuid
from datetime import datetime
from typing import Dict, Any, List, Optional
from app.agents.state import PromptLogItem

TRANSCRIPTS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "uploads", "transcripts")

CALL_TYPE_LABELS = {
    "interviewer_question": "面试官提问与追问",
    "shadow_observation": "影子观察员实时评估与决策",
    "evaluation_report": "终场多维诊断复盘报告",
    "coach_advice": "面试教练改进建议",
    "golden_answer": "AI 满分答题示范",
    "transition": "面试环节推进与开场/转场",
}

NODE_LABELS = {
    "orchestrator": "主考官",
    "orchestrator_welcome": "主考官·开场引导",
    "orchestrator_to_technical": "主考官·进入技术面",
    "orchestrator_to_hr": "主考官·进入HR面",
    "orchestrator_to_qa": "主考官·候选人反问",
    "orchestrator_conclusion": "主考官·面试结语",
    "technical": "专业技术面试官",
    "programmer": "程序员综合面试官",
    "hr": "HR与行为文化面试官",
    "challenger": "压力与挑战面试官",
    "management": "管理岗面试官",
    "custom_persona": "特邀/定制面试官",
    "shadow_observer": "影子观察员 (Shadow Observer)",
    "evaluator": "首席诊断专家 (Evaluator Agent)",
    "coach": "求职面试教练 (Coach Agent)",
}


class PromptRecorderService:
    @staticmethod
    def build_prompt_log(
        session_id: Optional[str],
        node: str,
        call_type: str,
        system_prompt: str,
        user_prompt: str,
        response: str,
        round_index: int = 0,
        stage: Optional[str] = None,
        turn_id: Optional[str] = None,
        model: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> PromptLogItem:
        """构建标准化的 Prompt 日志字典。"""
        return {
            "id": str(uuid.uuid4()),
            "session_id": session_id,
            "turn_id": turn_id,
            "round_index": round_index,
            "stage": stage,
            "node": node,
            "call_type": call_type,
            "system_prompt": system_prompt or "",
            "user_prompt": user_prompt or "",
            "model": model,
            "response": response or "",
            "timestamp": datetime.now().isoformat(),
            "metadata": metadata or {},
        }

    @staticmethod
    def render_full_prompts_markdown(
        session_meta: Dict[str, Any],
        prompt_logs: List[Dict[str, Any]],
        messages: Optional[List[Dict[str, Any]]] = None,
    ) -> str:
        """将全量 Prompt 调用链与上下文渲染为结构化的 Markdown 文档。"""
        s = session_meta or {}
        lines: List[str] = [
            f"# 模拟面试全链路大模型 Prompt 完整实录",
            "",
            f"> **会话标题**: {s.get('title') or '模拟面试会话'}",
            f"> **会话 ID**: `{s.get('session_id') or s.get('id') or '-'}`",
            f"> **岗位方向**: {s.get('industry', '-')} · {s.get('job_role', '-')}",
            f"> **职级与难度**: {s.get('seniority', '-')} / {s.get('difficulty', '-')} ({s.get('style', '常规')})",
            f"> **总计轮次**: {s.get('round_count', len(prompt_logs))} 轮 · 共记录 {len(prompt_logs)} 次大模型交互",
            f"> **记录时间**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            "",
            "---",
            "",
            "## 目录概要",
            "",
        ]

        # 目录索引
        for idx, log in enumerate(prompt_logs, start=1):
            node_name = NODE_LABELS.get(log.get("node", ""), log.get("node", "未知角色"))
            call_label = CALL_TYPE_LABELS.get(log.get("call_type", ""), log.get("call_type", "LLM调用"))
            round_idx = log.get("round_index", 0)
            lines.append(f"- [{idx}. 第 {round_idx} 轮 · {node_name} ({call_label})](#call-{idx})")

        lines.append("")
        lines.append("---")
        lines.append("")
        lines.append("## 大模型全量 Prompt 交互明细")
        lines.append("")

        for idx, log in enumerate(prompt_logs, start=1):
            node_name = NODE_LABELS.get(log.get("node", ""), log.get("node", "未知角色"))
            call_label = CALL_TYPE_LABELS.get(log.get("call_type", ""), log.get("call_type", "LLM调用"))
            round_idx = log.get("round_index", 0)
            stage = log.get("stage") or "normal"
            model_name = log.get("model") or "默认模型 (LLMService)"
            ts = log.get("timestamp") or "-"

            lines.append(f'<a id="call-{idx}"></a>')
            lines.append(f"### #{idx} · 第 {round_idx} 轮: {node_name}【{call_label}】")
            lines.append("")
            lines.append(f"- **触发节点**: `{log.get('node', '-')}`")
            lines.append(f"- **调用类型**: `{log.get('call_type', '-')}`")
            lines.append(f"- **所处阶段**: `{stage}`")
            lines.append(f"- **模型标识**: `{model_name}`")
            lines.append(f"- **记录时间**: `{ts}`")
            lines.append("")

            # 元数据展示（如 RAG 检索考点、搜索结果等）
            meta = log.get("metadata") or {}
            if meta:
                lines.append("#### 📌 附加上下文与检索元数据")
                lines.append("```json")
                lines.append(json.dumps(meta, ensure_ascii=False, indent=2))
                lines.append("```")
                lines.append("")

            # System Prompt
            lines.append("#### 🛠️ 1. 传入模型的系统提示词 (System Prompt)")
            lines.append("```text")
            lines.append(log.get("system_prompt", "").strip())
            lines.append("```")
            lines.append("")

            # User Prompt
            lines.append("#### 👤 2. 传入模型的指令与上下文 (Human / User Prompt)")
            lines.append("```text")
            lines.append(log.get("user_prompt", "").strip())
            lines.append("```")
            lines.append("")

            # Model Response
            lines.append("#### 🤖 3. 大模型原始返回内容 (Model Response)")
            lines.append("```text")
            lines.append(log.get("response", "").strip())
            lines.append("```")
            lines.append("")
            lines.append("---")
            lines.append("")

        return "\n".join(lines)

    @staticmethod
    def render_full_prompts_json(
        session_meta: Dict[str, Any],
        prompt_logs: List[Dict[str, Any]],
        messages: Optional[List[Dict[str, Any]]] = None,
    ) -> str:
        """输出完整的 JSON 字符串。"""
        payload = {
            "version": "1.0",
            "session": session_meta,
            "total_prompt_calls": len(prompt_logs),
            "exported_at": datetime.now().isoformat(),
            "prompt_logs": prompt_logs,
            "dialogue_messages": messages or [],
        }
        return json.dumps(payload, ensure_ascii=False, indent=2)

    def save_prompts_to_disk(
        self,
        session_id: str,
        session_meta: Dict[str, Any],
        prompt_logs: List[Dict[str, Any]],
        messages: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, str]:
        """将 Prompt 记录持久化为本地磁盘文件（Markdown 与 JSON）。仅当轮次 >= 3 时才落盘。"""
        if not prompt_logs:
            return {}
        # 对话轮次如果明确指定且未满 3 轮，不保存到磁盘
        if "round_count" in (session_meta or {}) and int((session_meta or {}).get("round_count", 0) or 0) < 3:
            return {}

        try:
            os.makedirs(TRANSCRIPTS_DIR, exist_ok=True)
            safe_session_id = "".join(c for c in session_id if c.isalnum() or c in ("-", "_"))
            md_path = os.path.join(TRANSCRIPTS_DIR, f"{safe_session_id}_prompts.md")
            json_path = os.path.join(TRANSCRIPTS_DIR, f"{safe_session_id}_prompts.json")

            md_content = self.render_full_prompts_markdown(session_meta, prompt_logs, messages)
            with open(md_path, "w", encoding="utf-8") as f:
                f.write(md_content)

            json_content = self.render_full_prompts_json(session_meta, prompt_logs, messages)
            with open(json_path, "w", encoding="utf-8") as f:
                f.write(json_content)

            return {
                "markdown": md_path,
                "json": json_path,
            }
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Failed to save prompt logs to disk: {e}")
            return {}

    def delete_prompts_from_disk(self, session_id: str) -> bool:
        """从本地磁盘彻底删除指定 session 的 Prompt 镜像文件（Markdown 与 JSON）。"""
        try:
            safe_session_id = "".join(c for c in session_id if c.isalnum() or c in ("-", "_"))
            if not safe_session_id:
                return False
            md_path = os.path.join(TRANSCRIPTS_DIR, f"{safe_session_id}_prompts.md")
            json_path = os.path.join(TRANSCRIPTS_DIR, f"{safe_session_id}_prompts.json")
            deleted = False
            for p in (md_path, json_path):
                if os.path.isfile(p):
                    try:
                        os.remove(p)
                        deleted = True
                    except OSError:
                        pass
            return deleted
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Failed to delete prompt logs from disk for {session_id}: {e}")
            return False

    def cleanup_orphaned_transcripts(self, valid_session_ids: set) -> int:
        """
        清理本地磁盘中所有不属于有效会话集合（或者不足 3 轮）的孤立镜像文件。
        """
        if not os.path.exists(TRANSCRIPTS_DIR):
            return 0
        deleted_count = 0
        try:
            for fname in os.listdir(TRANSCRIPTS_DIR):
                if not (fname.endswith("_prompts.md") or fname.endswith("_prompts.json")):
                    continue
                # 提取 session_id（去掉 _prompts.md 或 _prompts.json）
                sid = fname.replace("_prompts.md", "").replace("_prompts.json", "")
                if sid not in valid_session_ids:
                    fpath = os.path.join(TRANSCRIPTS_DIR, fname)
                    try:
                        os.remove(fpath)
                        deleted_count += 1
                    except OSError:
                        pass
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Failed to cleanup orphaned transcripts: {e}")
        return deleted_count


prompt_recorder = PromptRecorderService()
