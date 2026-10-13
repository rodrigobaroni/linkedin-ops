# upstream/ (reserved — ADR-0006)

This directory will hold the selective, hashed snapshot of `sergebulaev/linkedin-skills` (MIT):
`linkedin-skills/` (Markdown only), `NOTICE.md` and `UPSTREAM.lock.json`.

Nothing is vendored yet. The sync script (`scripts/sync-upstream.ts`), the hash verification and the
"no imports from `upstream/`" CI check are a separate Platform task; Pena owns the content.
The folder is excluded from ESLint, TypeScript, Vitest and the package `files` list.
