
export interface SeederContext {
    orgId: string;
    integrationId: string;
    accessToken: string;
}

export interface SeedResult {
    success: boolean;
    createdResources: Record<string, any[]>; // e.g. { "repos": ["test-repo"], "issues": ["#1"] }
    error?: string;
}

export interface IntegrationSeeder {
    seed(context: SeederContext): Promise<SeedResult>;
    cleanup(context: SeederContext, data: SeedResult): Promise<void>;
}
