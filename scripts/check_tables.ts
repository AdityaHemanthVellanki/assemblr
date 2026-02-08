
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

async function check() {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.from("session_memory").select("session_id").limit(1);
    if (error) {
        console.error("Error reading session_memory:", error);
    } else {
        console.log("session_memory exists. Data:", data);
    }
}

check().catch(console.error);
