import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseToolSpec } from "@/lib/spec/toolSpec";

async function markCorruptedTools() {
  const supabase = createSupabaseAdminClient();
  const { data: projects, error } = await (supabase.from("projects") as any)
    .select("id, org_id, name, spec, status");

  if (error) {
    throw new Error(error.message);
  }

  const failures: Array<{ id: string; error: string }> = [];
  for (const project of projects ?? []) {
    const parsed = parseToolSpec(project.spec);
    if (parsed.ok) continue;
    failures.push({ id: project.id, error: parsed.error });
    await (supabase.from("projects") as any)
      .update({
        status: "CORRUPTED",
        error_message: `Corrupted tool spec: ${parsed.error}`,
      })
      .eq("id", project.id)
      .eq("org_id", project.org_id);
  }

  console.log(`Scanned ${projects?.length ?? 0} tools`);
  console.log(`Marked ${failures.length} tools as CORRUPTED`);
  if (failures.length > 0) {
    console.log(JSON.stringify(failures.slice(0, 50), null, 2));
  }
}

markCorruptedTools().catch((err) => {
  console.error(err);
  process.exit(1);
});
