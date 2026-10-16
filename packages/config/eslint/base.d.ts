import type { Linter } from "eslint";
import type { ConfigArray, InfiniteDepthConfigWithExtends } from "typescript-eslint";

/** Paths never linted in any workspace. */
export declare const ignores: string[];

/** `no-restricted-imports` options for the ADR-0001 dependency direction; `allowUi` only in apps/web and packages/ui. */
export declare function noRestrictedImports(options?: { allowUi?: boolean }): Linter.RuleEntry;

/** Config object that allows importing `@linkedin-ops/ui` (apps/web, packages/ui). */
export declare const allowUiImports: Linter.Config;

/** Build the shared flat config for a workspace, appending `extra` config objects before Prettier. */
export declare function config(...extra: InfiniteDepthConfigWithExtends[]): ConfigArray;

declare const _default: ConfigArray;
export default _default;
