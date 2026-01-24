import type { AbsenceReason, GoalPlan, GoalSatisfactionResult, Decision, IntentContract } from "@/lib/toolos/spec";

export type GoalEvidence = {
  failed_commits: number;
  failure_incidents: number;
  related_emails: number;
  total_emails: number;
  missing_integrations?: string[];
};

export type RelevanceGateResult = {
  ok: boolean;
  issues: string[];
};

export type ValidationInputs = {
  prompt: string;
  goalPlan?: GoalPlan;
  intentContract?: IntentContract;
  evidence?: GoalEvidence | null;
  relevance?: RelevanceGateResult | null;
  integrationStatuses?: Record<string, { status: string; reason?: string; required?: boolean }>;
};

export function buildEvidenceFromDerivedIncidents(incidents: Array<Record<string, any>>): GoalEvidence {
  const failureIncidents = incidents.length;
  const relatedEmails = incidents.reduce((total, incident) => total + Number(incident?.emailCount ?? 0), 0);
  return {
    failed_commits: failureIncidents,
    failure_incidents: failureIncidents,
    related_emails: relatedEmails,
    total_emails: relatedEmails,
  };
}

export function evaluateGoalSatisfaction(params: ValidationInputs): GoalSatisfactionResult {
  const evidence = params.evidence ?? {
    failed_commits: 0,
    failure_incidents: 0,
    related_emails: 0,
    total_emails: 0,
  };
  if (params.intentContract && params.intentContract.successCriteria.length === 0) {
    return {
      level: "unsatisfied",
      satisfied: false,
      confidence: 0.5,
      failure_reason: "intent_missing_success_criteria",
      missing_requirements: ["success_criteria"],
      absence_reason: "ambiguous_query",
    };
  }
  if (!params.goalPlan) {
    return {
      level: "unsatisfied",
      satisfied: false,
      confidence: 0.2,
      failure_reason: "goal_plan_missing",
      missing_requirements: ["goal_plan"],
      absence_reason: "ambiguous_query",
    };
  }
  const slackStatus = params.integrationStatuses?.slack;
  if (slackStatus?.required && slackStatus.status === "reauth_required") {
    return {
      level: "unsatisfied",
      satisfied: false,
      confidence: 0.9,
      failure_reason: "slack_reauth_required",
      missing_requirements: ["slack_reauth"],
      absence_reason: "integration_permission_missing",
    };
  }
  if (params.relevance && !params.relevance.ok) {
    return {
      level: "unsatisfied",
      satisfied: false,
      confidence: 0.6,
      failure_reason: "irrelevant_data",
      missing_requirements: params.relevance.issues,
      absence_reason: "ambiguous_query",
    };
  }
  if (isAmbiguousPrompt(params.prompt)) {
    return {
      level: "unsatisfied",
      satisfied: false,
      confidence: 0.4,
      failure_reason: "ambiguous_query",
      missing_requirements: ["clarification"],
      absence_reason: "ambiguous_query",
    };
  }
  if (!requiresFailureCorrelation(params.prompt, params.goalPlan)) {
    return {
      level: "satisfied",
      satisfied: true,
      confidence: 0.8,
    };
  }
  if (evidence.failed_commits === 0) {
    return {
      level: "unsatisfied",
      satisfied: false,
      confidence: 0.7,
      failure_reason: "no_failed_builds",
      missing_requirements: ["failed_commits"],
      absence_reason: "no_failed_builds",
    };
  }
  if (evidence.failed_commits > 0 && evidence.related_emails === 0) {
    const absence: AbsenceReason =
      evidence.total_emails > 0 ? "emails_exist_not_related" : "failed_builds_exist_no_notifications";
    return {
      level: "partial",
      satisfied: false,
      confidence: 0.75,
      failure_reason: "missing_related_emails",
      missing_requirements: ["related_emails"],
      absence_reason: absence,
    };
  }
  return {
    level: "satisfied",
    satisfied: true,
    confidence: 0.9,
  };
}

