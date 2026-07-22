import type { AgentActRequest, AgentActResponse } from "@lalin/contracts";

import { asTextContent, postJson } from "../client.js";

export async function proposeAgentMutations(args: AgentActRequest) {
  return asTextContent(await postJson<AgentActResponse>("/agent/act", args));
}
