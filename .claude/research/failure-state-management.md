# Failure State Management

**Date:** 2026-03-24
**Status:** Research / Proposal

## Problem

We need to make sure we employ a uniform approach to handling failure states in the applications. Similar considerations should be given to automation-generated files (PDFs, HTML docs, etc.).

* Users should be notified of failures
* Users should be able to retry failed operations (where applicable)
* Users should receive clear and intelligible error messages
* Users should be able to view the details of a failed action
* Users should be able to view the root cause of a failure
* Users should be able to view the steps that failed
* Users should be able to view the steps that succeeded
* Users should be able to view the steps that were skipped

### Current State

Error handling across the platform is functional but inconsistent. Each layer has its own ad-hoc patterns:

**Web (`packages/web`):**
- Sonner toast notifications for success/error feedback (`toast.success()`, `toast.error()`)
- Centralized `apiFetch<T>()` wrapper returns `ApiResponse<T>` envelope with `success`/`data`/`error` fields
- `ExtensionError` class with `code`, `message`, and `recoverable` boolean — the most structured error handling in the frontend
- Component-level `isLoading` / `error` state variables with inline conditional rendering
- Step progress tracking in `step-extract.tsx` and `step-progress.tsx` with per-task status (`pending | running | done | failed`)
- No React Error Boundary — unhandled render errors crash silently
- No centralized error logging or reporting
- No retry logic beyond manual "Try Again" buttons

**API (`packages/api`):**
- Standard `ApiResponse` envelope (`{ success, data?, error? }`) defined in `@exodus/shared`
- Zod `safeParse()` for validation, returns `{ message: "Validation failed", code: "VALIDATION_ERROR" }` — no field-level detail
- Manual try-catch around `c.req.json()` for malformed request bodies
- Prisma error handling limited to `P2025` (record not found) — other Prisma errors re-thrown unhandled
- No global `app.onError()` handler in Hono — unhandled errors produce default framework responses
- `QueryResolverError` class defined in shared but unused in API routes
- `console.log`/`console.error` only — no structured logging

**App Generator (`packages/app-generator`):**
- `StepResult` type with `status: 'success' | 'failed' | 'skipped'` and `output` — the strongest pattern in the codebase
- `executeSteps()` tracks a `failed` Set and auto-skips dependent steps
- `PipelineError` wraps errors with `stepName`, `originalError`, and `context`
- Generator outputs include `warnings[]` and `skipped[]` arrays with metadata
- All of this is in-memory only — not persisted or surfaced to the user

**Automation Engine (`packages/automation-engine`):**
- `ValidationError` and `UnsupportedFormatError` custom classes in `documentService.ts`
- `HealthCheckResult` with `healthy`, `statusCode`, `error`, `responseTimeMs` for PDF service
- Workflow step results accessed via `getStepResult()` (Mastra framework)
- Service context with `withServiceContext()` try/finally cleanup

**Shared (`packages/shared`):**
- `ApiError` schema: `{ message: string, code?: string }`
- `ApiResponse<T>` schema: `{ success: boolean, data?: T, error?: ApiError }`
- `PipelineStatus`: `pending | running | completed | failed | cancelled`
- `PipelineJobSchema` with `id`, `status`, `progress`, `message`, timestamps

### Key Gaps

1. **No global error boundary** in the React app — unhandled render errors are invisible
2. **No unified error model** — each layer defines its own error shape (ExtensionError, PipelineError, ValidationError, QueryResolverError, ApiError)
3. **No step-level visibility** for users — `StepResult[]` exists in the generator but isn't surfaced through the API or UI beyond the extraction step
4. **No structured error codes** — most errors are plain strings; `code` field is optional and rarely populated
5. **No retry infrastructure** — retry is manual button clicks with no backoff, deduplication, or idempotency
6. **No error persistence** — failures are ephemeral (toasts, console logs, in-memory arrays)
7. **Validation errors lack specificity** — "Validation failed" with no field-level detail

---

## Solution

A layered failure-state architecture with three tiers: **structured error model**, **failure-aware UI patterns**, and **step-level execution tracking**. Each tier builds on the previous one.

### Tier 1: Structured Error Model

Extend the existing `ApiError` in `@exodus/shared` into a richer, unified error type used across all packages:

