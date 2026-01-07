export type MiniAppSpec = {
  kind: "mini_app";
  title: string;
  description?: string;
  pages: Page[];
  state: Record<string, any>; // Initial state
  actions: Action[];
  permissions?: string[];
};

export type Page = {
  id: string;
  name: string;
  components: Component[];
  layoutMode: "grid" | "stack";
};

export type Component = {
  id: string;
  type: "container" | "text" | "input" | "select" | "button" | "table" | "chart" | "status" | "modal" | "form";
  label?: string;
  properties?: Record<string, any>;
  dataSource?: { type: "state" | "query"; value: string };
  events?: EventHandler[];
  layout?: { w?: number; h?: number };
};

export type EventHandler = {
  type: "onClick" | "onChange" | "onSubmit";
  actionId: string;
  args?: Record<string, any>;
};

export type Action = {
  id: string;
  type: "integration_call" | "state_mutation" | "navigation" | "conditional";
  config?: any; // Specific to type
  steps?: ActionStep[]; // For multi-step actions
};

export type ActionStep = {
  type: "integration_call" | "state_mutation" | "navigation";
  config: any;
};
