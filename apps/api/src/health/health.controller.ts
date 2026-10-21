import { Controller, Inject } from "@nestjs/common";
import type { HealthStatus, ReadinessStatus } from "@linkedin-ops/contracts";
import { ContractRoute } from "../common/contract-route.decorator.js";
import { ProblemError } from "../common/problem.error.js";
import { APP_VERSION } from "../version.js";
import { READINESS_PROBES, type ReadinessProbe } from "./readiness.probes.js";

@Controller()
export class HealthController {
  constructor(@Inject(READINESS_PROBES) private readonly probes: readonly ReadinessProbe[]) {}

  @ContractRoute("health.liveness")
  liveness(): HealthStatus {
    return { status: "ok", version: APP_VERSION, uptimeSeconds: Math.floor(process.uptime()) };
  }

  /**
   * `200 { status: "ok", checks }` when nothing failed (`skipped` never counts as a failure);
   * `503 SERVICE_NOT_READY` otherwise, with the checks listed in `detail` (decision Maestro 2026-10-21).
   */
  @ContractRoute("health.readiness")
  async readiness(): Promise<ReadinessStatus> {
    const results = await Promise.all(
      this.probes.map(async (probe) => [probe.name, await probe.check()] as const),
    );
    const checks = Object.fromEntries(results) as ReadinessStatus["checks"];
    if (results.some(([, result]) => result === "failed")) {
      const summary = results.map(([name, result]) => `${name}=${result}`).join(", ");
      throw new ProblemError("SERVICE_NOT_READY", { detail: `Verificações: ${summary}` });
    }
    return { status: "ok", checks };
  }
}
