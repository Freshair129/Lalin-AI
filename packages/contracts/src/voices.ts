export interface Voice {
  id: string;
  name: string;
  ref_text: string;
  language: string;
  source?: "upload" | "microphone";
  consent?: boolean;
  created_at?: string;
  updated_at?: string;
}
