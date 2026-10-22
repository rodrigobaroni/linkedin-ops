import { Badge, type BadgeProps, Card, CardContent } from "@linkedin-ops/ui";
import type {
  CvSegment,
  CvStructured,
  MatchReport,
  MatchedRequirement,
  Provenance,
  TailoredCvContent,
} from "@linkedin-ops/contracts";
import { type ReactNode, useId } from "react";
import { messages } from "@/i18n/pt-br";

const copy = messages.career.jobs.detail;

/**
 * Match report and tailored CV of a `READY` posting (Aurora §3, spec §5.6 and §8). Everything here — the
 * requirements, the quotes of the CV, the tailored segments, the notes — is untrusted data (the posting and
 * the model's output): rendered as React text nodes only, never as HTML, markdown or links.
 */
export function JobReport({
  report,
  content,
  baseCv,
}: {
  report: MatchReport;
  content: TailoredCvContent;
  /** CV base the tailoring used, when it is still the active one (headings of experiences). */
  baseCv: CvStructured | null;
}) {
  const met = report.requirements.filter((item) => item.status !== "missing");
  const missing = report.requirements.filter((item) => item.status === "missing");
  const requirementText = new Map(
    report.requirements.map((item) => [item.requirementId, item.text]),
  );
  return (
    <>
      <ScoreCard score={report.baseScore} />
      <ReportSection title={copy.met.title}>
        {met.length === 0 ? (
          <Empty text={copy.met.empty} />
        ) : (
          <ul className="flex flex-col gap-3">
            {met.map((item) => (
              <li key={item.requirementId} className="flex flex-col gap-1">
                <RequirementLine item={item} />
                {item.cvEvidence.map((evidence, index) => (
                  <p key={index} className="text-sm leading-6 text-muted-foreground break-words">
                    {copy.met.quote(evidence.quote)}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        )}
      </ReportSection>
      <ReportSection title={copy.missing.title}>
        {missing.length === 0 ? (
          <Empty text={copy.missing.empty} />
        ) : (
          <ul className="flex flex-col gap-2">
            {missing.map((item) => (
              <li key={item.requirementId}>
                <RequirementLine item={item} />
              </li>
            ))}
          </ul>
        )}
      </ReportSection>
      <ReportSection title={copy.added.title} description={copy.added.description}>
        {report.added.length === 0 ? (
          <Empty text={copy.added.empty} />
        ) : (
          <ul className="flex flex-col gap-3">
            {report.added.map((item) => (
              <li key={item.segmentId} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-start gap-2">
                  <ProvenanceBadge provenance="added" />
                  <p className="min-w-0 flex-1 text-sm leading-6 break-words whitespace-pre-wrap">
                    {item.text}
                  </p>
                </div>
                <p className="text-sm leading-6 text-muted-foreground break-words">
                  {item.additionNote}
                </p>
                <p className="text-sm leading-6 text-muted-foreground break-words">
                  {copy.added.targets(
                    item.targetRequirementIds.map((id) => requirementText.get(id) ?? id).join("; "),
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </ReportSection>
      <TailoredCv content={content} baseCv={baseCv} />
    </>
  );
}

function ScoreCard({ score }: { score: number }) {
  const titleId = useId();
  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        <h2 id={titleId} className="text-lg font-semibold leading-7">
          {copy.score.title}
        </h2>
        <p className="text-3xl font-bold leading-10">{copy.score.value(score)}</p>
        <div
          role="meter"
          aria-labelledby={titleId}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={score}
          aria-valuetext={copy.score.value(score)}
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${score}%` }} />
        </div>
        <p className="text-sm leading-6 text-muted-foreground">{copy.score.legend}</p>
      </CardContent>
    </Card>
  );
}

function ReportSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId}>
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id={titleId} className="text-lg font-semibold leading-7">
              {title}
            </h2>
            {description ? (
              <p className="text-sm leading-6 text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {children}
        </CardContent>
      </Card>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm leading-6 text-muted-foreground">{text}</p>;
}

function RequirementLine({ item }: { item: MatchedRequirement }) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      <p className="min-w-0 flex-1 text-sm leading-6 font-medium break-words">{item.text}</p>
      <Badge variant="outline">{copy.kind[item.kind]}</Badge>
      {item.status === "partial" ? <Badge variant="warning">{copy.met.partial}</Badge> : null}
    </div>
  );
}

const PROVENANCE_VARIANT: Record<Provenance, NonNullable<BadgeProps["variant"]>> = {
  original: "outline",
  rewritten: "info",
  added: "automation",
};

/** Provenance as text (D4: review only, never in the PDF). */
export function ProvenanceBadge({ provenance }: { provenance: Provenance }) {
  return <Badge variant={PROVENANCE_VARIANT[provenance]}>{copy.provenance[provenance]}</Badge>;
}

function TailoredCv({
  content,
  baseCv,
}: {
  content: TailoredCvContent;
  baseCv: CvStructured | null;
}) {
  const experiences = new Map(baseCv?.experiences.map((item) => [item.id, item]) ?? []);
  return (
    <ReportSection title={copy.tailored.title} description={copy.tailored.description}>
      <div className="flex flex-col gap-5">
        <SegmentGroup title={copy.tailored.summary} segments={content.summary.segments} />
        {content.experiences.map((experience, index) => {
          const base = experiences.get(experience.cvExperienceId);
          const heading = base
            ? `${base.title} · ${base.company}`
            : copy.tailored.experience(index + 1);
          return (
            <div key={experience.cvExperienceId} className="flex flex-col gap-3">
              <h3 className="text-base font-semibold leading-6 break-words">{heading}</h3>
              <SegmentGroup
                title={copy.tailored.bullets}
                segments={experience.bullets.segments}
                level={4}
              />
              {experience.skills.segments.length > 0 ? (
                <SegmentGroup
                  title={copy.tailored.skills}
                  segments={experience.skills.segments}
                  level={4}
                />
              ) : null}
            </div>
          );
        })}
        <SegmentGroup
          title={copy.tailored.technical}
          segments={content.skills.technical.segments}
        />
        <SegmentGroup
          title={copy.tailored.behavioral}
          segments={content.skills.behavioral.segments}
        />
      </div>
    </ReportSection>
  );
}

function SegmentGroup({
  title,
  segments,
  level = 3,
}: {
  title: string;
  segments: CvSegment[];
  level?: 3 | 4;
}) {
  const Heading = level === 3 ? "h3" : "h4";
  return (
    <div className="flex flex-col gap-2">
      <Heading
        className={
          level === 3
            ? "text-base font-semibold leading-6"
            : "text-sm font-semibold leading-5 text-muted-foreground"
        }
      >
        {title}
      </Heading>
      {segments.length === 0 ? (
        <Empty text={copy.tailored.empty} />
      ) : (
        <ul className="flex flex-col gap-2">
          {segments.map((segment) => (
            <li key={segment.segmentId} className="flex flex-wrap items-start gap-2">
              <ProvenanceBadge provenance={segment.provenance} />
              <p className="min-w-0 flex-1 text-sm leading-6 break-words whitespace-pre-wrap">
                {segment.text}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
