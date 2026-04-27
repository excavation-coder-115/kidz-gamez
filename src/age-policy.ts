import type { ChildProfile, GameManifestV1, LaunchCheck } from './contracts/arcade';

export interface CabinetLockState {
  manifest: GameManifestV1;
  locked: boolean;
  launchCheck: LaunchCheck;
}

export function canLaunchForProfile(manifest: GameManifestV1, profile: ChildProfile | null): LaunchCheck {
  if (!profile) {
    return { allowed: false, reason: 'Choose a child profile to launch games.' };
  }

  const inRange =
    profile.ageBand.min >= manifest.ageBand.min && profile.ageBand.max <= manifest.ageBand.max;

  if (inRange) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: formatAgeLockReason(profile, manifest),
  };
}

export function formatAgeLockReason(profile: ChildProfile, manifest: GameManifestV1): string {
  const profileBand = `${profile.ageBand.min}-${profile.ageBand.max}`;
  const gameBand = `${manifest.ageBand.min}-${manifest.ageBand.max}`;
  return `${manifest.name} is locked for ${profile.name}. Profile age band ${profileBand} is outside game range ${gameBand}.`;
}

export function annotateCabinetLockStates(
  manifests: GameManifestV1[],
  profile: ChildProfile | null,
): CabinetLockState[] {
  return manifests.map((manifest) => {
    const launchCheck = canLaunchForProfile(manifest, profile);
    return {
      manifest,
      locked: !launchCheck.allowed,
      launchCheck,
    };
  });
}
