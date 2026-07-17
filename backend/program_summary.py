"""
Program-level aggregation for ABET Dashboard.
Computes compliance percentages across all courses within a program.
"""

import logging
from collections import defaultdict
from pathlib import Path

from loader import parse_file, normalise_course_name, normalise_professor, compute_percentages, extract_path_info
from models import MetricSet

logger = logging.getLogger(__name__)

# ── Data structures ─────────────────────────────────────────────────

def collect_all_scores(data_dir: str = "data") -> dict:
    """
    Parse all Excel files and return raw student scores.

    Returns:
        {
            "by_program_so": { program: { so_code: [score, ...] } },
            "by_so": { so_code: [score, ...] },
            "programs": [str],
            "cycles": [str],
            "total_students": int (unique student-course pairs)
        }
    """
    base = Path(data_dir)
    if not base.exists():
        return {"by_program_so": {}, "by_so": {}, "programs": [], "cycles": [], "total_students": 0}

    # program → so_code → list of scores
    by_program_so: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    # so_code → list of scores (all programs combined)
    by_so: dict[str, list[float]] = defaultdict(list)
    programs: set[str] = set()
    cycles: set[str] = set()
    total_records = 0

    for xlsx_path in sorted(base.rglob("*.xlsx")):
        if xlsx_path.name.startswith("~$"):
            continue

        try:
            parsed = parse_file(str(xlsx_path))
        except Exception as e:
            logger.warning("Skipping %s: %s", xlsx_path.name, e)
            continue

        semester = parsed["semester"]
        cycles.add(semester)

        # Determine program from path structure
        _, program, _ = extract_path_info(str(xlsx_path))
        programs.add(program)

        scores = parsed["scores"]
        for student_id, so_scores in scores.items():
            for so_code, score in so_scores.items():
                by_program_so[program][so_code].append(score)
                by_so[so_code].append(score)
                total_records += 1

    return {
        "by_program_so": {p: dict(so_dict) for p, so_dict in by_program_so.items()},
        "by_so": dict(by_so),
        "programs": sorted(programs),
        "cycles": sorted(cycles),
        "total_students": total_records,
    }


def compute_program_summary(data_dir: str = "data") -> list[dict]:
    """
    Compute per-program, per-SO compliance percentages.

    Returns list of:
        {
            "program": str,
            "outcomes": { so_code: { ge3, ge4, eq5 } }
        }
    """
    collected = collect_all_scores(data_dir)
    by_program_so = collected["by_program_so"]
    programs = collected["programs"]

    result = []
    for program in programs:
        so_dict = by_program_so.get(program, {})
        outcomes = {}
        for so_code, score_list in so_dict.items():
            n = len(score_list)
            if n == 0:
                continue
            outcomes[so_code] = {
                "ge3": round(sum(1 for s in score_list if s >= 3) / n * 100, 1),
                "ge4": round(sum(1 for s in score_list if s >= 4) / n * 100, 1),
                "eq5": round(sum(1 for s in score_list if s == 5) / n * 100, 1),
                "n": n,
            }
        result.append({
            "program": program,
            "outcomes": outcomes,
        })

    return result


def compute_cycle_summaries(data_dir: str = "data") -> dict:
    """
    Compute program and SO summaries per cycle (Cycle 1: 2024B+2025A, Cycle 2: 2026A).

    Returns:
        {
            "cycle1": { "program_summary": [...], "so_summary": [...] },
            "cycle2": { "program_summary": [...], "so_summary": [...] }
        }
    """
    base = Path(data_dir)
    if not base.exists():
        return {"cycle1": {"program_summary": [], "so_summary": []}, "cycle2": {"program_summary": [], "so_summary": []}}

    CYCLE_MAP = {"2024B": "cycle1", "2025A": "cycle1", "2026A": "cycle2"}

    # cycle → program → so_code → [scores]
    cycle_program_scores: dict[str, dict[str, dict[str, list[float]]]] = {
        "cycle1": defaultdict(lambda: defaultdict(list)),
        "cycle2": defaultdict(lambda: defaultdict(list)),
    }
    # cycle → so_code → [scores]
    cycle_so_scores: dict[str, dict[str, list[float]]] = {
        "cycle1": defaultdict(list),
        "cycle2": defaultdict(list),
    }

    for xlsx_path in sorted(base.rglob("*.xlsx")):
        if xlsx_path.name.startswith("~$"):
            continue
        try:
            parsed = parse_file(str(xlsx_path))
        except Exception as e:
            logger.warning("Skipping %s: %s", xlsx_path.name, e)
            continue

        semester = parsed["semester"]
        cycle = CYCLE_MAP.get(semester)
        if not cycle:
            continue

        # Derive program from path structure
        _, program, _ = extract_path_info(str(xlsx_path))
        scores = parsed["scores"]

        for student_id, so_scores in scores.items():
            for so_code, score in so_scores.items():
                cycle_program_scores[cycle][program][so_code].append(score)
                cycle_so_scores[cycle][so_code].append(score)

    # Build results
    result = {}
    for cycle in ["cycle1", "cycle2"]:
        # Program summary
        prog_summary = []
        for program, so_dict in cycle_program_scores[cycle].items():
            outcomes = {}
            for so_code, score_list in so_dict.items():
                n = len(score_list)
                if n == 0:
                    continue
                outcomes[so_code] = {
                    "ge3": round(sum(1 for s in score_list if s >= 3) / n * 100, 1),
                    "ge4": round(sum(1 for s in score_list if s >= 4) / n * 100, 1),
                    "eq5": round(sum(1 for s in score_list if s == 5) / n * 100, 1),
                    "n": n,
                }
            prog_summary.append({"program": program, "outcomes": outcomes})

        # SO summary
        so_summary = _build_so_summary_from_scores(dict(cycle_so_scores[cycle]))

        result[cycle] = {
            "program_summary": prog_summary,
            "so_summary": so_summary,
        }

    return result


