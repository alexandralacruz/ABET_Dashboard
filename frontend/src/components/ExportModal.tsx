import { useState, useMemo } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CourseRow, OutcomeDef } from '../types';

// ── Props ──────────────────────────────────────────────────────

interface Props {
  course: CourseRow;
  outcomes: OutcomeDef[];
  onClose: () => void;
}

// ── Build SO data for export ───────────────────────────────────

interface ExportRow {
  soNumber: number;
  soName: string;
  indicator: string;
  pct: number | null;
  interpretation: string;
}

function buildExportRows(course: CourseRow, outcomes: OutcomeDef[]): ExportRow[] {
  const rows: ExportRow[] = [];
  for (const so of outcomes) {
    let first = true;
    for (const sub of so.sub_outcomes) {
      const metrics = course.outcomes[sub.code];
      const pct = metrics?.ge3 ?? null;
      rows.push({
        soNumber: so.so_number,
        soName: so.so_name,
        indicator: sub.code,
        pct,
        interpretation: '',
      });
      first = false;
    }
  }
  return rows;
}

// ── Component ──────────────────────────────────────────────────

export default function ExportModal({ course, outcomes, onClose }: Props) {
  const exportRows = useMemo(() => buildExportRows(course, outcomes), [course, outcomes]);
  const [rows, setRows] = useState<ExportRow[]>(exportRows);
  const [courseNotes, setCourseNotes] = useState('');

  const updateInterpretation = (idx: number, text: string) => {
    const updated = [...rows];
    updated[idx] = { ...updated[idx], interpretation: text };
    setRows(updated);
  };

  const generatePDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();

    // ── Title ────────────────────────────────────────────────
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('ABET Student Outcomes Report', pageW / 2, 15, { align: 'center' });

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`Course: ${course.course}`, 14, 25);
    doc.text(`Program: ${course.program}`, 14, 31);

    if (courseNotes.trim()) {
      doc.setFontSize(9);
      doc.text(`Notes: ${courseNotes}`, 14, 38);
    }

    // ── Build table data ─────────────────────────────────────
    const body: (string | number)[][] = [];
    let currentSO = -1;

    for (const r of rows) {
      const soLabel = r.soNumber !== currentSO ? `SO${r.soNumber}: ${r.soName}` : '';
      currentSO = r.soNumber;
      body.push([
        soLabel,
        r.indicator,
        r.pct != null ? `${r.pct.toFixed(1)}%` : '—',
        r.interpretation,
      ]);
    }

    // ── Render table ─────────────────────────────────────────
    autoTable(doc, {
      startY: courseNotes.trim() ? 43 : 37,
      head: [['Student Outcome', 'Indicator', '% Students ≥ 3', 'Interpretation']],
      body,
      theme: 'grid',
      headStyles: {
        fillColor: [26, 26, 46],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
        halign: 'center',
      },
      bodyStyles: {
        fontSize: 8.5,
        cellPadding: 3,
        valign: 'middle',
      },
      columnStyles: {
        0: { cellWidth: 62, fontStyle: 'bold' },
        1: { cellWidth: 22, halign: 'center' },
        2: { cellWidth: 30, halign: 'center' },
        3: { cellWidth: 'auto' },
      },
      alternateRowStyles: {
        fillColor: [245, 247, 250],
      },
      didParseCell: (data) => {
        // Color-code the % column
        if (data.column.index === 2 && data.cell.raw != null && data.cell.raw !== '—') {
          const pct = parseFloat(String(data.cell.raw));
          if (!isNaN(pct)) {
            if (pct >= 80) {
              data.cell.styles.textColor = [30, 132, 73]; // green
            } else if (pct >= 60) {
              data.cell.styles.textColor = [125, 102, 8]; // amber
            } else {
              data.cell.styles.textColor = [176, 58, 46]; // red
            }
          }
        }
        // Merge SO cells vertically
        if (data.column.index === 0 && data.row.index > 0) {
          const prev = body[data.row.index - 1][0];
          const curr = body[data.row.index][0];
          if (prev === curr) {
            data.cell.text = [''];
          }
        }
      },
    });

    // ── Footer ───────────────────────────────────────────────
    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text(
      'Prepared by the Planning Office — Dirección de Planeación · Universidad de Ibagué',
      pageW / 2, finalY, { align: 'center' }
    );

    doc.save(`ABET_${course.course.replace(/\s+/g, '_')}.pdf`);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Export Report: {course.course}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <p className="modal-hint">
            Fill in interpretation notes, then download the PDF.
          </p>

          <div className="export-notes">
            <label>Course Notes</label>
            <textarea
              value={courseNotes}
              onChange={(e) => setCourseNotes(e.target.value)}
              rows={2}
              placeholder="Optional course-level notes..."
            />
          </div>

          <table className="export-table">
            <thead>
              <tr>
                <th>Student Outcome</th>
                <th>Indicator</th>
                <th>% ≥ 3</th>
                <th>Interpretation</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const isNewSO = i === 0 || rows[i - 1].soNumber !== r.soNumber;
                return (
                  <tr key={`${r.soNumber}-${r.indicator}`} className={isNewSO ? 'so-first-row' : ''}>
                    <td className="export-so-cell">
                      {isNewSO ? `SO${r.soNumber}: ${r.soName}` : ''}
                    </td>
                    <td className="export-indicator-cell">{r.indicator}</td>
                    <td
                      className={`export-pct-cell ${
                        r.pct != null
                          ? r.pct >= 80
                            ? 'cell-high'
                            : r.pct >= 60
                            ? 'cell-mid'
                            : 'cell-low'
                          : 'cell-na'
                      }`}
                    >
                      {r.pct != null ? `${r.pct.toFixed(1)}%` : '—'}
                    </td>
                    <td className="export-interp-cell">
                      <input
                        type="text"
                        value={r.interpretation}
                        onChange={(e) => updateInterpretation(i, e.target.value)}
                        placeholder="Write interpretation..."
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          <button className="btn-export" onClick={generatePDF}>
            📄 Download PDF
          </button>
        </div>
      </div>
    </div>
  );
}
