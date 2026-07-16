"""
FastAPI server for ABET Dashboard.
Reads Excel data from backend/data/ and serves student outcomes.
"""
import logging
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from models import (
    OUTCOME_DEFINITIONS,
    METRIC_LABELS,
    CourseRow,
    get_all_sub_outcome_codes,
)
from loader import load_all_courses
from program_summary import compute_program_summary, compute_so_summary, compute_cycle_summaries, compute_overall_compliance

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(
    title="ABET Dashboard API",
    description="API for ABET Student Outcomes Dashboard",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Response models ──────────────────────────────────────────────────

class SubOutcomeMeta(BaseModel):
    code: str
    so_number: int
    so_name: str


class StructureResponse(BaseModel):
    outcomes: list[dict]
    sub_outcomes: list[SubOutcomeMeta]
    metric_labels: list[str]


class CoursesResponse(BaseModel):
    courses: list[dict]
    count: int
    source: str


# ── In-memory cache ──────────────────────────────────────────────────

_courses_cache: Optional[list[CourseRow]] = None


def get_courses() -> list[CourseRow]:
    global _courses_cache
    if _courses_cache is None:
        _courses_cache = load_all_courses("data")
    return _courses_cache


# ── Routes ───────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    courses = get_courses()
    return {"status": "ok", "source": "excel", "courses_loaded": len(courses)}


@app.get("/api/structure", response_model=StructureResponse)
async def get_structure():
    """Return the column structure, dynamically including all SO codes found."""
    # Get actual SO codes from data
    courses = get_courses()
    all_codes = get_all_sub_outcome_codes(courses)

    outcomes = []
    sub_outcomes = []

    # Build SO groups from definitions, filling in codes from data
    so_groups: dict[int, dict] = {}
    for so in OUTCOME_DEFINITIONS:
        so_groups[so.so_number] = {
            "so_number": so.so_number,
            "so_name": so.so_name,
            "sub_outcomes": [],
            "codes_seen": set(),
        }

    for code in sorted(all_codes, key=lambda c: (int(c.split(".")[0]), int(c.split(".")[1]))):
        so_num = int(code.split(".")[0])
        if so_num not in so_groups:
            # Unknown SO group — create a placeholder
            so_groups[so_num] = {
                "so_number": so_num,
                "so_name": f"Student Outcome {so_num}",
                "sub_outcomes": [],
                "codes_seen": set(),
            }
        if code not in so_groups[so_num]["codes_seen"]:
            so_groups[so_num]["sub_outcomes"].append({"code": code})
            so_groups[so_num]["codes_seen"].add(code)
            sub_outcomes.append(SubOutcomeMeta(
                code=code,
                so_number=so_num,
                so_name=so_groups[so_num]["so_name"],
            ))

    # Keep SOs in numeric order
    for so_num in sorted(so_groups.keys()):
        outcomes.append({
            "so_number": so_groups[so_num]["so_number"],
            "so_name": so_groups[so_num]["so_name"],
            "sub_outcomes": so_groups[so_num]["sub_outcomes"],
        })

    return StructureResponse(
        outcomes=outcomes,
        sub_outcomes=sub_outcomes,
        metric_labels=METRIC_LABELS,
    )


def course_rows_to_dict(courses: list[CourseRow]) -> list[dict]:
    """Convert CourseRow list to JSON-serializable list of dicts."""
    result = []
    for c in courses:
        d = {
            "course": c.course,
            "program": c.program,
            "professor_2024b": c.professor_2024b,
            "professor_2025a": c.professor_2025a,
            "professor_2026a": c.professor_2026a,
            "outcomes": {},
            "periods": {},
        }
        for code, ms in c.outcomes.items():
            d["outcomes"][code] = {
                "ge3": ms.ge3,
                "ge4": ms.ge4,
                "eq5": ms.eq5,
            }
        for sem, period in c.periods.items():
            period_outcomes = {}
            for code, ms in period.outcomes.items():
                period_outcomes[code] = {
                    "ge3": ms.ge3,
                    "ge4": ms.ge4,
                    "eq5": ms.eq5,
                }
            d["periods"][sem] = {
                "semester": period.semester,
                "cycle": period.cycle,
                "professor": period.professor,
                "student_count": period.student_count,
                "outcomes": period_outcomes,
            }
        result.append(d)
    return result


@app.get("/api/courses", response_model=CoursesResponse)
async def get_courses_endpoint():
    """Fetch all course data from Excel files."""
    try:
        courses = get_courses()
        return CoursesResponse(
            courses=course_rows_to_dict(courses),
            count=len(courses),
            source="excel",
        )
    except Exception as e:
        logger.error("Error loading courses: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


class ProgramSummaryItem(BaseModel):
    program: str
    outcomes: dict  # so_code → { ge3, ge4, eq5, n }


class ProgramSummaryResponse(BaseModel):
    programs: list[ProgramSummaryItem]
    count: int


class SOSummaryItem(BaseModel):
    so_number: int
    so_name: str
    ge3_pct: float
    ge4_pct: float
    eq5_pct: float
    total_records: int
    sub_outcomes: list[dict]


class SOSummaryResponse(BaseModel):
    outcomes: list[SOSummaryItem]
    count: int


@app.get("/api/program-summary", response_model=ProgramSummaryResponse)
async def get_program_summary():
    """Program-level SO compliance aggregation."""
    try:
        data = compute_program_summary("data")
        return ProgramSummaryResponse(programs=data, count=len(data))
    except Exception as e:
        logger.error("Error computing program summary: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/so-summary", response_model=SOSummaryResponse)
async def get_so_summary():
    """SO-level aggregation across all students (indicator cards)."""
    try:
        data = compute_so_summary("data")
        return SOSummaryResponse(outcomes=data, count=len(data))
    except Exception as e:
        logger.error("Error computing SO summary: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


class CycleSummaryResponse(BaseModel):
    cycle1: dict  # { program_summary, so_summary }
    cycle2: dict  # { program_summary, so_summary }


@app.get("/api/cycle-summary", response_model=CycleSummaryResponse)
async def get_cycle_summary():
    """Cycle-level (Cycle 1 vs Cycle 2) program and SO summaries."""
    try:
        data = compute_cycle_summaries("data")
        return CycleSummaryResponse(cycle1=data["cycle1"], cycle2=data["cycle2"])
    except Exception as e:
        logger.error("Error computing cycle summary: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


class ComplianceSet(BaseModel):
    total_records: int
    ge3_pct: float
    ge3_count: int
    ge4_pct: float
    ge4_count: int
    eq5_pct: float
    eq5_count: int


class OverallComplianceResponse(BaseModel):
    total_records: int
    active_courses: int
    ge3_pct: float
    ge3_count: int
    ge4_pct: float
    ge4_count: int
    eq5_pct: float
    eq5_count: int
    cycle1: ComplianceSet
    cycle2: ComplianceSet


@app.get("/api/overall-compliance", response_model=OverallComplianceResponse)
async def get_overall_compliance():
    """Overall compliance percentages across all student scores."""
    try:
        data = compute_overall_compliance("data")
        return OverallComplianceResponse(**data)
    except Exception as e:
        logger.error("Error computing overall compliance: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
