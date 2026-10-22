"use client";

import { Button, EmptyState, ErrorState, LoadingState } from "@linkedin-ops/ui";
import { BriefcaseBusinessIcon, FileTextIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { messages } from "@/i18n/pt-br";
import { isApiProblem } from "@/lib/api";
import { useCareerCv } from "./use-career-cv";

const copy = messages.career.jobs;

/**
 * `/carreira/vagas` (career PR 3-pre, Aurora spec §3): only the entry point for now. Without a confirmed CV
 * base it sends the user to Meu CV; with one, it says the analysis is coming (the list and the batch form
 * arrive in PR 3b). Whether a CV base is active comes from `GET /career/cv`, never decided here.
 */
export function CareerJobsScreen() {
  const cv = useCareerCv();

  let main: ReactNode;
  if (cv.isPending) {
    main = <LoadingState label={copy.loading} blocks={1} />;
  } else if (cv.isError && !cv.data) {
    main = (
      <ErrorState
        title={copy.loadError}
        correlationId={isApiProblem(cv.error) ? cv.error.correlationId : undefined}
        actions={
          <Button variant="outline" onClick={() => void cv.refetch()}>
            {copy.retry}
          </Button>
        }
      />
    );
  } else if (cv.data?.active) {
    main = <EmptyState icon={<BriefcaseBusinessIcon />} title={copy.comingSoon.title} />;
  } else {
    main = (
      <EmptyState
        icon={<FileTextIcon />}
        title={copy.noCv.title}
        description={copy.noCv.description}
        actions={
          <Button asChild className="max-sm:w-full max-md:h-11">
            <Link href="/carreira/cv">{copy.noCv.action}</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 pb-8">
      <PageHeader
        title={copy.title}
        description={copy.description}
        breadcrumb={[
          { label: messages.nav.home, href: "/hoje" },
          { label: messages.career.breadcrumb },
        ]}
      />
      {main}
    </div>
  );
}
