/**
 * Characters reserved by the LinkedIn "little text" format used in `commentary` of `POST /rest/posts`.
 * Unescaped, they are parsed as mentions/hashtag templates or silently truncate the post.
 */
const RESERVED = /[\\|{}@[\]()<>#*_~]/g;

/** Escapes user-written text so LinkedIn publishes it literally (no mentions or templates are created). */
export function escapeLittleText(text: string): string {
  return text.replace(RESERVED, (char) => `\\${char}`);
}