def _build_so_summary_from_scores(by_so: dict[str, list[float]]) -> list[dict]:
    """Build SO summary from raw score lists (used by both all and cycle summaries)."""
    from models import OUTCOME_DEFINITIONS

    so_groups: dict[int, dict] = {}
    for so_def in OUTCOME_DEFINITIONS:
        so_groups[so_def.so_number] = {
            "so_number": so_def.so_number,
            "so_name": so_def.so_name,
            "scores": [],
            "sub_outcomes": [],
        }

    extra_so_nums: set[int] = set()

    for so_code, score_list in sorted(by_so.items()):
        so_num = int(so_code.split(".")[0])
        if so_num not in so_groups:
            extra_so_nums.add(so_num)
            so_groups[so_num] = {
                "so_number": so_num,
                "so_name": f"Student Outcome {so_num}",
                "scores": [],
                "sub_outcomes": [],
            }

        n = len(score_list)
        sub = {
            "code": so_code,
            "ge3": round(sum(1 for s in score_list if s >= 3) / n * 100, 1) if n else 0,
            "ge4": round(sum(1 for s in score_list if s >= 4) / n * 100, 1) if n else 0,
            "eq5": round(sum(1 for s in score_list if s == 5) / n * 100, 1) if n else 0,
            "n": n,
        }
        so_groups[so_num]["sub_outcomes"].append(sub)
        so_groups[so_num]["scores"].extend(score_list)

    result = []
    for so_num in sorted(so_groups.keys()):
        g = so_groups[so_num]
        all_scores = g["scores"]
        n = len(all_scores)
        result.append({
            "so_number": g["so_number"],
            "so_name": g["so_name"],
            "ge3_pct": round(sum(1 for s in all_scores if s >= 3) / n * 100, 1) if n else 0,
            "ge4_pct": round(sum(1 for s in all_scores if s >= 4) / n * 100, 1) if n else 0,
            "eq5_pct": round(sum(1 for s in all_scores if s == 5) / n * 100, 1) if n else 0,
            "total_records": n,
            "sub_outcomes": g["sub_outcomes"],
        })

    return result


def _compute_compliance_from_scores(all_scores: list[float]) -> dict:
    """Compute compliance dict from a flat list of scores."""
    n = len(all_scores)
    if n == 0:
        return {"total_records": 0, "ge3_pct": 0, "ge3_count": 0, "ge4_pct": 0, "ge4_count": 0, "eq5_pct": 0, "eq5_count": 0}
    ge3 = sum(1 for s in all_scores if s >= 3)
    ge4 = sum(1 for s in all_scores if s >= 4)
    eq5 = sum(1 for s in all_scores if s == 5)
    return {
        "total_records": n,
        "ge3_pct": round(ge3 / n * 100, 1),
        "ge3_count": ge3,
        "ge4_pct": round(ge4 / n * 100, 1),
        "ge4_count": ge4,
        "eq5_pct": round(eq5 / n * 100, 1),
        "eq5_count": eq5,
    }


def compute_overall_compliance(data_dir: str = "data") -> dict:
    """
    Compute overall compliance across ALL student scores + per-cycle breakdown.
    Each student-indicator pair counts as one record.
    """
    collected = collect_all_scores(data_dir)
    all_scores: list[float] = []
    active_courses: set[str] = set()

    # Per-cycle scores
    CYCLE_MAP = {"2024B": "cycle1", "2025A": "cycle1", "2026A": "cycle2"}
    cycle_scores: dict[str, list[float]] = {"cycle1": [], "cycle2": []}

    base = Path(data_dir)
    for xlsx_path in sorted(base.rglob("*.xlsx")):
        if xlsx_path.name.startswith("~$"):
            continue
        try:
            parsed = parse_file(str(xlsx_path))
        except Exception:
            continue
        cname = parsed["course"]
        _, program, semester = extract_path_info(str(xlsx_path))
        # Use a tuple (course, program) as the unique course identity
        if cname and parsed.get("scores"):
            active_courses.add((cname, program))
        cycle = CYCLE_MAP.get(semester)
        if cycle:
            for student_scores in parsed["scores"].values():
                for score in student_scores.values():
                    cycle_scores[cycle].append(score)

    for so_scores in collected["by_so"].values():
        all_scores.extend(so_scores)

    result = _compute_compliance_from_scores(all_scores)
    result["active_courses"] = len(active_courses)
    result["cycle1"] = _compute_compliance_from_scores(cycle_scores["cycle1"])
    result["cycle2"] = _compute_compliance_from_scores(cycle_scores["cycle2"])
    return result


def compute_so_summary(data_dir: str = "data") -> list[dict]:
    """
    Compute SO-level summary across all programs (for the indicator cards).
    """
    collected = collect_all_scores(data_dir)
    return _build_so_summary_from_scores(collected["by_so"])
