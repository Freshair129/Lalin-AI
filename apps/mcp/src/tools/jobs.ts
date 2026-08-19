import type { Job, JobsListResponse } from "@lalin/contracts";

import { asTextContent, getJson } from "../client.js";

export async function listJobs() {
  return asTextContent(await getJson<JobsListResponse>("/jobs"));
}

export async function getJob(args: { job_id: string }) {
  return asTextContent(await getJson<Job>(`/jobs/${encodeURIComponent(args.job_id)}`));
}
