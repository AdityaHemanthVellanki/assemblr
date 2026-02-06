import { ActionDetails } from "composio-core";

export type ComposioConnectionStatus = "CONNECTED" | "FAILED" | "INITIATED" | "ACTIVE";

export interface ComposioConnection {
    id: string; // connectedAccountId
    integrationId: string;
    status: ComposioConnectionStatus;
    connectedAt: string;
    appName: string;
}

export interface ComposioSchema {
    resource: string;
    actions: ActionDetails[];
}
