import asyncio
import logging
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.core.config import settings
from app.agents.llm import LLMError
from app.models.db import init_db
from app.api.v1.interviews import router as interviews_router
from app.api.v1.profiles import router as profiles_router
from app.api.v1.personas import router as personas_router
from app.api.v1.schedules import router as schedules_router
from app.api.v1.notifications import router as notifications_router
from app.api.v1.search import router as search_router
from app.api.v1.interviewer_versions import router as interviewer_versions_router
from app.api.v1.memory import router as memory_router
from app.api.v1.evolution import router as evolution_router
from app.api.ws.interview_stream import router as ws_router
from app.services.reminder_worker import reminder_scheduler_loop
from app.services.cleanup_worker import cleanup_scheduler_loop

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Auto-initialize SQLite database tables on startup
    await init_db()
    # 自建面试官历史数据迁移：数据库 interviewer_personas 表 → JSON 文件（幂等）
    from app.services.persona_store import persona_store
    await persona_store.migrate_from_database()
    # 启动临近面试邮件提醒定时后台轮询 Worker
    reminder_task = asyncio.create_task(reminder_scheduler_loop(interval_seconds=60))
    # 启动未满 3 轮废弃会话自动清理定时后台 Worker (默认每小时巡检，保护 60 分钟内活跃会话)
    cleanup_task = asyncio.create_task(cleanup_scheduler_loop())
    yield
    # 应用优雅停机时取消轮询任务
    reminder_task.cancel()
    cleanup_task.cancel()
    try:
        await reminder_task
    except asyncio.CancelledError:
        pass
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Interview-Copilot: Multi-Agent AI Mock Interview Platform Backend",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan
)


@app.exception_handler(LLMError)
async def llm_error_handler(request: Request, exc: LLMError):
    """模型链路失败：直接返回可读原因，不再伪装成笼统的 500。"""
    logger.error("LLM error path=%s: %s", request.url.path, exc.public_message)
    return JSONResponse(
        status_code=503,
        content={"detail": exc.public_message, "error": "llm_unavailable"},
    )


@app.exception_handler(Exception)
async def unexpected_exception_handler(request: Request, exc: Exception):
    trace_id = uuid.uuid4().hex[:12]
    logger.error("Unhandled request error trace_id=%s path=%s", trace_id, request.url.path, exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "服务暂时不可用", "trace_id": trace_id},
    )

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Routers
app.include_router(interviews_router, prefix=settings.API_V1_STR)
app.include_router(profiles_router, prefix=settings.API_V1_STR)
app.include_router(personas_router, prefix=settings.API_V1_STR)
app.include_router(schedules_router, prefix=settings.API_V1_STR)
app.include_router(notifications_router, prefix=settings.API_V1_STR)
app.include_router(search_router, prefix=settings.API_V1_STR)
app.include_router(interviewer_versions_router, prefix=settings.API_V1_STR)
app.include_router(memory_router, prefix=settings.API_V1_STR)
app.include_router(evolution_router, prefix=settings.API_V1_STR)
app.include_router(ws_router, prefix="/api")

@app.get("/health", tags=["system"])
async def health_check():
    return {
        "status": "healthy",
        "project": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "llm_configured": settings.llm_configured
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
