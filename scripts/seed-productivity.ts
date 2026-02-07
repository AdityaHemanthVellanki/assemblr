
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getComposioClient } from "@/lib/integrations/composio/client";

const USER_ID = "assemblr-e2e-test";
const LINEAR_TEAM = "Assemblr Test";
const NOTION_PAGE_TITLE = "Assemblr Seed Docs";

async function main() {
    const client = getComposioClient();
    console.log(`🌱 Seeding Productivity Tools for: ${USER_ID}`);

    const accounts = await client.connectedAccounts.list({ userUuid: USER_ID } as any);

    // --- LINEAR ---
    const linearConn = accounts.items.find((a: any) =>
        (a.appUniqueId === "linear" || a.appName === "linear") && a.status === "ACTIVE"
    );

    if (linearConn) {
        console.log(`\n🔵 Linear Found (${linearConn.id}). Seeding...`);
        try {
            // 1. Create Team (if possible) or Find existing
            const teams: any = await client.actions.execute({
                actionName: "LINEAR_GET_ALL_LINEAR_TEAMS", // Corrected Name
                requestBody: { connectedAccountId: linearConn.id, input: {} } as any
            });


            console.log("Linear Teams Response:", JSON.stringify(teams, null, 2).substring(0, 500));
            // Correct path based on debug output: data.teams
            const teamList = teams.data?.teams || teams.teams || teams.data || teams || [];

            // Safety check
            if (!Array.isArray(teamList)) {
                console.log("Linear Response is not an array. Keys:", Object.keys(teams));
                // Access nested?
            }

            let teamId = "";
            let team = teamList.find((t: any) => t.name === LINEAR_TEAM);

            if (!team && teamList.length > 0) team = teamList[0];

            if (team) {
                console.log(`Using Team: ${team.name}`);
                teamId = team.id;
                // Create Issue
                console.log("Creating Linear Issue...");
                await client.actions.execute({
                    actionName: "LINEAR_CREATE_LINEAR_ISSUE", // Corrected
                    requestBody: {
                        connectedAccountId: linearConn.id,
                        input: {
                            teamId: teamId,
                            title: "Verify Assemblr Integration",
                            description: "Automated seed issue from Assemblr E2E"
                        }
                    } as any
                });
                console.log("✅ Linear Issue Created.");
            } else {
                console.log("No Linear teams found. Cannot seed issues.");
            }

        } catch (e: any) {
            console.error("❌ Linear Seeding Failed:", e.message);
        }
    } else {
        console.log("\n⚪ Linear NOT Active. Skipping.");
    }

    // --- NOTION ---
    const notionConn = accounts.items.find((a: any) =>
        (a.appUniqueId === "notion" || a.appName === "notion") && a.status === "ACTIVE"
    );

    if (notionConn) {
        console.log(`\n ⚫ Notion Found (${notionConn.id}). Seeding...`);
        try {
            // 1. Search for parent
            const search: any = await client.actions.execute({
                actionName: "NOTION_SEARCH_NOTION_PAGE", // Corrected
                requestBody: {
                    connectedAccountId: notionConn.id,
                    input: { query: "" }
                } as any
            });

            const results = search.results || search.data?.results || [];
            if (results.length > 0) {
                const parentId = results[0].id;
                console.log(`Using Parent Page: ${parentId}`);

                // Create Page
                console.log(`Creating Notion Page: ${NOTION_PAGE_TITLE}...`);
                await client.actions.execute({
                    actionName: "NOTION_CREATE_NOTION_PAGE", // Corrected
                    requestBody: {
                        connectedAccountId: notionConn.id,
                        input: {
                            parent: { page_id: parentId },
                            properties: {
                                "title": [{ "text": { "content": NOTION_PAGE_TITLE } }]
                            }
                        }
                    } as any
                });
                console.log("✅ Notion Page Created.");
            } else {
                console.log("No parent pages found in Notion.");
            }

        } catch (e: any) {
            console.error("❌ Notion Seeding Failed:", e.message);
        }
    } else {
        console.log("\n⚪ Notion NOT Active. Skipping.");
    }

    // --- TRELLO ---
    const trelloConn = accounts.items.find((a: any) =>
        (a.appUniqueId === "trello" || a.appName === "trello") && a.status === "ACTIVE"
    );

    if (trelloConn) {
        console.log(`\n🔵 Trello Found (${trelloConn.id}). Seeding...`);
        try {
            const BOARD_NAME = "Assemblr Seed Board";
            // 1. Create Board
            console.log(`Creating Trello Board: ${BOARD_NAME}...`);
            const board: any = await client.actions.execute({
                actionName: "TRELLO_BOARD_CREATE_BOARD", // Corrected
                requestBody: {
                    connectedAccountId: trelloConn.id,
                    input: { name: BOARD_NAME }
                } as any
            });

            const boardId = board.id || board.data?.id;

            if (boardId) {
                console.log(`Board Created: ${boardId}`);
                // 2. Create List
                console.log("Creating List 'To Do'...");
                const list: any = await client.actions.execute({
                    actionName: "TRELLO_LIST_CREATE_LIST", // Corrected
                    requestBody: {
                        connectedAccountId: trelloConn.id,
                        input: {
                            name: "To Do",
                            idBoard: boardId
                        }
                    } as any
                });

                const listId = list.id || list.data?.id;

                if (listId) {
                    // 3. Create Card
                    console.log("Creating Card 'Verify Integration'...");
                    await client.actions.execute({
                        actionName: "TRELLO_CARD_CREATE_AND_UPDATE", // Corrected
                        requestBody: {
                            connectedAccountId: trelloConn.id,
                            input: {
                                name: "Verify Assemblr Integration",
                                idList: listId,
                                desc: "Automated seed card from Assemblr E2E"
                            }
                        } as any
                    });
                    console.log("✅ Trello Card Created.");
                }
            }
        } catch (e: any) {
            console.error("❌ Trello Seeding Failed:", e.message);
        }
    } else {
        console.log("\n⚪ Trello NOT Active. Skipping.");
    }
}

main().catch(console.error);
