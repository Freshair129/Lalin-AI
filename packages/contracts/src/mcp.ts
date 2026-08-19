export const LALIN_MCP_TOOLS = [
  "lalin.runtime_status",
  "lalin.health",
  "lalin.list_jobs",
  "lalin.get_job",
  "lalin.propose_agent_mutations",
] as const;

export type LalinMcpToolName = (typeof LALIN_MCP_TOOLS)[number];

export interface LalinMcpToolDefinition {
  name: LalinMcpToolName;
  mode: "read" | "propose";
  description: string;
  inputSchema: Record<string, unknown>;
}

export const getJobInputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    job_id: { type: "string", minLength: 1 },
  },
  required: ["job_id"],
} as const;

export const proposeAgentMutationsInputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    message: { type: "string", minLength: 1 },
    project: { type: "object", additionalProperties: true },
  },
  required: ["message", "project"],
} as const;

export const emptyInputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {},
} as const;

export const LALIN_MCP_TOOL_DEFINITIONS: readonly LalinMcpToolDefinition[] = [
  {
    name: "lalin.runtime_status",
    mode: "read",
    description: "Read current Lalin runtime telemetry, model identity, and active activity.",
    inputSchema: emptyInputSchema,
  },
  {
    name: "lalin.health",
    mode: "read",
    description: "Read the Lalin API health response.",
    inputSchema: emptyInputSchema,
  },
  {
    name: "lalin.list_jobs",
    mode: "read",
    description: "List current Lalin background jobs.",
    inputSchema: emptyInputSchema,
  },
  {
    name: "lalin.get_job",
    mode: "read",
    description: "Read one Lalin background job by id.",
    inputSchema: getJobInputSchema,
  },
  {
    name: "lalin.propose_agent_mutations",
    mode: "propose",
    description: "Ask Lalin agent logic to propose timeline mutations. This tool never applies mutations.",
    inputSchema: proposeAgentMutationsInputSchema,
  },
] as const;