```typescript
// packages/shared/src/types/errors.ts

export const ErrorSeverity = {
  INFO: "info",         // non-blocking warning
  WARNING: "warning",   // degraded but functional
  ERROR: "error",       // operation failed, recoverable
  FATAL: "fatal",       // operation failed, not recoverable
} as const;

export type ErrorSeverity = (typeof ErrorSeverity)[keyof typeof ErrorSeverity];

export const ErrorCodeSchema = z.enum([
  // Client errors
  "VALIDATION_ERROR",
  "INVALID_INPUT",
  "NOT_FOUND",
  "UNAUTHORIZED",
  "FORBIDDEN",
  // Server errors
  "INTERNAL_ERROR",
  "DATABASE_ERROR",
  "EXTERNAL_SERVICE_ERROR",
  // Pipeline/automation errors
  "STEP_FAILED",
  "STEP_SKIPPED",
  "PIPELINE_FAILED",
  "GENERATION_ERROR",
  // Extension errors
  "EXTENSION_NOT_INSTALLED",
  "EXTENSION_TIMEOUT",
  "EXTENSION_RUNTIME_ERROR",
  // Document generation errors
  "PDF_GENERATION_FAILED",
  "UNSUPPORTED_FORMAT",
]);

export const StructuredErrorSchema = z.object({
  message: z.string(),
  code: ErrorCodeSchema,
  severity: z.nativeEnum(ErrorSeverity).default("error"),
  field: z.string().optional(),              // for validation errors
  details: z.record(z.unknown()).optional(),  // arbitrary context
  cause: z.string().optional(),              // root cause description
  recoverable: z.boolean().default(true),
});

export type StructuredError = z.infer<typeof StructuredErrorSchema>;
```

**Why this approach:** The existing `ApiError` (`message` + optional `code`) is too thin to carry the information users need. Adding `severity`, `recoverable`, `field`, and `cause` lets every layer communicate failure state with enough fidelity for the UI to render appropriate responses — without requiring each component to invent its own error shape.

**Why not a class hierarchy:** Error classes (`ExtensionError`, `PipelineError`, `ValidationError`) don't serialize cleanly across the API boundary. A plain data schema works identically in the API response, in the browser, and in stored execution logs. The existing custom error classes would be kept as internal implementation details that map to `StructuredError` at the boundary.

### Tier 2: Failure-Aware UI Patterns

Standardize how the web app renders and recovers from failures.

#### 2a. Global Error Boundary

Add a React error boundary at the router root that catches unhandled render errors, logs them, and shows a fallback UI with a recovery action:

```typescript
// packages/web/src/components/error-boundary.tsx

class AppErrorBoundary extends React.Component<Props, State> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Unhandled render error:", error, info.componentStack);
    // Future: send to error reporting service
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} onReset={() => this.setState({ hasError: false })} />;
    }
    return this.props.children;
  }
}
```

The fallback UI should show: what happened (plain language), a "Try Again" button that resets the boundary, and a "View Details" expandable section with the error message and component stack.

#### 2b. Unified Error Display Component

Replace the ad-hoc inline error rendering (each component styles its own error state differently) with a shared component:

```typescript
// packages/web/src/components/ui/error-display.tsx

interface ErrorDisplayProps {
  error: StructuredError;
  onRetry?: () => void;
  onDismiss?: () => void;
  variant?: "inline" | "banner" | "full-page";
}
```

Rendering rules based on error properties:

| Property | UI Behavior |
|---|---|
| `severity: "info"` | Blue info banner, auto-dismissible |
| `severity: "warning"` | Amber warning banner with dismiss |
| `severity: "error"` + `recoverable: true` | Red error with "Try Again" button |
| `severity: "error"` + `recoverable: false` | Red error with "Contact Support" link |
| `severity: "fatal"` | Full-page error with suggested actions |
| `field` present | Inline field-level error (form context) |
| `cause` present | Expandable "Root Cause" detail section |
| `details.steps` present | Step progress visualization (see Tier 3) |

#### 2c. Toast Behavior Standardization

Current toast usage is inconsistent — sometimes `toast.error(message)`, sometimes `toast.error(res.error?.message ?? fallback)`. Standardize with a wrapper:

```typescript
// packages/web/src/lib/notify.ts

export function notifyError(error: StructuredError | string) {
  const err = typeof error === "string" ? { message: error, code: "INTERNAL_ERROR" as const } : error;
  toast.error(err.message, {
    description: err.cause,
    action: err.recoverable ? { label: "Details", onClick: () => showErrorDetail(err) } : undefined,
    duration: err.severity === "fatal" ? Infinity : 5000,
  });
}

export function notifySuccess(message: string) {
  toast.success(message, { duration: 3000 });
}
```

### Tier 3: Step-Level Execution Tracking

This addresses the core requirements around viewing steps that failed, succeeded, or were skipped. The app-generator already has `StepResult` with exactly this model — the gap is surfacing it through the API and UI.

#### 3a. Persist Step Results in Pipeline Jobs

The `PipelineJob` schema in `@exodus/shared` already has `status`, `progress`, and `message`. Extend it with step-level detail:

