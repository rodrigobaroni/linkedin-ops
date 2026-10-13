import { z } from "zod";

/** Content language. PT-BR is the primary language of the editorial engine. */
export const LanguageSchema = z.enum(["pt-BR", "en"]).meta({ id: "Language" });
export const Language = LanguageSchema.enum;
export type Language = z.infer<typeof LanguageSchema>;
