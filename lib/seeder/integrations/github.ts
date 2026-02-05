import { SeederContext } from "../context";
import { SeederProfile } from "../types";
import { gen } from "../generator";

export class GitHubSeeder {
    async run(ctx: SeederContext, profile: SeederProfile) {
        if (!ctx.github) {
            ctx.log("warn", "Skipping GitHub seeder: No client available");
            return;
        }

        ctx.log("info", `Starting GitHub Seeder for profile: ${profile.name}`);
        const org = await this.getTargetOrg(ctx); // Assume we seed into authenticated user's personal context or specified org

        // Create Repos
        for (let i = 0; i < profile.github.repoCount; i++) {
            const name = gen.repoName();
            // Check if exists? Or just try create?
            try {
                ctx.log("info", `Creating repo: ${name}`);
                const repo = await ctx.github.rest.repos.createForAuthenticatedUser({
                    name,
                    description: gen.technobabble(),
                    auto_init: true
                });

                ctx.registry.add({
                    id: repo.data.id.toString(),
                    type: "github_repo",
                    integration: "github",
                    metadata: {
                        name,
                        full_name: repo.data.full_name,
                        owner: repo.data.owner.login
                    }
                });

                await this.seedIssuesAndPRs(ctx, profile, repo.data);

            } catch (e: any) {
                ctx.log("error", `Failed to create repo ${name}: ${e.message}`);
            }
        }
    }

    async getTargetOrg(ctx: SeederContext) {
        // For now, seed into Authenticated User
        return "user";
    }

    async seedIssuesAndPRs(ctx: SeederContext, profile: SeederProfile, repo: any) {
        const owner = repo.owner.login;
        const repoName = repo.name;

        // Create Issues
        for (let j = 0; j < profile.github.issuesPerRepo; j++) {
            await ctx.github!.rest.issues.create({
                owner,
                repo: repoName,
                title: gen.issueTitle(),
                body: gen.technobabble()
            });
        }

        // Create PRs (needs managing branches, simplified for now: just empty PRs?)
        // PRs require commits. This is complex. Use simple file creation.
    }
}
