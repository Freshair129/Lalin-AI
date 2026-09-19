// @req Lalin Media P1/P2 — cross-process lifecycle contract

export type MediaLifecycleAction = "launch" | "focus" | "close" | "status";

export interface MediaLifecycleRequest {
  action: MediaLifecycleAction;
  requestId: string;
}

export type MediaLifecycleState =
  | {
      state: "starting";
      requestId: string;
      pid?: number;
    }
  | {
      state: "ready";
      requestId: string;
      pid: number;
    }
  | {
      state: "stopped";
      requestId: string;
      exitCode?: number;
    }
  | {
      state: "failed";
      requestId: string;
      code: string;
      message: string;
    };
