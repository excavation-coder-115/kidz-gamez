import { describe, expect, test } from 'bun:test';

import type { ArcadePlugin, ArcadeScene, ChildProfile, KernelContext } from '../src/contracts/arcade';
import { Kernel, PluginRegistry } from '../src/kernel';

function makeContext(profile: ChildProfile | null = null): KernelContext {
  return {
    profile,
    agePolicy: {
      canLaunch: () => ({ allowed: true }),
    },
    telemetry: {
      emit: () => undefined,
    },
    mount: { replaceChildren: () => undefined } as unknown as HTMLElement,
  };
}

function makePlugin(options: {
  id: string;
  route: string;
  canLaunchAllowed?: boolean;
  canLaunchReason?: string;
  events: string[];
  disposeCounter?: { count: number };
  throwInOnEnter?: boolean;
}): ArcadePlugin {
  const scene: ArcadeScene = {
    activate: () => {
      options.events.push(`scene:${options.id}:activate`);
    },
    dispose: () => {
      options.events.push(`scene:${options.id}:dispose`);
      if (options.disposeCounter) {
        options.disposeCounter.count += 1;
      }
    },
  };

  return {
    id: options.id,
    route: options.route,
    canLaunch: () => {
      options.events.push(`plugin:${options.id}:canLaunch`);
      return {
        allowed: options.canLaunchAllowed ?? true,
        reason: options.canLaunchReason,
      };
    },
    onEnter: () => {
      options.events.push(`plugin:${options.id}:onEnter`);
      if (options.throwInOnEnter) {
        throw new Error('boom');
      }
    },
    onExit: () => {
      options.events.push(`plugin:${options.id}:onExit`);
    },
    createScene: () => scene,
  };
}

describe('T01 kernel foundation', () => {
  test('plugin registry rejects duplicate ids', () => {
    const events: string[] = [];
    const registry = new PluginRegistry();

    registry.register(makePlugin({ id: 'lobby', route: '/lobby', events }));

    expect(() => {
      registry.register(makePlugin({ id: 'lobby', route: '/copy', events }));
    }).toThrow('already registered');
  });

  test('route transition calls hooks in order: canLaunch -> onExit -> onEnter', async () => {
    const events: string[] = [];
    const context = makeContext();
    const registry = new PluginRegistry();

    registry.register(makePlugin({ id: 'lobby', route: '/lobby', events }));
    registry.register(makePlugin({ id: 'racer', route: '/race', events }));

    const kernel = new Kernel(context, registry);

    await kernel.navigateTo('/lobby');
    await kernel.navigateTo('/race');

    expect(events).toEqual([
      'plugin:lobby:canLaunch',
      'scene:lobby:activate',
      'plugin:lobby:onEnter',
      'plugin:racer:canLaunch',
      'plugin:lobby:onExit',
      'scene:lobby:dispose',
      'scene:racer:activate',
      'plugin:racer:onEnter',
    ]);
  });

  test('canLaunch deny path blocks navigation and returns reason', async () => {
    const events: string[] = [];
    const context = makeContext();
    const registry = new PluginRegistry();

    registry.register(
      makePlugin({
        id: 'blocked-game',
        route: '/blocked',
        canLaunchAllowed: false,
        canLaunchReason: 'Parent settings do not allow this game yet.',
        events,
      }),
    );

    const kernel = new Kernel(context, registry);
    const result = await kernel.navigateTo('/blocked');

    expect(result.ok).toBeFalse();
    expect(result.reason).toBe('Parent settings do not allow this game yet.');
    expect(events).toEqual(['plugin:blocked-game:canLaunch']);
  });

  test('navigating from lobby to game disposes previous scene resources', async () => {
    const events: string[] = [];
    const context = makeContext();
    const registry = new PluginRegistry();
    const disposeCounter = { count: 0 };

    registry.register(makePlugin({ id: 'lobby', route: '/lobby', events, disposeCounter }));
    registry.register(makePlugin({ id: 'game-1', route: '/game-1', events }));

    const kernel = new Kernel(context, registry);

    await kernel.navigateTo('/lobby');
    await kernel.navigateTo('/game-1');

    expect(disposeCounter.count).toBe(1);
  });

  test('lifecycle failures surface readable errors and structured logs', async () => {
    const events: string[] = [];
    const context = makeContext();
    const registry = new PluginRegistry();
    const logs: Array<Record<string, unknown>> = [];

    registry.register(makePlugin({ id: 'lobby', route: '/lobby', events }));
    registry.register(makePlugin({ id: 'broken', route: '/broken', events, throwInOnEnter: true }));

    const kernel = new Kernel(context, registry, {
      emit: (event) => {
        logs.push(event as Record<string, unknown>);
      },
    });

    await kernel.navigateTo('/lobby');
    const result = await kernel.navigateTo('/broken');

    expect(result.ok).toBeFalse();
    expect(result.errorMessage).toBe('We could not switch games right now. Please try again.');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      level: 'error',
      code: 'LIFECYCLE_FAILURE',
      route: '/broken',
      pluginId: 'broken',
    });
  });
});
