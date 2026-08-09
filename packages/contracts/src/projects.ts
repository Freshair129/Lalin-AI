export interface ProjectMeta {
  id: string;
  name: string;
}

export interface ProjectDocument {
  id: string;
  name: string;
  data: Record<string, unknown>;
}
