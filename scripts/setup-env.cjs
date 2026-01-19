// This file is used to allow running Next.js server-side code in standalone scripts
// It bypasses the "server-only" check which is designed for Client Components bundlers
const Module = require("module");
const fs = require("fs");
const path = require("path");
const originalRequire = Module.prototype.require;

try {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    content.split("\n").forEach((line) => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
        if (key === "NEXT_PUBLIC_SITE_URL")
          console.log("   -> Set NEXT_PUBLIC_SITE_URL:", value);
      }
    });
    console.log("✅ Loaded .env.local");
    console.log("   NEXT_PUBLIC_SITE_URL in process.env:", process.env.NEXT_PUBLIC_SITE_URL);
  } else {
    console.warn("⚠️ .env.local not found");
  }
} catch (e) {
  console.error("Failed to load .env.local", e);
}

Module.prototype.require = function (id) {
  if (id === "server-only") {
    return {};
  }
  return originalRequire.apply(this, arguments);
};
