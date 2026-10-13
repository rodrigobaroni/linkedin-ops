import type { Metadata } from "next";
import { PlaceholderScreen, parseScreenState } from "@/components/placeholder-screen";
import { screens } from "@/config/screens";

export const metadata: Metadata = { title: screens.hoje.title };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { estado } = await searchParams;
  return <PlaceholderScreen screen="hoje" pathname="/hoje" state={parseScreenState(estado)} />;
}
