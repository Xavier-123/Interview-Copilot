import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.services.session_manager import session_manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])

@router.websocket("/ws/interview/{session_id}")
async def interview_websocket_endpoint(websocket: WebSocket, session_id: str):
    await websocket.accept()
    logger.info(f"WebSocket client connected for session: {session_id}")
    
    # Verify session
    state = session_manager.get_session(session_id)
    if not state:
        await websocket.send_json({
            "type": "error",
            "message": f"Session {session_id} not found. Please initialize session first."
        })
        await websocket.close()
        return

    # Send current state snapshot
    await websocket.send_json({
        "type": "init_state",
        "stage": state.get("stage"),
        "current_interviewer": state.get("current_interviewer"),
        "messages": state.get("messages", []),
        "status": state.get("status")
    })

    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)
            action = payload.get("action")

            if action == "start":
                await websocket.send_json({"type": "thinking", "interviewer": "orchestrator"})
                new_state = await session_manager.start_session(session_id)
                await websocket.send_json({
                    "type": "state_update",
                    "stage": new_state.get("stage"),
                    "current_interviewer": new_state.get("current_interviewer"),
                    "messages": new_state.get("messages", []),
                    "status": new_state.get("status")
                })

            elif action == "answer":
                user_msg = payload.get("message", "")
                await websocket.send_json({"type": "thinking", "interviewer": "evaluating"})
                new_state = await session_manager.submit_candidate_answer(session_id, user_msg)
                
                # Send latest observation log if any
                obs_logs = new_state.get("evaluation_logs", [])
                latest_obs = obs_logs[-1] if obs_logs else None
                
                await websocket.send_json({
                    "type": "state_update",
                    "stage": new_state.get("stage"),
                    "current_interviewer": new_state.get("current_interviewer"),
                    "round_count": new_state.get("round_count"),
                    "messages": new_state.get("messages", []),
                    "latest_observation": latest_obs,
                    "status": new_state.get("status")
                })

            elif action == "lifeline":
                hint_result = await session_manager.request_lifeline(session_id)
                await websocket.send_json({
                    "type": "lifeline_response",
                    "hint": hint_result.get("hint"),
                    "lifelines_used": hint_result.get("lifelines_used"),
                    "messages": hint_result.get("state", {}).get("messages", [])
                })

            elif action == "finish":
                await websocket.send_json({"type": "thinking", "interviewer": "evaluator"})
                report = await session_manager.finish_and_evaluate(session_id)
                await websocket.send_json({
                    "type": "report_ready",
                    "report": report
                })

            else:
                await websocket.send_json({"type": "warning", "message": f"Unknown action: {action}"})

    except WebSocketDisconnect:
        logger.info(f"WebSocket client disconnected for session {session_id}")
    except Exception as e:
        logger.error(f"WebSocket error in session {session_id}: {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
