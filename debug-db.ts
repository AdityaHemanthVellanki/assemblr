
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLatestResult() {
    const { data, error } = await supabase
        .from("tool_results")
        .select("*")
        .order("materialized_at", { ascending: false })
        .limit(1);

    if (error) {
        console.error("Error:", error);
        return;
    }

    console.log("Latest Result:", JSON.stringify(data[0], null, 2));
}

checkLatestResult();
