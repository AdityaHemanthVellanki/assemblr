#!/bin/bash
export SUPABASE_URL="https://example.supabase.co"
export SUPABASE_PUBLISHABLE_KEY="pk_test_123"
export SUPABASE_SECRET_KEY="sk_test_123"
export APP_BASE_URL="http://localhost:3000"
export AZURE_OPENAI_ENDPOINT="https://example.openai.azure.com"
export AZURE_OPENAI_API_KEY="key123"
export AZURE_OPENAI_DEPLOYMENT_NAME="gpt-4"
export AZURE_OPENAI_API_VERSION="2024-08-01-preview"
export DATA_ENCRYPTION_KEY="mock-encryption-key-for-testing-purposes-only"
export IS_HARNESS="true"

npx ts-node --project tsconfig.harness.json scripts/capability-execution-harness.ts
