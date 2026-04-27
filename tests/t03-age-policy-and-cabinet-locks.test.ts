import { describe, expect, test } from 'bun:test';

import type { ArcadePlugin, ChildProfile, GameManifestV1, KernelContext } from '../src/contracts/arcade';
import { annotateCabinetLockStates, canLaunchForProfile, formatAgeLockReason } from '../src/age-policy';
import { Kernel, PluginRegistry } from '../src/kernel';
import { PROFILE_AGE_BANDS } from '../src/profile-store';

function makeProfile(name: string, band: keyof typeof PROFILE_AGE_BANDS): ChildProfile {
  return {
    id: `child-${name.toLowerCase()}`,
    name,
    ageBand: PROFILE_AGE_BANDS[band],
  };
}

function makeManifest(ageMin: number, ageMax: number): GameManifestV1 {
  return {
    id: `game-${ageMin}-${ageMax}`,
    name: 'Sky Sprint',
    route: '/sky-sprint',
    description: 'Arcade racer',
    tags: ['racing'],
    ageBand: { min: ageMin, max: ageMax },
    cabinetType: 'racing',
    vehicleSupport: 'optional',
    launchMode: 'seamless',
  };
}

describe('T03 age policy and cabinet locks', () => {
  test('age policy boundary checks allow exact min/max and block outside range', () => {
    const profile = makeProfile('Luna', 'age-6-8');

    expect(canLaunchForProfile(makeManifest(6, 8), profile)).toEqual({ allowed: true });

    expect(canLaunchForProfile(makeManifest(7, 9), profile)).toMatchObject({
      allowed: false,
    });

    expect(canLaunchForProfile(makeManifest(3, 7), profile)).toMatchObject({
      allowed: false,
    });
  });

  test('lock reason formatter output is deterministic', () => {
    const profile = makeProfile('Ari', 'age-3-5');
    const manifest = makeManifest(6, 8);

    expect(formatAgeLockReason(profile, manifest)).toBe(
      'Sky Sprint is locked for Ari. Profile age band 3-5 is outside game range 6-8.',
    );
  });

  test('cabinet lock annotations keep entries visible with lock reason', () => {
    const profile = makeProfile('Milo', 'age-3-5');
    const eligible = {
      ...makeManifest(3, 5),
      id: 'puzzle-pop',
      name: 'Puzzle Pop',
      route: '/puzzle-pop',
      cabinetType: 'puzzle' as const,
    };
    const locked = makeManifest(9, 12);

    const states = annotateCabinetLockStates([eligible, locked], profile);

    expect(states).toHaveLength(2);
    expect(states[0]).toMatchObject({ locked: false, launchCheck: { allowed: true } });
    expect(states[1].locked).toBeTrue();
    expect(states[1].launchCheck.reason).toContain('outside game range 9-12');
  });

  test('kernel route handoff blocks direct navigation when age policy denies launch', async () => {
    const profile = makeProfile('Nova', 'age-3-5');
    const manifest = makeManifest(9, 12);

    const context: KernelContext = {
      profile,
      agePolicy: {
        canLaunch: canLaunchForProfile,
      },
      telemetry: {
        emit: () => undefined,
      },
    };

    const plugin: ArcadePlugin = {
      id: 'sky-sprint',
      route: '/sky-sprint',
      manifest,
      canLaunch: () => ({ allowed: true }),
      createScene: () => ({ activate: () => undefined, dispose: () => undefined }),
      onEnter: () => undefined,
      onExit: () => undefined,
    };

    const registry = new PluginRegistry();
    registry.register(plugin);
    const kernel = new Kernel(context, registry);

    const result = await kernel.navigateTo('/sky-sprint');

    expect(result.ok).toBeFalse();
    expect(result.reason).toBe('Sky Sprint is locked for Nova. Profile age band 3-5 is outside game range 9-12.');
  });
});
