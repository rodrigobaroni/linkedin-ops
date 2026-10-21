import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module.js";
import { HealthController } from "./health.controller.js";
import {
  DatabaseProbe,
  QueueProbe,
  READINESS_PROBES,
  type ReadinessProbe,
} from "./readiness.probes.js";

@Module({
  imports: [PrismaModule],
  controllers: [HealthController],
  providers: [
    DatabaseProbe,
    QueueProbe,
    {
      provide: READINESS_PROBES,
      inject: [DatabaseProbe, QueueProbe],
      useFactory: (...probes: ReadinessProbe[]) => probes,
    },
  ],
})
export class HealthModule {}
