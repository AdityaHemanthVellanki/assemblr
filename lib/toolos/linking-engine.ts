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
      
      // Domain-Specific Rules
      const sLower = sourceValue.toLowerCase();
      const tLower = targetValue.toLowerCase();
      
      // GitHub Issue <-> Linear Ticket
      if (
        (s.sourceIntegration === "github" && t.sourceIntegration === "linear") ||
        (s.sourceIntegration === "linear" && t.sourceIntegration === "github")
      ) {
         // Check for ID mentions (e.g. LIN-123 in GitHub body)
         const linearIdPattern = /[A-Z]+-\d+/;
         if (linearIdPattern.test(sLower) && sLower.includes(tLower)) {
             links.push({ sourceId: String(s.id), targetId: String(t.id), confidence: 0.95, reason: "Linear ID reference" });
         }
      }

      // Email <-> Repo/Issue
      if (s.entity === "Email" && (t.entity === "Repo" || t.entity === "Issue")) {
          // Check subject for repo name or issue title
          if (sLower.includes(tLower)) {
              links.push({ sourceId: String(s.id), targetId: String(t.id), confidence: 0.8, reason: "Context match" });
          }
      }
      
      // Slack Message <-> Issue
      if (s.entity === "Message" && t.entity === "Issue") {
           if (sLower.includes(tLower)) {
              links.push({ sourceId: String(s.id), targetId: String(t.id), confidence: 0.85, reason: "Discussion match" });
          }
      }
    }
  }

  return links;
}
