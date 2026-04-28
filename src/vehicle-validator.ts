import schema from './schemas/vehicle-graph.v1.schema.json';

import type { VehicleGraphNodeV1, VehicleGraphV1, VehicleValidationResult } from './contracts/arcade';
import { BUILDER_MODULES } from './builder-scene';

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

const REQUIRED_CORE_MODULE_ID = 'chassis-core';

interface VehicleSchemaSubset {
  required: string[];
  properties: {
    nodes: {
      maxItems: number;
    };
  };
}

const typedSchema = schema as VehicleSchemaSubset;
const REQUIRED_GRAPH_KEYS = new Set(typedSchema.required);
const MAX_NODES = typedSchema.properties.nodes.maxItems;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function cloneGraph(graph: VehicleGraphV1): VehicleGraphV1 {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({
      ...node,
      transform: {
        ...node.transform,
      },
    })),
    cosmetics: graph.cosmetics
      ? {
          ...graph.cosmetics,
          decalIds: graph.cosmetics.decalIds ? [...graph.cosmetics.decalIds] : undefined,
        }
      : undefined,
  };
}

function moduleKind(moduleId: string): string | null {
  return BUILDER_MODULES.find((entry) => entry.id === moduleId)?.kind ?? null;
}

function sanitizeTransform(node: VehicleGraphNodeV1, warnings: string[]): void {
  const raw = node.transform;
  node.transform = {
    tx: isFiniteNumber(raw.tx) ? raw.tx : DEFAULT_TRANSFORM.tx,
    ty: isFiniteNumber(raw.ty) ? raw.ty : DEFAULT_TRANSFORM.ty,
    tz: isFiniteNumber(raw.tz) ? raw.tz : DEFAULT_TRANSFORM.tz,
    rx: isFiniteNumber(raw.rx) ? raw.rx : DEFAULT_TRANSFORM.rx,
    ry: isFiniteNumber(raw.ry) ? raw.ry : DEFAULT_TRANSFORM.ry,
    rz: isFiniteNumber(raw.rz) ? raw.rz : DEFAULT_TRANSFORM.rz,
    sx: isFiniteNumber(raw.sx) && raw.sx > 0 ? raw.sx : DEFAULT_TRANSFORM.sx,
    sy: isFiniteNumber(raw.sy) && raw.sy > 0 ? raw.sy : DEFAULT_TRANSFORM.sy,
    sz: isFiniteNumber(raw.sz) && raw.sz > 0 ? raw.sz : DEFAULT_TRANSFORM.sz,
  };

  if (
    !isFiniteNumber(raw.tx) ||
    !isFiniteNumber(raw.ty) ||
    !isFiniteNumber(raw.tz) ||
    !isFiniteNumber(raw.rx) ||
    !isFiniteNumber(raw.ry) ||
    !isFiniteNumber(raw.rz) ||
    !isFiniteNumber(raw.sx) ||
    !isFiniteNumber(raw.sy) ||
    !isFiniteNumber(raw.sz) ||
    raw.sx <= 0 ||
    raw.sy <= 0 ||
    raw.sz <= 0
  ) {
    warnings.push(`Node ${node.id} had invalid transform values and was normalized.`);
  }
}

