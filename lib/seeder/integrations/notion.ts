/**
 * Notion bulk seeder — creates pages via Composio.
 *
 * Used for profile-based bulk seeding (not scenario-based).
 */

import type { SeederContext } from "../context";
import type { SeederProfile } from "../types";
import { SEED_TAG } from "../types";
import { gen } from "../generator";

export class NotionSeeder {
  async run(ctx: SeederContext, profile: SeederProfile) {
    if (!ctx.hasConnection("notion")) {
      ctx.log("warn", "Skipping Notion seeder: No connection available");
      return;
    }

    ctx.log("info", "Starting Notion Seeder...");

    for (let i = 0; i < profile.notion.docsPerProject; i++) {
      const title = `${SEED_TAG} Spec: ${gen.technobabble().split(" ").slice(0, 3).join(" ")}`;
      const content = `${SEED_TAG}\n\n${gen.technobabble()}`;

      try {
        const result = await ctx.execAction("notion", "NOTION_CREATE_NOTION_PAGE", {
          title,
          paragraph: content,
        });

        if (result?.id) {
          ctx.log("info", `Created Notion Page: ${title}`);
          ctx.registry.add({
            id: result.id,
            type: "notion_page",
            integration: "notion",
            metadata: { title },
          });
        }
      } catch (e: any) {
        ctx.log("error", `Notion Seeder failed: ${e.message}`);
      }
    }
  }
}
