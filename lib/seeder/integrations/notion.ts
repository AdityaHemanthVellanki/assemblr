import { SeederContext } from "../context";
import { SeederProfile } from "../types";
import { gen } from "../generator";
import { Client } from "@notionhq/client";

export class NotionSeeder {
    async run(ctx: SeederContext, profile: SeederProfile) {
        if (!ctx.notion) {
            ctx.log("warn", "Skipping Notion seeder: No client available");
            return;
        }

        ctx.log("info", `Starting Notion Seeder...`);

        // We need a parent page or database to create pages in.
        // We can search for one? Or just create inside a known page ID if provided.
        // For now, we will search for joined pages and pick one?
        // Or just try to find a "Docs" page.

        // Search
        let parentId: string | undefined;
        try {
            const search = await ctx.notion.search({
                query: "Docs",
                filter: { property: "object", value: "page" }
            });
            if (search.results.length > 0) {
                parentId = search.results[0].id;
            } else {
                // Pick ANY page?
                const anySearch = await ctx.notion.search({ page_size: 1, filter: { property: "object", value: "page" } });
                if (anySearch.results.length > 0) {
                    parentId = anySearch.results[0].id;
                }
            }
        } catch (e) {
            ctx.log("error", "Notion search failed");
        }

        if (!parentId) {
            ctx.log("warn", "No parent page found in Notion to seed into.");
            return;
        }

        for (let i = 0; i < profile.notion.docsPerProject; i++) {
            const title = "Spec: " + gen.technobabble().split(' ').slice(0, 3).join(' ');

            try {
                const res = await ctx.notion.pages.create({
                    parent: { page_id: parentId },
                    properties: {
                        title: {
                            title: [
                                {
                                    text: {
                                        content: title
                                    }
                                }
                            ]
                        }
                    },
                    children: [
                        {
                            object: 'block',
                            type: 'heading_2',
                            heading_2: {
                                rich_text: [{ text: { content: 'Overview' } }]
                            }
                        },
                        {
                            object: 'block',
                            type: 'paragraph',
                            paragraph: {
                                rich_text: [{ text: { content: gen.technobabble() } }]
                            }
                        }
                    ]
                });

                ctx.log("info", `Created Notion Page: ${title}`);
                ctx.registry.add({
                    id: res.id,
                    type: "notion_page",
                    integration: "notion",
                    metadata: { title }
                });

            } catch (e: any) {
                ctx.log("error", `Notion Seeder failed: ${e.message}`);
            }
        }
    }
}
