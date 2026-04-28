import type { VehicleGraphV1 } from './contracts/arcade';
import { validateVehicleGraph } from './vehicle-validator';
import type { ProfileStore, StorageLike } from './profile-store';
import { buildTelemetryPayload } from './telemetry';

export interface VehicleClassDefinition {
  id: string;
  name: string;
  defaultGraph: VehicleGraphV1;
}

export interface GarageEntry {
  id: string;
  name: string;
  classId: string;
  graph: VehicleGraphV1;
}

interface ProfileGarageState {
  entries: GarageEntry[];
  activeVehicleId: string | null;
}

interface PersistedGarageState {
  profiles: Record<string, ProfileGarageState>;
}

export type GarageResult =
  | { ok: true; vehicle: GarageEntry }
  | { ok: false; error: string };

export const VEHICLE_CLASS_REGISTRY: VehicleClassDefinition[] = [
  {
    id: 'speedster',
    name: 'Speedster',
    defaultGraph: {
      schemaVersion: 1,
      classId: 'speedster',
      nodes: [],
    },
  },
  {
    id: 'hauler',
    name: 'Hauler',
    defaultGraph: {
      schemaVersion: 1,
      classId: 'hauler',
      nodes: [],
    },
  },
  {
    id: 'glider',
    name: 'Glider',
    defaultGraph: {
      schemaVersion: 1,
      classId: 'glider',
      nodes: [],
    },
  },
];

export class GarageStore {
  private readonly storageKey = 'kidz-gamez.garage.v1';
  private state: PersistedGarageState;

  constructor(
    private readonly storage: StorageLike,
    private readonly profileStore: Pick<ProfileStore, 'getActiveProfile'>,
    private readonly telemetry?: { emit: (eventType: string, payload?: unknown) => void },
    private readonly now: () => Date = () => new Date(),
  ) {
    this.state = this.load();
  }

  saveVehicle(input: { name: string; graph: VehicleGraphV1 }): GarageResult {
    const profileId = this.getActiveProfileId();
    if (!profileId) {
      return { ok: false, error: 'Choose a child profile before managing garage builds.' };
    }

    const name = input.name.trim();
    if (name.length < 2) {
      return { ok: false, error: 'Vehicle name must be at least 2 characters.' };
    }

    const validation = validateVehicleGraph(input.graph);
    if (!validation.valid) {
      return { ok: false, error: `Validation failed: ${validation.errors.join(' ')}`.trim() };
    }

    const classId = this.resolveClassId(validation.output.classId);
    const entry: GarageEntry = {
      id: this.generateVehicleId(),
      name,
      classId,
      graph: {
        ...validation.output,
        classId,
      },
    };

    const profileGarage = this.getOrCreateProfileGarage(profileId);
    profileGarage.entries.push(entry);
    profileGarage.activeVehicleId = entry.id;
    this.persist();
    this.telemetry?.emit(
      'vehicle_saved',
      buildTelemetryPayload(
        {
          profile: this.profileStore.getActiveProfile(),
          vehicleId: entry.id,
        },
        this.now,
      ),
    );

    return { ok: true, vehicle: entry };
  }

  getGarageEntries(): GarageEntry[] {
    const profileId = this.getActiveProfileId();
    if (!profileId) {
      return [];
    }

    return [...this.getOrCreateProfileGarage(profileId).entries];
  }

  getActiveVehicle(): GarageEntry | null {
    const profileId = this.getActiveProfileId();
    if (!profileId) {
      return null;
    }

    const profileGarage = this.getOrCreateProfileGarage(profileId);
    const active = profileGarage.entries.find((entry) => entry.id === profileGarage.activeVehicleId);
    if (active) {
      return active;
    }

    if (profileGarage.entries.length > 0) {
      profileGarage.activeVehicleId = profileGarage.entries[0].id;
      this.persist();
      return profileGarage.entries[0];
    }

    const fallback = this.createDefaultEntry();
    profileGarage.entries = [fallback];
    profileGarage.activeVehicleId = fallback.id;
    this.persist();

    return fallback;
  }

