/**
 * Development seed (T-005). Idempotent: every write is an upsert keyed by the natural unique index, so
 * running it twice leaves the database unchanged. Fictitious data only — no real person, no real
 * credentials, no voice profile or Story Bank (those are Rodrigo's own words and are never invented).
 *
 * Environment: DATABASE_URL (required), SEED_USER_EMAIL (default dev@example.com),
 * SEED_USER_PASSWORD (default below, development only; never logged). Runs only when NODE_ENV is
 * `development` or `test` (`src/env/guards.ts`).
 */
import { pathToFileURL } from "node:url";
import { hashPassword } from "../src/auth/password.js";
import { createPrismaClient, type PrismaClient } from "../src/client.js";
import { assertDatabaseScriptAllowed, requireDatabaseUrl } from "../src/env/guards.js";
import { newId } from "../src/ids.js";
import { canonicalizeUrl } from "../src/sources/canonical-url.js";

export const SEED_DEFAULT_EMAIL = "dev@example.com";
/** ≥ 15 characters (ADR-0007). Development default; override with SEED_USER_PASSWORD. */
export const SEED_DEFAULT_PASSWORD = "dev-only-password-change-me";

export interface SeedOptions {
  email?: string;
  password?: string;
}

export interface SeedSummary {
  userId: string;
  pillars: number;
  sources: number;
}

const PILLARS = [
  {
    slug: "engenharia-de-software",
    name: "Engenharia de software",
    description: "Arquitetura, qualidade, testes e práticas de entrega.",
    targetAudience: "Pessoas desenvolvedoras e líderes técnicos",
    weight: "1.00",
  },
  {
    slug: "lideranca-tecnica",
    name: "Liderança técnica",
    description: "Decisões, trade-offs e comunicação em times de engenharia.",
    targetAudience: "Tech leads, staff engineers e gestores de engenharia",
    weight: "1.00",
  },
  {
    slug: "carreira-em-tecnologia",
    name: "Carreira em tecnologia",
    description: "Aprendizado contínuo, posicionamento e evolução profissional.",
    targetAudience: "Profissionais de tecnologia em qualquer nível",
    weight: "0.80",
  },
] as const;

const SOURCES = [
  {
    name: "Node.js Blog",
    url: "https://nodejs.org/en/feed/blog.xml",
    type: "RSS",
    trustLevel: "HIGH",
    fetchIntervalMinutes: 360,
  },
  {
    name: "GitHub Blog",
    url: "https://github.blog/feed/",
    type: "RSS",
    trustLevel: "MEDIUM",
    fetchIntervalMinutes: 360,
  },
] as const;

export async function seed(prisma: PrismaClient, options: SeedOptions = {}): Promise<SeedSummary> {
  const email = options.email ?? process.env["SEED_USER_EMAIL"] ?? SEED_DEFAULT_EMAIL;
  const password = options.password ?? process.env["SEED_USER_PASSWORD"] ?? SEED_DEFAULT_PASSWORD;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email }, select: { id: true } });
    const user =
      existing ??
      (await tx.user.create({
        data: {
          id: newId(),
          email,
          passwordHash: await hashPassword(password),
          name: "Dev User",
          role: "OWNER",
          locale: "pt-BR",
          timezone: "America/Sao_Paulo",
        },
        select: { id: true },
      }));

    await tx.autonomySettings.upsert({
      where: { userId: user.id },
      create: { userId: user.id, mode: "ASSISTED" },
      update: {},
    });

    for (const pillar of PILLARS) {
      await tx.contentPillar.upsert({
        where: { userId_slug: { userId: user.id, slug: pillar.slug } },
        create: { id: newId(), userId: user.id, ...pillar },
        update: {
          name: pillar.name,
          description: pillar.description,
          targetAudience: pillar.targetAudience,
          weight: pillar.weight,
        },
      });
    }

    for (const source of SOURCES) {
      const canonicalUrl = canonicalizeUrl(source.url);
      await tx.source.upsert({
        where: { userId_canonicalUrl: { userId: user.id, canonicalUrl } },
        create: { id: newId(), userId: user.id, canonicalUrl, ...source },
        update: { name: source.name, type: source.type, trustLevel: source.trustLevel },
      });
    }

    return { userId: user.id, pillars: PILLARS.length, sources: SOURCES.length };
  });
}

async function main(): Promise<void> {
  assertDatabaseScriptAllowed(process.env, "seed");
  const connectionString = requireDatabaseUrl(process.env);
  const prisma = createPrismaClient({ connectionString });
  try {
    const summary = await seed(prisma);
    // Counts only — never the e-mail, the password or the connection string.
    console.warn(`seed: ok (user 1, pillars ${summary.pillars}, sources ${summary.sources})`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
