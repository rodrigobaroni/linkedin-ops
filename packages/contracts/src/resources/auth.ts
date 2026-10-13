import { z } from "zod";
import { IsoDateTimeSchema, IanaTimezoneSchema } from "../common/datetime.js";
import { UuidSchema } from "../common/ids.js";
import { UserRoleSchema } from "../enums/user-role.js";
import { EmailSchema, LocaleSchema, UserNameSchema } from "./user.js";

export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MAX_LENGTH = 256;

/** ADR-0007: minimum 15 characters in the single-user phase. Credentials never echo back. */
export const PasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH)
  .max(PASSWORD_MAX_LENGTH)
  .describe(`Password (${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} chars)`);

/** Strict: unknown keys are rejected, not stripped (threat model TM-06). */
export const LoginInputSchema = z
  .strictObject({
    email: EmailSchema,
    password: PasswordSchema,
  })
  .meta({ id: "LoginInput" });
export type LoginInput = z.infer<typeof LoginInputSchema>;

/** `POST /auth/reauth`: elevates the session for 15 minutes (ADR-0007). */
export const ReauthInputSchema = z
  .strictObject({
    password: PasswordSchema,
  })
  .meta({ id: "ReauthInput" });
export type ReauthInput = z.infer<typeof ReauthInputSchema>;

/** `GET /auth/me`. */
export const MeSchema = z
  .object({
    id: UuidSchema,
    email: EmailSchema,
    name: UserNameSchema,
    role: UserRoleSchema,
    locale: LocaleSchema,
    timezone: IanaTimezoneSchema,
    linkedinConnected: z.boolean(),
  })
  .meta({ id: "Me" });
export type Me = z.infer<typeof MeSchema>;

/**
 * Active session as listed by `GET /auth/sessions`. `id` is a public identifier for revocation and is
 * never the session secret stored in the cookie.
 */
export const SessionSummarySchema = z
  .object({
    id: UuidSchema.describe("Public session id (not the cookie value)"),
    createdAt: IsoDateTimeSchema,
    lastSeenAt: IsoDateTimeSchema,
    ip: z.string().max(45).nullable(),
    userAgent: z.string().max(512).nullable(),
    current: z.boolean().describe("True for the session making the request"),
  })
  .meta({ id: "SessionSummary" });
export type SessionSummary = z.infer<typeof SessionSummarySchema>;
