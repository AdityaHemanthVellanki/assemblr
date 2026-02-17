import { IntegrationRuntime } from "@/lib/core/runtime";
import { ComposioRuntime } from "@/lib/integrations/runtimes/composio";

export const RUNTIMES: Record<string, IntegrationRuntime> = {
  github: new ComposioRuntime(),
  google: new ComposioRuntime(),
  slack: new ComposioRuntime(),
  notion: new ComposioRuntime(),
  linear: new ComposioRuntime(),
  hubspot: new ComposioRuntime(),
  jira: new ComposioRuntime(),
  asana: new ComposioRuntime(),
  trello: new ComposioRuntime(),
  salesforce: new ComposioRuntime(),
  zendesk: new ComposioRuntime(),
  stripe: new ComposioRuntime(),
  airtable: new ComposioRuntime(),
  discord: new ComposioRuntime(),
  intercom: new ComposioRuntime(),
  mixpanel: new ComposioRuntime(),
  pipedrive: new ComposioRuntime(),
  zoom: new ComposioRuntime(),
  shopify: new ComposioRuntime(),
  gitlab: new ComposioRuntime(),
  bitbucket: new ComposioRuntime(),
  clickup: new ComposioRuntime(),
  outlook: new ComposioRuntime(),
  google_analytics: new ComposioRuntime(),
  microsoft_teams: new ComposioRuntime(),
  quickbooks: new ComposioRuntime(),
};

export const EXECUTORS: Record<string, any> = {};
