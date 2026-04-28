import type { ChildProfile } from './contracts/arcade';

export type TelemetryEventType = 'profile_created' | 'vehicle_saved' | 'cabinet_interacted' | 'game_runtime_loaded';

export interface TelemetryEventPayload {
  profileId: string | null;
  timestamp: string;
  gameId?: string;
  manifestId?: string;
  cabinetId?: string;
  vehicleId?: string;
}

export interface TelemetryEvent {
  type: TelemetryEventType;
  payload: TelemetryEventPayload;
}

export interface TelemetryTransport {
  send(event: TelemetryEvent): void;
}

interface TelemetryBusOptions {
  transport?: TelemetryTransport;
  now?: () => Date;
}

interface BuildPayloadInput {
  profile: ChildProfile | null;
  gameId?: string;
  manifestId?: string;
  cabinetId?: string;
  vehicleId?: string;
}

export function buildTelemetryPayload(input: BuildPayloadInput, now: () => Date = () => new Date()): TelemetryEventPayload {
  const payload: TelemetryEventPayload = {
    profileId: input.profile?.id ?? null,
    timestamp: now().toISOString(),
  };

  if (input.gameId) {
    payload.gameId = input.gameId;
  }
  if (input.manifestId) {
    payload.manifestId = input.manifestId;
  }
  if (input.cabinetId) {
    payload.cabinetId = input.cabinetId;
  }
  if (input.vehicleId) {
    payload.vehicleId = input.vehicleId;
  }

  return payload;
}

export class TelemetryBus {
  private readonly debugEvents: TelemetryEvent[] = [];
  private readonly emittedKeys = new Set<string>();

  constructor(private readonly options: TelemetryBusOptions = {}) {}

  emit(type: string, payload?: unknown): void {
    if (!payload) {
      return;
    }

    const event: TelemetryEvent = {
      type: type as TelemetryEventType,
      payload: payload as TelemetryEventPayload,
    };
    this.debugEvents.push(event);

    try {
      this.options.transport?.send(event);
    } catch {
      // Missing or failing transport should not interrupt gameplay flows.
    }
  }

  emitUnique(type: TelemetryEventType, dedupeKey: string, payload: TelemetryEventPayload): void {
    const key = `${type}:${dedupeKey}`;
    if (this.emittedKeys.has(key)) {
      return;
    }

    this.emittedKeys.add(key);
    this.emit(type, payload);
  }

  getDebugEvents(): TelemetryEvent[] {
    return [...this.debugEvents];
  }

  resetSession(): void {
    this.emittedKeys.clear();
    this.debugEvents.length = 0;
  }
}
