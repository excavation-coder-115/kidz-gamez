import { describe, expect, test } from 'bun:test';

import { ParentGateChallenge } from '../src/parent-gate';
import { GarageStore } from '../src/garage-store';
import { BuilderSceneModel, BUILDER_MODULES } from '../src/builder-scene';
import { InMemoryStorage, ProfileStore } from '../src/profile-store';

function withParentReady(storage = new InMemoryStorage()): ProfileStore {
  const gate = new ParentGateChallenge();
  const store = new ProfileStore(storage, gate);
  const challenge = gate.createChallenge();
  expect(gate.verifyAnswer(challenge, challenge.answer)).toBeTrue();
  return store;
}

describe('T06 builder scene with snap modules', () => {
  test('socket placement rejects incompatible module/socket pairs', () => {
    const builder = new BuilderSceneModel({ classId: 'speedster' });
    const root = builder.addModule({ moduleId: 'chassis-core' });
    expect(root.ok).toBeTrue();

    const rootId = root.ok ? root.node.id : '';
    const badPlacement = builder.addModule({
      moduleId: 'engine-v1',
      parentId: rootId,
      socketId: 'wheel-left',
    });

    expect(badPlacement.ok).toBeFalse();
    if (!badPlacement.ok) {
      expect(badPlacement.error).toContain('incompatible');
    }

    const goodPlacement = builder.addModule({
      moduleId: 'wheel-standard',
      parentId: rootId,
      socketId: 'wheel-left',
    });
    expect(goodPlacement.ok).toBeTrue();
  });

  test('part cap enforcement blocks placement at 61st node', () => {
    const builder = new BuilderSceneModel({ classId: 'hauler' });

    for (let i = 0; i < 60; i += 1) {
      const add = builder.addModule({ moduleId: 'chassis-core' });
      expect(add.ok).toBeTrue();
    }

    const blocked = builder.addModule({ moduleId: 'chassis-core' });
    expect(blocked.ok).toBeFalse();
    if (!blocked.ok) {
      expect(blocked.error).toContain('60');
    }
  });

  test('edit flow (add/remove/rotate) produces stable graph output', () => {
    const builder = new BuilderSceneModel({ classId: 'glider' });

    const root = builder.addModule({ moduleId: 'chassis-core' });
    expect(root.ok).toBeTrue();
    const rootId = root.ok ? root.node.id : '';

    const wheel = builder.addModule({
      moduleId: 'wheel-standard',
      parentId: rootId,
      socketId: 'wheel-left',
      transform: { tx: -1.2, ty: -0.6, tz: 0.8 },
    });
    expect(wheel.ok).toBeTrue();

    const engine = builder.addModule({
      moduleId: 'engine-v1',
      parentId: rootId,
      socketId: 'rear-mount',
      transform: { tx: 0, ty: 0.4, tz: -1 },
    });
    expect(engine.ok).toBeTrue();

    const wheelId = wheel.ok ? wheel.node.id : '';
    const rotate = builder.rotateModule(wheelId, { rz: 90 });
    expect(rotate.ok).toBeTrue();

    const engineId = engine.ok ? engine.node.id : '';
    const remove = builder.removeModule(engineId);
    expect(remove.ok).toBeTrue();

    const exported = builder.exportGraph();
    expect(exported.classId).toBe('glider');
    expect(exported.nodes).toHaveLength(2);
    expect(exported.nodes.map((node) => node.id)).toEqual(['node_1', 'node_2']);
    expect(exported.nodes[1].transform.rz).toBe(90);

    for (const node of exported.nodes) {
      expect(typeof node.transform.tx).toBe('number');
      expect(typeof node.transform.ty).toBe('number');
      expect(typeof node.transform.tz).toBe('number');
      expect(typeof node.transform.rx).toBe('number');
      expect(typeof node.transform.ry).toBe('number');
      expect(typeof node.transform.rz).toBe('number');
      expect(typeof node.transform.sx).toBe('number');
      expect(typeof node.transform.sy).toBe('number');
      expect(typeof node.transform.sz).toBe('number');
    }
  });

  test('user can export and save vehicle to garage', () => {
    const storage = new InMemoryStorage();
    const profiles = withParentReady(storage);
    const create = profiles.createProfile({ name: 'Rae', ageBandId: 'age-6-8' });
    expect(create.ok).toBeTrue();

    const builder = new BuilderSceneModel({ classId: 'speedster' });
    const root = builder.addModule({ moduleId: 'chassis-core' });
    expect(root.ok).toBeTrue();

    const rootId = root.ok ? root.node.id : '';
    expect(
      builder.addModule({
        moduleId: 'wheel-standard',
        parentId: rootId,
        socketId: 'wheel-right',
      }).ok,
    ).toBeTrue();

    const garage = new GarageStore(storage, profiles);
    const save = garage.saveVehicle({
      name: 'Rae Rocket',
      graph: builder.exportGraph(),
    });

    expect(save.ok).toBeTrue();
    expect(garage.getGarageEntries()).toHaveLength(1);
  });

  test('module palette exposes constrained registry', () => {
    const ids = BUILDER_MODULES.map((entry) => entry.id);
    expect(ids).toEqual(['chassis-core', 'wheel-standard', 'engine-v1', 'wing-mini']);
  });
});
