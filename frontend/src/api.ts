import type {
  CoursesResponse,
  StructureResponse,
  ProgramSummaryResponse,
  SOSummaryResponse,
  CycleSummaryResponse,
  OverallCompliance,
} from './types';

const API_BASE = '/api';
const STATIC_BASE = '/data';

// Try backend first, fall back to static JSON files (for GitHub Pages)
async function fetchAPI<T>(endpoint: string): Promise<T> {
  // Try the backend API first
  try {
    const res = await fetch(`${API_BASE}${endpoint}`);
    if (res.ok) return res.json();
  } catch {
    // Backend not available, fall through to static
  }
  // Fall back to static JSON
  const res = await fetch(`${STATIC_BASE}${endpoint}.json`);
  if (!res.ok) throw new Error(`Failed to load static data: ${endpoint}`);
  return res.json();
}

export async function fetchStructure(): Promise<StructureResponse> {
  return fetchAPI<StructureResponse>('/structure');
}

export async function fetchCourses(): Promise<CoursesResponse> {
  return fetchAPI<CoursesResponse>('/courses');
}

export async function fetchHealth(): Promise<{ status: string; source: string; courses_loaded: number }> {
  return fetchAPI('/health');
}

export async function fetchProgramSummary(): Promise<ProgramSummaryResponse> {
  return fetchAPI<ProgramSummaryResponse>('/program-summary');
}

export async function fetchSOSummary(): Promise<SOSummaryResponse> {
  return fetchAPI<SOSummaryResponse>('/so-summary');
}

export async function fetchCycleSummary(): Promise<CycleSummaryResponse> {
  return fetchAPI<CycleSummaryResponse>('/cycle-summary');
}

export async function fetchOverallCompliance(): Promise<OverallCompliance> {
  return fetchAPI<OverallCompliance>('/overall-compliance');
}
