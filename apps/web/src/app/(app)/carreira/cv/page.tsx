import type { Metadata } from "next";
import { CareerCvScreen } from "@/components/career/career-cv-screen";
import { messages } from "@/i18n/pt-br";

export const metadata: Metadata = { title: messages.career.cv.title };

export default function Page() {
  return <CareerCvScreen />;
}
