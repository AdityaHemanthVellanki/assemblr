
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

async function main() {
    const email = "aditya@assemblr.ai";
    const password = "password";

    console.log(`Seeding user: ${email}...`);

    // Check if user exists
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();

    if (listError) {
        console.error("Error listing users:", listError);
        process.exit(1);
    }

    const existingUser = users.find((u) => u.email === email);

    if (existingUser) {
        console.log("User already exists. Updating password...");
        const { error: updateError } = await supabase.auth.admin.updateUserById(
            existingUser.id,
            { password: password, email_confirm: true }
        );
        if (updateError) {
            console.error("Error updating user:", updateError);
            process.exit(1);
        }
        console.log("User password updated successfully.");
    } else {
        console.log("User does not exist. Creating...");
        const { error: createError } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { name: "Aditya Test" },
        });
        if (createError) {
            console.error("Error creating user:", createError);
            process.exit(1);
        }
        console.log("User created successfully.");
    }
}

main();
