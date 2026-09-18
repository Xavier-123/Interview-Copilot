from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.models.db import init_db
from app.api.v1.auth import router as auth_router
from app.api.v1.interviews import router as interviews_router
from app.api.v1.profiles import router as profiles_router
from app.api.v1.personas import router as personas_router
from app.api.ws.interview_stream import router as ws_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Auto-initialize SQLite database tables on startup
    await init_db()
    yield

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
app.include_router(auth_router, prefix=settings.API_V1_STR)
app.include_router(interviews_router, prefix=settings.API_V1_STR)
app.include_router(profiles_router, prefix=settings.API_V1_STR)
app.include_router(personas_router, prefix=settings.API_V1_STR)
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
