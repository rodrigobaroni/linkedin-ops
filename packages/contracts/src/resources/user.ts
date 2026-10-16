import { z } from "zod";
import { IsoDateTimeSchema, IanaTimezoneSchema } from "../common/datetime.js";
import { LinkedInUrnSchema, UuidSchema } from "../common/ids.js";
import { UserRoleSchema } from "../enums/user-role.js";

/** BCP 47 locale tag such as `pt-BR`. */
export const LocaleSchema = z
  .string()
  .regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/, "Expected a locale like pt-BR")
  .describe("BCP 47 locale");
export type Locale = z.infer<typeof LocaleSchema>;

export const EmailSchema = z.email().max(254).describe("Login e-mail");

export const UserNameSchema = z.string().trim().min(1).max(120).describe("Display name");

/** Account as seen by the API. `passwordHash` and tokens never leave the database. */
export const UserSchema = z
  .object({
    id: UuidSchema,
    email: EmailSchema,
    name: UserNameSchema,
    role: UserRoleSchema,
    locale: LocaleSchema,
    timezone: IanaTimezoneSchema,
    linkedinMemberUrn: LinkedInUrnSchema.nullable(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .meta({ id: "User" });
export type User = z.infer<typeof UserSchema>;
