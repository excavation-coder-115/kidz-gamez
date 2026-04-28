# Telemetry event payloads (T09)

All required setup-to-launch funnel events use a common payload baseline:

- `profileId: string | null`
- `timestamp: string` (ISO-8601)

Event-specific fields:

- `profile_created`: baseline only.
- `vehicle_saved`: baseline + `vehicleId`.
- `cabinet_interacted`: baseline + `cabinetId` + `gameId` (cabinet route).
- `game_runtime_loaded`: baseline + `gameId` (plugin ID), and optional `manifestId` when manifest metadata is available.

Implementation lives in `src/telemetry.ts` and call sites are in profile, garage, lobby interaction, and kernel navigation flows.
