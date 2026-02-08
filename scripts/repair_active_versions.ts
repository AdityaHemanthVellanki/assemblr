
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createToolVersion, promoteToolVersion } from "@/lib/toolos/versioning";
import { buildCompiledToolArtifact } from "@/lib/toolos/compiler";

async function main() {
    const supabase = createSupabaseAdminClient();
    console.log("Starting repair of active versions...");

    // query projects where active_version_id is null but status is READY/FAILED/DRAFT
    // actually, we should just check all projects without active_version_id
    const { data: projects, error } = await supabase
        .from("projects")
        .select("id, name, org_id, spec, active_version_id")
        .is("active_version_id", null) as any;

    if (error) {
        console.error("Failed to fetch projects:", error);
        return;
    }

    console.log(`Found ${projects.length} projects with missing active_version_id`);

    for (const project of projects) {
        if (!project.spec) {
            console.warn(`Project ${project.id} (${project.name}) has no spec. Skipping.`);
            continue;
        }

        // Check if any versions exist
        const { data: versions } = await supabase
            .from("tool_versions")
            .select("id, created_at")
            .eq("tool_id", project.id)
            .order("created_at", { ascending: false })
            .limit(1) as any;

        if (versions && versions.length > 0) {
            const latest = versions[0];
            console.log(`Project ${project.id} (${project.name}) has existing version ${latest.id}. Promoting...`);
            try {
                await promoteToolVersion({ toolId: project.id, versionId: latest.id, supabase });
                console.log(`Successfully promoted version ${latest.id} for project ${project.id}`);
            } catch (err) {
                console.error(`Failed to promote version ${latest.id} for project ${project.id}:`, err);
            }
        } else {
            console.log(`Project ${project.id} (${project.name}) has NO versions. Creating new version from spec...`);
            try {
                const rawSpec: any = project.spec || {};
                if (!Array.isArray(rawSpec.actions)) rawSpec.actions = [];
                if (!Array.isArray(rawSpec.entities)) rawSpec.entities = [];
                if (!Array.isArray(rawSpec.workflows)) rawSpec.workflows = [];
                if (!Array.isArray(rawSpec.views)) rawSpec.views = [];
                if (!Array.isArray(rawSpec.triggers)) rawSpec.triggers = [];
                if (!Array.isArray(rawSpec.integrations)) rawSpec.integrations = [];

                if (!rawSpec.state) rawSpec.state = {};
                if (!Array.isArray(rawSpec.state.reducers)) rawSpec.state.reducers = [];
                if (!rawSpec.state.initial) rawSpec.state.initial = {};

                if (!rawSpec.permissions) rawSpec.permissions = {};
                if (!Array.isArray(rawSpec.permissions.roles)) rawSpec.permissions.roles = [];
                if (!Array.isArray(rawSpec.permissions.grants)) rawSpec.permissions.grants = [];

                if (!rawSpec.memory) rawSpec.memory = {};

                // Ensure name/purpose
                if (!rawSpec.name) rawSpec.name = project.name || "Untitled";
                if (!rawSpec.purpose) rawSpec.purpose = "Repaired tool";

                let compiledTool;
                try {
                    compiledTool = buildCompiledToolArtifact(rawSpec);
                } catch (compileErr) {
                    console.error(`Failed to compile spec for project ${project.id}:`, compileErr);
                    continue;
                }

                // Find owner context...
                // Or specific tool owner.
                const { data: tool } = await supabase.from("tools").select("id").eq("id", project.id).single();
                // Tools table doesn't have user_id, it is org based.
                // We need a user_id context.
                // Let's try to find an admin of the org? 
                // Or just use a system ID if allowed? 
                // createToolVersion requires userId. 

                // Find *any* user in the org to attribute this technical migration to.
                const { data: member } = await supabase
                    .from("org_members")
                    .select("user_id")
                    .eq("org_id", project.org_id)
                    .limit(1)
                    .single();

                if (!member) {
                    console.error(`No members found for org ${project.org_id}. Cannot repair project ${project.id}`);
                    continue;
                }

                const version = await createToolVersion({
                    orgId: project.org_id,
                    toolId: project.id,
                    userId: (member as any).user_id,
                    spec: project.spec as any,
                    compiledTool: compiledTool,
                    baseSpec: null,
                    supabase: supabase,
                });

                await promoteToolVersion({ toolId: project.id, versionId: version.id, supabase });
                console.log(`Successfully created and promoted NEW version ${version.id} for project ${project.id}`);

            } catch (err) {
                console.error(`Failed to repair project ${project.id}:`, err);
            }
        }
    }
    console.log("Repair complete.");
}

main().catch(console.error);
