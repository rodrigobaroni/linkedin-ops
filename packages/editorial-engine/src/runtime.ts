/** Randomness is injected (ADR-0005 §1): the worker passes a crypto-backed source, tests a fixed one. */
export interface Rng {
  /** `length` lowercase hex characters. */
  hex(length: number): string;
}
