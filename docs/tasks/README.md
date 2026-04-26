# V1 Task Breakdown

This folder decomposes `docs/v1-execution-plan.md` into implementation-ready tasks with acceptance criteria, test plans, and blocker dependencies.

## Task files

1. [T01 - Kernel foundation and plugin runtime](./T01-kernel-foundation.md)
2. [T02 - Parent gate and child profiles](./T02-parent-gate-and-profiles.md)
3. [T03 - Age policy and cabinet locking UI](./T03-age-policy-and-cabinet-locks.md)
4. [T04 - Manifest loader and typed parsing](./T04-manifest-loader.md)
5. [T05 - Vehicle classes and garage persistence](./T05-vehicle-classes-and-garage.md)
6. [T06 - Builder scene with snap modules](./T06-builder-snap-modules.md)
7. [T07 - Vehicle validator and auto-fix pipeline](./T07-vehicle-validator.md)
8. [T08 - Lobby launch interaction and lifecycle handoff](./T08-lobby-launch-handoff.md)
9. [T09 - Telemetry events and funnel instrumentation](./T09-telemetry-and-funnel.md)
10. [T10 - Performance budget and unsupported device handling](./T10-performance-and-device-guardrails.md)

## Suggested execution order

`T01 -> T02 -> T03 -> T04 -> T05 -> T06 -> T07 -> T08 -> T09 -> T10`

Parallelizable after T01: T02/T04/T10.
