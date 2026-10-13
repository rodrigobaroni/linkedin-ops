import { redirect } from "next/navigation";

/** The operational home is `/hoje` (navigation-map.md). */
export default function RootPage() {
  redirect("/hoje");
}
