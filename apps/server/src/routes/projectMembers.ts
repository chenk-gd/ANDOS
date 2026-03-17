import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/connection';

interface ProjectMemberParams {
  projectId: string;
  userId: string;
}

interface AddMemberBody {
  user_id: string;
  role_id: string;
}

interface UpdateMemberBody {
  role_id: string;
}

export async function projectMemberRoutes(app: FastifyInstance) {
  app.post('/:projectId/members', async (
    request: FastifyRequest<{ Params: { projectId: string }; Body: AddMemberBody }>,
    reply: FastifyReply
  ) => {
    const { projectId } = request.params;
    const { user_id, role_id } = request.body;

    try {
      const [member] = await db('project_members')
        .insert({
          project_id: projectId,
          user_id,
          role_id,
        })
        .returning('*');

      return reply.status(201).send(member);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.includes('unique')) {
        return reply.status(409).send({ error: 'User is already a member of this project' });
      }
      return reply.status(400).send({ error: message });
    }
  });

  app.get('/:projectId/members', async (
    request: FastifyRequest<{ Params: { projectId: string } }>,
    reply: FastifyReply
  ) => {
    const { projectId } = request.params;

    const members = await db('project_members')
      .join('users', 'project_members.user_id', 'users.id')
      .join('roles', 'project_members.role_id', 'roles.id')
      .where('project_members.project_id', projectId)
      .select(
        'project_members.*',
        'users.username',
        'users.name as user_name',
        'users.email',
        'roles.name as role_name'
      );

    return reply.send(members);
  });

  app.patch('/:projectId/members/:userId', async (
    request: FastifyRequest<{ Params: ProjectMemberParams; Body: UpdateMemberBody }>,
    reply: FastifyReply
  ) => {
    const { projectId, userId } = request.params;
    const { role_id } = request.body;

    const [updated] = await db('project_members')
      .where({ project_id: projectId, user_id: userId })
      .update({ role_id })
      .returning('*');

    if (!updated) {
      return reply.status(404).send({ error: 'Member not found' });
    }

    return reply.send(updated);
  });

  app.delete('/:projectId/members/:userId', async (
    request: FastifyRequest<{ Params: ProjectMemberParams }>,
    reply: FastifyReply
  ) => {
    const { projectId, userId } = request.params;

    await db('project_members')
      .where({ project_id: projectId, user_id: userId })
      .delete();

    return reply.status(204).send();
  });
}
