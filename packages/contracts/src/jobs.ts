export type JobStatus = "queued" | "running" | "done" | "error";

export interface JobResult {
  output?: string;
  subtitle_srt?: string | null;
  subtitle_vtt?: string | null;
  video_output?: string;
  video_mux_error?: string;
  [key: string]: unknown;
}

export interface Job {
  id: string;
  kind: string;
  status: JobStatus;
  progress: number;
  message: string;
  result?: JobResult;
  error?: string;
}

export interface JobsListResponse {
  jobs: Job[];
}
