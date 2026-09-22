"""
把优化后的自建面试官人设写回真实数据库（interview_copilot.db）。

用法（backend 目录下）：
    .venv/Scripts/python scripts/update_personas.py --from simulation_output/optimization/personas_v2.json
    .venv/Scripts/python scripts/update_personas.py --from simulation_output/personas_backup.json   # 回滚

JSON 格式：数组，元素包含 id + 要更新的字段（name/system_prompt/focus_topics/opening_hint/
deep_dive_hint/probe_hint/switch_hint/dislikes/preferences/skepticism_level/interaction_traits/
description/school_of_thought），只更新 JSON 里出现的字段，并记录 audit 事件。
"""
import argparse
import json
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
REAL_DB = BACKEND_DIR / "interview_copilot.db"

UPDATABLE = {
    "name", "avatar", "description", "system_prompt", "focus_topics",
    "opening_hint", "deep_dive_hint", "probe_hint", "switch_hint",
    "school_of_thought", "dislikes", "preferences", "skepticism_level",
    "interaction_traits", "enabled",
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--from", dest="src", required=True, help="优化后人设 JSON 文件")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    data = json.load(open(args.src, encoding="utf-8"))
    conn = sqlite3.connect(REAL_DB)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    now = datetime.now().isoformat()
    changed = 0
    for item in data:
        pid = item.get("id")
        if not pid:
            raise SystemExit(f"缺少 id: {item}")
        row = cur.execute("SELECT * FROM interviewer_personas WHERE id=?", (pid,)).fetchone()
        if not row:
            raise SystemExit(f"人设不存在: {pid}")
        updates = {k: v for k, v in item.items() if k in UPDATABLE and k != "id"}
        if not updates:
            continue
        diffs = []
        for k, v in updates.items():
            old = row[k]
            if isinstance(v, (dict, list)):
                v = json.dumps(v, ensure_ascii=False)
            if old != v:
                diffs.append(k)
        if not diffs:
            print(f"[skip] {row['name']}（无变化）")
            continue
        print(f"[update] {row['name']} 字段: {', '.join(diffs)}")
        for k in diffs:
            print(f"    {k}: {str(row[k])[:80]!r} -> {str(updates[k])[:80]!r}")
        if not args.dry_run:
            sets = ", ".join(f"{k}=?" for k in diffs)
            cur.execute(
                f"UPDATE interviewer_personas SET {sets}, updated_at=? WHERE id=?",
                [json.dumps(updates[k], ensure_ascii=False) if isinstance(updates[k], (dict, list)) else updates[k] for k in diffs] + [now, pid],
            )
            cur.execute(
                "INSERT INTO audit_events (id, event_type, actor, target_id, payload, created_at) "
                "VALUES (lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-'||'4'||substr(lower(hex(randomblob(2))),2)||'-'||'8'||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6))), "
                "'persona_optimized', 'simulation-optimizer', ?, ?, ?)",
                (pid, json.dumps({"fields": diffs, "source": args.src}, ensure_ascii=False), now),
            )
            changed += 1
    if not args.dry_run:
        conn.commit()
    conn.close()
    print(f"完成：{changed} 个人设已更新{'（dry-run 未落库）' if args.dry_run else ''}")


if __name__ == "__main__":
    main()
