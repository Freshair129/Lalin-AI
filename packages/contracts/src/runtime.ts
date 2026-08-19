export interface BrainConfig {
  provider: string;
  model?: string;
  ollama_base_url?: string;
  cloud_provider?: string;
  base_url?: string;
  has_api_key?: boolean;
}

export interface HealthResponse {
  status: string;
  service?: string;
  brain: any;
  brain_config?: Record<string, unknown>;
}

export interface RuntimeTelemetry {
  cpu_percent: number | null;
  ram_used_bytes: number | null;
  ram_total_bytes: number | null;
  gpu_name: string | null;
  gpu_percent: number | null;
  vram_used_bytes: number | null;
  vram_total_bytes: number | null;
}

export interface RuntimeIdentity {
  profile: "full" | "lite" | null;
  model: string | null;
  agent: string | null;
}

export interface RuntimeActivity {
  job_id: string | null;
  label: string | null;
  state: string | null;
  progress: number | null;
}

export interface RuntimeActivityStatus {
  telemetry: RuntimeTelemetry;
  runtime: RuntimeIdentity;
  activity: RuntimeActivity;
}
