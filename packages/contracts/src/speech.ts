export interface SpeechProfile {
  id: string;
  label: string;
  note: string;
}

export interface SpeechConfig {
  asr_model: string;
  asr_device: string;
  asr_compute_type: string;
  profiles: SpeechProfile[];
  asr_available: boolean;
  tts_available: boolean;
}
