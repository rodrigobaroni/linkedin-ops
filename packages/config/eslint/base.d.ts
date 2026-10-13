import type { ConfigArray, InfiniteDepthConfigWithExtends } from "typescript-eslint";

/** Paths never linted in any workspace. */
export declare const ignores: string[];

/** Build the shared flat config for a workspace, appending `extra` config objects before Prettier. */
export declare function config(...extra: InfiniteDepthConfigWithExtends[]): ConfigArray;

declare const _default: ConfigArray;
export default _default;
