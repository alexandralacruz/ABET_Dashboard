// ── ABET Dashboard Types ──────────────────────────────────────────

export interface MetricSet {
  ge3: number | null;
  ge4: number | null;
  eq5: number | null;
}

export interface CoursePeriod {
  semester: string;
  cycle: string;
  professor: string | null;
  student_count: number;
  outcomes: Record<string, MetricSet>;
}

export interface CourseRow {
  course: string;
  program: string;
  professor_2024b: string | null;
  professor_2025a: string | null;
  professor_2026a: string | null;
  outcomes: Record<string, MetricSet>;
  periods: Record<string, CoursePeriod>;
}

export interface CoursesResponse {
  courses: CourseRow[];
  count: number;
  source: string;
}

export interface SubOutcomeMeta {
  code: string;
  so_number: number;
  so_name: string;
}

export interface OutcomeDef {
  so_number: number;
  so_name: string;
  sub_outcomes: { code: string }[];
}

export interface StructureResponse {
  outcomes: OutcomeDef[];
  sub_outcomes: SubOutcomeMeta[];
  metric_labels: string[];
}

// ── Program Summary Types ────────────────────────────────────────

export interface ProgramRow {
  program: string;
  outcomes: Record<string, { ge3: number; ge4: number; eq5: number; n: number }>;
}

export interface ProgramSummaryResponse {
  programs: ProgramRow[];
  count: number;
}

export interface SOSummaryItem {
  so_number: number;
  so_name: string;
  ge3_pct: number;
  ge4_pct: number;
  eq5_pct: number;
  total_records: number;
  sub_outcomes: { code: string; ge3: number; ge4: number; eq5: number; n: number }[];
}

export interface SOSummaryResponse {
  outcomes: SOSummaryItem[];
  count: number;
}

// ── Overall Compliance ───────────────────────────────────────

export interface ComplianceSet {
  total_records: number;
  ge3_pct: number;
  ge3_count: number;
  ge4_pct: number;
  ge4_count: number;
  eq5_pct: number;
  eq5_count: number;
}

export interface OverallCompliance {
  total_records: number;
  active_courses: number;
  ge3_pct: number;
  ge3_count: number;
  ge4_pct: number;
  ge4_count: number;
  eq5_pct: number;
  eq5_count: number;
  cycle1: ComplianceSet;
  cycle2: ComplianceSet;
}

// ── Cycle Summary Types ───────────────────────────────────────

export interface CycleSummary {
  program_summary: ProgramRow[];
  so_summary: SOSummaryItem[];
}

export interface CycleSummaryResponse {
  cycle1: CycleSummary;
  cycle2: CycleSummary;
}
