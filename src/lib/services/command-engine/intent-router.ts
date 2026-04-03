import { capabilityCatalog, getDefaultCapability, type CapabilityDefinition } from "@/lib/services/command-engine/capability-registry";

export type CapabilityIntent = {
  capability: CapabilityDefinition;
  confidence: number;
  matchedKeywords: string[];
};

function countKeywordHits(prompt: string, keyword: string) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(`\\b${escaped}\\b`, "gi");
  const hits = prompt.match(expression);
  return hits?.length ?? 0;
}

export function resolveCapabilityIntent(prompt: string): CapabilityIntent {
  const normalizedPrompt = prompt.toLowerCase();
  let bestCapability = getDefaultCapability();
  let bestScore = 0;
  let bestMatches: string[] = [];

  for (const capability of capabilityCatalog) {
    let score = 0;
    const matches: string[] = [];

    for (const keyword of capability.keywords) {
      const hits = countKeywordHits(normalizedPrompt, keyword.toLowerCase());
      if (hits > 0) {
        score += hits;
        matches.push(keyword);
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestCapability = capability;
      bestMatches = matches;
    }
  }

  const confidence = bestScore === 0 ? 0.22 : Math.min(0.95, 0.3 + bestScore * 0.18);

  return {
    capability: bestCapability,
    confidence,
    matchedKeywords: bestMatches,
  };
}