function validateSchemaShape(input: unknown): { graph: VehicleGraphV1 | null; errors: string[] } {
  const errors: string[] = [];

  if (!isObject(input)) {
    return { graph: null, errors: ['Vehicle graph must be an object.'] };
  }

  for (const required of REQUIRED_GRAPH_KEYS) {
    if (!(required in input)) {
      errors.push(`Vehicle graph is missing required field: ${required}.`);
    }
  }

  if (input.schemaVersion !== 1) {
    errors.push('schemaVersion must be 1.');
  }

  if (typeof input.classId !== 'string' || input.classId.length === 0) {
    errors.push('classId must be a non-empty string.');
  }

  if (!Array.isArray(input.nodes)) {
    errors.push('nodes must be an array.');
  }

  if (errors.length > 0) {
    return { graph: null, errors };
  }

  const graph = input as unknown as VehicleGraphV1;
  if (graph.nodes.length > MAX_NODES) {
    errors.push(`nodes must include no more than ${MAX_NODES} entries.`);
  }

  graph.nodes.forEach((node, index) => {
    if (!isObject(node)) {
      errors.push(`nodes[${index}] must be an object.`);
      return;
    }

    if (typeof node.id !== 'string' || node.id.length === 0) {
      errors.push(`nodes[${index}].id must be a non-empty string.`);
    }

    if (typeof node.moduleId !== 'string' || node.moduleId.length === 0) {
      errors.push(`nodes[${index}].moduleId must be a non-empty string.`);
    }

    if (!isObject(node.transform)) {
      errors.push(`nodes[${index}].transform must be an object.`);
      return;
    }

    const transformKeys: Array<keyof VehicleGraphNodeV1['transform']> = ['tx', 'ty', 'tz', 'rx', 'ry', 'rz', 'sx', 'sy', 'sz'];
    for (const key of transformKeys) {
      if (typeof node.transform[key] !== 'number') {
        errors.push(`nodes[${index}].transform.${key} must be a number.`);
      }
    }
  });

  return { graph: errors.length === 0 ? graph : null, errors };
}

export function validateVehicleGraph(input: unknown): VehicleValidationResult {
  const schema = validateSchemaShape(input);
  if (!schema.graph) {
    return {
      valid: false,
      repaired: false,
      errors: schema.errors,
      warnings: [],
      output: {
        schemaVersion: 1,
        classId: 'speedster',
        nodes: [],
      },
    };
  }

  const working = cloneGraph(schema.graph);
  const warnings: string[] = [];
  const errors: string[] = [];

  for (const node of working.nodes) {
    sanitizeTransform(node, warnings);
  }

  if (!working.nodes.some((node) => node.moduleId === REQUIRED_CORE_MODULE_ID && !node.parentId && !node.socketId)) {
    working.nodes.unshift({
      id: 'auto_core_root',
      moduleId: REQUIRED_CORE_MODULE_ID,
      transform: { ...DEFAULT_TRANSFORM },
    });
    warnings.push('Inserted required core module chassis-core at root.');
  }

  const nodesById = new Map(working.nodes.map((node) => [node.id, node]));
  const root = working.nodes.find((node) => node.moduleId === REQUIRED_CORE_MODULE_ID && !node.parentId && !node.socketId);

  const socketUsage = new Set<string>();
  for (const node of working.nodes) {
    if (node.parentId && node.socketId && nodesById.has(node.parentId)) {
      socketUsage.add(`${node.parentId}:${node.socketId}`);
    }
  }

  for (const node of working.nodes) {
    if (!node.parentId && !node.socketId) {
      continue;
    }

    const parentIsValid = typeof node.parentId === 'string' && nodesById.has(node.parentId);
    if (parentIsValid) {
      continue;
    }

    if (!root) {
      errors.push(`Node ${node.id} references missing parent ${String(node.parentId)} and could not be repaired.`);
      continue;
    }

    const rootDefinition = BUILDER_MODULES.find((entry) => entry.id === root.moduleId);
    const targetKind = moduleKind(node.moduleId);
    const requestedSocket = typeof node.socketId === 'string' ? node.socketId : '';
    const canAttachToRequestedSocket = Boolean(
      rootDefinition?.sockets.some(
        (socket) =>
          socket.id === requestedSocket &&
          targetKind !== null &&
          socket.accepts.includes(targetKind as (typeof socket.accepts)[number]) &&
          !socketUsage.has(`${root.id}:${requestedSocket}`),
      ),
    );

    if (!canAttachToRequestedSocket) {
      errors.push(`Node ${node.id} references missing parent ${String(node.parentId)} and could not be repaired.`);
      continue;
    }

    node.parentId = root.id;
    node.socketId = requestedSocket;
    socketUsage.add(`${root.id}:${requestedSocket}`);
    warnings.push(`Repaired parent reference for node ${node.id} by attaching to ${root.id}:${requestedSocket}.`);
  }

  return {
    valid: errors.length === 0,
    repaired: warnings.length > 0,
    errors,
    warnings,
    output: working,
  };
}
