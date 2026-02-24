
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env";

async function run() {
    getServerEnv();
    const supabase = createSupabaseAdminClient();

    // Fetch valid Org IDs
    let orgId = null;
    let organizationId = null;

    const { data: orgs } = await supabase.from('orgs').select('id').limit(1);
    if (orgs && orgs.length > 0) {
        orgId = orgs[0].id; // Org from 'orgs'
    }

    const { data: organizations } = await supabase.from('organizations' as any).select('id').limit(1);
    if (organizations && organizations.length > 0) {
        organizationId = (organizations[0] as any).id;
    }

    console.log(`Using Org ID (orgs): ${orgId}`);
    console.log(`Using Org ID (organizations): ${organizationId}`);

    // Fetch valid Version ID
    let versionId: string | null = null;
    const { data: versions } = await supabase.from('tool_versions' as any).select('id').limit(1);
    if (versions && versions.length > 0) {
        versionId = (versions[0] as any).id;
    }

    console.log("Attempting CREATED -> MATERIALIZED transition test...");

    // Create Project + Version
    const { data: project, error: insertError } = await supabase.from('projects').insert({
        org_id: orgId || organizationId,
        name: `Test Project Transition ${new Date().getTime()}`,
        status: 'CREATED', // Crucially, start as CREATED
        spec: {},
        active_version_id: versionId
    }).select().single();

    if (insertError) {
        console.log(`Setup Error (Insert Project): ${insertError.message}`);
        return;
    }

    console.log(`Created Project: ${project.id} (Status: CREATED)`);

    // Now try to update project DIRECTLY to MATERIALIZED
    const { error: updateError } = await supabase.from('projects').update({
        data_snapshot: { foo: "bar" },
        data_ready: true,
        view_spec: {},
        view_ready: true,
        status: 'MATERIALIZED',
        finalized_at: new Date().toISOString(),
        lifecycle_done: true
    }).eq('id', project.id);

    if (updateError) {
        if (updateError.message.includes("projects_status_check")) {
            console.log(`❌ Update REJECTED by constraint projects_status_check (CREATED -> MATERIALIZED Forbidden)`);
        } else {
            console.log(`❌ Update ERROR: ${updateError.message}`);
        }
    } else {
        console.log(`✅ Update SUCCEEDED (CREATED -> MATERIALIZED Allowed)`);
    }

    await supabase.from('projects').delete().eq('id', project.id);
}

run();
