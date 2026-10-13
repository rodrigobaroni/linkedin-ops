import { z } from "zod";
import { IsoDateTimeSchema } from "../common/datetime.js";
import { UuidSchema } from "../common/ids.js";
import { LanguageSchema } from "../enums/language.js";

const ShortText = z.string().trim().min(1).max(300);

/** Real excerpt approved by Rodrigo; the system never invents examples. */
export const VoiceProfileExampleSchema = z
  .strictObject({
    text: z.string().min(1).max(3000),
    context: z.string().max(300).nullable().describe("Where/when it was written"),
  })
  .meta({ id: "VoiceProfileExample" });
export type VoiceProfileExample = z.infer<typeof VoiceProfileExampleSchema>;

export const VoiceVocabularyEntrySchema = z
  .strictObject({
    term: z.string().trim().min(1).max(80),
    note: z.string().max(300).nullable().describe("How the term is used"),
  })
  .meta({ id: "VoiceVocabularyEntry" });
export type VoiceVocabularyEntry = z.infer<typeof VoiceVocabularyEntrySchema>;

const voiceProfileShape = {
  language: LanguageSchema,
  tone: z.string().trim().min(1).max(500),
  principles: z.array(ShortText).max(50).describe("What to do"),
  avoid: z.array(ShortText).max(50).describe("What to avoid"),
  bannedPhrases: z.array(ShortText).max(200),
  vocabulary: z.array(VoiceVocabularyEntrySchema).max(200),
  examples: z.array(VoiceProfileExampleSchema).max(20),
  notes: z.string().max(5000).nullable(),
};

/** `POST /voice-profile/versions` body. Creating a version activates it. */
export const VoiceProfileInputSchema = z
  .strictObject(voiceProfileShape)
  .meta({ id: "VoiceProfileInput" });
export type VoiceProfileInput = z.infer<typeof VoiceProfileInputSchema>;

/** Voice profile version. Immutable once used by a `DraftVersion`. */
export const VoiceProfileSchema = z
  .object({
    ...voiceProfileShape,
    id: UuidSchema,
    version: z.int().min(1),
    isActive: z.boolean(),
    createdAt: IsoDateTimeSchema,
  })
  .meta({ id: "VoiceProfile" });
export type VoiceProfile = z.infer<typeof VoiceProfileSchema>;
