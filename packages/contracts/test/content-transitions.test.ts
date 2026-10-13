import { describe, expect, it } from "vitest";
import {
  CONTENT_TRANSITIONS,
  ContentEventSchema,
  ContentStateSchema,
  DISCARDABLE_STATES,
  DraftStatusSchema,
  OPPORTUNITY_STATUS_TO_CONTENT_STATE,
  OpportunityStatusSchema,
  TERMINAL_CONTENT_STATES,
  canTransition,
  resolveTransition,
  transitionsFrom,
  type ContentState,
} from "../src/index.js";

describe("ContentState enum vs. transition table (data-model.md §3.1)", () => {
  it("every from/to in the table is a ContentState", () => {
    for (const transition of CONTENT_TRANSITIONS) {
      expect(ContentStateSchema.safeParse(transition.from).success).toBe(true);
      expect(ContentStateSchema.safeParse(transition.to).success).toBe(true);
      expect(ContentEventSchema.safeParse(transition.event).success).toBe(true);
    }
  });

  it("every ContentState appears in at least one transition", () => {
    const seen = new Set(
      CONTENT_TRANSITIONS.flatMap((transition) => [transition.from, transition.to]),
    );
    for (const state of ContentStateSchema.options) expect(seen.has(state), state).toBe(true);
  });

  it("every ContentEvent is used by at least one transition", () => {
    const used = new Set(CONTENT_TRANSITIONS.map((transition) => transition.event));
    for (const event of ContentEventSchema.options) expect(used.has(event), event).toBe(true);
  });

  it("covers the briefing §13 happy path", () => {
    const path: ContentState[] = [
      "CANDIDATE",
      "SELECTED",
      "GENERATING",
      "DRAFT",
      "IN_REVIEW",
      "APPROVED",
      "SCHEDULED",
      "PUBLISHING",
      "PUBLISHED",
    ];
    for (let index = 0; index < path.length - 1; index += 1) {
      expect(
        canTransition(path[index] as ContentState, path[index + 1] as ContentState),
        `${path[index]} → ${path[index + 1]}`,
      ).toBe(true);
    }
    expect(canTransition("PUBLISHING", "FAILED")).toBe(true);
  });

  it("DraftStatus ⊂ ContentState and OpportunityStatus maps onto ContentState", () => {
    for (const status of DraftStatusSchema.options)
      expect(ContentStateSchema.options).toContain(status);
    for (const status of OpportunityStatusSchema.options) {
      expect(ContentStateSchema.options).toContain(OPPORTUNITY_STATUS_TO_CONTENT_STATE[status]);
    }
  });
});

describe("allowed transitions (PRD §8.2 / data-model.md §3.1)", () => {
  const allowed: Array<[ContentState, string, ContentState]> = [
    ["CANDIDATE", "select", "SELECTED"],
    ["CANDIDATE", "dismiss", "DISMISSED"],
    ["CANDIDATE", "expire", "EXPIRED"],
    ["CANDIDATE", "prefetch", "CANDIDATE"],
    ["SELECTED", "create_draft", "GENERATING"],
    ["GENERATING", "generation.succeeded", "DRAFT"],
    ["GENERATING", "generation.failed", "FAILED"],
    ["DRAFT", "edit", "DRAFT"],
    ["IN_REVIEW", "edit", "DRAFT"],
    ["APPROVED", "edit", "IN_REVIEW"],
    ["APPROVED", "regenerate", "IN_REVIEW"],
    ["DRAFT", "submit_review", "IN_REVIEW"],
    ["IN_REVIEW", "approve", "APPROVED"],
    ["IN_REVIEW", "reject", "DRAFT"],
    ["APPROVED", "schedule", "SCHEDULED"],
    ["SCHEDULED", "cancel_schedule", "APPROVED"],
    ["APPROVED", "revoke_auto_approval", "IN_REVIEW"],
    ["SCHEDULED", "revoke_auto_approval", "IN_REVIEW"],
    ["APPROVED", "publish_now", "PUBLISHING"],
    ["SCHEDULED", "dispatch", "PUBLISHING"],
    ["PUBLISHING", "publication.succeeded", "PUBLISHED"],
    ["PUBLISHING", "publication.failed", "FAILED"],
    ["FAILED", "retry", "APPROVED"],
    ["SCHEDULED", "discard", "DISCARDED"],
    ["FAILED", "discard", "DISCARDED"],
  ];

  for (const [from, event, to] of allowed) {
    it(`${from} --${event}--> ${to}`, () => {
      expect(resolveTransition(from, event as never)).toBe(to);
      expect(canTransition(from, to)).toBe(true);
    });
  }
});

describe("forbidden transitions", () => {
  const forbidden: Array<[ContentState, ContentState]> = [
    ["CANDIDATE", "GENERATING"],
    ["CANDIDATE", "DRAFT"],
    ["DRAFT", "APPROVED"],
    ["DRAFT", "SCHEDULED"],
    ["DRAFT", "PUBLISHING"],
    ["IN_REVIEW", "SCHEDULED"],
    ["IN_REVIEW", "PUBLISHING"],
    ["APPROVED", "PUBLISHED"],
    ["SCHEDULED", "PUBLISHED"],
    ["PUBLISHED", "DRAFT"],
    ["PUBLISHED", "DISCARDED"],
    ["PUBLISHING", "DISCARDED"],
    ["PUBLISHING", "APPROVED"],
    ["DISMISSED", "CANDIDATE"],
    ["EXPIRED", "SELECTED"],
    ["DISCARDED", "DRAFT"],
    ["FAILED", "PUBLISHING"],
  ];

  for (const [from, to] of forbidden) {
    it(`${from} -/-> ${to}`, () => {
      expect(canTransition(from, to)).toBe(false);
    });
  }

  it("rejects events in the wrong state", () => {
    expect(resolveTransition("IN_REVIEW", "schedule")).toBeNull();
    expect(resolveTransition("DRAFT", "approve")).toBeNull();
    expect(resolveTransition("PUBLISHED", "discard")).toBeNull();
    expect(resolveTransition("PUBLISHING", "discard")).toBeNull();
    expect(resolveTransition("SCHEDULED", "publish_now")).toBeNull();
  });

  it("PUBLISHED, DISMISSED, EXPIRED and DISCARDED are terminal", () => {
    expect([...TERMINAL_CONTENT_STATES].sort()).toEqual([
      "DISCARDED",
      "DISMISSED",
      "EXPIRED",
      "PUBLISHED",
    ]);
    for (const state of TERMINAL_CONTENT_STATES) expect(transitionsFrom(state)).toHaveLength(0);
  });

  it("discard is allowed from every draft state except PUBLISHING/PUBLISHED/DISCARDED", () => {
    const expected = DraftStatusSchema.options.filter(
      (state) => !["PUBLISHING", "PUBLISHED", "DISCARDED"].includes(state),
    );
    expect([...DISCARDABLE_STATES].sort()).toEqual([...expected].sort());
  });

  it("every (from, event) pair is unique", () => {
    const keys = CONTENT_TRANSITIONS.map((transition) => `${transition.from}:${transition.event}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
