import { config } from "dotenv";
config({ path: ".env.local" });

const keys = [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
    "SLACK_CLIENT_ID",
    "NOTION_CLIENT_ID",
    "LINEAR_CLIENT_ID"
];

console.log("Checking Env Vars:");
keys.forEach(k => {
    const val = process.env[k];
    console.log(`${k}: ${val ? (val.length > 5 ? val.substring(0, 5) + "..." : "present") : "MISSING"}`);
});
