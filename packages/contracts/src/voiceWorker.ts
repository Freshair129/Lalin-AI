// Lalin Voice Worker Contract 1.0 (decision D12)
// Hand-written mirror of packages/contracts/schemas/lalin-voice-worker.schema.json.
// Source of truth is Python: apps/api/app/voice_worker/contract.py (pydantic models) +
// apps/api/app/voice_worker/schema.py (JSON Schema export). Regenerate the schema with
// `python -m app.voice_worker.schema --write` after changing contract.py, then update this
// file to match — apps/api/tests/voice_worker/test_contract_schema.py only checks the
// Python <-> JSON Schema sync, not this file.

export type ExecutionStatus = "ACCEPTED" | "DISPATCHING" | "RUNNING" | "FINISHED" | "UNKNOWN";
export type OperationOutcome = "SUCCEEDED" | "FAILED" | "CANCELLED";
export type PayloadState = "NONE" | "AVAILABLE" | "ERASE_REQUESTED" | "ERASED" | "EXPIRED";
export type CancelDisposition = "ACK" | "UNSUPPORTED" | "CANCELLED_BEFORE_START" | "ALREADY_FINISHED";

// keys of apps/api/app/voice_worker/errors.py:HTTP_STATUS
export type WorkerErrorCode =
  | "AUDIO_FORMAT_UNSUPPORTED"
  | "AUDIO_TOO_LARGE"
  | "AUDIO_UNINTELLIGIBLE"
  | "CANCEL_REQUESTED"
  | "DEADLINE_EXCEEDED"
  | "EXECUTION_UNKNOWN"
  | "IDEMPOTENCY_CONFLICT"
  | "INVALID_REQUEST"
  | "LANGUAGE_UNSUPPORTED"
  | "MODEL_UNAVAILABLE"
  | "NOT_FOUND"
  | "NO_SPEECH"
  | "OUTPUT_INVALID"
  | "OUTPUT_LIMIT"
  | "OUTPUT_NOT_READY"
  | "PAYLOAD_ERASED"
  | "PROFILE_MISMATCH"
  | "RUNTIME_FAILED"
  | "RUNTIME_OOM"
  | "SCOPE_DENIED"
  | "TARGET_MISMATCH"
  | "UNAUTHORIZED"
  | "UNSUPPORTED_PARAMETER"
  | "VOICE_NOT_APPROVED"
  | "WORKER_BUSY";

// ── invocation envelope (POST /worker/v1/operations) ───────────────────────

export interface Target {
  runtime_id: string;
  runtime_epoch: string;
  physical_resource_id: string;
  profile_id: string;
  profile_revision: string;
}

export interface Admission {
  lease_id: string;
  start_before: string;
  deadline_at: string;
  content_fence: string | null;
}

export interface AsrInput {
  language: string;
  audio_sha256: string;
  audio_bytes: number;
  declared_mime_type: string;
}

export interface TtsInput {
  text: string;
  voice_preset_id: string;
  voice_revision: string;
  response_format: "wav" | "mp3";
  speed: number | null;
}

export interface AsrEnvelope {
  contract_version: "1.0";
  invocation_id: string;
  attempt_id: string;
  target: Target;
  admission: Admission;
  kind: "asr";
  input: AsrInput;
}

export interface TtsEnvelope {
  contract_version: "1.0";
  invocation_id: string;
  attempt_id: string;
  target: Target;
  admission: Admission;
  kind: "tts";
  input: TtsInput;
}

/** discriminated union on `kind` — matches $defs/InvocationEnvelope */
export type InvocationEnvelope = AsrEnvelope | TtsEnvelope;

// ── operation status / result (GET|POST /worker/v1/operations/*) ──────────

export interface StopEvidence {
  kind: string;
  observed_at?: string | null;
  // process_exit adds pid/exitcode/exited/intentional/runtime_epoch/vram_reclaimed; varies by kind
  [extra: string]: unknown;
}

export interface UsageReport {
  processing_seconds?: number | null;
  audio_input_seconds?: number | null;
  audio_output_seconds?: number | null;
  provenance?: string | null;
}

export interface OperationError {
  code: WorkerErrorCode;
  message: string;
}

export interface AsrResult {
  kind: "asr";
  engine?: string | null;
  text: string;
  language?: string | null;
  duration_seconds?: number | null;
  segments: unknown[];
  provenance?: string | null;
}

export interface TtsResult {
  kind: "tts";
  engine?: string | null;
  provenance?: string | null;
  voice_preset_id: string;
  voice_revision: string;
  language: string;
  text_policy_revision: string;
  text_code_points: number;
  format: string;
  mime_type: string;
  channels: number;
  sample_rate: number;
  sample_width_bytes: number;
  duration_seconds: number;
  bytes: number;
  sha256: string;
}

export type OperationResult = AsrResult | TtsResult;

