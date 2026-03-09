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

export interface ProjectListResponse {
  data: {
    items: Project[];
    total: number;
    page: number;
    limit: number;
  };
}
