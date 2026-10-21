import { Module } from "@nestjs/common";
import { SessionModule } from "../session/session.module.js";
import { AuthController } from "./auth.controller.js";

@Module({
  imports: [SessionModule],
  controllers: [AuthController],
})
export class AuthModule {}
