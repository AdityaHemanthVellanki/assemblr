"use server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function joinWaitlistAction(email: string) {
    if (!email || !email.includes("@")) {
        return { error: "Please enter a valid email address." };
    }

    try {
        const supabase = createSupabaseAdminClient();
        const { error } = await supabase
            .from("waitlist")
            .insert([{ email }]);

        if (error) {
            if (error.code === "23505") {
                return { error: "This email is already on the waitlist!" };
            }
            console.error("[WaitlistAction] Database error:", error);
            return { error: "Failed to join waitlist. Please try again." };
        }

        return { success: true };
    } catch (error) {
        console.error("[WaitlistAction] Unexpected failure:", error);
        return { error: "An unexpected error occurred. Please try again later." };
    }
}
