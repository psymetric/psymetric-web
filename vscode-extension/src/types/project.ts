// ─── types/project.ts ────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  lifecycleState?: string;
  maturitySummary?: string;
  nextValidAction?: string;
}

// The API may return either a direct array envelope or a paginated object envelope.
// Both shapes are supported at runtime in selectProject; this union models both.
export type ProjectListResponse =
  | { data: Project[] }
  | { data: { items: Project[]; total: number; page: number; limit: number } };
