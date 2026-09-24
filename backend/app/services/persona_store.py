"""基于 JSON 文件的自定义面试官（人设）存储层。

每个自建面试官对应 PERSONA_DATA_DIR 目录下的一个独立 JSON 文件
（以稳定 key 命名，如 persona_ab12cd34.json），可直接查看、复制与备份。
会话创建时仍会把人设快照写入 custom_config，与旧版行为一致。

历史数据库 interviewer_personas 表中的数据在应用启动时自动导出为
JSON 文件（幂等：已存在的 key 跳过，不删除旧表）。
"""

import asyncio
import json
import logging
import os
import secrets
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set

from app.core.config import settings

logger = logging.getLogger(__name__)

PERSONA_KEY_PREFIX = "persona_"


@dataclass
class PersonaData:
    """自定义面试官数据结构。

    字段与原 SQLAlchemy 模型一一对应，保持 attribute 访问方式，
    兼容 persona_evolver / interviewer_factory 的既有调用。
    """

    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    key: str = ""
    name: str = ""
    avatar: str = "🎭"
    description: str = ""
    system_prompt: str = ""
    focus_topics: List[str] = field(default_factory=list)
    opening_hint: str = ""
    deep_dive_hint: str = ""
    probe_hint: str = ""
    switch_hint: str = ""
    school_of_thought: str = "standard"
    dislikes: List[str] = field(default_factory=list)
    preferences: List[str] = field(default_factory=list)
    skepticism_level: float = 0.5
    interaction_traits: Dict[str, Any] = field(default_factory=dict)
    enabled: bool = True
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)


def persona_to_snapshot(p: PersonaData) -> dict:
    """返回写入会话 custom_config 的完整人设快照。"""
    return {
        "id": p.id,
        "key": p.key,
        "name": p.name,
        "avatar": p.avatar or "🎭",
        "description": p.description or "",
        "system_prompt": p.system_prompt,
        "focus_topics": p.focus_topics or [],
        "opening_hint": p.opening_hint or "",
        "deep_dive_hint": p.deep_dive_hint or "",
        "probe_hint": p.probe_hint or "",
        "switch_hint": p.switch_hint or "",
        "school_of_thought": p.school_of_thought or "standard",
        "dislikes": p.dislikes or [],
        "preferences": p.preferences or [],
        "skepticism_level": float(p.skepticism_level or 0.5),
        "interaction_traits": p.interaction_traits or {},
    }


