"""
按面试官分析模拟面试数据：规则指标 + LLM 评析。

用法（backend 目录下）：
    .venv/Scripts/python scripts/analyze_interviewers.py --iteration v1
    .venv/Scripts/python scripts/analyze_interviewers.py --iteration v1 --compare v2   # 追加对比

产物：simulation_output/<iteration>/analysis/
  - metrics.json        全部规则指标
  - <interviewer>.json  LLM 评析
  - ANALYSIS.md         人读分析报告（含对比表，若 --compare）
"""
import argparse
import asyncio
import json
import re
import sys
from collections import Counter
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
OUTPUT_DIR = BACKEND_DIR / "simulation_output"

from langchain_core.messages import HumanMessage, SystemMessage  # noqa: E402
from langchain_openai import ChatOpenAI  # noqa: E402
from app.core.config import settings  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]

MARKDOWN_PATTERNS = [
    (re.compile(r"\*\*[^*\n]+\*\*"), "bold"),
    (re.compile(r"`[^`\n]+`"), "backtick"),
    (re.compile(r"^\s*[-*•]\s+", re.M), "bullet"),
    (re.compile(r"^\s*\d+[.、)]\s*", re.M), "numbered"),
    (re.compile(r"[①②③④⑤⑥⑦⑧⑨⑩]"), "circled"),
    (re.compile(r"【[^】]{2,20}】"), "bracket-header"),
    (re.compile(r"^#{1,4}\s", re.M), "heading"),
]
ROBOTIC_OPENERS = [
    "好的", "非常棒", "感谢您的回答", "感谢你的分享", "接下来让我们", "很好", "太棒了",
    "听起来不错", "我明白了", "收到你的回答", "下面我们来看看", "嗯，好的",
]
FABRICATED_PANEL = re.compile(r"(三位|两位|四位|几位|panel)(面试官|评委|同事|panelists)")
FALLBACK_TEMPLATE = "思路清晰，对业务场景有明确认识"
FALLBACK_SCORE = 0.78


def extract_text(resp_content) -> str:
    if isinstance(resp_content, str):
        return resp_content.strip()
    if isinstance(resp_content, list):
        return "\n".join(
            p.get("text", "") if isinstance(p, dict) else str(p) for p in resp_content
        ).strip()
    return str(resp_content).strip()


async def chat_json(llm: ChatOpenAI, system: str, user: str, attempts: int = 3) -> dict:
    delay = 5.0
    last: Exception | None = None
    for _ in range(attempts):
        try:
            resp = await llm.ainvoke([SystemMessage(content=system), HumanMessage(content=user)])
            text = extract_text(resp.content)
            text = re.sub(r"^```(json)?|```$", "", text.strip(), flags=re.M).strip()
            start, end = text.find("{"), text.rfind("}")
            if start >= 0 and end > start:
                return json.loads(text[start:end + 1])
            raise ValueError("no json object found")
        except Exception as exc:  # noqa: BLE001
            last = exc
            await asyncio.sleep(delay)
            delay = min(delay * 2, 20.0)
    raise RuntimeError(f"LLM json failed: {last}")


def interviewer_speaker(msg: dict) -> str | None:
    if msg.get("role") != "assistant":
        return None
    return (msg.get("name") or "").strip() or "orchestrator"


