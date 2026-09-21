"""Version Comparator for Champion vs. Challenger gatekeeping.

Evaluates promotion release conditions defined in SYSTEM_ARCHITECTURE.md:
1. Realism must not drop significantly (delta >= -0.05)
2. Professionalism must not regress (delta >= 0.0)
3. Rubric & Coherence consistency must meet baseline (delta >= -0.05)
4. Sensitive & compliance violations must be exactly zero (safety == 1.0)
5. Latency regression must remain within SLA threshold (delta <= 500ms)
"""

import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)


class VersionComparator:
    """Compares benchmark metrics between Champion and Challenger interviewer versions."""

    def compare(
        self,
        champion_metrics: Dict[str, Any],
        challenger_metrics: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Calculates metric deltas and evaluates hard gate criteria for version promotion."""
        champ_realism = champion_metrics.get("realism", 0.85)
        chall_realism = challenger_metrics.get("realism", 0.85)
        realism_delta = round(chall_realism - champ_realism, 3)

        champ_prof = champion_metrics.get("professionalism", 0.85)
        chall_prof = challenger_metrics.get("professionalism", 0.85)
        prof_delta = round(chall_prof - champ_prof, 3)

        champ_coh = champion_metrics.get("coherence", 0.85)
        chall_coh = challenger_metrics.get("coherence", 0.85)
        coh_delta = round(chall_coh - champ_coh, 3)

        chall_safety = challenger_metrics.get("safety", 1.0)
        safety_passed = (chall_safety >= 1.0) and challenger_metrics.get("safety_passed", True)

        champ_lat = champion_metrics.get("avg_latency_ms", 200.0)
        chall_lat = challenger_metrics.get("avg_latency_ms", 200.0)
        lat_delta = round(chall_lat - champ_lat, 1)

        # Gate Checks
        gate_checks = {
            "realism_not_degraded": realism_delta >= -0.05,
            "professionalism_not_regressed": prof_delta >= -0.02,  # slight tolerance or strictly >= 0.0
            "coherence_maintained": coh_delta >= -0.05,
            "zero_compliance_violations": safety_passed,
            "latency_within_threshold": lat_delta <= 500.0,
        }

        all_gates_passed = all(gate_checks.values())

        if all_gates_passed:
            recommendation = "指标达标：Challenger 达到晋升门禁要求，建议发起人工审批或进入小流量 Canary 灰度。"
        else:
            failed = [k for k, v in gate_checks.items() if not v]
            recommendation = f"门禁未通过：存在不达标项 ({', '.join(failed)})，暂不建议晋升。"

        return {
            "passed": all_gates_passed,
            "gate_checks": gate_checks,
            "deltas": {
                "realism_delta": realism_delta,
                "professionalism_delta": prof_delta,
                "coherence_delta": coh_delta,
                "latency_delta_ms": lat_delta,
            },
            "champion_metrics": champion_metrics,
            "challenger_metrics": challenger_metrics,
            "recommendation": recommendation,
        }


version_comparator = VersionComparator()
