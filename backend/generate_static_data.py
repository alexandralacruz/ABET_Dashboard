"""
Generate static JSON data files for GitHub Pages deployment.
Run: python generate_static_data.py
Output: ../frontend/public/data/*.json
"""
import json
import logging
from pathlib import Path

logging.disable(logging.CRITICAL)

from loader import load_all_courses
from program_summary import (
    compute_program_summary,
    compute_so_summary,
    compute_cycle_summaries,
    compute_overall_compliance,
)
from main import (
    course_rows_to_dict,
    get_all_sub_outcome_codes,
    OUTCOME_DEFINITIONS,
    METRIC_LABELS,
)

OUTPUT_DIR = Path(__file__).parent.parent / "frontend" / "public" / "data"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

courses = load_all_courses("data")

# ── courses.json ───────────────────────────────────────────────
courses_dict = course_rows_to_dict(courses)
all_codes = get_all_sub_outcome_codes(courses)

with open(OUTPUT_DIR / "courses.json", "w", encoding="utf-8") as f:
    json.dump({"courses": courses_dict, "count": len(courses_dict), "source": "static"}, f)
print(f"✓ courses.json ({len(courses_dict)} courses)")

# ── structure.json ─────────────────────────────────────────────
so_groups: dict[int, dict] = {}
for so in OUTCOME_DEFINITIONS:
    so_groups[so.so_number] = {
        "so_number": so.so_number,
        "so_name": so.so_name,
        "sub_outcomes": [],
        "codes_seen": set(),
    }
sub_outcomes = []
for code in sorted(all_codes, key=lambda c: (int(c.split(".")[0]), int(c.split(".")[1]))):
    so_num = int(code.split(".")[0])
    if so_num not in so_groups:
        so_groups[so_num] = {
            "so_number": so_num,
            "so_name": f"Student Outcome {so_num}",
            "sub_outcomes": [],
            "codes_seen": set(),
        }
    if code not in so_groups[so_num]["codes_seen"]:
        so_groups[so_num]["sub_outcomes"].append({"code": code})
        so_groups[so_num]["codes_seen"].add(code)
        sub_outcomes.append({
            "code": code,
            "so_number": so_num,
            "so_name": so_groups[so_num]["so_name"],
        })

outcomes_list = []
for so_num in sorted(so_groups.keys()):
    outcomes_list.append({
        "so_number": so_groups[so_num]["so_number"],
        "so_name": so_groups[so_num]["so_name"],
        "sub_outcomes": so_groups[so_num]["sub_outcomes"],
    })

with open(OUTPUT_DIR / "structure.json", "w", encoding="utf-8") as f:
    json.dump({
        "outcomes": outcomes_list,
        "sub_outcomes": sub_outcomes,
        "metric_labels": METRIC_LABELS,
    }, f)
print(f"✓ structure.json ({len(outcomes_list)} SOs, {len(sub_outcomes)} indicators)")

# ── program-summary.json ───────────────────────────────────────
prog = compute_program_summary("data")
with open(OUTPUT_DIR / "program-summary.json", "w", encoding="utf-8") as f:
    json.dump({"programs": prog, "count": len(prog)}, f)
print(f"✓ program-summary.json ({len(prog)} programs)")

# ── so-summary.json ────────────────────────────────────────────
so = compute_so_summary("data")
with open(OUTPUT_DIR / "so-summary.json", "w", encoding="utf-8") as f:
    json.dump({"outcomes": so, "count": len(so)}, f)
print(f"✓ so-summary.json ({len(so)} outcomes)")

# ── cycle-summary.json ─────────────────────────────────────────
cycles = compute_cycle_summaries("data")
with open(OUTPUT_DIR / "cycle-summary.json", "w", encoding="utf-8") as f:
    json.dump({"cycle1": cycles["cycle1"], "cycle2": cycles["cycle2"]}, f)
print(f"✓ cycle-summary.json")

# ── overall-compliance.json ────────────────────────────────────
ov = compute_overall_compliance("data")
with open(OUTPUT_DIR / "overall-compliance.json", "w", encoding="utf-8") as f:
    json.dump(ov, f)
print(f"✓ overall-compliance.json")

# ── health.json ────────────────────────────────────────────────
with open(OUTPUT_DIR / "health.json", "w", encoding="utf-8") as f:
    json.dump({"status": "ok", "source": "static", "courses_loaded": len(courses_dict)}, f)
print(f"✓ health.json")

print(f"\nDone! Files written to {OUTPUT_DIR}")
