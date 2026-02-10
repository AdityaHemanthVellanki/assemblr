
import { config } from "dotenv";
import fs from "fs";
import path from "path";

// Load .env.local
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
    config({ path: envPath });
}

import { Octokit } from "@octokit/rest";
import { LinearClient } from "@linear/sdk";

// --- Configuration ---
const GITHUB_TOKEN = process.env.GITHUB_ACCESS_TOKEN;
const LINEAR_KEY = process.env.LINEAR_API_KEY;

const REPO_NAME = "assemblr-e2e-engineering";
const LINEAR_TEAM_NAME = "Assemblr E2E";
const LINEAR_TEAM_KEY = "E2E";

// --- Validations ---
if (!GITHUB_TOKEN) {
    console.error("❌ GITHUB_ACCESS_TOKEN is missing in .env.local");
    console.log("👉 Please add a classic Personal Access Token with 'repo' and 'user' scopes.");
}
if (!LINEAR_KEY) {
    console.error("❌ LINEAR_API_KEY is missing in .env.local");
    console.log("👉 Please add a Linear Personal API Key.");
}

if (!GITHUB_TOKEN || !LINEAR_KEY) {
    process.exit(1);
}

// --- Clients ---
const octokit = new Octokit({ auth: GITHUB_TOKEN });
const linear = new LinearClient({ apiKey: LINEAR_KEY });

// --- Generators ---
const USERS = ["Aditya", "Hemanth", "Rahul", "Sarah", "Mike"];
const TITLES = [
    "Fix login page layout",
    "Optimize database queries",
    "Add dark mode support",
    "Refactor auth middleware",
    "Update dependenceis",
    "Fix race condition in API",
    "Implement new dashboard design",
    "Investigate memory leak",
    "Add unit tests for utils",
    "Update documentation"
];

function pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(start: Date, end: Date) {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

// --- Main ---
async function main() {
    console.log("🚀 Starting Engineering Data Seeding...");

    // 1. Seed GitHub
    console.log("\n--- Seeding GitHub ---");
    let repo: any;
    try {
        const user = await octokit.users.getAuthenticated();
        console.log(`Authenticated as GitHub user: ${user.data.login}`);

        try {
            const { data } = await octokit.repos.get({ owner: user.data.login, repo: REPO_NAME });
            repo = data;
            console.log(`✅ Repo '${REPO_NAME}' already exists.`);
        } catch (e: any) {
            if (e.status === 404) {
                console.log(`Creating repo '${REPO_NAME}'...`);
                const { data } = await octokit.repos.createForAuthenticatedUser({
                    name: REPO_NAME,
                    description: "Automated Test Repo for Assemblr E2E Validation",
                    auto_init: true,
                    private: true
                });
                repo = data;
                console.log(`✅ Repo created: ${repo.html_url}`);
            } else {
                throw e;
            }
        }

        // Seed Issues
        const issueCount = 15;
        console.log(`Checking existing issues...`);
        const { data: existingIssues } = await octokit.issues.listForRepo({
            owner: repo.owner.login,
            repo: REPO_NAME,
            state: "all"
        });

        if (existingIssues.length < issueCount) {
            console.log(`Seeding ${issueCount - existingIssues.length} GitHub issues...`);
            for (let i = 0; i < issueCount - existingIssues.length; i++) {
                const title = pick(TITLES);
                const labels = [];
                if (Math.random() > 0.7) labels.push("bug");
                if (Math.random() > 0.8) labels.push("enhancement");
                if (Math.random() > 0.9) labels.push("QA");
                if (Math.random() > 0.9) labels.push("documentation");

                // Simulating Tech Debt
                let body = "Automated issue body.";
                if (Math.random() > 0.8) {
                    body += "\n\nTODO: Refactor this later.";
                    labels.push("Tech Debt");
                }

                await octokit.issues.create({
                    owner: repo.owner.login,
                    repo: REPO_NAME,
                    title: `${title} ${Math.floor(Math.random() * 1000)}`,
                    body: body,
                    labels
                });
            }
        }

    } catch (e: any) {
        console.error("GitHub seeding failed:", e.message);
    }

    // 2. Seed Linear
    console.log("\n--- Seeding Linear ---");
    try {
        const viewer = await linear.viewer;
        console.log(`Authenticated as Linear user: ${viewer.name}`);

        // Find or Create Team
        const teams = await linear.teams();
        let team = teams.nodes.find(t => t.key === LINEAR_TEAM_KEY);

        if (!team) {
            // Try to find by name if Key is taken or different
            team = teams.nodes.find(t => t.name === LINEAR_TEAM_NAME);
        }

        if (!team) {
            console.log(`Creating Linear Team '${LINEAR_TEAM_NAME}'...`);
            // Note: Creating a team might require admin privileges or paid plan features depending on org
            // Using first available team as fallback if creation fails is safer for E2E
            try {
                const teamCreate = await linear.createTeam({ name: LINEAR_TEAM_NAME, key: LINEAR_TEAM_KEY });
                team = await teamCreate.team;
            } catch (e) {
                console.warn("Could not create team (might lack permissions). Using first available team.");
                team = teams.nodes[0];
            }
        }

        if (!team) {
            throw new Error("No Linear team found or created.");
        }
        console.log(`Using Team: ${team.name} (${team.key})`);

        // Create Project
        const projectName = "Assemblr E2E Validation";
        // Helper to find project
        // Linear SDK doesn't have a simple "projects by name" on the top level easily without filtering
        const allProjects = await linear.projects({ filter: { name: { eq: projectName } } });
        let project = allProjects.nodes[0];

        if (!project) {
            console.log(`Creating Project '${projectName}'...`);
            const projectCreate = await linear.createProject({
                name: projectName,
                teamIds: [team.id]
            });
            project = (await projectCreate.project) as any;
        } else {
            console.log(`✅ Project '${projectName}' exists.`);
        }

        if (!project) throw new Error("Failed to get/create project");

        // Seed Issues
        const linearIssueCount = 10;
        // Simple check to avoid over-seeding
        const projectIssues = await project.issues();

        if (projectIssues.nodes.length < linearIssueCount) {
            console.log(`Seeding ${linearIssueCount - projectIssues.nodes.length} Linear issues...`);
            for (let i = 0; i < linearIssueCount - projectIssues.nodes.length; i++) {
                const title = pick(TITLES);
                const priority = Math.floor(Math.random() * 4) + 1; // 1-4

                let description = `Automated description for ${title}.`;

                // Link to GitHub? 
                if (repo && Math.random() > 0.5) {
                    description += `\n\nRelated to GitHub PR: ${repo.html_url}/pull/${Math.floor(Math.random() * 100)}`;
                }

                await linear.createIssue({
                    teamId: team.id,
                    projectId: project.id,
                    title: `${title} ${Math.floor(Math.random() * 1000)}`,
                    description,
                    priority,
                });
            }
        }

        console.log("✅ Linear Seeding Complete");

    } catch (e: any) {
        console.error("Linear seeding failed:", e.message);
    }

    console.log("\n✅ Engineering Data Seeding Finished.");
}

main().catch(console.error);
