import { z } from "zod";

export const UserRoleSchema = z.enum(["OWNER", "EDITOR", "VIEWER"]).meta({ id: "UserRole" });
export const UserRole = UserRoleSchema.enum;
export type UserRole = z.infer<typeof UserRoleSchema>;
