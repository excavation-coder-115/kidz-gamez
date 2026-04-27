import schema from './schemas/game-manifest.v1.schema.json';

import type { AgeBand, GameManifestV1, LaunchMode, VehicleSupport } from './contracts/arcade';

type CabinetType = GameManifestV1['cabinetType'];

interface SchemaWithEnums {
  properties: {
    cabinetType: { enum: CabinetType[] };
    vehicleSupport: { enum: VehicleSupport[] };
    launchMode: { enum: LaunchMode[] };
  };
}

const typedSchema = schema as SchemaWithEnums;
const VALID_CABINET_TYPES = new Set<CabinetType>(typedSchema.properties.cabinetType.enum);
const VALID_VEHICLE_SUPPORT = new Set<VehicleSupport>(typedSchema.properties.vehicleSupport.enum);
const VALID_LAUNCH_MODES = new Set<LaunchMode>(typedSchema.properties.launchMode.enum);

export interface ManifestLoadIssue {
  index: number;
  manifestId?: string;
  reasons: string[];
}

export interface ManifestLoaderOptions {
  reportIssue?: (issue: ManifestLoadIssue) => void;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => isNonEmptyString(item));
}

function isAgeBand(value: unknown): value is AgeBand {
  if (!isObject(value)) {
    return false;
  }

  const min = value.min;
  const max = value.max;

  return (
    typeof min === 'number' &&
    typeof max === 'number' &&
    Number.isInteger(min) &&
    Number.isInteger(max) &&
    min >= 0 &&
    max <= 18 &&
    min <= max
  );
}

function validateManifest(value: unknown): string[] {
  const reasons: string[] = [];

  if (!isObject(value)) {
    return ['Manifest entry must be an object.'];
  }

  if (!isNonEmptyString(value.id)) reasons.push('id must be a non-empty string.');
  if (!isNonEmptyString(value.name)) reasons.push('name must be a non-empty string.');
  if (!isNonEmptyString(value.route)) reasons.push('route must be a non-empty string.');
  if (!isNonEmptyString(value.description)) reasons.push('description must be a non-empty string.');

  if (!isStringArray(value.tags)) {
    reasons.push('tags must be an array of non-empty strings.');
  }

  if (!isAgeBand(value.ageBand)) {
    reasons.push('ageBand must use integer min/max within 0-18 with min <= max.');
  }

  if (!isNonEmptyString(value.cabinetType) || !VALID_CABINET_TYPES.has(value.cabinetType as CabinetType)) {
    reasons.push(`cabinetType must be one of: ${Array.from(VALID_CABINET_TYPES).join(', ')}.`);
  }

  if (!isNonEmptyString(value.vehicleSupport) || !VALID_VEHICLE_SUPPORT.has(value.vehicleSupport as VehicleSupport)) {
    reasons.push(`vehicleSupport must be one of: ${Array.from(VALID_VEHICLE_SUPPORT).join(', ')}.`);
  }

  if (!isNonEmptyString(value.launchMode) || !VALID_LAUNCH_MODES.has(value.launchMode as LaunchMode)) {
    reasons.push(`launchMode must be one of: ${Array.from(VALID_LAUNCH_MODES).join(', ')}.`);
  }

  return reasons;
}

export function loadManifestsFromSource(source: unknown[], options: ManifestLoaderOptions = {}): GameManifestV1[] {
  const valid: GameManifestV1[] = [];

  source.forEach((entry, index) => {
    const reasons = validateManifest(entry);
    if (reasons.length > 0) {
      options.reportIssue?.({
        index,
        manifestId: isObject(entry) && typeof entry.id === 'string' ? entry.id : undefined,
        reasons,
      });
      return;
    }

    valid.push(entry as GameManifestV1);
  });

  return valid.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export const STATIC_MANIFEST_V1_SOURCE: unknown[] = [];

export function loadStaticManifestV1(options: ManifestLoaderOptions = {}): GameManifestV1[] {
  return loadManifestsFromSource(STATIC_MANIFEST_V1_SOURCE, options);
}
