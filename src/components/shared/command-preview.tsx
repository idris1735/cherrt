import type { SuggestedArtifact } from "@/lib/types";

export function CommandPreview({ artifact }: { artifact: SuggestedArtifact }) {
  return (
    <div className="command-preview">
      <p className="command-preview__kind">{artifact.kind}</p>
      <h3>{artifact.headline}</h3>
      <p>{artifact.supportingText}</p>
    </div>
  );
}
