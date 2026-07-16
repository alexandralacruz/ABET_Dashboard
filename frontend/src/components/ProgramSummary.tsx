import { useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { OutcomeDef, ProgramRow, SOSummaryItem, CycleSummary, OverallCompliance } from '../types';

// ── Color palette ──────────────────────────────────────────────

const SO_COLORS: Record<number, string> = {
  1: '#1a5276', 2: '#117864', 3: '#b7950b', 4: '#922b21',
  5: '#6c3483', 6: '#d35400', 7: '#2471a3',
};

const SO_CARD_BG: Record<number, string> = {
  1: '#ebf5fb', 2: '#eafaf1', 3: '#fef9e7', 4: '#fdedec',
  5: '#f4ecf7', 6: '#fef5e7', 7: '#ebf5fb',
};

const SO_ROW_BG: Record<number, string> = {
  1: '#ebf5fb33', 2: '#eafaf133', 3: '#fef9e733', 4: '#fdedec33',
  5: '#f4ecf733', 6: '#fef5e733', 7: '#ebf5fb33',
};

// ── Props ──────────────────────────────────────────────────────

interface Props {
  outcomes: OutcomeDef[];
  programData: ProgramRow[];
  soData: SOSummaryItem[];
  cycleData: { cycle1: CycleSummary; cycle2: CycleSummary } | null;
  overall: OverallCompliance | null;
  loading: boolean;
}

type ViewId = 'aggregated' | 'cycle1' | 'cycle2';

const VIEW_LABELS: Record<ViewId, string> = {
  aggregated: 'All periods',
  cycle1: 'Cycle 1 (2024B + 2025A)',
  cycle2: 'Cycle 2 (2026A)',
};

// ── Transposed table builder ───────────────────────────────────

interface TransposedRow {
  soNumber: number;
  soName: string;
  indicator: string;
  ge3: number | null;
  ge4: number | null;
  eq5: number | null;
  n: number;
}

function buildTransposedRows(
  outcomes: OutcomeDef[],
  programData: ProgramRow[],
): TransposedRow[] {
  // Merge all program outcomes (normally just one program)
  const merged: Record<string, { ge3: number; ge4: number; eq5: number; n: number }> = {};
  for (const prog of programData) {
    for (const [code, m] of Object.entries(prog.outcomes)) {
      if (!merged[code]) {
        merged[code] = { ge3: 0, ge4: 0, eq5: 0, n: 0 };
      }
      // Weighted merge by n
      const totalN = merged[code].n + m.n;
      if (totalN > 0) {
        merged[code].ge3 = Math.round((merged[code].ge3 * merged[code].n + m.ge3 * m.n) / totalN * 10) / 10;
        merged[code].ge4 = Math.round((merged[code].ge4 * merged[code].n + m.ge4 * m.n) / totalN * 10) / 10;
        merged[code].eq5 = Math.round((merged[code].eq5 * merged[code].n + m.eq5 * m.n) / totalN * 10) / 10;
      }
      merged[code].n = totalN;
    }
  }

  const rows: TransposedRow[] = [];
  for (const so of outcomes) {
    let firstInSO = true;
    for (const sub of so.sub_outcomes) {
      const m = merged[sub.code];
      rows.push({
        soNumber: so.so_number,
        soName: firstInSO ? so.so_name : '',
        indicator: sub.code,
        ge3: m?.ge3 ?? null,
        ge4: m?.ge4 ?? null,
        eq5: m?.eq5 ?? null,
        n: m?.n ?? 0,
      });
      firstInSO = false;
    }
  }
  return rows;
}

// ── Cell styling ───────────────────────────────────────────────

function pctClass(v: number | null): string {
  if (v == null) return 'cell-na';
  if (v >= 80) return 'cell-high';
  if (v >= 60) return 'cell-mid';
  if (v > 0) return 'cell-low';
  return 'cell-na';
}

// ── Bar component ──────────────────────────────────────────────

function Bar({ pct, color, label }: { pct: number; color: string; label: string }) {
  return (
    <div className="so-bar-row">
      <span className="so-bar-label">{label}</span>
      <div className="so-bar-track">
        <div className="so-bar-fill" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }} />
      </div>
      <span className="so-bar-value">{pct.toFixed(1)}%</span>
    </div>
  );
}

