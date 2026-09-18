from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base
from app.core.config import settings

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

from sqlalchemy import text

Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        try:
            await conn.execute(text("ALTER TABLE interview_sessions ADD COLUMN web_search_enabled BOOLEAN DEFAULT 0"))
        except Exception:
            pass  # Already exists or not needed
        try:
            await conn.execute(text("ALTER TABLE interview_sessions ADD COLUMN company_scenario JSON"))
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