/** apps/api/app/voice_worker/receipts.py:Receipt.to_status() */
export interface OperationStatus {
  attempt_id: string;
  invocation_id: string;
  kind: "asr" | "tts";
  runtime_id: string;
  runtime_epoch: string;
  profile_id: string;
  profile_revision: string;
  content_fence: string | null;
  execution_status: ExecutionStatus;
  operation_outcome: OperationOutcome | null;
  cancellation_requested: boolean;
  compute_stopped: boolean | null;
  stop_evidence: StopEvidence | null;
  payload_state: PayloadState;
  result: OperationResult | null;
  error: OperationError | null;
  usage: UsageReport | null;
  safe_to_retry: boolean | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

/** apps/api/app/voice_worker/runtime.py:WorkerRuntime.cancel() — OperationStatus + disposition */
export interface CancelResponse extends OperationStatus {
  disposition: CancelDisposition;
}

/** apps/api/app/voice_worker/runtime.py:WorkerRuntime.erase() */
export interface ErasePayloadResponse {
  attempt_id: string;
  payload_state: PayloadState;
  execution_status: ExecutionStatus;
}

// ── error envelope ───────────────────────────────────────────────────────

/** apps/api/app/voice_worker/errors.py:WorkerError.to_body() → the `error` object */
export interface ErrorBody {
  code: WorkerErrorCode;
  message: string;
  request_id: string;
  attempt_id?: string | null;
  execution_status?: ExecutionStatus | null;
  safe_to_retry?: boolean | null;
  started?: boolean | null;
  details?: Record<string, unknown> | null;
}

export interface ErrorResponse {
  error: ErrorBody;
}

// ── describe() / readiness() ───────────────────────────────────────────────

export interface WorkerInfo {
  name: string;
  version: string;
  source_commit?: string | null;
}

export interface EngineInfo {
  name?: string | null;
  version?: string | null;
  labeled_stub: boolean;
}

export interface ProfileLimits {
  max_audio_bytes: number;
  max_audio_seconds: number;
  max_text_code_points: number;
  max_output_seconds: number;
  speed_min: number;
  speed_max: number;
}

export interface VoicePresetPublic {
  voice_preset_id: string;
  voice_revision: string;
  language: string;
  rights_status: string;
}

export interface AssetPublic {
  role: string;
  sha256: string;
}

export interface DeviceInfo {
  configured: string;
  effective?: string | null;
}

export interface ProfileState {
  configured: boolean;
  supported: boolean;
  loaded: boolean;
  ready: boolean;
  ready_reason: string | null;
  qualified: boolean;
  qualification_note: string;
}

export interface ProfileDescribe {
  profile_id: string;
  profile_revision: string;
  kind: "asr" | "tts";
  engine: string;
  languages: string[];
  accepted_audio_formats: string[];
  output_formats: string[];
  limits: ProfileLimits;
  max_concurrency: number;
  voices: VoicePresetPublic[];
  assets: AssetPublic[];
  manifest_sha256: string;
  device: DeviceInfo;
  state: ProfileState;
}

export interface Capabilities {
  operations: ("asr" | "tts")[];
  cancel: string;
  async_status: boolean;
  output_fetch: boolean;
  erase_payload: boolean;
  text_policy_revision?: string | null;
}

export interface CapacityInfo {
  max_concurrency: number;
  in_use: number;
}

/** may be just `{ provenance: "unavailable" }` before the engine reports its first hello */
export interface Residency {
  engine?: string | null;
  model_loaded?: boolean | null;
  device?: string | null;
  vram_bytes_allocated?: number | null;
  vram_bytes_reserved?: number | null;
  provenance: string;
}

/** apps/api/app/voice_worker/runtime.py:WorkerRuntime.describe() */
export interface DescribeResponse {
  contract_version: "1.0";
  worker: WorkerInfo;
  runtime_id: string;
  runtime_epoch: string | null;
  physical_resource_id: string;
  engine: EngineInfo;
  profiles: ProfileDescribe[];
  capabilities: Capabilities;
  capacity: CapacityInfo;
  residency: Residency;
  draining: boolean;
  observed_at: string;
  observation_seq: number;
}

export interface ReadinessProfileEntry {
  profile_id: string;
  profile_revision: string;
  ready: boolean;
  reason: string | null;
}

export interface ReconcileReport {
  epoch: string;
  never_started: number;
  unknown: number;
}

/** apps/api/app/voice_worker/runtime.py:WorkerRuntime.readiness() */
export interface ReadinessResponse {
  ready: boolean;
  runtime_id: string;
  runtime_epoch: string | null;
  profiles: ReadinessProfileEntry[];
  engine_alive: boolean;
  heartbeat_age_seconds: number | null;
  device: DeviceInfo;
  residency: Residency;
  draining: boolean;
  last_reconcile: ReconcileReport | null;
  observed_at: string;
  observation_seq: number;
}