  selectVehicle(vehicleId: string): GarageResult {
    const profileId = this.getActiveProfileId();
    if (!profileId) {
      return { ok: false, error: 'Choose a child profile before managing garage builds.' };
    }

    const profileGarage = this.getOrCreateProfileGarage(profileId);
    const vehicle = profileGarage.entries.find((entry) => entry.id === vehicleId);
    if (!vehicle) {
      return { ok: false, error: 'Selected vehicle could not be found.' };
    }

    profileGarage.activeVehicleId = vehicle.id;
    this.persist();

    return { ok: true, vehicle };
  }

  deleteVehicle(vehicleId: string): GarageResult {
    const profileId = this.getActiveProfileId();
    if (!profileId) {
      return { ok: false, error: 'Choose a child profile before managing garage builds.' };
    }

    const profileGarage = this.getOrCreateProfileGarage(profileId);
    const index = profileGarage.entries.findIndex((entry) => entry.id === vehicleId);
    if (index === -1) {
      return { ok: false, error: 'Vehicle could not be found.' };
    }

    const [removed] = profileGarage.entries.splice(index, 1);
    if (profileGarage.activeVehicleId === removed.id) {
      if (profileGarage.entries.length > 0) {
        profileGarage.activeVehicleId = profileGarage.entries[0].id;
      } else {
        const fallback = this.createDefaultEntry();
        profileGarage.entries = [fallback];
        profileGarage.activeVehicleId = fallback.id;
      }
    }

    const activeVehicle = this.getActiveVehicle();
    if (!activeVehicle) {
      return { ok: false, error: 'No active vehicle is available.' };
    }

    this.persist();
    return { ok: true, vehicle: activeVehicle };
  }

  private getActiveProfileId(): string | null {
    return this.profileStore.getActiveProfile()?.id ?? null;
  }

  private getOrCreateProfileGarage(profileId: string): ProfileGarageState {
    const existing = this.state.profiles[profileId];
    if (existing) {
      return existing;
    }

    const created: ProfileGarageState = {
      entries: [],
      activeVehicleId: null,
    };

    this.state.profiles[profileId] = created;
    return created;
  }

  private resolveClassId(classId: string): string {
    const matched = VEHICLE_CLASS_REGISTRY.find((entry) => entry.id === classId);
    return matched?.id ?? VEHICLE_CLASS_REGISTRY[0].id;
  }

  private createDefaultEntry(): GarageEntry {
    const fallbackClass = VEHICLE_CLASS_REGISTRY[0];

    return {
      id: this.generateVehicleId(),
      name: `${fallbackClass.name} Starter`,
      classId: fallbackClass.id,
      graph: {
        ...fallbackClass.defaultGraph,
      },
    };
  }

  private load(): PersistedGarageState {
    const raw = this.storage.getItem(this.storageKey);
    if (!raw) {
      return { profiles: {} };
    }

    try {
      const parsed = JSON.parse(raw) as PersistedGarageState;
      const profiles = typeof parsed.profiles === 'object' && parsed.profiles !== null ? parsed.profiles : {};

      const normalizedProfiles: Record<string, ProfileGarageState> = {};
      for (const [profileId, profileState] of Object.entries(profiles)) {
        const entries = Array.isArray(profileState?.entries)
          ? profileState.entries.filter((entry): entry is GarageEntry => typeof entry?.id === 'string')
          : [];
        const activeVehicleId = typeof profileState?.activeVehicleId === 'string' ? profileState.activeVehicleId : null;
        normalizedProfiles[profileId] = { entries, activeVehicleId };
      }

      return { profiles: normalizedProfiles };
    } catch {
      return { profiles: {} };
    }
  }

  private persist(): void {
    this.storage.setItem(this.storageKey, JSON.stringify(this.state));
  }

  private generateVehicleId(): string {
    return `vehicle_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}
