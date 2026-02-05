import { SeederProfile } from "./types";

export const PROFILES: Record<string, SeederProfile> = {
    "startup": {
        id: "startup",
        name: "Early-Stage Startup",
        description: "Small team, rapid iteration, few repos but high activity.",
        teamCount: 2,
        userCount: 5,
        github: { repoCount: 3, issuesPerRepo: 15, prsPerRepo: 5, historyDays: 30 },
        linear: { projectsPerTeam: 2, issuesPerProject: 20, cyclesPerTeam: 1 },
        slack: { channelsPerTeam: 3, messagesPerChannel: 50, incidentChance: 0.1 },
        notion: { docsPerProject: 3 },
    },
    "scaleup": {
        id: "scaleup",
        name: "Engineering Scale-Up",
        description: "Growing engineering org, multiple teams, structured processes.",
        teamCount: 5,
        userCount: 20,
        github: { repoCount: 10, issuesPerRepo: 50, prsPerRepo: 20, historyDays: 90 },
        linear: { projectsPerTeam: 4, issuesPerProject: 50, cyclesPerTeam: 3 },
        slack: { channelsPerTeam: 5, messagesPerChannel: 100, incidentChance: 0.2 },
        notion: { docsPerProject: 5 },
    },
    "enterprise": {
        id: "enterprise",
        name: "Large Enterprise",
        description: "Complex, multi-team, legacy data, heavy volume.",
        teamCount: 10,
        userCount: 100,
        github: { repoCount: 25, issuesPerRepo: 100, prsPerRepo: 40, historyDays: 180 },
        linear: { projectsPerTeam: 8, issuesPerProject: 100, cyclesPerTeam: 6 },
        slack: { channelsPerTeam: 10, messagesPerChannel: 200, incidentChance: 0.4 },
        notion: { docsPerProject: 10 },
    }
};
