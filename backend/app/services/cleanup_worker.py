import asyncio
import logging
from datetime import datetime
from typing import Dict, Any, Optional
from app.services.session_manager import session_manager, MIN_PERSIST_ROUNDS

logger = logging.getLogger(__name__)

DEFAULT_CLEANUP_INTERVAL_SECONDS = 3600  # 默认每 1 小时巡检一次
DEFAULT_IDLE_THRESHOLD_MINUTES = 60      # 默认超时 60 分钟未满 3 轮判定为废弃会话


async def run_periodic_cleanup(
    idle_threshold_minutes: int = DEFAULT_IDLE_THRESHOLD_MINUTES,
    min_rounds: int = MIN_PERSIST_ROUNDS,
) -> Dict[str, Any]:
    """
    执行单次全系统未完成会话清理：
    清理创建时间超过 idle_threshold_minutes 且 round_count < min_rounds 的废弃数据，
    联动清理 SQLite 数据库主子表、本地磁盘 uploads/transcripts 目录及内存缓存。
    """
    start_time = datetime.now()
    try:
        deleted_count = await session_manager.cleanup_incomplete_sessions(
            min_rounds=min_rounds,
            older_than_minutes=idle_threshold_minutes,
        )
        elapsed_ms = int((datetime.now() - start_time).total_seconds() * 1000)
        logger.info(
            f"[CleanupWorker] 定时自动清理完成: 清除废弃会话 {deleted_count} 个 "
            f"(门槛: < {min_rounds} 轮, 超时: >= {idle_threshold_minutes} 分钟), 耗时 {elapsed_ms}ms"
        )
        return {
            "status": "success",
            "deleted_sessions": deleted_count,
            "min_rounds": min_rounds,
            "idle_threshold_minutes": idle_threshold_minutes,
            "elapsed_ms": elapsed_ms,
        }
    except Exception as e:
        logger.error(f"[CleanupWorker] 定时自动清理异常: {e}", exc_info=True)
        return {
            "status": "error",
            "error": str(e),
            "deleted_sessions": 0,
        }


async def cleanup_scheduler_loop(
    interval_seconds: int = DEFAULT_CLEANUP_INTERVAL_SECONDS,
    idle_threshold_minutes: int = DEFAULT_IDLE_THRESHOLD_MINUTES,
    min_rounds: int = MIN_PERSIST_ROUNDS,
):
    """
    后台定时任务协程：每隔 interval_seconds 秒自动巡检并清理超时的废弃会话。
    在 FastAPI lifespan 启动时作为后台 Task 挂载，停机时优雅取消。
    """
    logger.info(
        f"[CleanupWorker] 后台定时清理任务已启动 "
        f"(巡检间隔: {interval_seconds}s, 保护窗口: {idle_threshold_minutes}m, 轮次门槛: >= {min_rounds} 轮)"
    )

    while True:
        try:
            await asyncio.sleep(interval_seconds)
            await run_periodic_cleanup(
                idle_threshold_minutes=idle_threshold_minutes,
                min_rounds=min_rounds,
            )
        except asyncio.CancelledError:
            logger.info("[CleanupWorker] 后台定时清理任务已被取消，优雅退出。")
            break
        except Exception as e:
            logger.error(f"[CleanupWorker] 定时清理任务循环异常: {e}", exc_info=True)
            # 发生意外异常时稍作休眠，避免死循环重试打满 CPU
            await asyncio.sleep(10)
