# ADR-0006: Pinning the `linkedin-skills` upstream

- Status: accepted (pending Platform script implementation) — agreed by Atlas, Pena (editorial, `docs/editorial/upstream-mapping.md` §6) and the Maestro acting for Platform on 2026-10-13; Estaleiro implements the sync script and CI check once recruited
- Date: 2026-10-13
- Deciders: Atlas (architect), Pena (AI editorial), Maestro on behalf of Platform (Estaleiro to confirm tooling)

## Context

The brief mandates using `https://github.com/sergebulaev/linkedin-skills` (MIT) as the editorial and
evaluation reference, recording the analysed commit/tag, preserving attribution, adapting the concepts
into `packages/editorial-engine`, and keeping a traceability document in
`docs/editorial/upstream-mapping.md`. The application must not depend on Claude Code, Codex or `SKILL.md`
files at runtime. We need a reproducible way to know *which* upstream revision each adaptation came
from, to diff future upstream changes, and to review adaptations against the original — without
introducing a runtime or build dependency. Pena's audit found that most derived material comes from the
upstream `references/` folder, and that the full repository (~3 MB, images, Python, generated packages,
symlinked `.claude/skills`) is noise.

## Decision

**Selective vendored snapshot with a hashed lock file, inside the editorial package, excluded from build.**

1. **Location**: `packages/editorial-engine/upstream/linkedin-skills/`. Inside the package (not a
   top-level `vendor/`): no change to the baseline structure, Pena owns it, and the adaptation diff sits
   next to the derived code.
2. **Content** (Markdown only): `LICENSE` (verbatim); `references/*.md` (currently 9 files:
   `voice-profile`, `story-bank`, `voice-rules`, `hook-formulas`, `algorithm-heuristics`,
   `untrusted-content`, `founder-topics`, `industry-benchmarks`, `engagement-metrics-taxonomy`); the
   `skills/<name>/**/*.md` of the ten relevant skills (`linkedin-interviewer`, `linkedin-post-writer`,
   `linkedin-humanizer`, `linkedin-content-planner`, `linkedin-profile-optimizer`,
   `linkedin-comment-drafter`, `linkedin-reply-handler`, `linkedin-hook-extractor`,
   `linkedin-repurposer`, `linkedin-thread-monitor`). Excluded: images, Python, `scripts/`,
   `.codex-marketplace/`, `.claude/`, symlinks.
3. **Attribution**: `NOTICE.md` next to the snapshot with title, URL, commit, tag, date, copyright and the
   upstream README "License" section (not the full README). Each engine module adapted from a skill
   carries a header comment `Adapted from linkedin-skills <path> @ <commit> (MIT)`. The repository root
   `THIRD_PARTY_LICENSES.md` lists the upstream.
4. **Lock file** `packages/editorial-engine/upstream/UPSTREAM.lock.json`:
   `{ "repo", "commit", "tag", "fetchedAt", "license": "MIT", "files": [{ "path", "sha256" }] }`.
5. **Sync script** `packages/editorial-engine/scripts/sync-upstream.ts` (manual): clones the pinned
   commit into a temp dir, copies the allowlisted paths, rewrites the lock with per-file SHA-256, and
   prints a diff summary. Bumping = change the commit in the lock, run the script, review the PR diff,
   update `upstream-mapping.md` and affected attribution headers.
6. **Read-only snapshot, enforced**: CI verifies every file hash against the lock (manual edits fail);
   `CODEOWNERS` assigns the folder to Pena; `tsconfig` `exclude`, ESLint ignore, Vitest exclude and
   package `files` keep it out of builds; a CI check asserts nothing under `src/` imports from `upstream/`.
7. **Cadence**: manual, event-driven — re-audit when upstream publishes a tag touching a vendored path,
   and at least quarterly. Each sync is a backlog task. Never automatic.
8. **Unverified claims**: heuristics about the LinkedIn algorithm found upstream are recorded in
   `upstream-mapping.md` with evidence labels and never surfaced as product truths (brief §7.8).

## Alternatives considered

- **Git submodule.** Reproducible and small, but adds friction for agents and CI (recursive clone,
  detached HEAD confusion), pins the *entire* repo, and makes partial vendoring impossible. Rejected.
- **Git subtree.** Keeps history in-repo, but pulls ~3 MB including images, Python, generated packages
  and symlinks; squash merges pollute `main`; conflicts are hard for a multi-agent team; tempts the team
  to "use the lib". Rejected.
- **Reference-only (commit SHA + notes).** Lightest, but not reproducible if upstream rewrites history or
  disappears; reviewers and Sentinela cannot audit the material offline. Rejected.
- **npm dependency.** Upstream is not a package and must not be a runtime dependency. Rejected.

## Consequences

- Roughly 470 KB of Markdown under the editorial package; acceptable.
- Upstream updates are deliberate, reviewed diffs, not automatic.
- Ownership: Pena maintains the lock, `NOTICE.md`, the mapping document and attribution headers;
  Estaleiro implements the sync script, hash verification and import check in CI (this is the only
  pending item; Estaleiro may swap the script language/tooling without reopening the decision).

## Security / compliance impact

- MIT attribution preserved; derived work documented and auditable offline.
- Vendored Markdown is reference material only — never loaded into prompts or served to users, so it
  cannot act as an injection vector; the hash check also detects tampering.
- Reviewers can verify that no unofficial "algorithm" claims leak into product copy.
