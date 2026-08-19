export type AgentMutationOp =
  | "move_clip"
  | "set_gain"
  | "set_pan"
  | "set_fx"
  | "set_lufs"
  | "mute_clip"
  | "slice_clip"
  | "reorder_track";

export interface AgentMutation {
  op: AgentMutationOp | string;
  args: Record<string, unknown>;
}

export interface AgentActRequest {
  message: string;
  project: Record<string, unknown>;
}

export interface AgentActResponse {
  reply: string;
  mutations: AgentMutation[];
}

export type AgentActResult = AgentActResponse;

export const AGENT_MUTATION_OPS: readonly AgentMutationOp[] = [
  "move_clip",
  "set_gain",
  "set_pan",
  "set_fx",
  "set_lufs",
  "mute_clip",
  "slice_clip",
  "reorder_track",
] as const;
