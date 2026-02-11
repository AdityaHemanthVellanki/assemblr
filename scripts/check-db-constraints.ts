
import { createSupabaseAdminClient } from "../lib/supabase/admin";
import { randomUUID } from "crypto";

async function main() {
    const supabase = createSupabaseAdminClient();

    // Get valid org
    const { data: orgs } = await (supabase.from('organizations') as any).select('id').limit(1);
    const orgId = orgs?.[0]?.id;
    if (!orgId) { console.log("No orgs"); return; }

    const { data: users } = await (supabase.from('users') as any).select('id').limit(1);
    const ownerId = users?.[0]?.id;

    const candidates = [
        'CREATED', 'PLANNED', 'READY_TO_EXECUTE', 'EXECUTING', 'MATERIALIZED', 'FAILED'
    ];

    console.log(`Testing ${candidates.length} status candidates...`);

    for (const status of candidates) {
        const runId = randomUUID();
        const { error } = await (supabase.from('projects') as any).insert({
            id: runId,
            org_id: orgId,
            owner_id: ownerId,
            name: `Status Test ${status}`,
            status: status,
            spec: {}
        });

        if (error) {
            if (error.message.includes('foreign key constraint')) {
                console.log(`✅ ACCEPTED (FK error): '${status}'`);
            } else {
                console.log(`❌ REJECTED: '${status}' (${error.message})`);
            }
        } else {
            console.log(`✅ ACCEPTED: '${status}'`);
            await (supabase.from('projects') as any).delete().eq('id', runId);
        }
    }
}

main().catch(console.error);
