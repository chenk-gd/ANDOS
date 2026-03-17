import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { projectService } from '../services/ProjectService';
import type { AuthenticatedRequest } from '../types';
import type { CreateProjectInput, UpdateProjectInput } from '../types/project';

interface ProjectParams {
  id: string;
}

interface OrgParams {
  orgId: string;
}

interface CreateProjectBody {
  org_id: string;
  name: string;
  description?: string;
}

export async function projectRoutes(app: FastifyInstance) {
  app.post('/', async (
    request: FastifyRequest<{ Body: CreateProjectBody }> & AuthenticatedRequest,
    reply: FastifyReply
  ) => {
    const { org_id, name, description } = request.body;
    const created_by = request.user?.userId || request.user?.id || 'system';

    try {
      const project = await projectService.create({
        org_id,
        name,
        description,
        created_by,
      });
      return reply.status(201).send(project);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.status(400).send({ error: message });
    }
  });

  app.get('/orgs/:orgId/projects', async (
    request: FastifyRequest<{ Params: OrgParams }>,
    reply: FastifyReply
  ) => {
    const { orgId } = request.params;
    const projects = await projectService.listByOrg(orgId);
    return reply.send(projects);
  });

  app.get('/:id', async (
    request: FastifyRequest<{ Params: ProjectParams }>,
    reply: FastifyReply
  ) => {
    const { id } = request.params;
    const project = await projectService.getById(id);
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }
    return reply.send(project);
  });

  app.patch('/:id', async (
    request: FastifyRequest<{ Params: ProjectParams; Body: UpdateProjectInput }>,
    reply: FastifyReply
  ) => {
    const { id } = request.params;

    try {
      const project = await projectService.update(id, request.body);
      return reply.send(project);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.status(400).send({ error: message });
    }
  });

  app.delete('/:id', async (
    request: FastifyRequest<{ Params: ProjectParams }>,
    reply: FastifyReply
  ) => {
    const { id } = request.params;

    try {
      await projectService.archive(id);
      return reply.status(204).send();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.status(400).send({ error: message });
    }
  });
}
