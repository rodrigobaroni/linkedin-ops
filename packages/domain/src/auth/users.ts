import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, type UserRole } from "@linkedin-ops/contracts";
import type { PrismaClient } from "../client.js";
import { newId } from "../ids.js";
import { hashPassword } from "./password.js";
import { normalizeEmail } from "./prisma-session.service.js";

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  locale: string;
  timezone: string;
  /** An `ACTIVE` LinkedIn credential exists (token contents are never read here). */
  linkedinConnected: boolean;
}

/** Profile reads for `GET /auth/me` (a user query, not part of the session port). */
export interface UserProfiles {
  get(userId: string): Promise<UserProfile | null>;
}

export class PrismaUserProfiles implements UserProfiles {
  constructor(private readonly prisma: PrismaClient) {}

  async get(userId: string): Promise<UserProfile | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        locale: true,
        timezone: true,
        oauthTokens: { where: { provider: "LINKEDIN", status: "ACTIVE" }, select: { id: true } },
      },
    });
    if (!user) return null;
    const { oauthTokens, ...profile } = user;
    return { ...profile, linkedinConnected: oauthTokens.length > 0 };
  }
}

export class SetupUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SetupUserError";
  }
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Serializes concurrent `setup:user` runs (transaction-scoped advisory lock). */
const SETUP_LOCK_ID = 15_001;

/**
 * Creates the first and only OWNER (T-015 `pnpm setup:user`). Refuses when an OWNER already exists, so it
 * can never be used to take over an installed instance; there is no HTTP equivalent. The password is
 * hashed with Argon2id and never returned or logged.
 */
export async function createFirstOwner(
  prisma: PrismaClient,
  input: { email: string; name: string; password: string },
): Promise<{ id: string; email: string }> {
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  if (!EMAIL_SHAPE.test(email) || email.length > 254) throw new SetupUserError("Invalid e-mail");
  if (name === "" || name.length > 120) throw new SetupUserError("Name must have 1–120 characters");
  if (input.password.length < PASSWORD_MIN_LENGTH || input.password.length > PASSWORD_MAX_LENGTH) {
    throw new SetupUserError(
      `Password must have ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters`,
    );
  }
  if (input.password.trim().toLowerCase() === email) {
    throw new SetupUserError("Password must not be the e-mail");
  }

  const passwordHash = await hashPassword(input.password);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SETUP_LOCK_ID})`;
    const owners = await tx.user.count({ where: { role: "OWNER" } });
    if (owners > 0) throw new SetupUserError("An OWNER already exists; refusing to create another");
    const user = await tx.user.create({
      data: { id: newId(), email, name, passwordHash, role: "OWNER" },
      select: { id: true, email: true },
    });
    return user;
  });
}
