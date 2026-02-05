export type IntegrationType = "github" | "linear" | "slack" | "notion" | "google";

export interface SyntheticEntity {
    id: string; // The Real ID in the external system
    type: string; // e.g. "github_repo", "linear_issue"
    integration: IntegrationType;
    metadata: Record<string, any>; // Store extra info like html_url, key, etc.
}

export interface SeederProfile {
    id: string;
    name: string;
    description: string;

    // Scale Factors
    teamCount: number;
    userCount: number;

    // GitHub Config
    github: {
        repoCount: number;
        issuesPerRepo: number;
        prsPerRepo: number;
        historyDays: number;
    };

    // Linear Config
    linear: {
        projectsPerTeam: number;
        issuesPerProject: number;
        cyclesPerTeam: number;
    };

    // Slack Config
    slack: {
        channelsPerTeam: number;
        messagesPerChannel: number;
        incidentChance: number; // 0-1
    };

    // Notion Config
    notion: {
        docsPerProject: number;
    };
}

export type SeederLog = (level: "info" | "warn" | "error", message: string) => void;
