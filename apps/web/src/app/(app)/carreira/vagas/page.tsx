import type { Metadata } from "next";
import { CareerJobsScreen } from "@/components/career/career-jobs-screen";
import { messages } from "@/i18n/pt-br";

export const metadata: Metadata = { title: messages.career.jobs.title };

export default function Page() {
  return <CareerJobsScreen />;
}
