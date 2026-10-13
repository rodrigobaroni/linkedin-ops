import { LoadingState } from "@linkedin-ops/ui";

/** Segment-level loading UI: skeletons inside `main`; navigation and header stay interactive. */
export default function Loading() {
  return (
    <div className="py-6">
      <LoadingState />
    </div>
  );
}
