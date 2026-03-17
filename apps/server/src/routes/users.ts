import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { userService } from '../services/UserService';
import type { CreateUserInput, UpdateUserInput } from '../types/user';

interface UserParams {
  id: string;
}

interface OrgParams {
  orgId: string;
}

interface CreateUserBody {
  org_id: string;
  username: string;
  email: string;
  phone: string;
  name: string;
  password: string;
}

export async function userRoutes(app: FastifyInstance) {
  app.post('/', async (
    request: FastifyRequest<{ Body: CreateUserBody }>,
    reply: FastifyReply
  ) => {
    const { org_id, username, email, phone, name, password } = request.body;

    try {
      const user = await userService.create({
        org_id,
        username,
        email,
        phone,
        name,
        password,
      });
      return reply.status(201).send(user);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.status(400).send({ error: message });
    }
  });

  app.get('/orgs/:orgId/users', async (
    request: FastifyRequest<{ Params: OrgParams }>,
    reply: FastifyReply
  ) => {
    const { orgId } = request.params;
    const users = await userService.listByOrg(orgId);
    return reply.send(users);
  });

  app.get('/:id', async (
    request: FastifyRequest<{ Params: UserParams }>,
    reply: FastifyReply
  ) => {
    const { id } = request.params;
    const user = await userService.getById(id);
    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }
    return reply.send(user);
  });

  app.patch('/:id', async (
    request: FastifyRequest<{ Params: UserParams; Body: UpdateUserInput }>,
    reply: FastifyReply
  ) => {
    const { id } = request.params;

    try {
      const user = await userService.update(id, request.body);
      return reply.send(user);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.status(400).send({ error: message });
    }
  });

  app.delete('/:id', async (
    request: FastifyRequest<{ Params: UserParams }>,
    reply: FastifyReply
  ) => {
    const { id } = request.params;

    try {
      await userService.delete(id);
      return reply.status(204).send();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.status(400).send({ error: message });
    }
  });
}
