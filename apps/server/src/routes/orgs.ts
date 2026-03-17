import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { organizationService } from '../services/OrganizationService';
import type { CreateOrganizationInput, UpdateOrganizationInput } from '../types/organization';

interface OrgParams {
  id: string;
}

interface CreateOrgBody {
  parent_id?: string;
  name: string;
  description?: string;
}

interface UpdateOrgBody {
  name?: string;
  description?: string;
}

interface GetOrgsQuery {
  root_id?: string;
}

export async function orgRoutes(app: FastifyInstance) {
  app.post('/', async (
    request: FastifyRequest<{ Body: CreateOrgBody }>,
    reply: FastifyReply
  ) => {
    const { parent_id, name, description } = request.body;

    try {
      const org = await organizationService.create({
        parent_id,
        name,
        description,
      });
      return reply.status(201).send(org);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.status(400).send({ error: message });
    }
  });

  app.get('/', async (
    request: FastifyRequest<{ Querystring: GetOrgsQuery }>,
    reply: FastifyReply
  ) => {
    const { root_id } = request.query;
    const tree = await organizationService.getTree(root_id);
    return reply.send(tree);
  });

  app.get('/:id', async (
    request: FastifyRequest<{ Params: OrgParams }>,
    reply: FastifyReply
  ) => {
    const { id } = request.params;
    const org = await organizationService.getById(id);
    if (!org) {
      return reply.status(404).send({ error: 'Organization not found' });
    }
    return reply.send(org);
  });

  app.patch('/:id', async (
    request: FastifyRequest<{ Params: OrgParams; Body: UpdateOrgBody }>,
    reply: FastifyReply
  ) => {
    const { id } = request.params;
    const { name, description } = request.body;

    try {
      const org = await organizationService.update(id, { name, description });
      return reply.send(org);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.status(400).send({ error: message });
    }
  });

  app.delete('/:id', async (
    request: FastifyRequest<{ Params: OrgParams }>,
    reply: FastifyReply
  ) => {
    const { id } = request.params;

    try {
      await organizationService.delete(id);
      return reply.status(204).send();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.status(400).send({ error: message });
    }
  });
}
