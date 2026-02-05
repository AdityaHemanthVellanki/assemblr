import { EntityRegistry } from "./registry";
import { SeederLog } from "./types";
import { Octokit } from "@octokit/rest";
import { SupabaseClient } from "@supabase/supabase-js";

export interface SeederContext {
    registry: EntityRegistry;
    log: SeederLog;
    supabase: SupabaseClient; // For local Assemblr lookups if needed

    // Clients
    github?: Octokit;
    linear?: any; // Will use LinearClient
    slack?: any; // Will use WebClient
    notion?: any; // Will use Client

    orgId: string;
}
