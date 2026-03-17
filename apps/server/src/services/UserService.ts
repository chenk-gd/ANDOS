import { db } from '../db/connection';
import { User, CreateUserInput, UpdateUserInput } from '../types/user';
import bcrypt from 'bcrypt';

export class UserService {
  async create(input: CreateUserInput): Promise<User> {
    const existing = await db('users')
      .where('username', input.username)
      .orWhere('email', input.email)
      .orWhere('phone', input.phone)
      .first();

    if (existing) {
      if (existing.username === input.username) throw new Error('Username already exists');
      if (existing.email === input.email) throw new Error('Email already exists');
      if (existing.phone === input.phone) throw new Error('Phone already exists');
    }

    const passwordHash = await bcrypt.hash(input.password, 10);

    const [user] = await db('users')
      .insert({
        org_id: input.org_id,
        username: input.username,
        email: input.email,
        phone: input.phone,
        name: input.name,
        password_hash: passwordHash,
      })
      .returning(['id', 'org_id', 'username', 'email', 'phone', 'name', 'avatar_url', 'status', 'last_login_at', 'created_at', 'updated_at']);

    return user;
  }

  async getById(id: string): Promise<User | null> {
    return db('users').where('id', id).first();
  }

  async getByUsername(username: string): Promise<User | null> {
    return db('users').where('username', username).first();
  }

  async listByOrg(orgId: string): Promise<User[]> {
    return db('users').where('org_id', orgId).orderBy('name');
  }

  async update(id: string, input: UpdateUserInput): Promise<User> {
    const [updated] = await db('users')
      .where('id', id)
      .update({ ...input, updated_at: new Date() })
      .returning(['id', 'org_id', 'username', 'email', 'phone', 'name', 'avatar_url', 'status', 'last_login_at', 'created_at', 'updated_at']);

    if (!updated) throw new Error('User not found');
    return updated;
  }

  async delete(id: string): Promise<void> {
    const memberOf = await db('project_members').where('user_id', id).first();
    if (memberOf) throw new Error('Cannot delete user who is a project member');

    await db('users').where('id', id).delete();
  }

  async updateLastLogin(id: string): Promise<void> {
    await db('users').where('id', id).update({ last_login_at: new Date() });
  }
}

export const userService = new UserService();
