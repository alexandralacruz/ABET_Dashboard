import { useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CourseRow, OutcomeDef, MetricSet, CoursePeriod } from '../types';

// ── Color palette per SO ──────────────────────────────────────────

const SO_COLORS: Record<number, string> = {
  1: '#1a5276', 2: '#117864', 3: '#b7950b', 4: '#922b21',
  5: '#6c3483', 6: '#d35400', 7: '#2471a3',
};

const BAR_COLORS = { ge3: '#27ae60', ge4: '#f39c12', eq5: '#e74c3c' };

// ── Props ─────────────────────────────────────────────────────────

interface Props {
  outcomes: OutcomeDef[];
  courses: CourseRow[];
  loading: boolean;
}

// ── Group courses by program ──────────────────────────────────────

interface CourseGroup {
  program: string;
  courses: CourseRow[];
}

function groupByProgram(courses: CourseRow[]): CourseGroup[] {
  const map = new Map<string, CourseRow[]>();
  for (const c of courses) {
    const prog = c.program || 'Unknown';
    if (!map.has(prog)) map.set(prog, []);
    map.get(prog)!.push(c);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([program, courses]) => ({ program, courses }));
}

// ── Build SO data for outcomes map ────────────────────────────────

interface SOBlock {
  soNumber: number;
  soName: string;
  indicators: { code: string; metrics: MetricSet | null }[];
}

function buildSOBlocks(
  outcomesMap: Record<string, MetricSet>,
  outcomes: OutcomeDef[],
): SOBlock[] {
  const courseSOCodes = new Set(Object.keys(outcomesMap));
  const relevantOutcomes = outcomes.filter((so) =>
    so.sub_outcomes.some((sub) => courseSOCodes.has(sub.code))
  );

  return relevantOutcomes.map((so) => ({
    soNumber: so.so_number,
    soName: so.so_name,
    indicators: so.sub_outcomes
      .filter((sub) => courseSOCodes.has(sub.code))
      .map((sub) => ({
        code: sub.code,
        metrics: outcomesMap[sub.code] || null,
      })),
  }));
}

// ── Mini Bar component ────────────────────────────────────────────

function MiniBar({ value, color, label }: { value: number | null; color: string; label: string }) {
  return (
    <div className="cv-minibar-row">
      <span className="cv-minibar-label">{label}</span>
      <div className="cv-minibar-track">
        <div
          className="cv-minibar-fill"
          style={{
            width: value != null ? `${Math.min(value, 100)}%` : '0%',
            backgroundColor: color,
          }}
        />
      </div>
      <span className="cv-minibar-value">{value != null ? `${value.toFixed(0)}%` : '—'}</span>
    </div>
  );
}

// ── PDF export per course ─────────────────────────────────────────