// ── PDF Generator ─────────────────────────────────────────────

function generatePDF(
  soData: SOSummaryItem[],
  transposedRows: TransposedRow[],
  outcomes: OutcomeDef[],
  viewLabel?: string,
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  let y = 15;

  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  const title = viewLabel
    ? `ABET Student Outcomes — Program Summary (${viewLabel})`
    : 'ABET Student Outcomes — Program Summary';
  doc.text(title, pageW / 2, y, { align: 'center' });
  y += 10;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Systems Eng. — Universidad de Ibagué', pageW / 2, y, { align: 'center' });
  y += 5;
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageW / 2, y, { align: 'center' });
  y += 10;

  // ── Transposed compliance table ──────────────────────────
  const body: (string | number)[][] = [];
  let currentSO = -1;
  for (const r of transposedRows) {
    const soLabel = r.soNumber !== currentSO
      ? `SO${r.soNumber}: ${r.soName}`
      : '';
    currentSO = r.soNumber;
    body.push([
      soLabel,
      r.indicator,
      r.ge3 != null ? `${r.ge3.toFixed(1)}%` : '—',
      r.ge4 != null ? `${r.ge4.toFixed(1)}%` : '—',
      r.eq5 != null ? `${r.eq5.toFixed(1)}%` : '—',
      r.n,
    ]);
  }

  autoTable(doc, {
    startY: y,
    head: [['Student Outcome', 'Ind.', '≥ 3', '≥ 4', '= 5', 'n']],
    body,
    theme: 'grid',
    headStyles: { fillColor: [26, 26, 46], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9, halign: 'center' },
    bodyStyles: { fontSize: 8.5, cellPadding: 3, valign: 'middle' },
    columnStyles: {
      0: { cellWidth: 60, fontStyle: 'bold' },
      1: { cellWidth: 16, halign: 'center' },
      2: { cellWidth: 24, halign: 'center' },
      3: { cellWidth: 24, halign: 'center' },
      4: { cellWidth: 24, halign: 'center' },
      5: { cellWidth: 18, halign: 'center' },
    },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    didParseCell: (data) => {
      if (data.column.index >= 2 && data.column.index <= 4 && data.cell.raw !== '—') {
        const pct = parseFloat(String(data.cell.raw));
        if (!isNaN(pct)) {
          if (pct >= 80) data.cell.styles.textColor = [30, 132, 73];
          else if (pct >= 60) data.cell.styles.textColor = [125, 102, 8];
          else data.cell.styles.textColor = [176, 58, 46];
        }
      }
    },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  // ── SO cards in PDF ──────────────────────────────────────
  for (const so of soData) {
    if (y > 240) {
      doc.addPage();
      y = 15;
    }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    const soColor = SO_COLORS[so.so_number] || '#333';
    doc.setTextColor(soColor);
    doc.text(`SO${so.so_number}: ${so.so_name}`, 14, y);
    doc.setTextColor(0);
    y += 6;

    const subBody: (string | number)[][] = so.sub_outcomes.map((sub) => [
      sub.code, `${sub.ge3}%`, `${sub.ge4}%`, `${sub.eq5}%`, sub.n,
    ]);
    autoTable(doc, {
      startY: y,
      head: [['Ind.', '≥ 3', '≥ 4', '= 5', 'n']],
      body: subBody,
      theme: 'plain',
      headStyles: { fillColor: [230, 235, 240], textColor: [80, 80, 80], fontStyle: 'bold', fontSize: 8, halign: 'center' },
      bodyStyles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: 25, halign: 'center' },
        2: { cellWidth: 25, halign: 'center' },
        3: { cellWidth: 25, halign: 'center' },
        4: { cellWidth: 20, halign: 'center' },
      },
      margin: { left: 20 },
      tableWidth: 120,
      didParseCell: (data) => {
        if (data.column.index >= 1 && data.column.index <= 3) {
          const pct = parseFloat(String(data.cell.raw));
          if (!isNaN(pct)) {
            if (pct >= 80) data.cell.styles.textColor = [30, 132, 73];
            else if (pct >= 60) data.cell.styles.textColor = [125, 102, 8];
            else data.cell.styles.textColor = [176, 58, 46];
          }
        }
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(130);
  doc.text(
    'Prepared by the Planning Office — Dirección de Planeación · Universidad de Ibagué',
    pageW / 2, 288, { align: 'center' }
  );
  doc.save(`ABET_Program_Summary${viewLabel ? '_' + viewLabel.replace(/\s+/g, '_') : ''}.pdf`);
}

// ── Component ──────────────────────────────────────────────────

export default function ProgramSummary({ outcomes, programData, soData, cycleData, overall, loading }: Props) {
  const [view, setView] = useState<ViewId>('aggregated');

  // Determine which data to show based on active view
  const activeProgramData = view === 'aggregated'
    ? programData
    : (cycleData?.[view]?.program_summary || []);
  const activeSOData = view === 'aggregated'
    ? soData
    : (cycleData?.[view]?.so_summary || []);

  const transposedRows = useMemo(
    () => buildTransposedRows(outcomes, activeProgramData),
    [outcomes, activeProgramData],
  );

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
        <p>Loading program summary&hellip;</p>
      </div>
    );
  }

  const isCycle1Ready = cycleData != null && cycleData.cycle1.so_summary.length > 0;
  const isCycle2Ready = cycleData != null && cycleData.cycle2.so_summary.length > 0;

  return (
    <div className="program-summary">
      {/* Header */}
      <div className="ps-topbar">
        <h2>Program Summary — Systems Eng.</h2>
        <button
          className="btn-export-ps"
          onClick={() => generatePDF(activeSOData, transposedRows, outcomes, VIEW_LABELS[view])}
        >
          📄 Download PDF
        </button>
      </div>

      {/* Cycle tabs */}
      <div className="cv-period-tabs ps-cycle-tabs">
        {([
          { id: 'aggregated' as ViewId, label: 'All', enabled: true, records: soData.reduce((s, so) => s + so.total_records, 0) },
          { id: 'cycle1' as ViewId, label: 'Cycle 1', enabled: isCycle1Ready, records: cycleData?.cycle1.so_summary.reduce((s, so) => s + so.total_records, 0) || 0 },
          { id: 'cycle2' as ViewId, label: 'Cycle 2', enabled: isCycle2Ready, records: cycleData?.cycle2.so_summary.reduce((s, so) => s + so.total_records, 0) || 0 },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            className={`cv-period-tab ${view === tab.id ? 'cv-period-active' : ''} ${!tab.enabled ? 'cv-period-disabled' : ''}`}
            disabled={!tab.enabled}
            onClick={() => setView(tab.id)}
          >
            {tab.id === 'aggregated' ? '📊 ' : '🔄 '}
            {tab.label}
            {tab.records > 0 && tab.id !== 'aggregated' && (
              <span className="cv-tab-n">({tab.records} rec.)</span>
            )}
          </button>
        ))}
      </div>

      {/* Cycle compliance KPI cards */}
      {view !== 'aggregated' && overall && (
        <div className="ps-compliance-row">
          <span className={`cv-period-cycle-badge ${view === 'cycle1' ? 'cv-badge-c1' : 'cv-badge-c2'}`}>
            {VIEW_LABELS[view]}
          </span>
          {(['ge3', 'ge4', 'eq5'] as const).map((metric) => {
            const c = overall[view];
            const labels: Record<string, string> = { ge3: 'Meet ≥ 3', ge4: 'Meet ≥ 4', eq5: 'Meet = 5' };
            const colors: Record<string, string> = { ge3: '#1e8449', ge4: '#b7950b', eq5: '#c0392b' };
            const pct = c[`${metric}_pct` as keyof typeof c] as number;
            const count = c[`${metric}_count` as keyof typeof c] as number;
            return (
              <div key={metric} className="ps-compliance-card">
                <span className="ps-comp-value" style={{ color: colors[metric] }}>
                  {pct.toFixed(1)}%
                </span>
                <span className="ps-comp-label">{labels[metric]}</span>
                <span className="ps-comp-detail">
                  {count.toLocaleString()} de {c.total_records.toLocaleString()} registros
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Transposed Compliance Matrix */}
      <section className="ps-section">
        <h3>Compliance Matrix: Student Outcomes × Indicators</h3>
        <p className="ps-subtitle">
          % of records meeting each criterion by student outcome and indicator
          {view !== 'aggregated' ? ` — ${VIEW_LABELS[view]}` : ''}
        </p>

        <div className="ps-transposed-table">
          <table className="ps-matrix-table">
            <thead>
              <tr>
                <th>Student Outcome</th>
                <th>Ind.</th>
                <th>≥ 3</th>
                <th>≥ 4</th>
                <th>= 5</th>
                <th>n</th>
              </tr>
            </thead>
            <tbody>
              {transposedRows.map((row, i) => {
                // Detect SO group boundaries
                const prevSO = i > 0 ? transposedRows[i - 1].soNumber : -1;
                const isNewSO = row.soNumber !== prevSO;
                const soColor = SO_COLORS[row.soNumber] || '#333';
                const soBg = SO_ROW_BG[row.soNumber] || 'transparent';

                return (
                  <tr
                    key={`${row.soNumber}-${row.indicator}`}
                    className={isNewSO ? 'ps-so-first' : ''}
                    style={isNewSO ? { borderTop: `2px solid ${soColor}` } : { backgroundColor: soBg }}
                  >
                    <td className="ps-so-cell">
                      {isNewSO && (
                        <>
                          <span
                            className="ps-so-dot"
                            style={{ backgroundColor: soColor }}
                          />
                          <strong>SO{row.soNumber}</strong>
                          <span className="ps-so-name-cell">{row.soName}</span>
                        </>
                      )}
                    </td>
                    <td className="ps-ind-cell">{row.indicator}</td>
                    <td className={`ps-pct-cell ${pctClass(row.ge3)}`}>
                      {row.ge3 != null ? `${row.ge3.toFixed(0)}%` : '—'}
                    </td>
                    <td className={`ps-pct-cell ${pctClass(row.ge4)}`}>
                      {row.ge4 != null ? `${row.ge4.toFixed(0)}%` : '—'}
                    </td>
                    <td className={`ps-pct-cell ${pctClass(row.eq5)}`}>
                      {row.eq5 != null ? `${row.eq5.toFixed(0)}%` : '—'}
                    </td>
                    <td className="ps-n-cell">{row.n || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="ps-note">
          Each cell shows the percentage of records meeting the criteria ≥ 3 (basic achievement),
          ≥ 4 (high achievement) and = 5 (maximum achievement), calculated from individual student
          grades by student outcome and indicator.
        </p>
      </section>

      {/* SO Indicator Cards */}
      <section className="ps-section">
        <h3>
          Students by Indicator
          {view !== 'aggregated' ? ` — ${VIEW_LABELS[view]}` : ' — All Courses Combined'}
        </h3>
        {activeSOData.length === 0 ? (
          <div className="cv-no-data">No data available for this view</div>
        ) : (
          <div className="so-cards-grid">
            {activeSOData.map((so) => {
              const barColor = SO_COLORS[so.so_number] || '#333';
              return (
                <div
                  key={so.so_number}
                  className="so-card"
                  style={{ borderTopColor: barColor, backgroundColor: SO_CARD_BG[so.so_number] || '#fff' }}
                >
                  <h4 className="so-card-title">
                    SO{so.so_number}. {so.so_name}
                  </h4>
                  <p className="so-card-subtitle">
                    % of students per indicator
                    {view !== 'aggregated' ? ` — ${VIEW_LABELS[view]}` : ' — all courses combined'}
                  </p>
                  <div className="so-bars">
                    <Bar pct={so.ge3_pct} color="#27ae60" label="≥3" />
                    <Bar pct={so.ge4_pct} color="#f39c12" label="≥4" />
                    <Bar pct={so.eq5_pct} color="#e74c3c" label="=5" />
                  </div>
                  <p className="so-card-n">Total records: {so.total_records}</p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <footer className="ps-footer">
        Prepared by the Planning Office — Dirección de Planeación based on grades
        provided by the Faculty of Sciences, Engineering and Innovation · Universidad de Ibagué
      </footer>
    </div>
  );
}
