"""Evolution Lab services: offline simulation, defect criticism, candidate optimization, and gatekeeping."""

from app.services.evolution.synthetic_candidate import (
    SyntheticCandidateAgent,
    synthetic_candidate_agent,
    PERSONA_BEHAVIORS,
)
from app.services.evolution.critic import CriticAgent, critic_agent
from app.services.evolution.optimizer import OptimizerAgent, optimizer_agent
from app.services.evolution.safety_reviewer import (
    SafetyFairnessReviewer,
    safety_reviewer,
)
from app.services.evolution.replay_runner import ReplayRunner, replay_runner
from app.services.evolution.comparator import VersionComparator, version_comparator

__all__ = [
    "SyntheticCandidateAgent",
    "synthetic_candidate_agent",
    "PERSONA_BEHAVIORS",
    "CriticAgent",
    "critic_agent",
    "OptimizerAgent",
    "optimizer_agent",
    "SafetyFairnessReviewer",
    "safety_reviewer",
    "ReplayRunner",
    "replay_runner",
    "VersionComparator",
    "version_comparator",
]
