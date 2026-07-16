import type {
  CoursesResponse,
  StructureResponse,
  ProgramSummaryResponse,
  SOSummaryResponse,
  CycleSummaryResponse,
  OverallCompliance,
} from './types';

const BASE = '/api';

export async function fetchStructure(): Promise<StructureResponse> {
  const res = await fetch(`${BASE}/structure`);
  if (!res.ok) throw new Error(`Failed to fetch structure: ${res.statusText}`);
  return res.json();
}

export async function fetchCourses(): Promise<CoursesResponse> {
  const res = await fetch(`${BASE}/courses`);
  if (!res.ok) throw new Error(`Failed to fetch courses: ${res.statusText}`);
  return res.json();
}

export async function fetchHealth(): Promise<{ status: string; source: string; courses_loaded: number }> {
  const res = await fetch(`${BASE}/health`);
  return res.json();
}

export async function fetchProgramSummary(): Promise<ProgramSummaryResponse> {
  const res = await fetch(`${BASE}/program-summary`);
  if (!res.ok) throw new Error(`Failed to fetch program summary: ${res.statusText}`);
  return res.json();
}

export async function fetchSOSummary(): Promise<SOSummaryResponse> {
  const res = await fetch(`${BASE}/so-summary`);
  if (!res.ok) throw new Error(`Failed to fetch SO summary: ${res.statusText}`);
  return res.json();
}

export async function fetchCycleSummary(): Promise<CycleSummaryResponse> {
  const res = await fetch(`${BASE}/cycle-summary`);
  if (!res.ok) throw new Error(`Failed to fetch cycle summary: ${res.statusText}`);
  return res.json();
}

export async function fetchOverallCompliance(): Promise<OverallCompliance> {
  const res = await fetch(`${BASE}/overall-compliance`);
  if (!res.ok) throw new Error(`Failed to fetch overall compliance: ${res.statusText}`);
  return res.json();
}
