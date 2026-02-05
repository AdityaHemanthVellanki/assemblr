
import { AssemblrBroker } from "./broker";
import { IntegrationBroker } from "./types";
import { getServerEnv } from "@/lib/env";

let brokerInstance: IntegrationBroker | null = null;

export function getBroker(): IntegrationBroker {
    if (brokerInstance) return brokerInstance;

    // Verify Critical Env Vars
    const env = getServerEnv();
    // We check for encryption key presence (lazy check in security.ts but good to check here)
    if (!env.DATA_ENCRYPTION_KEY) {
        console.warn("⚠️ DATA_ENCRYPTION_KEY missing. Broker will fail on encryption.");
    }

    brokerInstance = new AssemblrBroker();
    return brokerInstance;
}
