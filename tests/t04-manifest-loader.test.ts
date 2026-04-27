import { describe, expect, test } from 'bun:test';

import type { GameManifestV1 } from '../src/contracts/arcade';
import { loadManifestsFromSource, type ManifestLoadIssue } from '../src/manifest-loader';

function makeManifest(overrides: Partial<GameManifestV1> = {}): GameManifestV1 {
  return {
    id: 'sky-sprint',
    name: 'Sky Sprint',
    route: '/sky-sprint',
    description: 'Arcade racer',
    tags: ['racing'],
    ageBand: { min: 6, max: 8 },
    cabinetType: 'racing',
    vehicleSupport: 'optional',
    launchMode: 'seamless',
    ...overrides,
  };
}

describe('T04 manifest loader and typed parsing', () => {
  test('valid manifest fixture parses successfully', () => {
    const manifests = loadManifestsFromSource([makeManifest()]);

    expect(manifests).toHaveLength(1);
    expect(manifests[0]).toMatchObject({
      id: 'sky-sprint',
      cabinetType: 'racing',
      vehicleSupport: 'optional',
      launchMode: 'seamless',
    });
  });

  test('invalid enum values are rejected with actionable reason logging', () => {
    const issues: ManifestLoadIssue[] = [];

    const manifests = loadManifestsFromSource(
      [
        makeManifest({ id: 'bad-cabinet', cabinetType: 'sports' as GameManifestV1['cabinetType'] }),
        makeManifest({ id: 'bad-support', vehicleSupport: 'sometimes' as GameManifestV1['vehicleSupport'] }),
        makeManifest({ id: 'bad-launch', launchMode: 'manual' as GameManifestV1['launchMode'] }),
      ],
      {
        reportIssue: (issue) => {
          issues.push(issue);
        },
      },
    );

    expect(manifests).toHaveLength(0);
    expect(issues).toHaveLength(3);
    expect(issues[0].reasons.join(' ')).toContain('cabinetType');
    expect(issues[1].reasons.join(' ')).toContain('vehicleSupport');
    expect(issues[2].reasons.join(' ')).toContain('launchMode');
  });

  test('malformed age bands are rejected', () => {
    const manifests = loadManifestsFromSource([
      makeManifest({ id: 'negative-min', ageBand: { min: -1, max: 5 } }),
      makeManifest({ id: 'out-of-range-max', ageBand: { min: 8, max: 20 } }),
      makeManifest({ id: 'inverted-range', ageBand: { min: 9, max: 7 } }),
    ]);

    expect(manifests).toHaveLength(0);
  });

  test('mixed valid/invalid manifest list yields only valid entries in deterministic order', () => {
    const manifests = loadManifestsFromSource([
      makeManifest({ id: 'zeta', name: 'Zeta Quest' }),
      makeManifest({ id: 'bad-range', ageBand: { min: 10, max: 2 } }),
      makeManifest({ id: 'alpha', name: 'Alpha Builder' }),
      makeManifest({ id: 'bad-enum', vehicleSupport: 'sometimes' as GameManifestV1['vehicleSupport'] }),
    ]);

    expect(manifests.map((manifest) => manifest.id)).toEqual(['alpha', 'zeta']);
  });
});