class PersonaStore:
    """目录下的一组 JSON 文件即全部自建面试官数据（一文件一角色）。"""

    def __init__(self) -> None:
        # 单进程本地应用：写操作串行化即可保证一致性
        self._write_lock = asyncio.Lock()

    # ── 路径解析 ────────────────────────────────────────────────
    def _dir(self) -> Path:
        return Path(settings.PERSONA_DATA_DIR)

    def _path(self, key: str) -> Path:
        return self._dir() / f"{key}.json"

    # ── 同步文件 IO（经 asyncio.to_thread 调用） ────────────────
    def _read_all_sync(self) -> List[PersonaData]:
        directory = self._dir()
        if not directory.exists():
            return []
        personas: List[PersonaData] = []
        for fp in sorted(directory.glob("*.json")):
            try:
                raw = json.loads(fp.read_text(encoding="utf-8"))
                personas.append(self._parse(raw))
            except Exception as e:
                logger.warning(f"Skipping unreadable persona file {fp.name}: {e}")
        return personas

    def _write_sync(self, persona: PersonaData) -> None:
        directory = self._dir()
        directory.mkdir(parents=True, exist_ok=True)
        target = self._path(persona.key)
        tmp = target.with_name(target.name + ".tmp")
        payload = {
            "id": persona.id,
            "key": persona.key,
            "name": persona.name,
            "avatar": persona.avatar,
            "description": persona.description,
            "system_prompt": persona.system_prompt,
            "focus_topics": persona.focus_topics or [],
            "opening_hint": persona.opening_hint,
            "deep_dive_hint": persona.deep_dive_hint,
            "probe_hint": persona.probe_hint,
            "switch_hint": persona.switch_hint,
            "school_of_thought": persona.school_of_thought or "standard",
            "dislikes": persona.dislikes or [],
            "preferences": persona.preferences or [],
            "skepticism_level": float(persona.skepticism_level or 0.5),
            "interaction_traits": persona.interaction_traits or {},
            "enabled": bool(persona.enabled),
            "created_at": persona.created_at.isoformat(),
            "updated_at": persona.updated_at.isoformat(),
        }
        tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, target)

    def _delete_sync(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)

    # ── 解析 ───────────────────────────────────────────────────
    def _parse(self, raw: Dict[str, Any]) -> PersonaData:
        now = datetime.utcnow()

        def _dt(v: Any) -> datetime:
            if isinstance(v, datetime):
                return v
            if isinstance(v, str):
                try:
                    return datetime.fromisoformat(v)
                except ValueError:
                    pass
            return now

        def _json(v: Any, default: Any) -> Any:
            if v is None:
                return default
            if isinstance(v, (list, dict)):
                return v
            if isinstance(v, str):
                try:
                    return json.loads(v)
                except ValueError:
                    return default
            return default

        return PersonaData(
            id=str(raw.get("id") or str(uuid.uuid4())),
            key=str(raw.get("key") or ""),
            name=str(raw.get("name") or ""),
            avatar=str(raw.get("avatar") or "🎭"),
            description=str(raw.get("description") or ""),
            system_prompt=str(raw.get("system_prompt") or ""),
            focus_topics=_json(raw.get("focus_topics"), []),
            opening_hint=str(raw.get("opening_hint") or ""),
            deep_dive_hint=str(raw.get("deep_dive_hint") or ""),
            probe_hint=str(raw.get("probe_hint") or ""),
            switch_hint=str(raw.get("switch_hint") or ""),
            school_of_thought=str(raw.get("school_of_thought") or "standard"),
            dislikes=_json(raw.get("dislikes"), []),
            preferences=_json(raw.get("preferences"), []),
            skepticism_level=float(raw.get("skepticism_level") or 0.5),
            interaction_traits=_json(raw.get("interaction_traits"), {}),
            enabled=bool(raw.get("enabled", True)),
            created_at=_dt(raw.get("created_at")),
            updated_at=_dt(raw.get("updated_at")),
        )

    # ── 对外接口 ───────────────────────────────────────────────
    async def list_personas(self) -> List[PersonaData]:
        personas = await asyncio.to_thread(self._read_all_sync)
        return sorted(personas, key=lambda p: p.created_at, reverse=True)

    async def get_persona(self, persona_id: str) -> Optional[PersonaData]:
        for p in await asyncio.to_thread(self._read_all_sync):
            if p.id == persona_id:
                return p
        return None

    async def get_by_ids(
        self, persona_ids: Iterable[str], enabled_only: bool = True
    ) -> List[PersonaData]:
        wanted = set(persona_ids)
        personas = await asyncio.to_thread(self._read_all_sync)
        return [
            p for p in personas
            if p.id in wanted and (p.enabled or not enabled_only)
        ]

    async def save(self, persona: PersonaData) -> PersonaData:
        if not persona.key:
            persona.key = await self.generate_key()
        persona.updated_at = datetime.utcnow()
        async with self._write_lock:
            await asyncio.to_thread(self._write_sync, persona)
        return persona

    async def delete(self, persona_id: str) -> bool:
        target = await self.get_persona(persona_id)
        if not target:
            return False
        async with self._write_lock:
            await asyncio.to_thread(self._delete_sync, target.key)
        return True

    async def generate_key(self) -> str:
        """生成消息 name / 路由标识用的短 key（interview_messages.name 限 32 字符）。"""
        while True:
            key = f"{PERSONA_KEY_PREFIX}{secrets.token_hex(4)}"
            if not await asyncio.to_thread(lambda: self._path(key).exists()):
                return key

    # ── 历史数据迁移 ───────────────────────────────────────────
    async def migrate_from_database(self) -> int:
        """把旧数据库 interviewer_personas 表数据一次性导出为 JSON 文件（幂等）。

        只在应用启动时调用；不删除旧表，已存在同 key 文件的行跳过。
        """
        from sqlalchemy import inspect as sa_inspect, text
        from app.models.db import engine

        def _read_legacy(sync_conn) -> List[Dict[str, Any]]:
            insp = sa_inspect(sync_conn)
            if "interviewer_personas" not in insp.get_table_names():
                return []
            rows = sync_conn.execute(
                text("SELECT * FROM interviewer_personas")
            ).mappings().all()
            return [dict(r) for r in rows]

        try:
            async with engine.connect() as conn:
                legacy_rows = await conn.run_sync(_read_legacy)
        except Exception as e:
            logger.warning(f"Legacy persona table migration skipped: {e}")
            return 0

        if not legacy_rows:
            return 0

        existing_keys: Set[str] = {p.key for p in await asyncio.to_thread(self._read_all_sync)}
        migrated = 0
        for row in legacy_rows:
            persona = self._parse(dict(row))
            if not persona.key or persona.key in existing_keys:
                continue
            async with self._write_lock:
                await asyncio.to_thread(self._write_sync, persona)
            existing_keys.add(persona.key)
            migrated += 1
        if migrated:
            logger.info(
                f"Migrated {migrated} persona(s) from database table to JSON files "
                f"under {settings.PERSONA_DATA_DIR}"
            )
        return migrated


persona_store = PersonaStore()
