import { z } from "zod";
import { IsoDateTimeSchema } from "../common/datetime.js";
import { LinkedInUrnSchema, UuidSchema } from "../common/ids.js";
import {
  LinkedInUploadStatusSchema,
  MediaAssetStatusSchema,
  MediaKindSchema,
  MediaOriginSchema,
} from "../enums/media.js";
import { Sha256HexSchema } from "./source-item.js";

/** Upload limits enforced by the API on `POST /media` (multipart). */
export const MEDIA_UPLOAD_LIMITS = {
  maxBytes: 8 * 1024 * 1024,
  allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "application/pdf"],
} as const;

export const MimeTypeSchema = z.string().regex(/^[a-z]+\/[a-z0-9.+-]+$/, "Expected a MIME type");

/** Input of a locally rendered code card (Satori/Resvg/Sharp; never AI image generation). */
export const CodeCardRenderSpecSchema = z
  .strictObject({
    language: z.string().trim().min(1).max(40),
    code: z.string().min(1).max(4000),
    title: z.string().trim().max(120).optional(),
    theme: z.string().trim().max(40).optional(),
  })
  .meta({ id: "CodeCardRenderSpec" });
export type CodeCardRenderSpec = z.infer<typeof CodeCardRenderSpecSchema>;

/** `POST /media/render` body. */
export const MediaRenderInputSchema = z
  .strictObject({
    kind: z.literal("CODE_CARD"),
    spec: CodeCardRenderSpecSchema,
  })
  .meta({ id: "MediaRenderInput" });
export type MediaRenderInput = z.infer<typeof MediaRenderInputSchema>;

/** Stored media. Bucket and storage key stay internal; access is through `signedUrl`. */
export const MediaAssetSchema = z
  .object({
    id: UuidSchema,
    origin: MediaOriginSchema,
    kind: MediaKindSchema,
    mimeType: MimeTypeSchema,
    bytes: z.int().min(0),
    sha256: Sha256HexSchema,
    width: z.int().min(1).nullable(),
    height: z.int().min(1).nullable(),
    renderSpec: CodeCardRenderSpecSchema.nullable(),
    linkedinAssetUrn: LinkedInUrnSchema.nullable(),
    linkedinUploadStatus: LinkedInUploadStatusSchema,
    status: MediaAssetStatusSchema,
    signedUrl: z.url().max(4096).nullable().describe("Short-lived download URL"),
    signedUrlExpiresAt: IsoDateTimeSchema.nullable(),
    createdAt: IsoDateTimeSchema,
  })
  .meta({ id: "MediaAsset" });
export type MediaAsset = z.infer<typeof MediaAssetSchema>;
