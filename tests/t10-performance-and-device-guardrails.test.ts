import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, test } from 'bun:test';

import { detectDeviceSupport } from '../src/device-capability';
import { decideBootPath } from '../src/runtime-guardrails';

describe('T10 performance and device guardrails', () => {
  test('device capability check marks environment unsupported when WebGL is unavailable', () => {
    const result = detectDeviceSupport({
      hasWebGLRenderingContext: false,
      webglContextAvailable: false,
      maxTextureSize: 4096,
      userAgent: 'Mozilla/5.0',
    });

    expect(result.supported).toBeFalse();
    expect(result.reasons).toContain('WebGL is not available in this environment.');
  });

  test('simulated unsupported device reaches guidance screen', () => {
    const screen = decideBootPath({
      hasWebGLRenderingContext: false,
      webglContextAvailable: false,
      maxTextureSize: 4096,
      userAgent: 'Mozilla/5.0',
    });

    expect(screen.type).toBe('unsupported-device');
    expect(screen.message).toContain('Try a modern desktop browser');
  });

  test('supported environment continues normal game boot path', () => {
    const screen = decideBootPath({
      hasWebGLRenderingContext: true,
      webglContextAvailable: true,
      maxTextureSize: 8192,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    });

    expect(screen.type).toBe('game');
    expect(screen.reasons).toEqual([]);
  });

  test('asset budget checker fails on over-budget fixture', () => {
    const assetsDir = mkdtempSync(join(tmpdir(), 'kidz-budget-'));

    try {
      writeFileSync(join(assetsDir, 'bundle-a.gz'), Buffer.alloc(11 * 1024 * 1024, 1));
      writeFileSync(join(assetsDir, 'bundle-b.br'), Buffer.alloc(6 * 1024 * 1024, 1));

      const run = Bun.spawnSync({
        cmd: ['bun', 'scripts/check-asset-budget.mjs', '--dir', assetsDir, '--limit-mb', '15'],
        stdout: 'pipe',
        stderr: 'pipe',
      });

      expect(run.exitCode).toBe(1);
      expect(run.stderr.toString()).toContain('Asset budget exceeded');
    } finally {
      rmSync(assetsDir, { recursive: true, force: true });
    }
  });

  test('asset budget checker falls back to built assets when compressed files are absent', () => {
    const assetsDir = mkdtempSync(join(tmpdir(), 'kidz-budget-plain-'));

    try {
      writeFileSync(join(assetsDir, 'main.js'), Buffer.alloc(9 * 1024 * 1024, 1));
      writeFileSync(join(assetsDir, 'main.css'), Buffer.alloc(8 * 1024 * 1024, 1));

      const run = Bun.spawnSync({
        cmd: ['bun', 'scripts/check-asset-budget.mjs', '--dir', assetsDir, '--limit-mb', '15'],
        stdout: 'pipe',
        stderr: 'pipe',
      });

      expect(run.exitCode).toBe(1);
      expect(run.stderr.toString()).toContain('Asset budget exceeded');
    } finally {
      rmSync(assetsDir, { recursive: true, force: true });
    }
  });

  test('performance script reports first interactive measurement for target profile', () => {
    const run = Bun.spawnSync({
      cmd: ['bun', 'scripts/measure-first-interactive.mjs', '--profile', 'desktop-mid', '--budget-ms', '2500'],
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(run.exitCode).toBe(0);
    expect(run.stdout.toString()).toContain('First interactive');
    expect(run.stdout.toString()).toContain('desktop-mid');
  });
});