def rule_metrics(run_dir: Path) -> dict:
    tpath = run_dir / "transcript.json"
    try:
        run_rel = str(run_dir.relative_to(OUTPUT_DIR))
    except ValueError:
        run_rel = str(run_dir)
    meta = json.load(open(run_dir / "meta.json", encoding="utf-8"))
    m = {
        "run_dir": run_rel,
        "interviewer": meta["interviewer_name"],
        "candidate": meta["candidate_id"],
        "status": meta["status"],
        "rounds": 0,
        "markdown_hits": Counter(),
        "markdown_examples": {},
        "max_questions_per_turn": 0,
        "avg_questions_per_turn": 0.0,
        "turns_over_2_questions": 0,
        "robotic_opener_turns": [],
        "fabricated_panel": [],
        "observer_fallback_turns": [],
        "avg_satisfaction": None,
        "avg_depth": None,
        "distinct_topics": 0,
        "topics": [],
        "interviewer_turns": 0,
        "orchestrator_turns": 0,
    }
    if not tpath.exists():
        m["status"] = meta.get("status", "missing")
        return m
    t = json.load(open(tpath, encoding="utf-8"))
    obs = t.get("observations") or []
    m["rounds"] = len(obs)
    qcounts = []
    for msg in t.get("messages") or []:
        spk = interviewer_speaker(msg)
        if not spk:
            continue
        content = (msg.get("content") or "").strip()
        if not content:
            continue
        if spk == "orchestrator":
            m["orchestrator_turns"] += 1
            mm = FABRICATED_PANEL.search(content)
            if mm:
                m["fabricated_panel"].append(mm.group(0))
            continue
        if spk == "candidate":
            continue
        m["interviewer_turns"] += 1
        for pat, name in MARKDOWN_PATTERNS:
            found = pat.findall(content)
            if found:
                m["markdown_hits"][name] += len(found)
                m["markdown_examples"].setdefault(name, f"{found[0][:40]}")
        first_line = content.split("\n", 1)[0].strip()
        for opener in ROBOTIC_OPENERS:
            if first_line.startswith(opener):
                m["robotic_opener_turns"].append(opener)
                break
        nq = content.count("？") + content.count("?")
        qcounts.append(nq)
        if nq > 2:
            m["turns_over_2_questions"] += 1
    if qcounts:
        m["max_questions_per_turn"] = max(qcounts)
        m["avg_questions_per_turn"] = round(sum(qcounts) / len(qcounts), 2)
    m["markdown_hits"] = dict(m["markdown_hits"])
    scores = [o.get("satisfaction_score") for o in obs if isinstance(o.get("satisfaction_score"), (int, float))]
    depths = [o.get("depth_level") for o in obs if isinstance(o.get("depth_level"), (int, float))]
    if scores:
        m["avg_satisfaction"] = round(sum(scores) / len(scores), 3)
        m["observer_fallback_turns"] = [
            i + 1 for i, s in enumerate(scores)
            if abs(s - FALLBACK_SCORE) < 1e-6
        ]
    if depths:
        m["avg_depth"] = round(sum(depths) / len(depths), 2)
    topics = [o.get("topic") for o in obs if o.get("topic")]
    m["distinct_topics"] = len(set(topics))
    m["topics"] = topics
    # 观察员兜底模板句检测
    for i, o in enumerate(obs):
        sts = " ".join(o.get("strengths") or [])
        if FALLBACK_TEMPLATE in sts and (i + 1) not in m["observer_fallback_turns"]:
            m["observer_fallback_turns"].append(i + 1)
    return m


def aggregate(runs: list[dict]) -> dict:
    ok = [r for r in runs if r["status"] == "ok"]
    if not ok:
        return {"runs_ok": 0}
    md_total = sum(sum(r["markdown_hits"].values()) for r in ok)
    return {
        "runs_ok": len(ok),
        "rounds_min": min(r["rounds"] for r in ok),
        "markdown_total": md_total,
        "markdown_per_run": round(md_total / len(ok), 1),
        "max_questions_per_turn": max(r["max_questions_per_turn"] for r in ok),
        "avg_questions_per_turn": round(sum(r["avg_questions_per_turn"] for r in ok) / len(ok), 2),
        "turns_over_2_questions": sum(r["turns_over_2_questions"] for r in ok),
        "robotic_opener_turns": sum(len(r["robotic_opener_turns"]) for r in ok),
        "fabricated_panel": [x for r in ok for x in r["fabricated_panel"]][:5],
        "observer_fallback_turns": sum(len(r["observer_fallback_turns"]) for r in ok),
        "avg_satisfaction": round(sum(r["avg_satisfaction"] for r in ok if r["avg_satisfaction"] is not None) / max(1, sum(1 for r in ok if r["avg_satisfaction"] is not None)), 3),
        "distinct_topics_avg": round(sum(r["distinct_topics"] for r in ok) / len(ok), 1),
    }


def trim_transcript_for_llm(run_dir: Path, q_cap: int = 300, a_cap: int = 320) -> list[dict]:
    tpath = run_dir / "transcript.json"
    if not tpath.exists():
        return []
    t = json.load(open(tpath, encoding="utf-8"))
    obs = t.get("observations") or []
    # 直接从 messages 重建每轮问题（observations.question 在旧版自定义会话中
    # 会被错误地记录为主考官欢迎词，不可作为评析依据）
    rounds: list[dict] = []
    last_assistant = ""
    for msg in t.get("messages") or []:
        if msg.get("role") == "assistant":
            name = (msg.get("name") or "").strip()
            content = (msg.get("content") or "").strip()
            if content:
                last_assistant = content
            if name != "orchestrator":
                continue
        elif msg.get("role") == "user" and last_assistant:
            rounds.append({"question": last_assistant, "answer": (msg.get("content") or "").strip()})
            last_assistant = ""
    out = []
    for i, r in enumerate(rounds):
        o = obs[i] if i < len(obs) else {}
        out.append({
            "round": i + 1,
            "question": r["question"][:q_cap],
            "answer": r["answer"][:a_cap],
            "topic": o.get("topic"),
            "score": o.get("satisfaction_score"),
            "answer_status": o.get("answer_status"),
        })
    return out


