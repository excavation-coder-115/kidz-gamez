import { describe, expect, test } from 'bun:test';

import type { ArcadePlugin, ChildProfile, KernelContext } from '../src/contracts/arcade';
import { GarageStore } from '../src/garage-store';
import { Kernel, PluginRegistry } from '../src/kernel';
import { LobbyLaunchController } from '../src/lobby-launch';
import { ParentGateChallenge } from '../src/parent-gate';
import { InMemoryStorage, ProfileStore } from '../src/profile-store';
import { TelemetryBus, buildTelemetryPayload } from '../src/telemetry';

function makePlugin(options: { id: string; route: string; manifestId?: string }): ArcadePlugin {
  return {
    id: options.id,
    route: options.route,
    manifest: options.manifestId
      ? {
          id: options.manifestId,
          name: options.id,
          route: options.route,
          description: '',
          tags: [],
          ageBand: { min: 3, max: 12 },
          cabinetType: 'arcade',
          vehicleSupport: 'optional',
          launchMode: 'seamless',
        }
      : undefined,
    canLaunch: () => ({ allowed: true }),
    createScene: () => ({
      activate: () => undefined,
      dispose: () => undefined,
    }),
    onEnter: () => undefined,
    onExit: () => undefined,
  };
}

function unlockParentGate(gate: ParentGateChallenge): void {
  const challenge = gate.createChallenge();
  expect(gate.verifyAnswer(challenge, challenge.answer)).toBeTrue();
}

describe('T09 telemetry and funnel instrumentation', () => {
  test('payload builder includes mandatory fields', () => {
    const profile: ChildProfile = { id: 'child-1', name: 'Milo', ageBand: { min: 6, max: 8 } };
    const payload = buildTelemetryPayload(
      {
        profile,
        gameId: 'race',
        manifestId: 'manifest-race',
      },
      () => new Date('2026-04-28T00:00:00.000Z'),
    );

    expect(payload).toEqual({
      profileId: 'child-1',
      timestamp: '2026-04-28T00:00:00.000Z',
      gameId: 'race',
      manifestId: 'manifest-race',
    });
  });

  test('duplicate suppression emits unique events once per dedupe key', () => {
    const bus = new TelemetryBus();
    const payload = {
      profileId: 'child-1',
      timestamp: '2026-04-28T00:00:00.000Z',
    };

    bus.emitUnique('cabinet_interacted', 'cab-1', payload);
    bus.emitUnique('cabinet_interacted', 'cab-1', payload);
    bus.emitUnique('cabinet_interacted', 'cab-2', payload);

    expect(bus.getDebugEvents().map((event) => `${event.type}:${event.payload.profileId}`)).toEqual([
      'cabinet_interacted:child-1',
      'cabinet_interacted:child-1',
    ]);
  });

  test('missing or failing transport does not break gameplay paths', async () => {
    const bus = new TelemetryBus({
      transport: {
        send: () => {
          throw new Error('transport down');
        },
      },
    });

    const profile: ChildProfile = { id: 'child-1', name: 'Nova', ageBand: { min: 6, max: 8 } };
    const context: KernelContext = {
      profile,
      agePolicy: {
        canLaunch: () => ({ allowed: true }),
      },
      telemetry: bus,
      mount: { replaceChildren: () => undefined } as unknown as HTMLElement,
    };

    const registry = new PluginRegistry();
    registry.register(makePlugin({ id: 'race', route: '/race', manifestId: 'manifest-race' }));

    const kernel = new Kernel(context, registry);
    const result = await kernel.navigateTo('/race');

    expect(result.ok).toBeTrue();
    expect(bus.getDebugEvents()).toHaveLength(1);
    expect(bus.getDebugEvents()[0].type).toBe('game_runtime_loaded');
  });

  test('happy-path journey emits required funnel events in order', async () => {
    const storage = new InMemoryStorage();
    const parentGate = new ParentGateChallenge();
    unlockParentGate(parentGate);

    const telemetry = new TelemetryBus({ now: () => new Date('2026-04-28T10:00:00.000Z') });
    const profileStore = new ProfileStore(storage, parentGate, telemetry, () => new Date('2026-04-28T10:00:01.000Z'));
    const created = profileStore.createProfile({ name: 'Aria', ageBandId: 'age-6-8' });
    expect(created.ok).toBeTrue();

    const garage = new GarageStore(storage, profileStore, telemetry, () => new Date('2026-04-28T10:00:02.000Z'));
    const saved = garage.saveVehicle({
      name: 'Aria Racer',
      graph: { schemaVersion: 1, classId: 'speedster', nodes: [] },
    });
    expect(saved.ok).toBeTrue();

    const registry = new PluginRegistry();
    registry.register(makePlugin({ id: 'race', route: '/race', manifestId: 'manifest-race' }));

    const context: KernelContext = {
      profile: profileStore.getActiveProfile(),
      agePolicy: {
        canLaunch: () => ({ allowed: true }),
      },
      telemetry,
      mount: { replaceChildren: () => undefined } as unknown as HTMLElement,
    };

    const kernel = new Kernel(context, registry);
    const controller = new LobbyLaunchController({
      kernel,
      hubRoute: '/lobby',
      hubSpawn: { x: 0, y: 0, z: 0 },
      telemetry,
      getCurrentProfile: () => profileStore.getActiveProfile(),
    });

    controller.setCabinets([
      {
        id: 'cab-race',
        route: '/race',
        position: { x: 0, y: 0, z: 0 },
        interactionRadius: 2,
        name: 'Race Time',
      },
    ]);

    controller.updatePlayerPosition({ x: 0, y: 0, z: 0 });
    const launch = await controller.interact();

    expect(launch.ok).toBeTrue();

    expect(telemetry.getDebugEvents().map((event) => event.type)).toEqual([
      'profile_created',
      'vehicle_saved',
      'cabinet_interacted',
      'game_runtime_loaded',
    ]);
  });
});
