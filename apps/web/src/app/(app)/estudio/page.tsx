import type { Metadata } from "next";
import { PlaceholderScreen, parseScreenState } from "@/components/placeholder-screen";
import { screens } from "@/config/screens";

export const metadata: Metadata = { title: screens.estudio.title };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { estado } = await searchParams;
  return (
    <PlaceholderScreen screen="estudio" pathname="/estudio" state={parseScreenState(estado)} />
  );
}