CRITIC_SYSTEM = """你是资深的面试官质检与教练专家。你会收到同一位 AI 面试官的 3 场模拟面试逐轮记录（问题、候选人回答、考点、观察员评分）。
候选人由另一个 LLM 按特定人设扮演（有强有弱），你的任务是评估这位面试官的表现并给出可落地的 prompt 优化建议。

评估维度（各 0-10 分）：
- realism 真实感：像不像真人面试官（口语自然、无机器腔、不泄露评分、不虚构评委、无 markdown 残留、无结构预告腔）。
- focus 职责聚焦：问题是否守住该面试官的职责边界（不越界、不漂移、必考领域覆盖）。
- depth_quality 追问质量：是否紧扣候选人上一轮的具体陈述、能抓矛盾与漏洞、深挖有层次而非重复索要。
- breadth 广度：考点覆盖是否合理，不困于单一考点（除非深挖确实有价值）。
- adaptation 适配度：对强/中/弱候选人的难度与风格是否适配（弱者给台阶、强者有挑战、压力面不过界）。

输出严格 JSON（不要输出其他文字）：
{
  "run_scores": [{"run": 1, "realism": 0-10, "focus": 0-10, "depth_quality": 0-10, "breadth": 0-10, "adaptation": 0-10, "note": "一句话概括本场表现"}],
  "strengths": ["表现好的方面，带证据"],
  "issues": [{"severity": "high|medium|low", "category": "类别（如：语言失控/职责漂移/问题堆叠/考点被困/机器腔/虚构阵容/难度失配/追问空洞）", "description": "问题描述", "evidence": "runX 第Y轮：引用原文关键句", "optimization": "针对面试官 prompt 的具体、可执行的修改建议"}],
  "prompt_optimization": "综合所有问题，给这位面试官的 system prompt 写一段 80-200 字的优化建议，说明应增加哪些硬性规则/禁区/校准项，语气保持原人设。"
}

要求：每条 issue 必须引用具体证据（场次+轮次+原文关键词）；宁可少而准，不要凑数；连续 3 场都出现的问题标 high。"""


async def criticize_interviewer(llm: ChatOpenAI, iv_dir: Path, iv_meta: dict) -> dict:
    runs = []
    for i, run_dir in enumerate(sorted(iv_dir.glob("run*"))):
        trimmed = trim_transcript_for_llm(run_dir)
        runs.append({"run": i + 1, "candidate": iv_meta["runs"][i] if i < len(iv_meta["runs"]) else "?", "rounds": trimmed})
    user = json.dumps({
        "interviewer": iv_meta["name"],
        "interviewer_domain": iv_meta["domain"],
        "job_role": iv_meta["job_role"],
        "runs": runs,
    }, ensure_ascii=False)
    return await chat_json(llm, CRITIC_SYSTEM, user)


