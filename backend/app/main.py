import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
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

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Auto-initialize SQLite database tables on startup
    await init_db()
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
        "mock_mode": settings.ENABLE_MOCK_MODE
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
