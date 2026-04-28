import { describe, expect, test } from 'bun:test';

import type { ArcadePlugin, ChildProfile, KernelContext } from '../src/contracts/arcade';
import { Kernel, PluginRegistry } from '../src/kernel';
import { LobbyLaunchController } from '../src/lobby-launch';

function makeContext(profile: ChildProfile | null = null): KernelContext {
  return {
    profile,
    agePolicy: {
      canLaunch: () => ({ allowed: true }),
    },
    telemetry: {
      emit: () => undefined,
    },
  };
}

function makePlugin(options: {
  id: string;
  route: string;
  events: string[];
  throwInCreateScene?: boolean;
}): ArcadePlugin {
  return {
    id: options.id,
    route: options.route,
    canLaunch: () => ({ allowed: true }),
    createScene: () => {
      options.events.push(`scene:${options.id}:create`);
      if (options.throwInCreateScene) {
        throw new Error('runtime failed');
      }
      return {
        activate: () => {
          options.events.push(`scene:${options.id}:activate`);
        },
        dispose: () => {
          options.events.push(`scene:${options.id}:dispose`);
        },
      };
    },
    onEnter: () => {
      options.events.push(`plugin:${options.id}:onEnter`);
    },
    onExit: () => {
      options.events.push(`plugin:${options.id}:onExit`);
    },
  };
}

describe('T08 lobby launch interaction and lifecycle handoff', () => {
  test('interaction radius controls cabinet prompt transitions', () => {
    const registry = new PluginRegistry();
    const kernel = new Kernel(makeContext(), registry);
    const controller = new LobbyLaunchController({
      kernel,
      hubRoute: '/lobby',
      hubSpawn: { x: 8, y: 0, z: 4 },
    });

    controller.setCabinets([
      {
        id: 'cab-1',
        route: '/race',
        position: { x: 2, y: 0, z: 0 },
        interactionRadius: 2,
        name: 'Sky Sprint',
      },
    ]);

    controller.updatePlayerPosition({ x: 8, y: 0, z: 0 });
    expect(controller.getPrompt()).toBeNull();

    controller.updatePlayerPosition({ x: 3, y: 0, z: 0 });
    expect(controller.getPrompt()).toBe('Press E to launch Sky Sprint.');

    controller.updatePlayerPosition({ x: 2.25, y: 0, z: 0 });
    expect(controller.getPrompt()).toBe('Press E to launch Sky Sprint.');
  });

  test('ineligible cabinet interaction returns lock reason and blocks launch', async () => {
    const events: string[] = [];
    const registry = new PluginRegistry();
    registry.register(makePlugin({ id: 'lobby', route: '/lobby', events }));
    registry.register(makePlugin({ id: 'locked', route: '/locked', events }));

    const kernel = new Kernel(makeContext(), registry);
    await kernel.navigateTo('/lobby');

    const controller = new LobbyLaunchController({
      kernel,
      hubRoute: '/lobby',
      hubSpawn: { x: 0, y: 0, z: 0 },
    });

    controller.setCabinets([
      {
        id: 'cab-locked',
        route: '/locked',
        position: { x: 1, y: 0, z: 0 },
        interactionRadius: 2,
        lockedReason: 'This cabinet is locked for your age band.',
      },
    ]);

    controller.updatePlayerPosition({ x: 1, y: 0, z: 0 });
    const result = await controller.interact();

    expect(result.ok).toBeFalse();
    expect(result.reason).toBe('This cabinet is locked for your age band.');
    expect(controller.getPrompt()).toContain('locked for your age band');
    expect(events).not.toContain('scene:locked:create');
  });

  test('eligible launch path and runtime exit return player to hub spawn', async () => {
    const events: string[] = [];
    const registry = new PluginRegistry();
    registry.register(makePlugin({ id: 'lobby', route: '/lobby', events }));
    registry.register(makePlugin({ id: 'race', route: '/race', events }));

    const kernel = new Kernel(makeContext(), registry);
    await kernel.navigateTo('/lobby');

    const respawned: Array<{ x: number; y: number; z: number }> = [];
    const controller = new LobbyLaunchController({
      kernel,
      hubRoute: '/lobby',
      hubSpawn: { x: 10, y: 0, z: -5 },
      onReturnToHubSpawn: (position) => {
        respawned.push(position);
      },
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
    expect(launch).toEqual({ ok: true, route: '/race' });

    const exit = await controller.exitRuntimeToHub();
    expect(exit).toEqual({ ok: true, route: '/lobby' });
    expect(respawned).toEqual([{ x: 10, y: 0, z: -5 }]);

    expect(events).toEqual([
      'scene:lobby:create',
      'scene:lobby:activate',
      'plugin:lobby:onEnter',
      'plugin:lobby:onExit',
      'scene:lobby:dispose',
      'scene:race:create',
      'scene:race:activate',
      'plugin:race:onEnter',
      'plugin:race:onExit',
      'scene:race:dispose',
      'scene:lobby:create',
      'scene:lobby:activate',
      'plugin:lobby:onEnter',
    ]);
  });

  test('failed runtime initialization restores stable lobby state and opens error modal', async () => {
    const events: string[] = [];
    const registry = new PluginRegistry();
    registry.register(makePlugin({ id: 'lobby', route: '/lobby', events }));
    registry.register(makePlugin({ id: 'broken', route: '/broken', events, throwInCreateScene: true }));

    const kernel = new Kernel(makeContext(), registry);
    await kernel.navigateTo('/lobby');

    const controller = new LobbyLaunchController({
      kernel,
      hubRoute: '/lobby',
      hubSpawn: { x: 0, y: 0, z: 0 },
    });

    controller.setCabinets([
      {
        id: 'cab-broken',
        route: '/broken',
        position: { x: 0, y: 0, z: 0 },
        interactionRadius: 2,
      },
    ]);

    controller.updatePlayerPosition({ x: 0, y: 0, z: 0 });
    const launch = await controller.interact();

    expect(launch.ok).toBeFalse();
    expect(launch.errorMessage).toBe('We could not switch games right now. Please try again.');
    expect(controller.getErrorModalMessage()).toBe('We could not switch games right now. Please try again.');

    const recovery = await controller.exitRuntimeToHub();
    expect(recovery.ok).toBeTrue();
    expect(recovery.route).toBe('/lobby');

    expect(events).toEqual([
      'scene:lobby:create',
      'scene:lobby:activate',
      'plugin:lobby:onEnter',
      'plugin:lobby:onExit',
      'scene:lobby:dispose',
      'scene:broken:create',
      'scene:lobby:create',
      'scene:lobby:activate',
      'plugin:lobby:onEnter',
      'plugin:lobby:onExit',
      'scene:lobby:dispose',
      'scene:lobby:create',
      'scene:lobby:activate',
      'plugin:lobby:onEnter',
    ]);
  });
});