def run_table(runs: list[dict]) -> str:
    lines = ["| 场次 | 候选人 | 轮数 | markdown | 最大单轮问题数 | 超2问轮次 | 机械开场 | 虚构阵容 | 观察员兜底 | 均分 | 考点数 |",
             "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
    for r in runs:
        lines.append(
            f"| {Path(r['run_dir']).parent.name}/{Path(r['run_dir']).name} | {r['candidate']} | {r['rounds']} "
            f"| {sum(r['markdown_hits'].values())} | {r['max_questions_per_turn']} | {r['turns_over_2_questions']} "
            f"| {len(r['robotic_opener_turns'])} | {'有:' + ','.join(r['fabricated_panel']) if r['fabricated_panel'] else '无'} "
            f"| {len(r['observer_fallback_turns'])} | {r['avg_satisfaction']} | {r['distinct_topics']} |"
        )
    return "\n".join(lines)


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--iteration", required=True)
    parser.add_argument("--compare", default="", help="同时读取另一迭代做对比（在报告中出对比表）")
    args = parser.parse_args()

    iter_dir = OUTPUT_DIR / args.iteration
    out_dir = iter_dir / "analysis"
    out_dir.mkdir(parents=True, exist_ok=True)

    from simulate_per_interviewer import INTERVIEWERS  # noqa: E402
    iv_map = {iv["id"]: iv for iv in INTERVIEWERS}

    llm = ChatOpenAI(
        model=settings.LLM_MODEL, api_key=settings.LLM_API_KEY,
        base_url=settings.LLM_BASE_URL, temperature=0.2, timeout=180, max_retries=0,
    )

    all_metrics: dict[str, dict] = {}
    for iv in INTERVIEWERS:
        iv_dir = iter_dir / iv["id"]
        if not iv_dir.exists():
            print(f"[skip] {iv['id']} 不存在")
            continue
        runs = [rule_metrics(rd) for rd in sorted(iv_dir.glob("run*"))]
        all_metrics[iv["id"]] = {
            "name": iv["name"], "kind": iv["kind"], "domain": iv["domain"],
            "runs": runs, "aggregate": aggregate(runs),
        }
        print(f"[metrics] {iv['id']} ok={all_metrics[iv['id']]['aggregate'].get('runs_ok')}")

    with open(out_dir / "metrics.json", "w", encoding="utf-8") as f:
        json.dump(all_metrics, f, ensure_ascii=False, indent=2)

    # LLM 评析（仅当该面试官 3 场全部 ok 时才评析，避免用残缺数据下结论）
    for iv in INTERVIEWERS:
        if iv["id"] not in all_metrics:
            continue
        runs = all_metrics[iv["id"]]["runs"]
        if len(runs) < 3 or any(r["status"] != "ok" for r in runs):
            continue
        critique_path = out_dir / f"{iv['id']}.json"
        if critique_path.exists():
            print(f"[llm] {iv['id']} 已存在，跳过")
            continue
        try:
            critique = await criticize_interviewer(llm, iter_dir / iv["id"], iv)
            with open(critique_path, "w", encoding="utf-8") as f:
                json.dump(critique, f, ensure_ascii=False, indent=2)
            print(f"[llm] {iv['id']} issues={len(critique.get('issues', []))}")
        except Exception as exc:  # noqa: BLE001
            print(f"[llm][fail] {iv['id']}: {exc}")

    # 汇总报告
    compare_data = None
    if args.compare:
        cmp_metrics_path = OUTPUT_DIR / args.compare / "analysis" / "metrics.json"
        if cmp_metrics_path.exists():
            compare_data = json.load(open(cmp_metrics_path, encoding="utf-8"))

    lines = [f"# 面试官逐人分析报告（{args.iteration}）", ""]
    for iv in INTERVIEWERS:
        m = all_metrics.get(iv["id"])
        if not m:
            continue
        lines += [f"## {iv['name']}（{iv['id']}，{iv['kind']}）", ""]
        lines += [run_table(m["runs"]), ""]
        agg = m["aggregate"]
        lines += [f"汇总：{agg}", ""]
        cpath = out_dir / f"{iv['id']}.json"
        if cpath.exists():
            c = json.load(open(cpath, encoding="utf-8"))
            rs = c.get("run_scores") or []
            if rs:
                lines += ["LLM 评分："]
                for r in rs:
                    lines.append(f"- run{r.get('run')}: realism={r.get('realism')} focus={r.get('focus')} "
                                 f"depth={r.get('depth_quality')} breadth={r.get('breadth')} "
                                 f"adaptation={r.get('adaptation')} — {r.get('note')}")
                lines.append("")
            if c.get("strengths"):
                lines += ["亮点："] + [f"- {s}" for s in c["strengths"]] + [""]
            issues = c.get("issues") or []
            if issues:
                lines += ["问题清单："]
                for i, iss in enumerate(issues, 1):
                    lines.append(f"{i}. [{iss.get('severity')}] {iss.get('category')} — {iss.get('description')}")
                    lines.append(f"   证据：{iss.get('evidence')}")
                    lines.append(f"   建议：{iss.get('optimization')}")
                lines.append("")
            if c.get("prompt_optimization"):
                lines += ["Prompt 优化方向：", f"> {c['prompt_optimization']}", ""]
        if compare_data and iv["id"] in compare_data:
            agg2 = compare_data[iv["id"]].get("aggregate", {})
            lines += [f"与 {args.compare} 对比：", f"- 本轮：{agg}", f"- {args.compare}：{agg2}", ""]
    with open(out_dir / "ANALYSIS.md", "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"报告已写入 {out_dir / 'ANALYSIS.md'}")


if __name__ == "__main__":
    asyncio.run(main())
