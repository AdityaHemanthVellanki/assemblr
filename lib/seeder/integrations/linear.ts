/**
 * Linear bulk seeder — creates issues and projects via Composio.
 *
 * Used for profile-based bulk seeding (not scenario-based).
 */

import type { SeederContext } from "../context";
import type { SeederProfile } from "../types";
import { SEED_TAG } from "../types";
import { gen } from "../generator";
import { extractPayloadArray } from "@/lib/integrations/composio/execution";

export class LinearSeeder {
  async run(ctx: SeederContext, profile: SeederProfile) {
    if (!ctx.hasConnection("linear")) {
      ctx.log("warn", "Skipping Linear seeder: No connection available");
      return;
    }

    ctx.log("info", "Starting Linear Seeder...");

    try {
      // Get teams
      const teamsResult = await ctx.execAction(
        "linear",
        "LINEAR_LIST_LINEAR_TEAMS",
        {},
      );
      const teams = Array.isArray(teamsResult)
        ? teamsResult
        : extractPayloadArray(teamsResult);

      if (teams.length === 0) {
        ctx.log("warn", "No Linear teams found. Skipping.");
        return;
      }

      const team = teams[0];
      const teamId = team.id;
      ctx.log("info", `Using Linear Team: ${team.name || team.key || teamId}`);

      ctx.registry.add({
        id: teamId,
        type: "linear_team",
        integration: "linear",
        metadata: { key: team.key, name: team.name },
      });

      // Create issues
      for (let i = 0; i < profile.linear.issuesPerProject; i++) {
        try {
          const ghRepo = ctx.registry.getRandom("github_repo");
          let desc = `${SEED_TAG}\n\n${gen.technobabble()}`;
          if (ghRepo) {
            desc += `\n\nRelated to GitHub Repo: ${ghRepo.metadata.name}`;
          }

          const result = await ctx.execAction("linear", "LINEAR_CREATE_LINEAR_ISSUE", {
            teamId,
            title: `${SEED_TAG} ${gen.issueTitle()}`,
            description: desc,
            priority: Math.floor(Math.random() * 4) + 1,
          });

          if (result?.id) {
            ctx.registry.add({
              id: result.id,
              type: "linear_issue",
              integration: "linear",
              metadata: { title: result.title, teamId },
            });
          }
        } catch (e: any) {
          ctx.log("error", `Failed to create Linear issue: ${e.message}`);
        }
      }
    } catch (e: any) {
      ctx.log("error", `Linear Seeder failed: ${e.message}`);
    }
  }
}
