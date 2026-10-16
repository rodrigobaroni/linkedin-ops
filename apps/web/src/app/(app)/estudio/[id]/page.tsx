import type { Metadata } from "next";
import { PlaceholderScreen, parseScreenState } from "@/components/placeholder-screen";
import { screens } from "@/config/screens";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = { title: screens.estudioItem.title };

export default async function Page({ params, searchParams }: Props) {
  const [{ id }, { estado }] = await Promise.all([params, searchParams]);
  return (
    <PlaceholderScreen
      screen="estudioItem"
      pathname={`/estudio/${encodeURIComponent(id)}`}
      state={parseScreenState(estado)}
      meta={
        <>
          ID do item: <code className="font-mono text-xs">{id}</code>
        </>
      }
    />
  );
}
