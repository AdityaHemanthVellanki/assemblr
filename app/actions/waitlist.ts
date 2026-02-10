"use server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function joinWaitlistAction(email: string) {
    console.log("[WaitlistAction] SERVER ACTION CALLED with email:", email);
    if (!email || !email.includes("@")) {
        return { error: "Please enter a valid email address." };
    }

    try {
        let supabase;
        try {
            console.log("[WaitlistAction] Initializing Supabase Admin Client...");
            supabase = createSupabaseAdminClient();
        } catch (envError: any) {
            console.error("[WaitlistAction] Env initialization failed:", envError.message);
            return { error: `Environment config error: ${envError.message}. Please check Vercel "Production" scopes.` };
        }

        console.log("[WaitlistAction] Inserting email:", email);
        const { error } = await supabase
            .from("waitlist")
            .insert([{ email }]);

        if (error) {
            console.error("[WaitlistAction] Database error details:", JSON.stringify(error, null, 2));
            if (error.code === "23505") {
                return { error: "This email is already on the waitlist!" };
            }
            if (error.code === "PGRST116" || error.code === "42P01") {
                return { error: "Waitlist table not found. Please ensure the migration was run in your Supabase SQL Editor." };
            }
            return { error: `Database error: ${error.message || error.code || "unknown"}` };
        }

        console.log("[WaitlistAction] Success!");
        return { success: true };
    } catch (error: any) {
        console.error("[WaitlistAction] Critical failure:", error?.message || error);
        return {
            error: `Unexpected error: ${error?.message?.substring(0, 100) || "Check logs."}`
        };
    }
}
