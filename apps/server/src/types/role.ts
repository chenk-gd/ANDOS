export interface Role {
  id: string;
  name: string;
  description?: string;
  permissions: Permission[];
  is_system: boolean;
  created_at: Date;
}

export type Permission = string;

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role_id: string;
  joined_at: Date;
}

export interface AddProjectMemberInput {
  project_id: string;
  user_id: string;
  role_id: string;
}

export interface UpdateProjectMemberInput {
  role_id: string;
}