function exportCoursePDF(course: CourseRow, soBlocks: SOBlock[], label?: string) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  let y = 15;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('ABET Student Outcomes — Course Report', pageW / 2, y, { align: 'center' });
  y += 8;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`Course: ${course.course}`, 14, y);
  y += 6;
  doc.text(`Program: ${course.program}`, 14, y);
  y += 6;
  if (label) {
    doc.text(`View: ${label}`, 14, y);
    y += 6;
  }

  const profs: string[] = [];
  if (course.professor_2024b) profs.push(`2024B: ${course.professor_2024b}`);
  if (course.professor_2025a) profs.push(`2025A: ${course.professor_2025a}`);
  if (course.professor_2026a) profs.push(`2026A: ${course.professor_2026a}`);
  if (profs.length > 0) {
    doc.text(`Professors: ${profs.join(' | ')}`, 14, y);
    y += 6;
  }
  y += 4;

  const body: (string | number)[][] = [];
  for (const block of soBlocks) {
    body.push([`SO${block.soNumber}: ${block.soName}`, '', '', '']);
    for (const ind of block.indicators) {
      body.push([
        '',
        ind.code,
        ind.metrics?.ge3 != null ? `${ind.metrics.ge3.toFixed(1)}%` : '—',
        ind.metrics?.ge4 != null ? `${ind.metrics.ge4.toFixed(1)}%` : '—',
      ]);
    }
  }

  autoTable(doc, {
    startY: y,
    head: [['Student Outcome', 'Indicator', '% ≥ 3', '% ≥ 4']],
    body,
    theme: 'grid',
    headStyles: { fillColor: [26, 26, 46], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9, halign: 'center' },
    bodyStyles: { fontSize: 8.5, cellPadding: 3, valign: 'middle' },
    columnStyles: {
      0: { cellWidth: 70, fontStyle: 'bold' },
      1: { cellWidth: 24, halign: 'center' },
      2: { cellWidth: 30, halign: 'center' },
      3: { cellWidth: 30, halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.column.index >= 2 && data.cell.raw !== '—') {
        const pct = parseFloat(String(data.cell.raw));
        if (!isNaN(pct)) {
          if (pct >= 80) data.cell.styles.textColor = [30, 132, 73];
          else if (pct >= 60) data.cell.styles.textColor = [125, 102, 8];
          else data.cell.styles.textColor = [176, 58, 46];
        }
      }
    },
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.text(
    'Prepared by the Planning Office — Dirección de Planeación · Universidad de Ibagué',
    pageW / 2, finalY, { align: 'center' }
  );

  doc.save(`ABET_${course.course.replace(/\s+/g, '_')}${label ? '_' + label.replace(/\s+/g, '_') : ''}.pdf`);
}

// ── Cycle helpers ─────────────────────────────────────────────────

type ViewId = 'aggregated' | 'cycle1' | 'cycle2';

interface CycleTab {
  id: ViewId;
  label: string;
  hasData: boolean;
  periods: CoursePeriod[];    // constituent periods
  totalStudents: number;
}

/** Periods that make up each cycle */
const CYCLE_PERIODS: Record<string, string[]> = {
  cycle1: ['2024B', '2025A'],
  cycle2: ['2026A'],
};

function getCycleTabs(course: CourseRow): CycleTab[] {
  const c1Periods = CYCLE_PERIODS.cycle1
    .map((s) => course.periods[s])
    .filter((p): p is CoursePeriod => p != null && Object.keys(p.outcomes).length > 0);

  const c2Periods = CYCLE_PERIODS.cycle2
    .map((s) => course.periods[s])
    .filter((p): p is CoursePeriod => p != null && Object.keys(p.outcomes).length > 0);

  return [
    {
      id: 'aggregated',
      label: 'All',
      hasData: true,
      periods: [],
      totalStudents: c1Periods.reduce((s, p) => s + p.student_count, 0)
                    + c2Periods.reduce((s, p) => s + p.student_count, 0),
    },
    {
      id: 'cycle1',
      label: 'Cycle 1',
      hasData: c1Periods.length > 0,
      periods: c1Periods,
      totalStudents: c1Periods.reduce((s, p) => s + p.student_count, 0),
    },
    {
      id: 'cycle2',
      label: 'Cycle 2',
      hasData: c2Periods.length > 0,
      periods: c2Periods,
      totalStudents: c2Periods.reduce((s, p) => s + p.student_count, 0),
    },
  ];
}

/** Combine multiple periods' outcomes using weighted average by student count */
function combinePeriodOutcomes(periods: CoursePeriod[]): Record<string, MetricSet> {
  if (periods.length === 0) return {};
  if (periods.length === 1) return { ...periods[0].outcomes };

  const result: Record<string, MetricSet> = {};

  // Collect all unique SO codes
  const allCodes = new Set<string>();
  for (const p of periods) {
    for (const code of Object.keys(p.outcomes)) {
      allCodes.add(code);
    }
  }

  for (const code of allCodes) {
    let totalWeight = 0;
    let sumGe3 = 0;
    let sumGe4 = 0;
    let sumEq5 = 0;

    for (const p of periods) {
      const m = p.outcomes[code];
      if (m && m.ge3 != null) {
        const w = p.student_count || 1;
        sumGe3 += (m.ge3 ?? 0) * w;
        sumGe4 += (m.ge4 ?? 0) * w;
        sumEq5 += (m.eq5 ?? 0) * w;
        totalWeight += w;
      }
    }

    if (totalWeight > 0) {
      result[code] = {
        ge3: Math.round(sumGe3 / totalWeight * 10) / 10,
        ge4: Math.round(sumGe4 / totalWeight * 10) / 10,
        eq5: Math.round(sumEq5 / totalWeight * 10) / 10,
      };
    }
  }

  return result;
}

function getOutcomesForView(course: CourseRow, viewId: ViewId): Record<string, MetricSet> {
  if (viewId === 'aggregated') return course.outcomes;
  const semesters = CYCLE_PERIODS[viewId];
  const periods = semesters
    .map((s) => course.periods[s])
    .filter((p): p is CoursePeriod => p != null && Object.keys(p.outcomes).length > 0);
  return combinePeriodOutcomes(periods);
}

// ── Main Component ────────────────────────────────────────────────

export default function CoursesView({ outcomes, courses, loading }: Props) {
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());
  const [expandedPrograms, setExpandedPrograms] = useState<Set<string>>(new Set());
  const [selectedView, setSelectedView] = useState<Record<string, ViewId>>({});

  const programGroups = useMemo(() => groupByProgram(courses), [courses]);

  // Initialize all programs expanded
  useMemo(() => {
    if (programGroups.length > 0) {
      setExpandedPrograms((prev) => {
        if (prev.size === 0) {
          return new Set(programGroups.map((g) => g.program));
        }
        return prev;
      });
    }
  }, [programGroups]);

  const toggleCourse = (courseName: string) => {
    setExpandedCourses((prev) => {
      const next = new Set(prev);
      if (next.has(courseName)) next.delete(courseName);
      else next.add(courseName);
      return next;
    });
    setSelectedView((prev) => {
      if (!(courseName in prev)) {
        return { ...prev, [courseName]: 'aggregated' };
      }
      return prev;
    });
  };

  const toggleProgram = (program: string) => {
    setExpandedPrograms((prev) => {
      const next = new Set(prev);
      if (next.has(program)) next.delete(program);
      else next.add(program);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
        <p>Loading ABET student outcomes data&hellip;</p>
      </div>
    );
  }

  return (
    <div className="courses-view">
      {/* Program blocks */}
      <div className="cv-programs">
        {programGroups.map((group) => {
          const isProgExpanded = expandedPrograms.has(group.program);

          return (
            <div key={group.program} className="cv-program-block">
              <button
                className={`cv-program-header ${isProgExpanded ? 'cv-expanded' : ''}`}
                onClick={() => toggleProgram(group.program)}
              >
                <span className="cv-program-chevron">{isProgExpanded ? '▼' : '▶'}</span>
                <span className="cv-program-name">{group.program}</span>
                <span className="cv-program-badge">{group.courses.length} courses</span>
              </button>

              {isProgExpanded && (
                <div className="cv-courses">
                  {group.courses.map((course) => {
                    const isExpanded = expandedCourses.has(course.course);
                    const cycleTabs = getCycleTabs(course);
                    const activeViewId = selectedView[course.course] || 'aggregated';
                    const activeOutcomes = getOutcomesForView(course, activeViewId);
                    const soBlocks = buildSOBlocks(activeOutcomes, outcomes);
                    const activeTab = cycleTabs.find((t) => t.id === activeViewId);

                    // Professor summary for expanded course
                    const profs: { sem: string; name: string }[] = [];
                    if (course.professor_2024b) profs.push({ sem: '2024B', name: course.professor_2024b });
                    if (course.professor_2025a) profs.push({ sem: '2025A', name: course.professor_2025a });
                    if (course.professor_2026a) profs.push({ sem: '2026A', name: course.professor_2026a });

                    return (
                      <div key={course.course} className={`cv-course-card ${isExpanded ? 'cv-course-expanded' : ''}`}>
                        {/* Course header */}
                        <div className="cv-course-header" onClick={() => toggleCourse(course.course)}>
                          <span className="cv-course-chevron">{isExpanded ? '▼' : '▶'}</span>
                          <span className="cv-course-name">{course.course}</span>
                          <span className="cv-course-so-count">
                            {soBlocks.length} SO{soBlocks.length !== 1 ? 's' : ''}
                          </span>
                          <button
                            className="cv-course-export"
                            onClick={(e) => {
                              e.stopPropagation();
                              const label = activeViewId !== 'aggregated'
                                ? activeTab?.label
                                : undefined;
                              exportCoursePDF(course, soBlocks, label);
                            }}
                            title="Export course report"
                          >
                            📄
                          </button>
                        </div>

                        {/* Professor bar with cycle grouping */}
                        {isExpanded && profs.length > 0 && (
                          <div className="cv-course-professors">
                            <span className="cv-prof-cycle-group">
                              <span className="cv-prof-cycle-label">C1</span>
                              {profs.filter(p => p.sem === '2024B' || p.sem === '2025A').map((p) => (
                                <span key={p.sem} className="cv-prof-tag">{p.sem}: {p.name}</span>
                              ))}
                            </span>
                            <span className="cv-prof-cycle-group">
                              <span className="cv-prof-cycle-label cv-prof-c2">C2</span>
                              {profs.filter(p => p.sem === '2026A').map((p) => (
                                <span key={p.sem} className="cv-prof-tag">{p.sem}: {p.name}</span>
                              ))}
                            </span>
                          </div>
                        )}

                        {/* Expanded content */}
                        {isExpanded && (
                          <>
                            {/* Cycle tabs */}
                            <div className="cv-period-tabs">
                              {cycleTabs.map((tab) => (
                                <button
                                  key={tab.id}
                                  className={`cv-period-tab ${activeViewId === tab.id ? 'cv-period-active' : ''} ${!tab.hasData ? 'cv-period-disabled' : ''}`}
                                  disabled={!tab.hasData}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedView((prev) => ({ ...prev, [course.course]: tab.id }));
                                  }}
                                >
                                  {tab.id === 'aggregated' ? '📊 ' : '🔄 '}
                                  {tab.label}
                                  {tab.totalStudents > 0 && tab.id !== 'aggregated' && (
                                    <span className="cv-tab-n">({tab.totalStudents} st.)</span>
                                  )}
                                </button>
                              ))}
                            </div>

                            {/* Cycle info — show constituent periods */}
                            {activeViewId !== 'aggregated' && activeTab && activeTab.periods.length > 0 && (
                              <div className="cv-period-info">
                                <span className={`cv-period-cycle-badge ${activeViewId === 'cycle1' ? 'cv-badge-c1' : 'cv-badge-c2'}`}>
                                  {activeTab.label}
                                </span>
                                <span className="cv-period-composition">
                                  {activeTab.periods.map((p, i) => (
                                    <span key={p.semester}>
                                      {i > 0 && ' + '}
                                      <strong>{p.semester}</strong> ({p.student_count} st.)
                                    </span>
                                  ))}
                                </span>
                              </div>
                            )}

                            {/* SO indicator blocks */}
                            <div className="cv-so-grid">
                              {soBlocks.length === 0 ? (
                                <div className="cv-no-data">No student outcome data for this view</div>
                              ) : (
                                soBlocks.map((block) => (
                                  <div
                                    key={block.soNumber}
                                    className="cv-so-card"
                                    style={{ borderLeftColor: SO_COLORS[block.soNumber] || '#333' }}
                                  >
                                    <div className="cv-so-card-header">
                                      <span
                                        className="cv-so-number"
                                        style={{ backgroundColor: SO_COLORS[block.soNumber] || '#333' }}
                                      >
                                        SO{block.soNumber}
                                      </span>
                                      <span className="cv-so-name">{block.soName}</span>
                                    </div>
                                    <div className="cv-so-bars">
                                      {block.indicators.map((ind) => (
                                        <div key={ind.code} className="cv-indicator-group">
                                          <div className="cv-indicator-code">{ind.code}</div>
                                          <MiniBar value={ind.metrics?.ge3 ?? null} color={BAR_COLORS.ge3} label="≥3" />
                                          <MiniBar value={ind.metrics?.ge4 ?? null} color={BAR_COLORS.ge4} label="≥4" />
                                          <MiniBar value={ind.metrics?.eq5 ?? null} color={BAR_COLORS.eq5} label="=5" />
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="legend">
        <span className="legend-item"><span className="swatch cell-high" /> ≥ 80%</span>
        <span className="legend-item"><span className="swatch cell-mid" /> 60–79%</span>
        <span className="legend-item"><span className="swatch cell-low" /> &lt; 60%</span>
        <span className="legend-item"><span className="swatch cell-na" /> No data</span>
      </div>
    </div>
  );
}
