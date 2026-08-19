import type { HealthResponse, RuntimeActivityStatus } from "@lalin/contracts";

import { asTextContent, getJson } from "../client.js";

export async function readRuntimeStatus() {
  return asTextContent(await getJson<RuntimeActivityStatus>("/runtime/status"));
}

export async function readHealth() {
  return asTextContent(await getJson<HealthResponse>("/health"));
}
