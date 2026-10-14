import { CreateProjectSchema, type CreateProjectData, type Project } from '@pixel/contracts';
import { Types } from 'mongoose';
import { ProjectModel } from '../../operations/project.model.js';
import { createProject, findProjectByActionKey } from '../../operations/projects.service.js';
import { defineCapability, type PixelTool } from '../action.types.js';

/*
 * workspace.projects (Prompt 18): proyectos del workspace a través de `projects.service` (mismas
 * reglas que la API manual: schema, campaña del mismo workspace, fechas). Sin CRUD propio.
 */

const createProjectCapability = defineCapability<CreateProjectData, Project>({
  key: 'create_project',
  description: 'Crear un proyecto en este Pixel.',
  inputSchema: CreateProjectSchema,
  effect: 'create',
  target: 'internal',
  resourceKind: 'project',
  reversible: true,
  async execute(input, ctx) {
    // Idempotente por la clave de ESTA acción (nunca por el nombre): si ya la ejecutó (recuperación
    // tras una caída, reintento o carrera), se reconoce el proyecto creado en lugar de duplicarlo.
    const existing = await findProjectByActionKey(ctx.workspace, ctx.idempotencyKey);
    const project =
      existing ?? (await createProject(ctx.workspace, input, { actionKey: ctx.idempotencyKey }));
    return {
      status: 'success',
      summary: existing
        ? `El proyecto «${project.name}» ya lo había creado esta acción.`
        : `Se creó el proyecto «${project.name}».`,
      resourceRefs: [{ kind: 'project', id: project.id, label: project.name }],
      output: project,
    };
  },
  async verify(result, input, ctx) {
    const ref = result.resourceRefs[0];
    if (!ref || !Types.ObjectId.isValid(ref.id)) return false;
    const project = await ProjectModel.findOne({
      _id: new Types.ObjectId(ref.id),
      workspaceId: ctx.workspace._id,
    }).select({ name: 1, pixelActionKey: 1 });
    return project?.name === input.name && project.pixelActionKey === ctx.idempotencyKey;
  },
});

export const workspaceProjectsTool: PixelTool = {
  key: 'workspace.projects',
  name: 'Proyectos',
  description: 'Los proyectos de este Pixel.',
  contextTypes: ['personal', 'enterprise'],
  feature: 'projects',
  capabilities: [createProjectCapability],
  availability: () => 'available',
};
