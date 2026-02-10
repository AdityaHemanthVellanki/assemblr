"use server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function joinWaitlistAction(email: string) {
    if (!email || !email.includes("@")) {
        return { error: "Please enter a valid email address." };
    }

    try {
        console.log("[WaitlistAction] Initializing Supabase Admin Client...");
        const supabase = createSupabaseAdminClient();

        console.log("[WaitlistAction] Inserting email:", email);
        const { error } = await supabase
            .from("waitlist")
            .insert([{ email }]);

        if (error) {
            console.error("[WaitlistAction] Database error details:", JSON.stringify(error, null, 2));
            if (error.code === "23505") {
                return { error: "This email is already on the waitlist!" };
            }
            if (error.code === "PGRST116") {
                return { error: "Waitlist table not found. Please ensure migrations are applied." };
            }
            return { error: `Database error: ${error.message || error.code || "unknown"}` };
        }

        console.log("[WaitlistAction] Success!");
        return { success: true };
    } catch (error: any) {
        console.error("[WaitlistAction] Critical failure:", error?.message || error);
        // This usually means getServerEnv() thrown due to missing variables
        return {
            error: `Server initialization error: ${error?.message?.substring(0, 100) || "Check environment variables scopes (Production vs Preview)."}`
        };
    }
}