export function decideRendering(params: {
  prompt: string;
  result: GoalSatisfactionResult;
}): Decision {
  if (params.result.absence_reason === "ambiguous_query") {
    return {
      kind: "ask",
      question: buildClarificationQuestion(params.prompt),
    };
  }
  if (params.result.confidence < 0.8) {
    return {
      kind: "explain",
      explanation: buildAbsenceExplanation(params.result),
    };
  }
  if (params.result.level === "satisfied") {
    return { kind: "render" };
  }
  if (params.result.level === "partial") {
    return {
      kind: "render",
      partial: true,
      explanation: buildAbsenceExplanation(params.result),
    };
  }
  return {
    kind: "explain",
    explanation: buildAbsenceExplanation(params.result),
  };
}

export function buildAbsenceExplanation(result: GoalSatisfactionResult): string {
  switch (result.absence_reason) {
    case "no_failed_builds":
      return "No failed builds were found in GitHub, so no related emails exist.";
    case "failed_builds_exist_no_notifications":
      return "Failed builds were found, but no related email notifications exist.";
    case "emails_exist_not_related":
      return "Emails were found, but none were related to the failed commits.";
    case "integration_permission_missing":
      return "Slack needs to be reconnected to continue. Click reconnect to re-authorize.";
    case "ambiguous_query":
      return "The request is ambiguous. Provide a repo or time window to continue.";
    default:
      return "No results were found for the requested goal.";
  }
}

export function isAmbiguousPrompt(prompt: string) {
  const normalized = prompt.toLowerCase();
  if (normalized.includes(" or ")) return true;
  if (normalized.includes("maybe")) return true;
  return normalized.split(/\s+/).length < 4;
}

function requiresFailureCorrelation(prompt: string, goalPlan: GoalPlan) {
  const normalized = prompt.toLowerCase();
  if (normalized.includes("build") && normalized.includes("fail")) return true;
  const constraintText = goalPlan.constraints.join(" ").toLowerCase();
  return constraintText.includes("fail") || constraintText.includes("failure");
}

function buildClarificationQuestion(prompt: string) {
  if (prompt.toLowerCase().includes("build")) {
    return "Which repository and time window should I check for build failures?";
  }
  return "Can you clarify the exact goal and scope for this request?";
}

export function evaluateRelevanceGate(params: {
  intentContract?: IntentContract;
  outputs: Array<{ output: any }>;
}): RelevanceGateResult {
  const issues: string[] = [];
  const rows = params.outputs.flatMap((entry) => normalizeRows(entry.output));
  if (rows.length === 0) {
    issues.push("non_empty");
  }
  const hasReadable = rows.some((row) => Object.values(row).some((value) => isReadableValue(value)));
  if (!hasReadable) {
    issues.push("human_readable");
  }
  if (params.intentContract?.forbiddenOutputs.length) {
    const forbiddenHit = params.intentContract.forbiddenOutputs.some((phrase) => {
      const normalized = phrase.toLowerCase();
      return rows.some((row) => Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(normalized)));
    });
    if (forbiddenHit) {
      issues.push("forbidden_output");
    }
  }
  return { ok: issues.length === 0, issues };
}

function normalizeRows(data: any): Array<Record<string, any>> {
  if (Array.isArray(data)) return data.filter((row) => row && typeof row === "object") as Array<Record<string, any>>;
  if (data && typeof data === "object") return Object.values(data).filter((row) => row && typeof row === "object") as Array<Record<string, any>>;
  return [];
}

function isReadableValue(value: unknown) {
  if (typeof value !== "string") return false;
  const text = value.trim();
  if (text.length < 3) return false;
  if (/^[a-f0-9-]{8,}$/i.test(text)) return false;
  if (/^\d+$/.test(text)) return false;
  return /[a-zA-Z]/.test(text);
}
