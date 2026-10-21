import { Inject, Injectable } from "@nestjs/common";
import type { ReadinessCheck } from "@linkedin-ops/contracts";
import type { PrismaClient } from "@linkedin-ops/domain";
import { PRISMA_CLIENT } from "../prisma/prisma.module.js";

export const READINESS_PROBES = Symbol("READINESS_PROBES");
export const PROBE_TIMEOUT_MS = 2_000;

/** One dependency checked by `GET /ready`. Implementations never throw: they report `failed`. */
export interface ReadinessProbe {
  readonly name: "database" | "queue";
  check(): Promise<ReadinessCheck>;
}

export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

@Injectable()
export class DatabaseProbe implements ReadinessProbe {
  readonly name = "database" as const;

  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async check(): Promise<ReadinessCheck> {
    try {
      await withTimeout(this.prisma.$queryRaw`SELECT 1`, PROBE_TIMEOUT_MS);
      return "ok";
    } catch {
      return "failed";
    }
  }
}

/** TODO(T-006): check pg-boss once the worker exists. Until then the check is reported as `skipped`. */
@Injectable()
export class QueueProbe implements ReadinessProbe {
  readonly name = "queue" as const;

  async check(): Promise<ReadinessCheck> {
    return "skipped";
  }
}
