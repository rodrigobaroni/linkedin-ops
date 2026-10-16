/**
 * Development seed (T-005). Idempotent: every write is an upsert keyed by the natural unique index, so
 * running it twice leaves the database unchanged. Fictitious data only — no real person, no real
 * credentials, no voice profile or Story Bank (those are Rodrigo's own words and are never invented).
 *
 * Environment: DATABASE_URL (required), SEED_USER_EMAIL (default dev@example.com),
 * SEED_USER_PASSWORD (default below, development only; never logged). Refuses to run in production.
 */
import { pathToFileURL } from "node:url";
import argon2 from "argon2";
import { createPrismaClient, type PrismaClient } from "../src/client.js";
import { newId } from "../src/ids.js";

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

/** OWASP minimum parameters for Argon2id (19 MiB, 2 iterations, 1 lane). Calibrated later (T-008). */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
}

/** Lowercase host, drop query string and fragment — the same normalization the API will apply. */
export function canonicalizeUrl(raw: string): string {
  const url = new URL(raw);
  url.hostname = url.hostname.toLowerCase();
  url.search = "";
  url.hash = "";
  return url.toString();
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
  if (process.env["NODE_ENV"] === "production") {
    throw new Error("Refusing to seed: NODE_ENV=production");
  }
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
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
