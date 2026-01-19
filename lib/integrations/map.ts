
import { IntegrationExecutor } from "@/lib/execution/types";
import { IntegrationRuntime } from "@/lib/core/runtime";

import { GitHubExecutor } from "@/lib/integrations/executors/github";
import { LinearExecutor } from "@/lib/integrations/executors/linear";
import { SlackExecutor } from "@/lib/integrations/executors/slack";
import { NotionExecutor } from "@/lib/integrations/executors/notion";
import { GoogleExecutor } from "@/lib/integrations/executors/google";

import { GitHubRuntime } from "@/lib/integrations/runtimes/github";
import { GoogleRuntime } from "@/lib/integrations/runtimes/google";
import { SlackRuntime } from "@/lib/integrations/runtimes/slack";
import { NotionRuntime } from "@/lib/integrations/runtimes/notion";

export const EXECUTORS: Record<string, IntegrationExecutor> = {
  github: new GitHubExecutor(),
  linear: new LinearExecutor(),
  slack: new SlackExecutor(),
  notion: new NotionExecutor(),
  google: new GoogleExecutor(),
};

export const RUNTIMES: Record<string, IntegrationRuntime> = {
  github: new GitHubRuntime(),
  google: new GoogleRuntime(),
  slack: new SlackRuntime(),
  notion: new NotionRuntime(),
};
