import { useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, ColGroupDef, CellClassParams } from 'ag-grid-community';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import type { OutcomeDef } from '../types';

ModuleRegistry.registerModules([AllCommunityModule]);

// ── Props ──────────────────────────────────────────────────────────

interface DashboardProps {
  outcomes: OutcomeDef[];
  rowData: Record<string, unknown>[];
  loading: boolean;
}

function pctCellClass(params: CellClassParams): string {
  if (params.value == null) return 'cell-na';
  const v = params.value as number;
  if (v >= 80) return 'cell-high';
  if (v >= 60) return 'cell-mid';
  if (v > 0) return 'cell-low';
  return 'cell-na';
}

function pctFormatter(params: { value: number | null }): string {
  if (params.value == null) return '—';
  return `${params.value.toFixed(0)}%`;
}

// ── Column Builder ─────────────────────────────────────────────────

function buildColumnDefs(outcomes: OutcomeDef[]): (ColDef | ColGroupDef)[] {
  const cols: (ColDef | ColGroupDef)[] = [
    {
      headerName: 'Course',
      field: 'course',
      pinned: 'left' as const,
      width: 280,
      filter: 'agTextColumnFilter',
      cellStyle: { fontWeight: 600 },
    },
    {
      headerName: 'Program',
      field: 'program',
      pinned: 'left' as const,
      width: 160,
      filter: 'agTextColumnFilter',
    },
    {
      headerName: 'Professor\n2024B',
      field: 'professor_2024b',
      pinned: 'left' as const,
      width: 200,
      wrapText: true,
    },
    {
      headerName: 'Professor\n2025A',
      field: 'professor_2025a',
      pinned: 'left' as const,
      width: 200,
      wrapText: true,
    },
    {
      headerName: 'Professor\n2026A',
      field: 'professor_2026a',
      pinned: 'left' as const,
      width: 200,
      wrapText: true,
    },
  ];

  for (const so of outcomes) {
    const soId = `SO${so.so_number}`;
    const subGroups: ColGroupDef[] = so.sub_outcomes.map((sub) => {
      const subId = sub.code.replace('.', '_');
      return {
        headerName: sub.code,
        headerClass: `so-sub-header so-sub-${soId}`,
        columnGroupShow: 'open' as const,
        children: [
          { headerName: '≥3', field: `outcome_${subId}_ge3`, width: 68, cellClass: pctCellClass, valueFormatter: pctFormatter, headerClass: 'metric-header metric-ge3', type: 'numericColumn' },
          { headerName: '≥4', field: `outcome_${subId}_ge4`, width: 68, cellClass: pctCellClass, valueFormatter: pctFormatter, headerClass: 'metric-header metric-ge4', type: 'numericColumn' },
          { headerName: '5', field: `outcome_${subId}_eq5`, width: 68, cellClass: pctCellClass, valueFormatter: pctFormatter, headerClass: 'metric-header metric-eq5', type: 'numericColumn' },
        ] as ColDef[],
      };
    });

    cols.push({
      headerName: `${soId}: ${so.so_name}`,
      headerClass: `so-header so-header-${soId}`,
      children: subGroups,
    });
  }

  return cols;
}

// ── Data flattener ─────────────────────────────────────────────────

function flattenRowData(data: Record<string, unknown>[]): Record<string, unknown>[] {
  return data.map((row) => {
    const flat: Record<string, unknown> = {
      course: row.course,
      program: row.program,
      professor_2024b: row.professor_2024b || '—',
      professor_2025a: row.professor_2025a || '—',
      professor_2026a: row.professor_2026a || '—',
    };
    const outcomes = row.outcomes as Record<string, { ge3: number | null; ge4: number | null; eq5: number | null }> | undefined;
    if (outcomes) {
      for (const [code, metrics] of Object.entries(outcomes)) {
        const safeCode = code.replace('.', '_');
        flat[`outcome_${safeCode}_ge3`] = metrics.ge3;
        flat[`outcome_${safeCode}_ge4`] = metrics.ge4;
        flat[`outcome_${safeCode}_eq5`] = metrics.eq5;
      }
    }
    return flat;
  });
}

// ── Component ──────────────────────────────────────────────────────

export default function Dashboard({ outcomes, rowData, loading }: DashboardProps) {
  const columnDefs = useMemo(() => buildColumnDefs(outcomes), [outcomes]);

  const flatData = useMemo(() => flattenRowData(rowData), [rowData]);

  const defaultColDef = useMemo<ColDef>(
    () => ({ resizable: true, sortable: true, suppressMovable: true }),
    [],
  );

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
        <p>Loading ABET student outcomes data&hellip;</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="ag-theme-alpine ag-grid-wrapper">
        <AgGridReact
          rowData={flatData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          suppressRowHoverHighlight={false}
          rowHeight={42}
          headerHeight={60}
          groupHeaderHeight={50}
          animateRows={false}
          domLayout="autoHeight"
          enableCellTextSelection={true}
          suppressScrollOnNewData={true}
          tooltipShowDelay={0}
        />
      </div>
    </div>
  );
}
