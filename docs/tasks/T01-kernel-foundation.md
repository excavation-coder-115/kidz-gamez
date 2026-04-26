# T01 — Kernel foundation and plugin runtime

## Description
Implement a minimal kernel that owns routing, scene lifecycle, input abstraction entry points, and plugin registration/execution hooks (`onEnter`, `onExit`, `canLaunch`). This is the spine for all subsequent tasks.

## Deliverables
- Kernel bootstrap module.
- Plugin registry with typed interfaces from `src/contracts/arcade.ts`.
- Scene lifecycle manager (create/activate/dispose contract).
- Route transition pipeline with plugin lifecycle invocation.

## Acceptance criteria
- Kernel can register at least two mock plugins.
- Route change invokes `onExit` for previous plugin and `onEnter` for next plugin exactly once.
- `canLaunch` is evaluated before entering plugin routes.
- Lifecycle failures surface readable user-facing errors and structured logs.

## Meaningful tests
- Unit: plugin registry rejects duplicate IDs.
- Unit: route transition calls hooks in order (`canLaunch` -> `onExit` -> `onEnter`).
- Integration: navigating between lobby and a mock game disposes prior scene resources.
- Integration: `canLaunch` deny path blocks navigation and returns reason text.

## Blocker dependencies
- None (foundation task).
