export interface User {
  id: string;
  org_id: string;
  username: string;
  email: string;
  phone: string;
  name: string;
  avatar_url?: string;
  status: 'active' | 'inactive' | 'suspended';
  last_login_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserInput {
  org_id: string;
  username: string;
  email: string;
  phone: string;
  name: string;
  password: string;
}

export interface UpdateUserInput {
  email?: string;
  phone?: string;
  name?: string;
  avatar_url?: string;
  status?: 'active' | 'inactive' | 'suspended';
}
