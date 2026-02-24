import type { UseCaseDefinition } from "../categories";
import { buildSpec } from "../build-spec";
import { makeStripeSubscriptionEntity, makeStripeChargeEntity, makeStripeInvoiceEntity, makeStripeCustomerEntity, makeQBAccountEntity, makeHubspotDealEntity } from "../entity-builders";
import { makeStripeSubscriptionsListAction, makeStripeChargesListAction, makeStripeCustomersListAction, makeStripeInvoicesListAction, makeQBAccountsQueryAction, makeQBBalanceReportAction, makeQBVendorsReadAction, makeHubspotDealsListAction } from "../action-builders";

export const financeUseCases: UseCaseDefinition[] = [
  // 11. MRR / ARR Dashboard
  {
    id: "fin-mrr-dashboard",
    name: "MRR / ARR Dashboard",
    description: "Track monthly and annual recurring revenue with subscription health metrics from Stripe.",
    category: "Finance",
    integrations: ["stripe"],
    trigger: "Time-based",
    output: "Summary",
    prompt: "Show me the current MRR, ARR, and subscription health from Stripe.",
    spec: buildSpec({
      id: "fin-mrr-dashboard",
      name: "MRR / ARR Dashboard",
      description: "Recurring revenue metrics from Stripe.",
      purpose: "Track and visualize subscription revenue performance.",
      integrations: ["stripe"],
      entities: [makeStripeSubscriptionEntity(), makeStripeChargeEntity()],
      actions: [makeStripeSubscriptionsListAction(), makeStripeChargesListAction()],
      views: [
        { id: "subs-table", name: "Active Subscriptions", type: "table", source: { entity: "Subscription", statePath: "stripe.subscriptions" }, fields: ["id", "status", "customer", "plan_amount", "plan_currency", "plan_interval", "current_period_end", "cancel_at_period_end", "trial_end"], actions: ["stripe.subscriptions.list"] },
        { id: "revenue-dashboard", name: "Revenue Overview", type: "dashboard", source: { entity: "Subscription", statePath: "stripe.subscriptions" }, fields: ["status", "plan_amount", "plan_interval", "cancel_at_period_end"], actions: [] },
      ],
      query_plans: [
        { integrationId: "stripe", actionId: "stripe.subscriptions.list", query: { limit: 50 }, fields: ["id", "status", "customer", "plan_amount", "plan_interval"], max_results: 50 },
        { integrationId: "stripe", actionId: "stripe.charges.list", query: { limit: 50 }, fields: ["id", "amount", "currency", "status", "created"], max_results: 50 },
      ],
      answer_contract: { entity_type: "Subscription", required_constraints: [], failure_policy: "empty_over_incorrect", list_shape: "array" },
    }),
  },

  // 12. Failed Payment Recovery
  {
    id: "fin-failed-payments",
    name: "Failed Payment Recovery",
    description: "Track failed Stripe charges and customer recovery status.",
    category: "Finance",
    integrations: ["stripe"],
    trigger: "Event-based",
    output: "Table",
    prompt: "Show me all failed Stripe payments and their recovery status.",
    spec: buildSpec({
      id: "fin-failed-payments",
      name: "Failed Payment Recovery",
      description: "Monitor failed charges and recovery.",
      purpose: "Recover lost recurring revenue from payment failures.",
      integrations: ["stripe"],
      entities: [makeStripeChargeEntity(), makeStripeCustomerEntity()],
      actions: [makeStripeChargesListAction(), makeStripeCustomersListAction()],
      views: [
        { id: "failed-table", name: "Failed Charges", type: "table", source: { entity: "Charge", statePath: "stripe.charges" }, fields: ["id", "amount", "currency", "status", "customer", "receipt_email", "created", "failure_message", "refunded"], actions: ["stripe.charges.list"] },
        { id: "recovery-dashboard", name: "Recovery Overview", type: "dashboard", source: { entity: "Charge", statePath: "stripe.charges" }, fields: ["status", "amount", "currency", "failure_message"], actions: [] },
      ],
      query_plans: [{ integrationId: "stripe", actionId: "stripe.charges.list", query: { limit: 50 }, fields: ["id", "amount", "status", "failure_message"], max_results: 50 }],
      answer_contract: { entity_type: "Charge", required_constraints: [], failure_policy: "empty_over_incorrect", list_shape: "array" },
    }),
  },

  // 13. Invoice Status Tracker
  {
    id: "fin-invoice-status",
    name: "Invoice Status Tracker",
    description: "Track all Stripe invoices, payment status, and outstanding amounts.",
    category: "Finance",
    integrations: ["stripe"],
    trigger: "Prompt-based",
    output: "Table",
    prompt: "Show me all invoices with their payment status and amounts.",
    spec: buildSpec({
      id: "fin-invoice-status",
      name: "Invoice Status Tracker",
      description: "Track invoice lifecycle and payments.",
      purpose: "Monitor outstanding invoices and collection status.",
      integrations: ["stripe"],
      entities: [makeStripeInvoiceEntity()],
      actions: [makeStripeInvoicesListAction()],
      views: [
        { id: "invoices-table", name: "Invoices", type: "table", source: { entity: "Invoice", statePath: "stripe.invoices" }, fields: ["id", "status", "customer_email", "amount_due", "amount_paid", "amount_remaining", "currency", "due_date", "created", "hosted_invoice_url"], actions: ["stripe.invoices.list"] },
      ],
      query_plans: [{ integrationId: "stripe", actionId: "stripe.invoices.list", query: { limit: 50 }, fields: ["id", "status", "amount_due", "amount_paid", "due_date"], max_results: 50 }],
      answer_contract: { entity_type: "Invoice", required_constraints: [], failure_policy: "empty_over_incorrect", list_shape: "array" },
    }),
  },

  // 14. Subscription Health Monitor
  {
    id: "fin-subscription-health",
    name: "Subscription Health Monitor",
    description: "Monitor subscription statuses, churn signals, and trial conversions.",
    category: "Finance",
    integrations: ["stripe"],
    trigger: "Time-based",
    output: "Summary",
    prompt: "Show me subscription health metrics including churn risk and trial status.",
    spec: buildSpec({
      id: "fin-subscription-health",
      name: "Subscription Health Monitor",
      description: "Subscription lifecycle monitoring.",
      purpose: "Identify at-risk subscriptions and churn signals.",
      integrations: ["stripe"],
      entities: [makeStripeSubscriptionEntity()],
      actions: [makeStripeSubscriptionsListAction()],
      views: [
        { id: "subs-dashboard", name: "Subscription Health", type: "dashboard", source: { entity: "Subscription", statePath: "stripe.subscriptions" }, fields: ["status", "plan_amount", "cancel_at_period_end", "trial_end"], actions: [] },
        { id: "subs-table", name: "All Subscriptions", type: "table", source: { entity: "Subscription", statePath: "stripe.subscriptions" }, fields: ["id", "status", "customer", "plan_amount", "plan_currency", "plan_interval", "current_period_end", "cancel_at_period_end", "trial_end"], actions: ["stripe.subscriptions.list"] },
      ],
      query_plans: [{ integrationId: "stripe", actionId: "stripe.subscriptions.list", query: { limit: 50 }, fields: ["id", "status", "plan_amount", "cancel_at_period_end"], max_results: 50 }],
      answer_contract: { entity_type: "Subscription", required_constraints: [], failure_policy: "empty_over_incorrect", list_shape: "array" },
    }),
  },

  // 15. Accounts Overview
  {
    id: "fin-accounts-overview",
    name: "Accounts Overview",
    description: "View QuickBooks chart of accounts with balances and classifications.",
    category: "Finance",
    integrations: ["quickbooks"],
    trigger: "Prompt-based",
    output: "Table",
    prompt: "Show me all QuickBooks accounts with their current balances.",
    spec: buildSpec({
      id: "fin-accounts-overview",
      name: "Accounts Overview",
      description: "QuickBooks chart of accounts overview.",
      purpose: "Monitor account balances and financial health.",
      integrations: ["quickbooks"],
      entities: [makeQBAccountEntity()],
      actions: [makeQBAccountsQueryAction(), makeQBBalanceReportAction()],
      views: [
        { id: "accounts-table", name: "Chart of Accounts", type: "table", source: { entity: "QBAccount", statePath: "quickbooks.accounts" }, fields: ["Name", "AccountType", "AccountSubType", "CurrentBalance", "Active", "Classification", "CurrencyRef"], actions: ["quickbooks.accounts.query"] },
        { id: "accounts-dashboard", name: "Balance Overview", type: "dashboard", source: { entity: "QBAccount", statePath: "quickbooks.accounts" }, fields: ["AccountType", "CurrentBalance", "Classification"], actions: [] },
      ],
      query_plans: [{ integrationId: "quickbooks", actionId: "quickbooks.accounts.query", query: {}, fields: ["Name", "AccountType", "CurrentBalance", "Classification"], max_results: 50 }],
      answer_contract: { entity_type: "QBAccount", required_constraints: [], failure_policy: "empty_over_incorrect", list_shape: "array" },
    }),
  },

  // 16. Customer Billing Console
  {
    id: "fin-customer-billing",
    name: "Customer Billing Console",
    description: "Unified customer billing view combining Stripe payment data with HubSpot deal context.",
    category: "Finance",
    integrations: ["stripe", "hubspot"],
    trigger: "Prompt-based",
    output: "Table",
    prompt: "Show me customer billing status with deal context from HubSpot.",
    spec: buildSpec({
      id: "fin-customer-billing",
      name: "Customer Billing Console",
      description: "Cross-reference billing and CRM data.",
      purpose: "Unified customer financial view for billing operations.",
      integrations: ["stripe", "hubspot"],
      entities: [makeStripeCustomerEntity(), makeHubspotDealEntity()],
      actions: [makeStripeCustomersListAction(), makeHubspotDealsListAction()],
      views: [
        { id: "customers-table", name: "Customer Billing", type: "table", source: { entity: "StripeCustomer", statePath: "stripe.customers" }, fields: ["id", "name", "email", "currency", "balance", "created", "delinquent", "description"], actions: ["stripe.customers.list"] },
      ],
      query_plans: [
        { integrationId: "stripe", actionId: "stripe.customers.list", query: { limit: 50 }, fields: ["id", "name", "email", "balance", "delinquent"], max_results: 50 },
        { integrationId: "hubspot", actionId: "hubspot.deals.list", query: {}, fields: ["dealname", "dealstage", "amount"], max_results: 50 },
      ],
      answer_contract: { entity_type: "StripeCustomer", required_constraints: [], failure_policy: "empty_over_incorrect", list_shape: "array" },
    }),
  },

  // 17. Revenue Recognition Report
  {
    id: "fin-revenue-recognition",
    name: "Revenue Recognition Report",
    description: "Revenue timing and recognition view from Stripe invoices and QuickBooks accounts.",
    category: "Finance",
    integrations: ["stripe", "quickbooks"],
    trigger: "Time-based",
    output: "Table",
    prompt: "Generate a revenue recognition report from Stripe and QuickBooks.",
    spec: buildSpec({
      id: "fin-revenue-recognition",
      name: "Revenue Recognition Report",
      description: "Accrual-based revenue visibility.",
      purpose: "Support accounting closes with revenue timing data.",
      integrations: ["stripe", "quickbooks"],
      entities: [makeStripeInvoiceEntity(), makeQBAccountEntity()],
      actions: [makeStripeInvoicesListAction(), makeQBAccountsQueryAction()],
      views: [
        { id: "revenue-table", name: "Revenue Items", type: "table", source: { entity: "Invoice", statePath: "stripe.invoices" }, fields: ["id", "status", "customer_email", "amount_due", "amount_paid", "amount_remaining", "currency", "due_date", "created", "paid_at"], actions: ["stripe.invoices.list"] },
        { id: "revenue-dashboard", name: "Revenue Dashboard", type: "dashboard", source: { entity: "Invoice", statePath: "stripe.invoices" }, fields: ["status", "amount_due", "amount_paid", "currency"], actions: [] },
      ],
      query_plans: [{ integrationId: "stripe", actionId: "stripe.invoices.list", query: { limit: 50 }, fields: ["id", "status", "amount_due", "amount_paid", "created"], max_results: 50 }],
      answer_contract: { entity_type: "Invoice", required_constraints: [], failure_policy: "empty_over_incorrect", list_shape: "array" },
    }),
  },

  // 18. Vendor / Expense Tracker
  {
    id: "fin-expense-tracker",
    name: "Vendor / Expense Tracker",
    description: "Track vendor payments and expense accounts from QuickBooks.",
    category: "Finance",
    integrations: ["quickbooks"],
    trigger: "Prompt-based",
    output: "Table",
    prompt: "Show me all vendor accounts and expense categories from QuickBooks.",
    spec: buildSpec({
      id: "fin-expense-tracker",
      name: "Vendor / Expense Tracker",
      description: "Vendor and expense account tracking.",
      purpose: "Monitor vendor payments and expense categorization.",
      integrations: ["quickbooks"],
      entities: [makeQBAccountEntity()],
      actions: [makeQBVendorsReadAction(), makeQBAccountsQueryAction()],
      views: [
        { id: "expenses-table", name: "Expense Accounts", type: "table", source: { entity: "QBAccount", statePath: "quickbooks.accounts" }, fields: ["Name", "AccountType", "AccountSubType", "CurrentBalance", "Active", "Classification"], actions: ["quickbooks.accounts.query"] },
      ],
      query_plans: [{ integrationId: "quickbooks", actionId: "quickbooks.accounts.query", query: {}, fields: ["Name", "AccountType", "CurrentBalance"], max_results: 50 }],
      answer_contract: { entity_type: "QBAccount", required_constraints: [], failure_policy: "empty_over_incorrect", list_shape: "array" },
    }),
  },
];
