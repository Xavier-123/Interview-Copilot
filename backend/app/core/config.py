import os
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    PROJECT_NAME: str = "Interview-Copilot"
    VERSION: str = "0.1.0"
    API_V1_STR: str = "/api/v1"

    # LLM Settings (OpenAI / DeepSeek / Qwen / Moonshot compatible)
    LLM_API_KEY: str = os.getenv("LLM_API_KEY", os.getenv("OPENAI_API_KEY", "mock-key"))
    LLM_BASE_URL: Optional[str] = os.getenv("LLM_BASE_URL", os.getenv("OPENAI_BASE_URL", None))
    LLM_MODEL: str = os.getenv("LLM_MODEL", "gpt-4o")
    LLM_TEMPERATURE: float = 0.7

    # Optional server-side default for real web search. Per-request credentials
    # take precedence and are never persisted.
    TAVILY_API_KEY: str = os.getenv("TAVILY_API_KEY", "")

    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./interview_copilot.db")

    # Uploads
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "./uploads")

    # Security & CORS
    CORS_ORIGINS: list[str] = ["*"]

    # Debug / Mock Mode
    ENABLE_MOCK_MODE: bool = os.getenv("ENABLE_MOCK_MODE", "false").lower() in ("true", "1")

settings = Settings()
