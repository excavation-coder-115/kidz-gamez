import type { NavigationResult } from './kernel';
import type { ChildProfile } from './contracts/arcade';
import { buildTelemetryPayload } from './telemetry';

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface KernelNavigator {
  navigateTo(route: string): Promise<NavigationResult>;
}

export interface CabinetInteractionTarget {
  id: string;
  route: string;
  position: Vec3;
  interactionRadius: number;
  name?: string;
  lockedReason?: string;
}

interface LobbyLaunchControllerOptions {
  kernel: KernelNavigator;
  hubRoute: string;
  hubSpawn: Vec3;
  onReturnToHubSpawn?: (position: Vec3) => void;
  telemetry?: { emit: (eventType: string, payload?: unknown) => void };
  getCurrentProfile?: () => ChildProfile | null;
}

export class LobbyLaunchController {
  private cabinets: CabinetInteractionTarget[] = [];
  private playerPosition: Vec3 = { x: 0, y: 0, z: 0 };
  private activeCabinet: CabinetInteractionTarget | null = null;
  private prompt: string | null = null;
  private errorModalMessage: string | null = null;

  constructor(private readonly options: LobbyLaunchControllerOptions) {}

  setCabinets(cabinets: CabinetInteractionTarget[]): void {
    this.cabinets = cabinets;
    this.refreshPrompt();
  }

  updatePlayerPosition(position: Vec3): void {
    this.playerPosition = position;
    this.refreshPrompt();
  }

  getPrompt(): string | null {
    return this.prompt;
  }

  getErrorModalMessage(): string | null {
    return this.errorModalMessage;
  }

  async interact(): Promise<NavigationResult> {
    if (!this.activeCabinet) {
      return { ok: false, route: this.options.hubRoute, reason: 'No cabinet in interaction range.' };
    }

    this.options.telemetry?.emit(
      'cabinet_interacted',
      buildTelemetryPayload({
        profile: this.options.getCurrentProfile?.() ?? null,
        cabinetId: this.activeCabinet.id,
        gameId: this.activeCabinet.route,
      }),
    );

    const { lockedReason } = this.activeCabinet;
    if (lockedReason) {
      this.prompt = lockedReason;
      return { ok: false, route: this.activeCabinet.route, reason: lockedReason, errorMessage: lockedReason };
    }

    const launch = await this.options.kernel.navigateTo(this.activeCabinet.route);
    if (!launch.ok) {
      this.errorModalMessage = launch.errorMessage ?? 'Unable to launch game runtime.';
      if (launch.requiresHubRecovery) {
        await this.options.kernel.navigateTo(this.options.hubRoute);
      }
      return launch;
    }

    this.errorModalMessage = null;
    return launch;
  }

  async exitRuntimeToHub(): Promise<NavigationResult> {
    const navigation = await this.options.kernel.navigateTo(this.options.hubRoute);
    if (navigation.ok) {
      this.options.onReturnToHubSpawn?.(this.options.hubSpawn);
      this.errorModalMessage = null;
    }
    return navigation;
  }

  private refreshPrompt(): void {
    const nearest = this.findNearestCabinetInRange();
    this.activeCabinet = nearest;

    if (!nearest) {
      this.prompt = null;
      return;
    }

    if (nearest.lockedReason) {
      this.prompt = nearest.lockedReason;
      return;
    }

    const label = nearest.name ?? 'this cabinet';
    this.prompt = `Press E to launch ${label}.`;
  }

  private findNearestCabinetInRange(): CabinetInteractionTarget | null {
    let best: CabinetInteractionTarget | null = null;
    let bestDistanceSquared = Number.POSITIVE_INFINITY;

    for (const cabinet of this.cabinets) {
      const distanceSquared = this.distanceSquared(this.playerPosition, cabinet.position);
      if (distanceSquared > cabinet.interactionRadius * cabinet.interactionRadius) {
        continue;
      }

      if (distanceSquared < bestDistanceSquared) {
        best = cabinet;
        bestDistanceSquared = distanceSquared;
      }
    }

    return best;
  }

  private distanceSquared(a: Vec3, b: Vec3): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;

    return dx * dx + dy * dy + dz * dz;
  }
}
