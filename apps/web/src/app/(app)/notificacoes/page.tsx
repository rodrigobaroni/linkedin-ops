import type { Metadata } from "next";
import { PlaceholderScreen, parseScreenState } from "@/components/placeholder-screen";
import { screens } from "@/config/screens";

export const metadata: Metadata = { title: screens.notificacoes.title };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { estado } = await searchParams;
  return (
    <PlaceholderScreen
      screen="notificacoes"
      pathname="/notificacoes"
      state={parseScreenState(estado)}
    />
  );
}