```typescript
// Extend packages/shared/src/types/pipeline.ts

export const StepStatusSchema = z.enum(["pending", "running", "success", "failed", "skipped"]);

export const PipelineStepSchema = z.object({
  name: z.string(),
  status: StepStatusSchema,
  message: z.string().optional(),
  error: StructuredErrorSchema.optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  durationMs: z.number().optional(),
  output: z.record(z.unknown()).optional(),
  dependsOn: z.array(z.string()).optional(),
  skippedReason: z.string().optional(),   // e.g., "dependency 'validate-schema' failed"
});

export const PipelineJobSchema = z.object({
  id: z.string(),
  status: PipelineStatusSchema,
  progress: z.number().min(0).max(100).optional(),
  message: z.string().optional(),
  steps: z.array(PipelineStepSchema).optional(),   // NEW
  error: StructuredErrorSchema.optional(),           // NEW: top-level error
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
```

#### 3b. Step Progress Visualization Component

Build a reusable component that renders `PipelineStep[]` as a vertical timeline — similar to the existing `step-progress.tsx` but generalized:

```typescript
// packages/web/src/components/ui/step-timeline.tsx

interface StepTimelineProps {
  steps: PipelineStep[];
  showDurations?: boolean;
  expandErrors?: boolean;
}
```

Visual mapping:

| Step Status | Icon | Color | Behavior |
|---|---|---|---|
| `pending` | Circle (hollow) | Gray | Dimmed text |
| `running` | Loader2 (spinning) | Blue | Pulse animation |
| `success` | CheckCircle2 | Green | Shows duration if available |
| `failed` | XCircle | Red | Expands to show error detail + root cause |
| `skipped` | MinusCircle | Amber | Shows `skippedReason` as tooltip/subtitle |

Failed steps should show:
- The error message
- The root cause (if `error.cause` is populated)
- A "Retry from here" action (if the operation supports partial retry)

Skipped steps should show:
- Which dependency failed that caused the skip
- What the step would have done (from `name`)

#### 3c. Document Generation Failure Reporting

For automation-generated files (PDFs, HTML docs), failures should produce the same structured output. The automation engine's `documentService.ts` already throws `ValidationError` and `UnsupportedFormatError` — these need to be caught and mapped into `StructuredError`:

```typescript
// In the document generation pipeline
try {
  const result = await generateDocument(request);
  return { success: true, data: result };
} catch (error) {
  if (error instanceof ValidationError) {
    return {
      success: false,
      error: {
        message: error.message,
        code: "VALIDATION_ERROR",
        severity: "error",
        recoverable: true,
        cause: "The document request failed validation before generation started.",
      },
    };
  }
  if (error instanceof UnsupportedFormatError) {
    return {
      success: false,
      error: {
        message: error.message,
        code: "UNSUPPORTED_FORMAT",
        severity: "error",
        recoverable: false,
        cause: `Format not supported. Supported formats: pdf, csv, json.`,
      },
    };
  }
  // PDF service health/timeout errors
  return {
    success: false,
    error: {
      message: "Document generation failed",
      code: "PDF_GENERATION_FAILED",
      severity: "error",
      recoverable: true,
      cause: error instanceof Error ? error.message : "Unknown error",
      details: { format: request.format, attempted: true },
    },
  };
}
```

---

## Implementation

### Phase 1: Foundation (Error Model + Global Boundary)

**Goal:** Establish the shared error contract and catch unhandled failures.

1. **Create `packages/shared/src/types/errors.ts`** with `StructuredError`, `ErrorSeverity`, and `ErrorCode` schemas. Export from shared package index.

2. **Update `ApiResponse<T>`** to use `StructuredError` instead of `ApiError`:
   ```typescript
   // Backward-compatible: StructuredError is a superset of ApiError
   export type ApiResponse<T> = {
     success: boolean;
     data?: T;
     error?: StructuredError;
   };
   ```

3. **Add Hono global error handler** in `packages/api/src/app.ts`:
   ```typescript
   app.onError((err, c) => {
     const structured = mapToStructuredError(err);
     console.error({ error: structured, path: c.req.path });
     return c.json({ success: false, error: structured }, structured.code === "NOT_FOUND" ? 404 : 500);
   });
   ```
   This catches all unhandled errors (including the Prisma errors that currently re-throw) and returns consistent `StructuredError` responses.

4. **Add React Error Boundary** wrapping the router in `packages/web/src/routes/__root.tsx`. This is a safety net — no component changes needed yet.

5. **Create `notifyError()` / `notifySuccess()`** wrappers in `packages/web/src/lib/notify.ts` to standardize toast usage.

**Generators affected:** None. This is platform-only.

### Phase 2: Enriched API Errors

**Goal:** Make API error responses carry enough information for the UI to render intelligently.

