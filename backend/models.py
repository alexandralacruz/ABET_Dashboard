"""
Data models and processing for ABET Student Outcomes dashboard.
"""
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class MetricSet:
    """Three metrics (>=3, >=4, 5) for one sub-outcome."""
    ge3: Optional[float] = None   # percentage >= 3
    ge4: Optional[float] = None   # percentage >= 4
    eq5: Optional[float] = None   # percentage == 5


@dataclass
class SubOutcome:
    """A sub-outcome like 1.1, 1.2, etc."""
    code: str          # e.g. "1.1"
    metrics: MetricSet = field(default_factory=MetricSet)


@dataclass
class StudentOutcome:
    """An SO like 'Problem Solving' with its sub-outcomes."""
    so_number: int           # 1-7
    so_name: str             # e.g. "Problem Solving"
    sub_outcomes: list[SubOutcome] = field(default_factory=list)


@dataclass
class PeriodOutcomes:
    """Outcomes and metadata for one semester/period."""
    semester: str            # e.g. "2024B", "2025A", "2026A"
    cycle: str               # "Cycle 1" or "Cycle 2"
    professor: Optional[str] = None
    student_count: int = 0
    outcomes: dict[str, MetricSet] = field(default_factory=dict)


@dataclass
class CourseRow:
    """A single row in the dashboard table."""
    course: str
    program: str
    professor_2024b: Optional[str] = None
    professor_2025a: Optional[str] = None
    professor_2026a: Optional[str] = None
    outcomes: dict[str, MetricSet] = field(default_factory=dict)
    periods: dict[str, PeriodOutcomes] = field(default_factory=dict)
    # key = "1.1", "1.2", ..., "7.1"


# ── Static definition of the ABET structure ──────────────────────────

OUTCOME_DEFINITIONS: list[StudentOutcome] = [
    StudentOutcome(so_number=1, so_name="Problem Solving",
                   sub_outcomes=[SubOutcome("1.1"), SubOutcome("1.2"), SubOutcome("1.3")]),
    StudentOutcome(so_number=2, so_name="Engineering Design",
                   sub_outcomes=[SubOutcome("2.1"), SubOutcome("2.2"), SubOutcome("2.3")]),
    StudentOutcome(so_number=3, so_name="Effective Communication",
                   sub_outcomes=[SubOutcome("3.1"), SubOutcome("3.2")]),
    StudentOutcome(so_number=4, so_name="Ethical Responsibility",
                   sub_outcomes=[SubOutcome("4.1"), SubOutcome("4.2")]),
    StudentOutcome(so_number=5, so_name="Teamwork",
                   sub_outcomes=[SubOutcome("5.1"), SubOutcome("5.2")]),
    StudentOutcome(so_number=6, so_name="Experimentation",
                   sub_outcomes=[SubOutcome("6.1"), SubOutcome("6.2"), SubOutcome("6.3")]),
    StudentOutcome(so_number=7, so_name="New Knowledge",
                   sub_outcomes=[SubOutcome("7.1")]),
]

# Metric suffixes
METRIC_LABELS = ["≥3", "≥4", "5"]

ALL_SUB_OUTCOME_CODES = [
    sub.code
    for so in OUTCOME_DEFINITIONS
    for sub in so.sub_outcomes
]


def parse_percentage(raw: Optional[str]) -> Optional[float]:
    """Parse a cell like '89.2%', '91.9%', '—', '', or None into float or None."""
    if raw is None:
        return None
    raw = raw.strip()
    if raw in ("", "—", "-", "N/A", "n/a", "NA"):
        return None
    # Remove % and whitespace, then parse
    cleaned = raw.replace("%", "").replace(",", ".").strip()
    try:
        val = float(cleaned)
        return val
    except ValueError:
        return None


def parse_dashboard_rows(raw_rows: list[list[str]]) -> list[CourseRow]:
    """
    Parse raw Google Sheets rows into structured CourseRow objects.

    The expected sheet layout has the header in row 1 (SO labels),
    sub-outcome headers in row 2, metric headers in row 3,
    and data starting in row 4.

    Column layout (0-indexed):
      0: Course
      1: Program
      2: Professor 2024B
      3: Professor 2025A
      4: Professor 2026A
      5+: SO metrics (48 columns for 16 sub-outcomes × 3 metrics)
    """
    if len(raw_rows) < 4:
        return []

    data_rows = raw_rows[3:]  # Skip 3 header rows
    courses: list[CourseRow] = []

    for row in data_rows:
        # Pad row to expected width
        padded = row + [""] * (5 + len(ALL_SUB_OUTCOME_CODES) * 3)

        course_name = padded[0].strip() if len(padded) > 0 else ""
        if not course_name:
            continue  # skip empty rows

        row_obj = CourseRow(
            course=course_name,
            program=padded[1].strip() if len(padded) > 1 else "",
            professor_2024b=padded[2].strip() if len(padded) > 2 else None,
            professor_2025a=padded[3].strip() if len(padded) > 3 else None,
            professor_2026a=padded[4].strip() if len(padded) > 4 else None,
        )

        col_idx = 5
        for code in ALL_SUB_OUTCOME_CODES:
            ge3 = parse_percentage(padded[col_idx]) if col_idx < len(padded) else None
            ge4 = parse_percentage(padded[col_idx + 1]) if col_idx + 1 < len(padded) else None
            eq5 = parse_percentage(padded[col_idx + 2]) if col_idx + 2 < len(padded) else None
            row_obj.outcomes[code] = MetricSet(ge3=ge3, ge4=ge4, eq5=eq5)
            col_idx += 3

        courses.append(row_obj)

    return courses


def get_all_sub_outcome_codes(courses: list[CourseRow] | None = None) -> list[str]:
    """
    Return all unique SO sub-outcome codes.
    If courses are provided, include codes found in the data
    in addition to the standard definitions.
    """
    codes = set(ALL_SUB_OUTCOME_CODES)
    if courses:
        for c in courses:
            codes.update(c.outcomes.keys())
    # Sort: by SO number, then sub-outcome number
    return sorted(codes, key=lambda c: (int(c.split(".")[0]), int(c.split(".")[1])))
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
        }
        for code, ms in c.outcomes.items():
            d["outcomes"][code] = {
                "ge3": ms.ge3,
                "ge4": ms.ge4,
                "eq5": ms.eq5,
            }
        result.append(d)
    return result
