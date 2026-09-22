from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base
from app.core.config import settings

import logging
logger = logging.getLogger(__name__)

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {}
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

from sqlalchemy import text, inspect as sa_inspect

Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

# 含 user_id 遗留列的表：SQLite 无法直接 DROP 参与 FOREIGN KEY 定义的列，需整表重建
_LEGACY_USER_TABLES = ("interview_sessions", "interviewer_personas", "user_resumes")


def _rebuild_tables_without_user_id(sync_conn) -> None:
    """单用户本地模式：把仍含 user_id 列的旧表重建为当前模型结构（幂等）。"""
    insp = sa_inspect(sync_conn)
    existing = set(insp.get_table_names())
    for tname in _LEGACY_USER_TABLES:
        if tname not in existing:
            continue
        old_cols = [c["name"] for c in insp.get_columns(tname)]
        if "user_id" not in old_cols:
            continue
        legacy_indexes = [idx["name"] for idx in insp.get_indexes(tname) if idx["name"]]
        keep = ", ".join(
            c.name for c in Base.metadata.tables[tname].columns if c.name in old_cols
        )
        legacy_name = f"{tname}__legacy_user"
        sync_conn.exec_driver_sql(f"ALTER TABLE {tname} RENAME TO {legacy_name}")
        for idx in legacy_indexes:
            sync_conn.exec_driver_sql(f"DROP INDEX IF EXISTS {idx}")
        Base.metadata.tables[tname].create(bind=sync_conn)
        sync_conn.exec_driver_sql(f"INSERT INTO {tname} ({keep}) SELECT {keep} FROM {legacy_name}")
        sync_conn.exec_driver_sql(f"DROP TABLE {legacy_name}")

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # 单用户本地模式：移除账号体系遗留的表与 user_id 列（幂等迁移，DDL 在事务内原子生效）
        try:
            await conn.run_sync(_rebuild_tables_without_user_id)
            await conn.execute(text("DROP TABLE IF EXISTS user_profiles"))
            await conn.execute(text("DROP TABLE IF EXISTS users"))
        except Exception as e:
            logger.warning(f"Legacy user-column migration skipped: {e}")
        try:
            await conn.execute(text("ALTER TABLE interview_sessions ADD COLUMN web_search_enabled BOOLEAN DEFAULT 0"))
        except Exception:
            pass  # Already exists or not needed
        try:
            await conn.execute(text("ALTER TABLE interview_sessions ADD COLUMN company_scenario JSON"))
        except Exception:
            pass
        for col, dtype in [
            ("interviewer_id", "VARCHAR(64) DEFAULT 'orchestrator'"),
            ("interviewer_version", "VARCHAR(64) DEFAULT 'legacy-v1'"),
            ("trace_id", "VARCHAR(64)"),
        ]:
            try:
                await conn.execute(text(f"ALTER TABLE interview_sessions ADD COLUMN {col} {dtype}"))
            except Exception:
                pass
        # 消息顺序号列：用于 interview_messages 增量同步与回滚（幂等迁移）
        try:
            await conn.execute(text("ALTER TABLE interview_messages ADD COLUMN seq INTEGER"))
        except Exception:
            pass  # Already exists or not needed
        try:
            await conn.execute(text("ALTER TABLE interview_messages ADD COLUMN search_metadata JSON"))
        except Exception:
            pass  # Already exists or not needed
        try:
            await conn.execute(text("ALTER TABLE interview_messages ADD COLUMN prompt_log_id VARCHAR(64)"))
        except Exception:
            pass  # Already exists or not needed
        try:
            await conn.execute(text(
                "UPDATE interview_messages SET seq = ("
                "  SELECT COUNT(*) FROM interview_messages m2"
                "  WHERE m2.session_id = interview_messages.session_id"
                "    AND (m2.created_at < interview_messages.created_at"
                "         OR (m2.created_at = interview_messages.created_at AND m2.rowid <= interview_messages.rowid))"
                ") - 1 WHERE seq IS NULL"
            ))
        except Exception:
            pass  # Legacy rows already backfilled or table empty
        # InterviewerPersona 流派画像字段
        for col, dtype in [
            ("school_of_thought", "VARCHAR(32) DEFAULT 'standard'"),
            ("dislikes", "JSON"),
            ("preferences", "JSON"),
            ("skepticism_level", "FLOAT DEFAULT 0.5"),
            ("interaction_traits", "JSON"),
        ]:
            try:
                await conn.execute(text(f"ALTER TABLE interviewer_personas ADD COLUMN {col} {dtype}"))
            except Exception:
                pass

        # evolution_candidates 进化表扩展字段
        for col, dtype in [
            ("interviewer_id", "VARCHAR(64)"),
            ("candidate_version", "VARCHAR(32)"),
            ("safety_check_passed", "BOOLEAN DEFAULT 0"),
            ("created_by", "VARCHAR(64) DEFAULT 'optimizer'"),
            ("updated_at", "DATETIME"),
        ]:
            try:
                await conn.execute(text(f"ALTER TABLE evolution_candidates ADD COLUMN {col} {dtype}"))
            except Exception:
                pass

        # 面试日程：谈薪阶段记录 Offer 薪资（幂等迁移）
        try:
            await conn.execute(text("ALTER TABLE interview_schedules ADD COLUMN salary VARCHAR(128)"))
        except Exception:
            pass  # Already exists

        # 面试日程：记录邮件提醒已发送时间
        try:
            await conn.execute(text("ALTER TABLE interview_schedules ADD COLUMN email_reminded_at DATETIME"))
        except Exception:
            pass  # Already exists

        # 简历编辑功能：user_resumes 记录最后修改时间
        try:
            await conn.execute(text("ALTER TABLE user_resumes ADD COLUMN updated_at DATETIME"))
        except Exception:
            pass  # Already exists