1. **Enrich validation errors** with field-level detail:
   ```typescript
   if (!parsed.success) {
     return c.json({
       success: false,
       error: {
         message: "Validation failed",
         code: "VALIDATION_ERROR",
         severity: "error",
         recoverable: true,
         details: {
           fields: parsed.error.issues.map(i => ({
             path: i.path.join("."),
             message: i.message,
           })),
         },
       },
     }, 400);
   }
   ```

2. **Expand Prisma error mapping** beyond P2025:
   | Prisma Code | Mapped Error Code | Message |
   |---|---|---|
   | P2025 | `NOT_FOUND` | "Record not found" |
   | P2002 | `VALIDATION_ERROR` | "A record with this value already exists" (+ field) |
   | P2003 | `DATABASE_ERROR` | "Referenced record does not exist" |
   | P2014 | `DATABASE_ERROR` | "Required relation violation" |
   | Others | `DATABASE_ERROR` | "A database error occurred" |

3. **Map `ExtensionError` codes** to `StructuredError` in the web client's `apiFetch` or at the call site, so extension communication failures render through the same UI components.

**Generators affected:** None.

### Phase 3: Step-Level Pipeline Visibility

**Goal:** Users can see which steps succeeded, failed, and were skipped for pipeline jobs.

1. **Extend `PipelineJobSchema`** with `steps: PipelineStep[]` as described in Tier 3a.

2. **Update the pipeline job processor** (pg-boss handler) to write `StepResult[]` from `executeSteps()` into the job record as `PipelineStep[]`, mapping the app-generator's `StepResult` to the shared schema.

3. **Add API endpoint** `GET /api/projects/:id/jobs/:jobId` that returns the full job with steps.

4. **Build `<StepTimeline>` component** as described in Tier 3b.

5. **Integrate into project detail view** — when a job has `status: "failed"`, show the step timeline with expandable error details for the failed step(s) and skip reasons for dependent steps.

**Generators affected:** None directly. The app-generator's `executeSteps()` output format is already compatible — we're persisting what was previously discarded.

### Phase 4: Document Generation Failure Reporting

**Goal:** Automation-generated files (PDFs, HTML) report failures through the same model.

1. **Wrap document generation calls** in the automation engine to catch `ValidationError`, `UnsupportedFormatError`, and PDF service errors, mapping them to `StructuredError` as shown in Tier 3c.

2. **Surface document generation failures** in the pipeline step results — a failed PDF generation becomes a `StepResult` with `status: "failed"` and a `StructuredError` containing the root cause (e.g., "PDF service health check failed: connection refused on port 3001").

3. **Add retry support** for recoverable document generation errors (service timeouts, transient failures) via the step-level retry mechanism in the pipeline.

**Generators affected:** Automation Runtime Generator (for generated apps that produce documents).

### Phase 5: Retry Infrastructure (Future)

**Goal:** Move beyond manual "Try Again" buttons to programmatic retry with backoff.

This phase is outlined here for completeness but should be specified separately — it depends on the observability work (see `observability-research.md`) for execution persistence.

Key capabilities:
- **API-level retry** for transient failures (503, network errors) in `apiFetch()` with exponential backoff (max 3 attempts)
- **Pipeline step retry** — re-execute from the failed step using persisted `StepResult[]` context (requires idempotent steps)
- **Dead letter queue** for pipeline jobs that exceed retry limits — admin-visible, manually retriggerable
- **Idempotency keys** for mutation operations to prevent duplicate side effects on retry

---

## Migration Path

The implementation phases are designed so each one delivers standalone value:

| Phase | Standalone Value | Depends On |
|---|---|---|
| Phase 1 | Catches unhandled errors, standardizes toast usage | Nothing |
| Phase 2 | Better error messages for users, field-level validation feedback | Phase 1 (error types) |
| Phase 3 | Users can see exactly what failed in their migration pipeline | Phase 1 (error types) |
| Phase 4 | Document generation failures are visible and debuggable | Phase 1 + Phase 3 |
| Phase 5 | Automated recovery from transient failures | Phase 3 + observability work |

The `StructuredError` schema is backward-compatible with the existing `ApiError` — any response that has `{ message, code? }` is a valid subset. This means Phase 1 can be deployed without updating every error site at once; existing error responses continue to work and can be migrated incrementally.

---

## Relationship to Other Research

- **Observability (`observability-research.md`):** The automation execution monitor (Idea 1) and this document's Phase 3 share the same underlying need — persisting `StepResult[]`. If both are implemented, they should share the storage model. The observability work adds the _query and analysis_ layer on top of the failure data this document proposes to capture.
- **Pagination (`pagination-optimization.md`):** Paginated list views need their own error state for partial-page failures (e.g., page 3 of results fails to load). The `ErrorDisplay` component from Phase 1 should handle this via the `variant: "inline"` mode.
