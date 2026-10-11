// Pure helpers for task-limit handling.
// The backend is the source of truth for limits; these helpers keep the UI
// consistent and are unit-testable.

export const DEFAULT_TASK_LIMIT = 3;

// Cap a requested task count to the user's allowed limit. Never allows a
// run to exceed the user's task limit.
export function clampTargetCount(requested: number, taskLimit?: number): number {
  const limit = Math.max(1, Number(taskLimit) || DEFAULT_TASK_LIMIT);
  const want = Math.max(1, Number(requested) || limit);
  return Math.min(want, limit);
}

// Resolve the effective task limit for the settings UI (read-only field).
export function resolveTaskLimit(taskLimit?: number): number {
  return Math.max(1, Number(taskLimit) || DEFAULT_TASK_LIMIT);
}

// Friendly plan label derived from the user's task limit.
export function planLabel(taskLimit?: number): string {
  return resolveTaskLimit(taskLimit) > DEFAULT_TASK_LIMIT ? 'Premium' : 'Free';
}
