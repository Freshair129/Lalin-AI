import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { LALIN_MCP_TOOL_DEFINITIONS } from "@lalin/contracts";
import { z } from "zod";

import { getJob, listJobs } from "./tools/jobs.js";
import { proposeAgentMutations } from "./tools/agent.js";
import { readHealth, readRuntimeStatus } from "./tools/runtime.js";

const server = new McpServer({
  name: "lalin-local-runtime",
  version: "0.1.0",
});

function toolDescription(name: string): string {
  const definition = LALIN_MCP_TOOL_DEFINITIONS.find((tool) => tool.name === name);
  if (!definition) {
    throw new Error(`Missing MCP contract definition: ${name}`);
  }
  return definition.description;
}

server.tool(
  "lalin.runtime_status",
  toolDescription("lalin.runtime_status"),
  {},
  readRuntimeStatus,
);

server.tool(
  "lalin.health",
  toolDescription("lalin.health"),
  {},
  readHealth,
);

server.tool(
  "lalin.list_jobs",
  toolDescription("lalin.list_jobs"),
  {},
  listJobs,
);

server.tool(
  "lalin.get_job",
  toolDescription("lalin.get_job"),
  { job_id: z.string().min(1) },
  getJob,
);

server.tool(
  "lalin.propose_agent_mutations",
  toolDescription("lalin.propose_agent_mutations"),
  {
    message: z.string().min(1),
    project: z.record(z.unknown()),
  },
  proposeAgentMutations,
);

const transport = new StdioServerTransport();
await server.connect(transport);
