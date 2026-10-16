/**
 * Autonomy mode as defined in docs/architecture/data-model.md (`AutonomyMode`).
 * TODO(T-004): replace with the enum exported by `@linkedin-ops/contracts` once it lands;
 * the UI package only maps the value to labels, icons and colors — it never decides behaviour.
 */
export const AUTONOMY_MODES = ["ASSISTED", "AUTOPILOT_CONTROLLED", "AUTOPILOT_FULL"] as const;

export type AutonomyMode = (typeof AUTONOMY_MODES)[number];
