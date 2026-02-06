
import { LinearClient } from "@linear/sdk";
import { IntegrationSeeder, SeederContext, SeedResult } from "../types";

export class LinearSeeder implements IntegrationSeeder {
    async seed(context: SeederContext): Promise<SeedResult> {
        const client = new LinearClient({ accessToken: context.accessToken });
        const createdResources: Record<string, any[]> = { teams: [], projects: [], issues: [] };

        try {
            console.log(`[LinearSeeder] Fetching teams...`);
            const teams = await client.teams();
            let team = teams.nodes[0];

            if (!team) {
                throw new Error("No Linear teams found. Please create at least one team manually.");
                // Creating team via API requires admin? Trying anyway?
                // const newTeam = await client.createTeam({ name: "Assemblr E2E" }); 
                // team = await newTeam.team;
            }

            console.log(`[LinearSeeder] Using team: ${team.name}`);

            // 1. Create Project
            const timestamp = Date.now();
            const projectName = `E2E Project ${timestamp}`;
            console.log(`[LinearSeeder] Creating project: ${projectName}`);

            const projectPayload = await client.createProject({
                name: projectName,
                teamIds: [team.id]
            });

            const project = await projectPayload.project;
            if (!project) throw new Error("Failed to create project");
            createdResources.projects.push(project.id); // ID for cleanup

            // 2. Create Issues
            console.log(`[LinearSeeder] Creating issues...`);
            for (let i = 1; i <= 5; i++) {
                const issuePayload = await client.createIssue({
                    teamId: team.id,
                    projectId: project.id,
                    title: `Test Issue ${i}`,
                    description: "Automated issue by Assemblr"
                });
                const issue = await issuePayload.issue;
                if (issue) createdResources.issues.push(issue.id);
            }

            return { success: true, createdResources };

        } catch (e: any) {
            console.error(`[LinearSeeder] Failed:`, e);
            return { success: false, createdResources, error: e.message };
        }
    }

    async cleanup(context: SeederContext, result: SeedResult): Promise<void> {
        const client = new LinearClient({ accessToken: context.accessToken });

        // Delete Issues (Archive? Linear API doesn't allow hard delete easily via SDK usually, but archive is fine)
        // Actually `delete` mutation exists.

        for (const issueId of result.createdResources.issues || []) {
            await client.deleteIssue(issueId); // Check if SDK supports this direct method or need mutation
            // client.issue(id).delete() ?
            // using raw client or graphQL if needed?
            // SDK usually has:
            // const issue = await client.issue(issueId); await issue.delete();
        }

        // Delete Project
        for (const projectId of result.createdResources.projects || []) {
            console.log(`[LinearSeeder] Deleting project: ${projectId}`);
            const project = await client.project(projectId);
            await project.delete();
        }
    }
}
