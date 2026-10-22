import type { Metadata } from "next";
import { CareerJobDetailScreen } from "@/components/career/career-job-detail-screen";
import { messages } from "@/i18n/pt-br";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: messages.career.jobs.detail.metaTitle };

export default async function Page({ params }: Props) {
  const { id } = await params;
  return <CareerJobDetailScreen id={id} />;
}
