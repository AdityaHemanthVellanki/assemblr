export type LinkCandidate = {
  sourceId: string;
  targetId: string;
  confidence: number;
  reason: string;
};

export function linkEntities(params: {
  source: Array<Record<string, any>>;
  target: Array<Record<string, any>>;
  sourceField: string;
  targetField: string;
}): LinkCandidate[] {
  const { source, target, sourceField, targetField } = params;
  const links: LinkCandidate[] = [];

  for (const s of source) {
    const sourceValue = String(s?.[sourceField] ?? "").toLowerCase();
    if (!sourceValue) continue;
    for (const t of target) {
      const targetValue = String(t?.[targetField] ?? "").toLowerCase();
      if (!targetValue) continue;
      if (sourceValue === targetValue) {
        links.push({
          sourceId: String(s?.id ?? ""),
          targetId: String(t?.id ?? ""),
          confidence: 0.9,
          reason: "Exact match",
        });
        continue;
      }
      if (sourceValue.includes(targetValue) || targetValue.includes(sourceValue)) {
        links.push({
          sourceId: String(s?.id ?? ""),
          targetId: String(t?.id ?? ""),
          confidence: 0.72,
          reason: "Heuristic match",
        });
      }
    }
  }

  return links;
}
