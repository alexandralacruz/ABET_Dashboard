import { useState, useEffect } from 'react';
import CoursesView from './components/CoursesView';
import ProgramSummary from './components/ProgramSummary';
import { fetchStructure, fetchCourses, fetchProgramSummary, fetchSOSummary, fetchCycleSummary, fetchOverallCompliance } from './api';
import type { OutcomeDef, CourseRow, ProgramRow, SOSummaryItem, CycleSummary, OverallCompliance } from './types';
import './App.css';

type TabId = 'courses' | 'program';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('courses');

  const [outcomes, setOutcomes] = useState<OutcomeDef[]>([]);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [programData, setProgramData] = useState<ProgramRow[]>([]);
  const [soData, setSOData] = useState<SOSummaryItem[]>([]);
  const [cycleData, setCycleData] = useState<{ cycle1: CycleSummary; cycle2: CycleSummary } | null>(null);
  const [overall, setOverall] = useState<OverallCompliance | null>(null);
  const [loadingProgram, setLoadingProgram] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [structure, coursesRes] = await Promise.all([
          fetchStructure(),
          fetchCourses(),
        ]);
        setOutcomes(structure.outcomes);
        setCourses(coursesRes.courses);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoadingCourses(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    async function loadProgram() {
      try {
        const [progRes, soRes] = await Promise.all([
          fetchProgramSummary(),
          fetchSOSummary(),
        ]);
        setProgramData(progRes.programs);
        setSOData(soRes.outcomes);
        // Also fetch cycle & overall summaries
        try {
          const [cycleRes, overallRes] = await Promise.all([
            fetchCycleSummary(),
            fetchOverallCompliance(),
          ]);
          setCycleData({ cycle1: cycleRes.cycle1, cycle2: cycleRes.cycle2 });
          setOverall(overallRes);
        } catch (cycleErr) {
          console.error('Cycle/overall summary load error:', cycleErr);
        }
      } catch (err) {
        console.error('Program summary load error:', err);
      } finally {
        setLoadingProgram(false);
      }
    }
    loadProgram();
  }, []);

  if (error) {
    return (
      <div className="app-error">
        <h2>⚠️ Cannot connect to backend</h2>
        <p>{error}</p>
        <p className="hint">
          Make sure the backend is running:
          <br />
          <code>cd backend && source .venv/bin/activate && uvicorn main:app --reload</code>
        </p>
        <button className="btn-retry" onClick={() => window.location.reload()}>
          🔄 Retry
        </button>
      </div>
    );
  }

  // ── Aggregate stats for summary bar ───────────────────────
  const totalIndicators = outcomes.reduce((sum, so) => sum + so.sub_outcomes.length, 0);

  return (
    <div className="app">
      <header className="app-header">
        <h1>ABET Student Outcomes Dashboard</h1>
        <span className="header-subtitle">Universidad de Ibagué — Systems Engineering</span>
        <div className="header-right">
          <nav className="tab-nav">
            <button
              className={`tab-btn ${activeTab === 'courses' ? 'tab-active' : ''}`}
              onClick={() => setActiveTab('courses')}
            >
              Courses
            </button>
            <button
              className={`tab-btn ${activeTab === 'program' ? 'tab-active' : ''}`}
              onClick={() => setActiveTab('program')}
            >
              Program Summary
            </button>
          </nav>
        </div>
      </header>

      {/* Common summary bar */}
      <div className="dashboard-summary">
        <div className="ds-card">
          <span className="ds-value">{overall?.active_courses ?? courses.length}</span>
          <span className="ds-label">Active Courses</span>
        </div>
        <div className="ds-card">
          <span className="ds-value">{outcomes.length}</span>
          <span className="ds-label">Student Outcomes</span>
        </div>
        <div className="ds-card">
          <span className="ds-value">{totalIndicators}</span>
          <span className="ds-label">Indicators</span>
        </div>

        {overall && (
          <>
            <div className="ds-divider" />
            <div className="ds-card ds-card-high">
              <span className="ds-value">{overall.ge3_pct.toFixed(1)}%</span>
              <span className="ds-label">Meet ≥ 3</span>
              <span className="ds-detail">{overall.ge3_count.toLocaleString()} de {overall.total_records.toLocaleString()}</span>
            </div>
            <div className="ds-card ds-card-mid">
              <span className="ds-value">{overall.ge4_pct.toFixed(1)}%</span>
              <span className="ds-label">Meet ≥ 4</span>
              <span className="ds-detail">{overall.ge4_count.toLocaleString()} de {overall.total_records.toLocaleString()}</span>
            </div>
            <div className="ds-card ds-card-low">
              <span className="ds-value">{overall.eq5_pct.toFixed(1)}%</span>
              <span className="ds-label">Meet = 5</span>
              <span className="ds-detail">{overall.eq5_count.toLocaleString()} de {overall.total_records.toLocaleString()}</span>
            </div>
            <div className="ds-divider" />
          </>
        )}


      </div>

      <main>
        {activeTab === 'courses' ? (
          <CoursesView
            outcomes={outcomes}
            courses={courses}
            loading={loadingCourses}
          />
        ) : (
          <ProgramSummary
            outcomes={outcomes}
            programData={programData}
            soData={soData}
            cycleData={cycleData}
            overall={overall}
            loading={loadingProgram}
          />
        )}
      </main>


    </div>
  );
}
