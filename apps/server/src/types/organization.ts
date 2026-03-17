export interface Organization {
  id: string;
  parent_id: string | null;
  name: string;
  description?: string;
  level: number;
  path: string;
  created_at: Date;
  updated_at: Date;
}

export interface OrganizationTree {
  id: string;
  name: string;
  level: number;
  children: OrganizationTree[];
}

export interface CreateOrganizationInput {
  parent_id?: string;
  name: string;
  description?: string;
}

export interface UpdateOrganizationInput {
  name?: string;
  description?: string;
}
