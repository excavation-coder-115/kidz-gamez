import { describe, expect, test } from 'bun:test';

import { BuilderSceneModel } from '../src/builder-scene';
import { GarageStore } from '../src/garage-store';
import { ParentGateChallenge } from '../src/parent-gate';
import { InMemoryStorage, ProfileStore } from '../src/profile-store';
import { validateVehicleGraph } from '../src/vehicle-validator';

function withParentReady(storage = new InMemoryStorage()): ProfileStore {
  const gate = new ParentGateChallenge();
  const store = new ProfileStore(storage, gate);
  const challenge = gate.createChallenge();
  expect(gate.verifyAnswer(challenge, challenge.answer)).toBeTrue();
  return store;
}

describe('T07 vehicle validator and repair pipeline', () => {
  test('missing required core module is auto-fixed', () => {
    const result = validateVehicleGraph({
      schemaVersion: 1,
      classId: 'speedster',
      nodes: [
        {
          id: 'wheel-1',
          moduleId: 'wheel-standard',
          transform: { tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 },
        },
      ],
    });

    expect(result.valid).toBeTrue();
    expect(result.repaired).toBeTrue();
    expect(result.warnings.some((entry) => entry.includes('Inserted required core module'))).toBeTrue();
    expect(result.output.nodes[0].moduleId).toBe('chassis-core');
  });

  test('invalid parent references are repaired predictably when possible', () => {
    const result = validateVehicleGraph({
      schemaVersion: 1,
      classId: 'speedster',
      nodes: [
        {
          id: 'root',
          moduleId: 'chassis-core',
          transform: { tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 },
        },
        {
          id: 'wheel-1',
          moduleId: 'wheel-standard',
          parentId: 'missing-parent',
          socketId: 'wheel-left',
          transform: { tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 },
        },
      ],
    });

    expect(result.valid).toBeTrue();
    expect(result.errors).toHaveLength(0);
    const repairedWheel = result.output.nodes.find((node) => node.id === 'wheel-1');
    expect(repairedWheel?.parentId).toBe('root');
    expect(repairedWheel?.socketId).toBe('wheel-left');
  });

  test('unrecoverable parent references fail with clear errors', () => {
    const result = validateVehicleGraph({
      schemaVersion: 1,
      classId: 'speedster',
      nodes: [
        {
          id: 'root',
          moduleId: 'chassis-core',
          transform: { tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 },
        },
        {
          id: 'wheel-1',
          moduleId: 'wheel-standard',
          parentId: 'missing-parent',
          socketId: 'not-a-socket',
          transform: { tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 },
        },
      ],
    });

    expect(result.valid).toBeFalse();
    expect(result.errors.some((entry) => entry.includes('could not be repaired'))).toBeTrue();
  });

  test('repair output is deterministic for same input', () => {
    const invalid = {
      schemaVersion: 1 as const,
      classId: 'glider',
      nodes: [
        {
          id: 'wing-1',
          moduleId: 'wing-mini',
          parentId: 'ghost',
          socketId: 'top-mount',
          transform: { tx: NaN, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, sx: 0, sy: 1, sz: 1 },
        },
      ],
    };

    const first = validateVehicleGraph(invalid);
    const second = validateVehicleGraph(invalid);

    expect(first.output).toEqual(second.output);
    expect(first.warnings).toEqual(second.warnings);
  });

  test('builder-exported graphs validate before garage save', () => {
    const storage = new InMemoryStorage();
    const profiles = withParentReady(storage);
    const create = profiles.createProfile({ name: 'Rio', ageBandId: 'age-9-12' });
    expect(create.ok).toBeTrue();

    const builder = new BuilderSceneModel({ classId: 'speedster' });
    const root = builder.addModule({ moduleId: 'chassis-core' });
    expect(root.ok).toBeTrue();
    if (!root.ok) {
      return;
    }

    const addWheel = builder.addModule({
      moduleId: 'wheel-standard',
      parentId: root.node.id,
      socketId: 'wheel-left',
    });
    expect(addWheel.ok).toBeTrue();

    const exported = builder.exportGraph();
    const validation = validateVehicleGraph(exported);
    expect(validation.valid).toBeTrue();

    const garage = new GarageStore(storage, profiles);
    const save = garage.saveVehicle({ name: 'Rio Rider', graph: exported });
    expect(save.ok).toBeTrue();
  });

  test('garage save rejects unrecoverable graph validation errors', () => {
    const storage = new InMemoryStorage();
    const profiles = withParentReady(storage);
    const create = profiles.createProfile({ name: 'Pax', ageBandId: 'age-9-12' });
    expect(create.ok).toBeTrue();

    const garage = new GarageStore(storage, profiles);
    const save = garage.saveVehicle({
      name: 'Broken Ride',
      graph: {
        schemaVersion: 1,
        classId: 'speedster',
        nodes: [
          {
            id: 'wheel-1',
            moduleId: 'wheel-standard',
            parentId: 'ghost',
            socketId: 'nope',
            transform: { tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 },
          },
        ],
      },
    });

    expect(save.ok).toBeFalse();
    if (!save.ok) {
      expect(save.error).toContain('Validation failed');
    }
  });

});
