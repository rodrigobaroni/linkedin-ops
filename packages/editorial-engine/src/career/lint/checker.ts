/**
 * Deterministic CV humanizer checker (`cv-banned-phrases@1.0.0`, docs/editorial/humanizer-cv-rules.md §4).
 * Runs on every segment: single-hit `reject` entries fail the CV; density hits are counted per segment
 * (≥ 3 → reject, 2 → flag). Em dashes and `job-echo` are counted in code (§2.3, §4.5).
 */
import type { CareerLanguage, TailoredCvContent } from "@linkedin-ops/contracts";
import { listSegments } from "../segments.js";
import { normalizeForMatch, wordShingles } from "../text.js";
import {
  CV_BANNED_PHRASES,
  type BannedPhraseAction,
  type BannedPhraseEntry,
  type BannedPhraseScope,
  type CvBlockKind,
} from "./cv-banned-phrases.v1.0.0.js";

export const CV_LINT_RULES_VERSION = `${CV_BANNED_PHRASES.id}@${CV_BANNED_PHRASES.version}`;

/** Code-computed rules (not in the phrase list). */
export const DENSITY_REJECT_RULE = "cv.density.reject";
export const DENSITY_FLAG_RULE = "cv.density.flag";
export const JOB_ECHO_RULE = "cv.job-echo";
export const JOB_ECHO_REPEATED_RULE = "cv.job-echo.repeated";
export const EM_DASH_BULLET_RULE = "cv.any.em-dash.bullet";
export const EM_DASH_SUMMARY_RULE = "cv.any.em-dash.summary";

const DENSITY_REJECT_AT = 3;
const DENSITY_FLAG_AT = 2;
const JOB_ECHO_REPEATED_ABOVE = 2;
const MATCH_EXCERPT_MAX = 80;

/** One finding. `match` is sent back to the model (`lintFindings`) and never logged. */
export interface LintFinding {
  segmentId: string;
  entryId: string;
  match: string;
  scope: BannedPhraseScope;
  action: BannedPhraseAction;
}

export interface LintResult {
  passed: boolean;
  findings: LintFinding[];
  /** Unique rule ids that fail the CV. */
  rejectRuleIds: string[];
  /** Unique rule ids reported without failing. */
  flagRuleIds: string[];
}

interface CompiledEntry {
  entry: BannedPhraseEntry;
  regex: RegExp;
}

const COMPILED: readonly CompiledEntry[] = CV_BANNED_PHRASES.entries.map((entry) => ({
  entry,
  regex: new RegExp(entry.pattern, entry.flags.includes("m") ? entry.flags : `${entry.flags}m`),
}));

function appliesTo(
  entry: BannedPhraseEntry,
  language: CareerLanguage,
  block: CvBlockKind,
): boolean {
  if (entry.language !== "any" && entry.language !== language) return false;
  return entry.blocks === undefined || entry.blocks.includes(block);
}

/** Findings of the phrase list for one text. Exported for the humanizer's over-correction guard. */
export function lintText(
  segmentId: string,
  text: string,
  language: CareerLanguage,
  block: CvBlockKind,
): LintFinding[] {
  const findings: LintFinding[] = [];
  for (const { entry, regex } of COMPILED) {
    if (!appliesTo(entry, language, block)) continue;
    regex.lastIndex = 0;
    for (const match of text.matchAll(regex)) {
      findings.push({
        segmentId,
        entryId: entry.id,
        match: match[0].slice(0, MATCH_EXCERPT_MAX),
        scope: entry.scope,
        action: entry.action,
      });
    }
  }
  return findings;
}

export interface LintOptions {
  language: CareerLanguage;
  /** Posting text (title, summary of requirements, evidences) for the `job-echo` marker. */
  jobText?: string;
}

export function lintTailoredCv(cv: TailoredCvContent, options: LintOptions): LintResult {
  const jobShingles = options.jobText ? wordShingles(options.jobText) : new Set<string>();
  const findings: LintFinding[] = [];
  let summaryDashes = 0;
  let echoSegments = 0;

  for (const { segment, block } of listSegments(cv)) {
    const own = lintText(segment.segmentId, segment.text, options.language, block);
    let density = own.filter((finding) => finding.scope === "density").length;

    if (jobShingles.size > 0) {
      const echoed = [...wordShingles(segment.text)].find((shingle) => jobShingles.has(shingle));
      if (echoed !== undefined) {
        echoSegments += 1;
        density += 1;
        own.push({
          segmentId: segment.segmentId,
          entryId: JOB_ECHO_RULE,
          match: echoed,
          scope: "density",
          action: "flag",
        });
      }
    }

    const dashes = (segment.text.match(/\u2014/g) ?? []).length;
    if (block === "bullet" && dashes > 0) {
      own.push({
        segmentId: segment.segmentId,
        entryId: EM_DASH_BULLET_RULE,
        match: "\u2014",
        scope: "single-hit",
        action: "flag",
      });
    }
    if (block === "summary") summaryDashes += dashes;

    if (density >= DENSITY_REJECT_AT) {
      own.push({
        segmentId: segment.segmentId,
        entryId: DENSITY_REJECT_RULE,
        match: normalizeForMatch(segment.text).slice(0, MATCH_EXCERPT_MAX),
        scope: "density",
        action: "reject",
      });
    } else if (density === DENSITY_FLAG_AT) {
      own.push({
        segmentId: segment.segmentId,
        entryId: DENSITY_FLAG_RULE,
        match: normalizeForMatch(segment.text).slice(0, MATCH_EXCERPT_MAX),
        scope: "density",
        action: "flag",
      });
    }
    findings.push(...own);
  }

  const extraFlags: string[] = [];
  if (summaryDashes > 1) extraFlags.push(EM_DASH_SUMMARY_RULE);
  if (echoSegments > JOB_ECHO_REPEATED_ABOVE) extraFlags.push(JOB_ECHO_REPEATED_RULE);

  const rejectRuleIds = unique(
    findings
      .filter((finding) => finding.action === "reject" && finding.scope === "single-hit")
      .map((finding) => finding.entryId)
      .concat(findings.filter((f) => f.entryId === DENSITY_REJECT_RULE).map((f) => f.entryId)),
  );
  const flagRuleIds = unique([
    ...findings.filter((finding) => finding.action === "flag").map((finding) => finding.entryId),
    ...extraFlags,
  ]).filter((id) => !rejectRuleIds.includes(id));

  return { passed: rejectRuleIds.length === 0, findings, rejectRuleIds, flagRuleIds };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
