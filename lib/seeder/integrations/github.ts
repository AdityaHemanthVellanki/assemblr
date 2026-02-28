/**
 * GitHub bulk seeder — creates issues via Composio.
 *
 * Used for profile-based bulk seeding (not scenario-based).
 */

import type { SeederContext } from "../context";
import type { SeederProfile } from "../types";
import { SEED_TAG } from "../types";
import { gen } from "../generator";

export class GitHubSeeder {
  async run(ctx: SeederContext, profile: SeederProfile) {
    if (!ctx.hasConnection("github")) {
      ctx.log("warn", "Skipping GitHub seeder: No connection available");
      return;
    }

    ctx.log("info", `Starting GitHub Seeder for profile: ${profile.name}`);

    // List existing repos to get owner name
    const reposResult = await ctx.execAction(
      "github",
      "GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER",
      { per_page: 5, sort: "updated" },
    );

    const repos = Array.isArray(reposResult) ? reposResult : [];
    if (repos.length === 0) {
      ctx.log("warn", "No GitHub repos found. Skipping issue creation.");
      return;
    }

    // Seed issues into existing repos
    const targetRepos = repos.slice(0, Math.min(profile.github.repoCount, repos.length));
    for (const repo of targetRepos) {
      const owner = repo.owner?.login || repo.full_name?.split("/")[0];
      const repoName = repo.name;
      if (!owner || !repoName) continue;

      ctx.registry.add({
        id: String(repo.id),
        type: "github_repo",
        integration: "github",
        metadata: { name: repoName, full_name: repo.full_name, owner },
      });

      await this.seedIssues(ctx, profile, owner, repoName);
    }
  }

  private async seedIssues(ctx: SeederContext, profile: SeederProfile, owner: string, repo: string) {
    for (let i = 0; i < profile.github.issuesPerRepo; i++) {
      try {
        const result = await ctx.execAction("github", "GITHUB_CREATE_AN_ISSUE", {
          owner,
          repo,
          title: `${SEED_TAG} ${gen.issueTitle()}`,
          body: `${SEED_TAG}\n\n${gen.technobabble()}`,
        });

        if (result?.number) {
          ctx.registry.add({
            id: String(result.number),
            type: "github_issue",
            integration: "github",
            metadata: { owner, repo, number: result.number },
          });
        }
      } catch (e: any) {
        ctx.log("error", `Failed to create GitHub issue in ${owner}/${repo}: ${e.message}`);
      }
    }
  }
}
