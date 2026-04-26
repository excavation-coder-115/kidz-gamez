import type { AgeBand, ChildProfile } from './contracts/arcade';
import type { ParentGateChallenge } from './parent-gate';

export type AgeBandId = 'age-3-5' | 'age-6-8' | 'age-9-12';

export const PROFILE_AGE_BANDS: Record<AgeBandId, AgeBand> = {
  'age-3-5': { min: 3, max: 5 },
  'age-6-8': { min: 6, max: 8 },
  'age-9-12': { min: 9, max: 12 },
};

interface PersistedProfiles {
  profiles: ChildProfile[];
  activeProfileId: string | null;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class InMemoryStorage implements StorageLike {
  private readonly data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

export type ProfileResult =
  | {
      ok: true;
      profile: ChildProfile;
    }
  | {
      ok: false;
      error: string;
    };

export class ProfileStore {
  private readonly storageKey = 'kidz-gamez.profiles.v1';
  private state: PersistedProfiles;

  constructor(
    private readonly storage: StorageLike,
    private readonly parentGate: ParentGateChallenge,
  ) {
    this.state = this.load();
  }

  createProfile(input: { name: string; ageBandId: AgeBandId }): ProfileResult {
    const accessCheck = this.ensureParentAccess();
    if (accessCheck) {
      return accessCheck;
    }

    const name = input.name.trim();
    if (name.length < 2) {
      return { ok: false, error: 'Profile name must be at least 2 characters.' };
    }

    const ageBand = PROFILE_AGE_BANDS[input.ageBandId];
    if (!ageBand) {
      return { ok: false, error: 'Please choose a valid age band.' };
    }

    const profile: ChildProfile = {
      id: this.generateProfileId(),
      name,
      ageBand,
    };

    this.state.profiles.push(profile);
    this.state.activeProfileId = profile.id;
    this.persist();

    return { ok: true, profile };
  }

  selectProfile(profileId: string): ProfileResult {
    const accessCheck = this.ensureParentAccess();
    if (accessCheck) {
      return accessCheck;
    }

    const profile = this.state.profiles.find((item) => item.id === profileId);
    if (!profile) {
      return { ok: false, error: 'Selected profile could not be found.' };
    }

    this.state.activeProfileId = profile.id;
    this.persist();

    return { ok: true, profile };
  }

  getProfiles(): ChildProfile[] {
    return [...this.state.profiles];
  }

  getActiveProfile(): ChildProfile | null {
    const activeId = this.state.activeProfileId;
    if (!activeId) {
      return null;
    }

    return this.state.profiles.find((profile) => profile.id === activeId) ?? null;
  }

  private ensureParentAccess(): { ok: false; error: string } | null {
    if (!this.parentGate.isUnlocked()) {
      return { ok: false, error: 'Parent gate must be completed before managing profiles.' };
    }

    return null;
  }

  private load(): PersistedProfiles {
    const raw = this.storage.getItem(this.storageKey);
    if (!raw) {
      return { profiles: [], activeProfileId: null };
    }

    try {
      const parsed = JSON.parse(raw) as PersistedProfiles;
      const profiles = Array.isArray(parsed.profiles) ? parsed.profiles : [];
      const activeProfileId = typeof parsed.activeProfileId === 'string' ? parsed.activeProfileId : null;

      return { profiles, activeProfileId };
    } catch {
      return { profiles: [], activeProfileId: null };
    }
  }

  private persist(): void {
    this.storage.setItem(this.storageKey, JSON.stringify(this.state));
  }

  private generateProfileId(): string {
    return `child_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}
