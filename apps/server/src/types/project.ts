export interface Project {
  id: string;
  org_id: string;
  name: string;
  description?: string;
  status: 'active' | 'archived';
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateProjectInput {
  org_id: string;
  name: string;
  description?: string;
  created_by: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  status?: 'active' | 'archived';
}
