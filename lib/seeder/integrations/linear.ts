import { SeederContext } from "../context";
import { SeederProfile } from "../types";
import { gen } from "../generator";
import { LinearClient } from "@linear/sdk";

export class LinearSeeder {
    async run(ctx: SeederContext, profile: SeederProfile) {
        if (!ctx.linear) {
            ctx.log("warn", "Skipping Linear seeder: No client available");
            return;
        }

        ctx.log("info", `Starting Linear Seeder...`);

        try {
            // 1. Get or Create Team
            const teamName = "SE_" + gen.repoName().split("_")[1];
            let teamId: string | undefined;
            let teamKey: string | undefined;
            let teamNameReal: string | undefined;

            try {
                const teamCreate = await ctx.linear.createTeam({
                    name: teamName,
                    key: teamName.substring(0, 3).toUpperCase() + Math.floor(Math.random() * 100),
                });
                const team = await teamCreate.team;
                if (team) {
                    teamId = team.id;
                    teamKey = team.key;
                    teamNameReal = team.name;
                    ctx.log("info", `Created Linear Team: ${team.name} (${team.key})`);
                }
            } catch (e: any) {
                ctx.log("warn", `Failed to create Linear Team: ${e.message}. Attempting to reuse existing...`);
                // Fallback
                const teams = await ctx.linear.teams();
                if (teams.nodes.length > 0) {
                    // Prefer SE_ team
                    const seTeam = teams.nodes.find((t: any) => t.name.startsWith("SE_"));
                    const target = seTeam || teams.nodes[0];
                    teamId = target.id;
                    teamKey = target.key;
                    teamNameReal = target.name;
                    ctx.log("info", `Reusing Linear Team: ${target.name}`);
                } else {
                    ctx.log("error", "No Linear teams available to seed into.");
                    return;
                }
            }

            if (!teamId || !teamKey || !teamNameReal) return;

            ctx.registry.add({
                id: teamId,
                type: "linear_team",
                integration: "linear",
                metadata: { key: teamKey, name: teamNameReal }
            });

            // 2. Create Project
            let projectId: string | undefined;
            try {
                const projectCreate = await ctx.linear.createProject({
                    name: "Project " + gen.technobabble().split(" ")[0],
                    teamIds: [teamId]
                });
                const project = await projectCreate.project;
                if (project) {
                    projectId = project.id;
                    ctx.log("info", `Created Linear Project: ${project.name}`);
                    ctx.registry.add({
                        id: project.id,
                        type: "linear_project",
                        integration: "linear",
                        metadata: { name: project.name }
                    });
                }
            } catch (e: any) {
                ctx.log("error", `Failed to create Linear Project: ${e.message}`);
            }

            // 3. Create Issues
            for (let i = 0; i < profile.linear.issuesPerProject; i++) {
                const pr = ctx.registry.getRandom("github_repo");
                let desc = gen.technobabble();
                if (pr) {
                    desc += `\n\nRelated to GitHub Repo: ${pr.metadata.name}`;
                }

                await ctx.linear.createIssue({
                    teamId,
                    projectId,
                    title: gen.issueTitle(),
                    description: desc,
                    priority: 0,
                });
            }

        } catch (e: any) {
            ctx.log("error", `Linear Seeder failed fatal: ${e.message}`);
        }
    }
}
