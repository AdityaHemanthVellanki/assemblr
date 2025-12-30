# Implementation Plan - Integration Platform Expansion

I will expand the integration runtime to support the 12 domains required, implementing the architecture: `Universal Interface -> Domain-Specific Normalization -> Generic Escape Hatches`.

## 1. Expand Capabilities & Normalization

* **File**: `lib/integrations/capabilities.ts`

  * Update `Capability` type to include \~40 new capabilities (e.g., `funnel_analysis`, `infra_metrics`).

  * Add `IntegrationDomain` enum.

* **File**: `lib/integrations/types.ts`

  * Add normalization types:

    * `NormalizedMessage` (sender, content, channel)

    * `NormalizedMetric` (name, value, timestamp, tags)

    * `NormalizedDocument` (title, content, url, mimeType)

  * Update `NormalizedData` union.

## 2. Register Integration Ecosystem

* **File**: `lib/integrations/capabilities.ts`

  * Update `INTEGRATIONS` list to include metadata for key players in all 12 domains (Snowflake, Salesforce, Slack, GitHub, AWS, etc.).

  * This allows the Capability Resolver to "know" about them without needing immediate full connectors for every single one.

## 3. Implement Generic API Connector (The Escape Hatch)

* **File**: `lib/integrations/connectors/generic-api.ts`

  * Implements `IntegrationConnector`.

  * Auth: `api_key` or `bearer`.

  * Fetch: Executes HTTP request based on `parameters` (path, method).

  * Normalization: Returns JSON as `NormalizedTable` (if array) or raw properties.

  * **Safety**: URL allowlist logic (or strict base URL enforcement).

## 4. Refactor & Verify

* **File**: `lib/integrations/registry.ts`

  * Register `generic-api`.

* **File**: `scripts/integration-runtime-smoke-tests.ts`

  * Update tests to verify `NormalizedMessage` and `GenericApiConnector`.

## Why this scales

* **Metadata-first**: We can define 100 integrations in `capabilities.ts`.

* **Generic Runtime**: The `GenericApiConnector` covers the long tail of REST APIs.

* **Strict Normalization**: The UI only needs to know how to render `Table`, `Events`, `Messages`, `Metrics`.

