/**
 * Centralized integration detection from natural language.
 *
 * Maps domain-specific keywords and concepts to the integrations that serve them.
 * Used by the chat planner, tool-chat layer, and compiler pipeline so detection
 * logic is consistent and comprehensive across the entire stack.
 */

import type { IntegrationId } from "@/lib/toolos/spec";

type Signal = {
  pattern: RegExp;
  integrations: IntegrationId[];
};

/**
 * Semantic signals: regex patterns that map natural language concepts to integrations.
 *
 * Rules:
 * - Patterns use word boundaries (\b) to avoid false substring matches.
 * - Case-insensitive via the `i` flag.
 * - Ordered by specificity: more specific patterns first.
 * - Multi-word patterns (e.g. "pull request") come before their shorter variants.
 */
const SIGNALS: Signal[] = [
  // ─── GitHub: version control, code, CI/CD ─────────────────────────
  { pattern: /\bgithub\b/i, integrations: ["github"] },
  { pattern: /\bcommits?\b/i, integrations: ["github"] },
  { pattern: /\bpull\s*requests?\b/i, integrations: ["github"] },
  { pattern: /\bprs?\b/i, integrations: ["github"] },
  { pattern: /\bmerge[ds]?\b/i, integrations: ["github"] },
  { pattern: /\bbranch(es|ing)?\b/i, integrations: ["github"] },
  { pattern: /\brepos?(itor(y|ies))?\b/i, integrations: ["github"] },
  { pattern: /\bforks?(ed|ing)?\b/i, integrations: ["github"] },
  { pattern: /\breleases?\b/i, integrations: ["github"] },
  { pattern: /\bcode\s*reviews?\b/i, integrations: ["github"] },
  { pattern: /\bdiffs?\b/i, integrations: ["github"] },
  { pattern: /\bdeploy(ments?|ed|ing|s)?\b/i, integrations: ["github"] },
  { pattern: /\bcontribut(ors?|ions?|ing)\b/i, integrations: ["github"] },
  { pattern: /\bgit\b/i, integrations: ["github"] },
  { pattern: /\bworkflow\s*runs?\b/i, integrations: ["github"] },
  { pattern: /\bgithub\s*actions?\b/i, integrations: ["github"] },
  { pattern: /\bopen\s*source\b/i, integrations: ["github"] },
  { pattern: /\bsource\s*code\b/i, integrations: ["github"] },
  { pattern: /\bcodebase\b/i, integrations: ["github"] },
  { pattern: /\bstargazers?\b/i, integrations: ["github"] },
  { pattern: /\bbuild\s*status\b/i, integrations: ["github"] },
  { pattern: /\bcheck\s*runs?\b/i, integrations: ["github"] },
  { pattern: /\bpushed?\b/i, integrations: ["github"] },
  { pattern: /\bclone[ds]?\b/i, integrations: ["github"] },
  { pattern: /\bgists?\b/i, integrations: ["github"] },
  { pattern: /\bREADME\b/i, integrations: ["github"] },
  { pattern: /\bpackage\.json\b/i, integrations: ["github"] },

  // ─── Slack: messaging, channels, notifications ────────────────────
  { pattern: /\bslack\b/i, integrations: ["slack"] },
  { pattern: /\bchannels?\b/i, integrations: ["slack"] },
  { pattern: /\bdirect\s*messages?\b/i, integrations: ["slack"] },
  { pattern: /\bdms?\b/i, integrations: ["slack"] },
  { pattern: /\bthreads?\b/i, integrations: ["slack"] },
  { pattern: /\bstand\s*-?\s*ups?\b/i, integrations: ["slack"] },
  { pattern: /\bnotifications?\b/i, integrations: ["slack"] },
  { pattern: /\bmentions?\b/i, integrations: ["slack"] },
  { pattern: /\bannouncements?\b/i, integrations: ["slack"] },
  { pattern: /\bchat\s*history\b/i, integrations: ["slack"] },
  { pattern: /\b#[a-z][\w-]+\b/i, integrations: ["slack"] }, // #channel-name

  // ─── Notion: docs, wikis, knowledge management ────────────────────
  { pattern: /\bnotion\b/i, integrations: ["notion"] },
  { pattern: /\bwiki\b/i, integrations: ["notion"] },
  { pattern: /\bknowledge\s*base\b/i, integrations: ["notion"] },
  { pattern: /\bnotion\s*(pages?|databases?)\b/i, integrations: ["notion"] },
  { pattern: /\bnotes?\b/i, integrations: ["notion"] },

  // ─── Linear: project management, sprints, issues ──────────────────
  { pattern: /\blinear\b/i, integrations: ["linear"] },
  { pattern: /\bsprints?\b/i, integrations: ["linear"] },
  { pattern: /\bcycles?\b/i, integrations: ["linear"] },
  { pattern: /\bbacklog\b/i, integrations: ["linear"] },
  { pattern: /\broadmaps?\b/i, integrations: ["linear"] },
  { pattern: /\bproject\s*boards?\b/i, integrations: ["linear"] },
  { pattern: /\btickets?\b/i, integrations: ["linear"] },
  { pattern: /\btriage\b/i, integrations: ["linear"] },
  { pattern: /\bvelocity\b/i, integrations: ["linear"] },
  { pattern: /\bepics?\b/i, integrations: ["linear"] },
  {
    pattern: /\bpriority\s*(p[0-4]|urgent|high|medium|low)\b/i,
    integrations: ["linear"],
  },

  // ─── Google: email, sheets, docs, calendar, drive ─────────────────
  { pattern: /\bgoogle\b/i, integrations: ["google"] },
  { pattern: /\bgmail\b/i, integrations: ["google"] },
  {
    pattern: /\bgoogle\s*(sheets?|docs?|drive|meet|calendar)\b/i,
    integrations: ["google"],
  },
  { pattern: /\bspreadsheets?\b/i, integrations: ["google"] },
  { pattern: /\bdrive\b/i, integrations: ["google"] },

  // ─── Trello: boards, cards, kanban ────────────────────────────────
  { pattern: /\btrello\b/i, integrations: ["trello"] },
  { pattern: /\btrello\s*boards?\b/i, integrations: ["trello"] },
  { pattern: /\btrello\s*cards?\b/i, integrations: ["trello"] },
  { pattern: /\btrello\s*lists?\b/i, integrations: ["trello"] },
  { pattern: /\bkanban\b/i, integrations: ["trello"] },
  { pattern: /\bboards?\b/i, integrations: ["trello"] },
  { pattern: /\bcards?\b/i, integrations: ["trello"] },

  // ─── Airtable: bases, records, spreadsheet-like ───────────────────
  { pattern: /\bairtable\b/i, integrations: ["airtable"] },
  { pattern: /\bairtable\s*base\b/i, integrations: ["airtable"] },
  { pattern: /\bairtable\s*records?\b/i, integrations: ["airtable"] },
  { pattern: /\bairtable\s*views?\b/i, integrations: ["airtable"] },
  { pattern: /\bbases?\b/i, integrations: ["airtable"] },

  // ─── Intercom: customer support, conversations ────────────────────
  { pattern: /\bintercom\b/i, integrations: ["intercom"] },
  {
    pattern: /\bintercom\s*conversations?\b/i,
    integrations: ["intercom"],
  },
  { pattern: /\bsupport\s*tickets?\b/i, integrations: ["intercom"] },
  { pattern: /\bcustomer\s*support\b/i, integrations: ["intercom"] },
  { pattern: /\bhelp\s*desk\b/i, integrations: ["intercom"] },
  { pattern: /\blive\s*chat\b/i, integrations: ["intercom"] },

  // ─── Zoom: video meetings, webinars, recordings ───────────────────
  { pattern: /\bzoom\b/i, integrations: ["zoom"] },
  { pattern: /\bzoom\s*meetings?\b/i, integrations: ["zoom"] },
  { pattern: /\bzoom\s*recordings?\b/i, integrations: ["zoom"] },
  { pattern: /\bwebinars?\b/i, integrations: ["zoom"] },
  { pattern: /\bvideo\s*calls?\b/i, integrations: ["zoom"] },
  { pattern: /\brecordings?\b/i, integrations: ["zoom"] },

  // ─── GitLab: repos, merge requests, pipelines, CI/CD ─────────────
  { pattern: /\bgitlab\b/i, integrations: ["gitlab"] },
  { pattern: /\bgitlab\s*projects?\b/i, integrations: ["gitlab"] },
  { pattern: /\bgitlab\s*pipelines?\b/i, integrations: ["gitlab"] },
  { pattern: /\bgitlab\s*commits?\b/i, integrations: ["gitlab"] },
  { pattern: /\bmerge\s*requests?\b/i, integrations: ["gitlab"] },

  // ─── Bitbucket: repos, pull requests, pipelines ───────────────────
  { pattern: /\bbitbucket\b/i, integrations: ["bitbucket"] },
  { pattern: /\bbitbucket\s*repos?\b/i, integrations: ["bitbucket"] },
  {
    pattern: /\bbitbucket\s*pull\s*requests?\b/i,
    integrations: ["bitbucket"],
  },
  {
    pattern: /\bbitbucket\s*pipelines?\b/i,
    integrations: ["bitbucket"],
  },
  {
    pattern: /\bbitbucket\s*commits?\b/i,
    integrations: ["bitbucket"],
  },

  // ─── Asana: tasks, projects, workspaces ───────────────────────────
  { pattern: /\basana\b/i, integrations: ["asana"] },
  { pattern: /\basana\s*tasks?\b/i, integrations: ["asana"] },
  { pattern: /\basana\s*projects?\b/i, integrations: ["asana"] },
  { pattern: /\basana\s*workspaces?\b/i, integrations: ["asana"] },
  { pattern: /\bworkload\b/i, integrations: ["asana"] },

  // ─── Microsoft Teams: channels, messages, chat ────────────────────
  { pattern: /\bmicrosoft\s*teams\b/i, integrations: ["microsoft_teams"] },
  { pattern: /\bms\s*teams\b/i, integrations: ["microsoft_teams"] },
  { pattern: /\bteams\s*channels?\b/i, integrations: ["microsoft_teams"] },
  { pattern: /\bteams\s*messages?\b/i, integrations: ["microsoft_teams"] },
  { pattern: /\bteams\s*chat\b/i, integrations: ["microsoft_teams"] },
  { pattern: /\bteams\b/i, integrations: ["microsoft_teams"] },

  // ─── Outlook: mail, calendar, email ───────────────────────────────
  { pattern: /\boutlook\b/i, integrations: ["outlook"] },
  { pattern: /\boutlook\s*mail\b/i, integrations: ["outlook"] },
  { pattern: /\boutlook\s*calendar\b/i, integrations: ["outlook"] },
  { pattern: /\boutlook\s*e-?mails?\b/i, integrations: ["outlook"] },

  // ─── Google Analytics: traffic, sessions, page views ──────────────
  {
    pattern: /\bgoogle\s*analytics\b/i,
    integrations: ["google_analytics"],
  },
  { pattern: /\b(?:GA)\b/, integrations: ["google_analytics"] },
  { pattern: /\bpage\s*views?\b/i, integrations: ["google_analytics"] },
  { pattern: /\bsessions?\b/i, integrations: ["google_analytics"] },
  { pattern: /\bbounce\s*rate\b/i, integrations: ["google_analytics"] },
  { pattern: /\btraffic\b/i, integrations: ["google_analytics"] },
  { pattern: /\bweb\s*analytics\b/i, integrations: ["google_analytics"] },
  { pattern: /\banalytics\b/i, integrations: ["google_analytics"] },

  // ─── Stripe: payments, billing, subscriptions ─────────────────────
  { pattern: /\bstripe\b/i, integrations: ["stripe"] },
  { pattern: /\bstripe\s*customers?\b/i, integrations: ["stripe"] },
  { pattern: /\bpayments?\b/i, integrations: ["stripe"] },
  { pattern: /\bcharges?\b/i, integrations: ["stripe"] },
  { pattern: /\bsubscriptions?\b/i, integrations: ["stripe"] },
  { pattern: /\bbilling\b/i, integrations: ["stripe"] },
  { pattern: /\brefunds?\b/i, integrations: ["stripe"] },

  // ─── HubSpot: CRM, contacts, deals, pipelines ────────────────────
  { pattern: /\bhubspot\b/i, integrations: ["hubspot"] },
  { pattern: /\bhubspot\s*contacts?\b/i, integrations: ["hubspot"] },
  { pattern: /\bhubspot\s*deals?\b/i, integrations: ["hubspot"] },
  { pattern: /\bCRM\b/, integrations: ["hubspot"] },
  { pattern: /\bcontacts?\b/i, integrations: ["hubspot"] },
  { pattern: /\bdeals?\b/i, integrations: ["hubspot"] },
  { pattern: /\bsales\s*pipeline\b/i, integrations: ["hubspot"] },
  { pattern: /\bcompanies\b/i, integrations: ["hubspot"] },

  // ─── Discord: servers, channels, guilds ───────────────────────────
  { pattern: /\bdiscord\b/i, integrations: ["discord"] },
  { pattern: /\bdiscord\s*servers?\b/i, integrations: ["discord"] },
  { pattern: /\bdiscord\s*channels?\b/i, integrations: ["discord"] },
  { pattern: /\bdiscord\s*guilds?\b/i, integrations: ["discord"] },
  { pattern: /\bguilds?\b/i, integrations: ["discord"] },

  // ─── ClickUp: tasks, spaces, lists ────────────────────────────────
  { pattern: /\bclickup\b/i, integrations: ["clickup"] },
  { pattern: /\bclickup\s*tasks?\b/i, integrations: ["clickup"] },
  { pattern: /\bclickup\s*spaces?\b/i, integrations: ["clickup"] },
  { pattern: /\bclickup\s*lists?\b/i, integrations: ["clickup"] },

  // ─── QuickBooks: accounting, invoices, expenses ───────────────────
  { pattern: /\bquickbooks\b/i, integrations: ["quickbooks"] },
  { pattern: /\baccounting\b/i, integrations: ["quickbooks"] },
  { pattern: /\bbookkeeping\b/i, integrations: ["quickbooks"] },
  { pattern: /\bexpenses?\b/i, integrations: ["quickbooks"] },

  // ─── Shared / ambiguous concepts ──────────────────────────────────
  { pattern: /\bissues?\b/i, integrations: ["github", "linear"] },
  { pattern: /\bdocs?\b/i, integrations: ["notion", "google"] },
  { pattern: /\bdocuments?\b/i, integrations: ["notion", "google"] },
  {
    pattern: /\btasks?\b/i,
    integrations: ["linear", "asana", "clickup", "trello"],
  },
  { pattern: /\bpages?\b/i, integrations: ["notion"] },
  { pattern: /\bdatabases?\b/i, integrations: ["notion"] },
  {
    pattern: /\bprojects?\b/i,
    integrations: ["github", "linear", "asana", "gitlab", "clickup", "trello"],
  },
  { pattern: /\be-?mails?\b/i, integrations: ["google", "outlook"] },
  { pattern: /\binbox\b/i, integrations: ["google", "outlook"] },
  { pattern: /\bmail\b/i, integrations: ["google", "outlook"] },
  {
    pattern: /\bmessages?\b/i,
    integrations: ["slack", "microsoft_teams"],
  },
  {
    pattern: /\bconversations?\b/i,
    integrations: ["slack", "intercom"],
  },
  {
    pattern: /\bmeetings?\b/i,
    integrations: ["google", "zoom"],
  },
  {
    pattern: /\bcalendar\b/i,
    integrations: ["google", "outlook"],
  },
  {
    pattern: /\binvoices?\b/i,
    integrations: ["stripe", "quickbooks"],
  },
  {
    pattern: /\bcustomers?\b/i,
    integrations: ["stripe", "hubspot", "intercom"],
  },
  {
    pattern: /\bpipelines?\b/i,
    integrations: ["github", "gitlab", "bitbucket", "hubspot"],
  },
  {
    pattern: /\bci\s*[\/\s]\s*cd\b/i,
    integrations: ["github", "gitlab", "bitbucket"],
  },
];

/**
 * Detect integrations from natural language text using semantic keyword matching.
 *
 * Returns all matching integration IDs found in the text.
 */
export function detectIntegrationsFromText(text: string): IntegrationId[] {
  const hits = new Set<IntegrationId>();
  for (const signal of SIGNALS) {
    if (signal.pattern.test(text)) {
      for (const id of signal.integrations) {
        hits.add(id);
      }
    }
  }
  return Array.from(hits);
}
