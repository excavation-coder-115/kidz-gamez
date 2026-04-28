import type { VehicleGraphNodeV1, VehicleGraphV1 } from './contracts/arcade';

type ModuleKind = 'chassis' | 'wheel' | 'engine' | 'wing';

interface ModuleSocket {
  id: string;
  accepts: ModuleKind[];
}

export interface BuilderModuleDefinition {
  id: string;
  name: string;
  kind: ModuleKind;
  sockets: ModuleSocket[];
  rootAllowed?: boolean;
}

export const BUILDER_MODULES: BuilderModuleDefinition[] = [
  {
    id: 'chassis-core',
    name: 'Core Chassis',
    kind: 'chassis',
    rootAllowed: true,
    sockets: [
      { id: 'wheel-left', accepts: ['wheel'] },
      { id: 'wheel-right', accepts: ['wheel'] },
      { id: 'rear-mount', accepts: ['engine', 'wing'] },
      { id: 'top-mount', accepts: ['wing'] },
    ],
  },
  {
    id: 'wheel-standard',
    name: 'Standard Wheel',
    kind: 'wheel',
    sockets: [],
  },
  {
    id: 'engine-v1',
    name: 'Engine V1',
    kind: 'engine',
    sockets: [],
  },
  {
    id: 'wing-mini',
    name: 'Mini Wing',
    kind: 'wing',
    sockets: [],
  },
];

interface BuilderNode {
  graphNode: VehicleGraphNodeV1;
  module: BuilderModuleDefinition;
}

export type BuilderResult<T> = { ok: true; value: T } | { ok: false; error: string };
export type AddModuleResult = { ok: true; node: VehicleGraphNodeV1 } | { ok: false; error: string };

interface AddModuleInput {
  moduleId: string;
  parentId?: string;
  socketId?: string;
  transform?: Partial<VehicleGraphNodeV1['transform']>;
}

interface BuilderSceneModelOptions {
  classId: string;
  maxParts?: number;
}

const DEFAULT_TRANSFORM: VehicleGraphNodeV1['transform'] = {
  tx: 0,
  ty: 0,
  tz: 0,
  rx: 0,
  ry: 0,
  rz: 0,
  sx: 1,
  sy: 1,
  sz: 1,
};

export class BuilderSceneModel {
  private readonly maxParts: number;
  private readonly classId: string;
  private readonly nodesById = new Map<string, BuilderNode>();
  private readonly nodeOrder: string[] = [];
  private nextId = 1;

  constructor(options: BuilderSceneModelOptions) {
    this.classId = options.classId;
    this.maxParts = options.maxParts ?? 60;
  }

  addModule(input: AddModuleInput): AddModuleResult {
    if (this.nodeOrder.length >= this.maxParts) {
      return { ok: false, error: `Part cap exceeded. Maximum allowed is ${this.maxParts}.` };
    }

    const module = this.findModule(input.moduleId);
    if (!module) {
      return { ok: false, error: `Unknown module: ${input.moduleId}` };
    }

    const isRootPlacement = !input.parentId && !input.socketId;
    if (isRootPlacement) {
      if (!module.rootAllowed) {
        return { ok: false, error: `Module ${module.id} is not allowed as a root module.` };
      }

      const node = this.makeNode({ module, transform: input.transform });
      this.insertNode(node, module);
      return { ok: true, node: this.cloneNode(node) };
    }

    if (!input.parentId || !input.socketId) {
      return { ok: false, error: 'Both parentId and socketId are required for non-root placement.' };
    }

    const parent = this.nodesById.get(input.parentId);
    if (!parent) {
      return { ok: false, error: `Parent node not found: ${input.parentId}` };
    }

    const socket = parent.module.sockets.find((entry) => entry.id === input.socketId);
    if (!socket) {
      return { ok: false, error: `Socket not found: ${input.socketId}` };
    }

    const socketUsed = this.nodeOrder.some((nodeId) => {
      const existing = this.nodesById.get(nodeId)?.graphNode;
      return existing?.parentId === input.parentId && existing?.socketId === input.socketId;
    });
    if (socketUsed) {
      return { ok: false, error: `Socket ${input.socketId} is already occupied.` };
    }

    if (!socket.accepts.includes(module.kind)) {
      return {
        ok: false,
        error: `Socket ${input.socketId} is incompatible with module ${module.id}.`,
      };
    }

    const node = this.makeNode({
      module,
      parentId: input.parentId,
      socketId: input.socketId,
      transform: input.transform,
    });
    this.insertNode(node, module);

    return { ok: true, node: this.cloneNode(node) };
  }

  removeModule(nodeId: string): BuilderResult<{ removedCount: number }> {
    if (!this.nodesById.has(nodeId)) {
      return { ok: false, error: `Node not found: ${nodeId}` };
    }

    const toRemove = new Set<string>();
    toRemove.add(nodeId);

    let changed = true;
    while (changed) {
      changed = false;
      for (const id of this.nodeOrder) {
        const node = this.nodesById.get(id)?.graphNode;
        if (node?.parentId && toRemove.has(node.parentId) && !toRemove.has(id)) {
          toRemove.add(id);
          changed = true;
        }
      }
    }

    for (const id of toRemove) {
      this.nodesById.delete(id);
    }

    const kept = this.nodeOrder.filter((id) => !toRemove.has(id));
    this.nodeOrder.length = 0;
    this.nodeOrder.push(...kept);

    return { ok: true, value: { removedCount: toRemove.size } };
  }

  rotateModule(nodeId: string, rotation: Partial<Pick<VehicleGraphNodeV1['transform'], 'rx' | 'ry' | 'rz'>>): BuilderResult<VehicleGraphNodeV1> {
    const node = this.nodesById.get(nodeId);
    if (!node) {
      return { ok: false, error: `Node not found: ${nodeId}` };
    }

    const next = {
      ...node.graphNode.transform,
      ...rotation,
    };

    node.graphNode.transform = next;
    return { ok: true, value: this.cloneNode(node.graphNode) };
  }

  exportGraph(): VehicleGraphV1 {
    return {
      schemaVersion: 1,
      classId: this.classId,
      nodes: this.nodeOrder
        .map((id) => this.nodesById.get(id)?.graphNode)
        .filter((node): node is VehicleGraphNodeV1 => Boolean(node))
        .map((node) => this.cloneNode(node)),
    };
  }

  private cloneNode(node: VehicleGraphNodeV1): VehicleGraphNodeV1 {
    return {
      ...node,
      transform: {
        ...node.transform,
      },
    };
  }

  private findModule(moduleId: string): BuilderModuleDefinition | undefined {
    return BUILDER_MODULES.find((entry) => entry.id === moduleId);
  }

  private makeNode(input: {
    module: BuilderModuleDefinition;
    parentId?: string;
    socketId?: string;
    transform?: Partial<VehicleGraphNodeV1['transform']>;
  }): VehicleGraphNodeV1 {
    return {
      id: `node_${this.nextId++}`,
      moduleId: input.module.id,
      parentId: input.parentId,
      socketId: input.socketId,
      transform: {
        ...DEFAULT_TRANSFORM,
        ...input.transform,
      },
    };
  }

  private insertNode(node: VehicleGraphNodeV1, module: BuilderModuleDefinition): void {
    this.nodesById.set(node.id, { graphNode: node, module });
    this.nodeOrder.push(node.id);
  }
}
