import { z } from "zod";

export const MediaOriginSchema = z.enum(["UPLOAD", "RENDERED"]).meta({ id: "MediaOrigin" });
export const MediaOrigin = MediaOriginSchema.enum;
export type MediaOrigin = z.infer<typeof MediaOriginSchema>;

export const MediaKindSchema = z.enum(["IMAGE", "CODE_CARD", "DOCUMENT"]).meta({ id: "MediaKind" });
export const MediaKind = MediaKindSchema.enum;
export type MediaKind = z.infer<typeof MediaKindSchema>;

export const LinkedInUploadStatusSchema = z
  .enum(["NONE", "UPLOADED", "FAILED"])
  .meta({ id: "LinkedInUploadStatus" });
export const LinkedInUploadStatus = LinkedInUploadStatusSchema.enum;
export type LinkedInUploadStatus = z.infer<typeof LinkedInUploadStatusSchema>;

export const MediaAssetStatusSchema = z
  .enum(["READY", "FAILED", "DELETED"])
  .meta({ id: "MediaAssetStatus" });
export const MediaAssetStatus = MediaAssetStatusSchema.enum;
export type MediaAssetStatus = z.infer<typeof MediaAssetStatusSchema>;
