// @req NFR-02 — poll /health + retry, gate UI จนกว่า backend พร้อม
import { useEffect, useState } from "react";
import { health } from "../api";

export type BackendReadinessState = "checking" | "ready" | "offline";

export interface BackendReadiness {
  state: BackendReadinessState;
  online: boolean | null;
  brainName: string;
  error: string;
  attempt: number;
  retry: () => void;
}

const BOOT_POLL_MS = 1500;
const READY_POLL_MS = 10000;

export function useBackendReadiness(): BackendReadiness {
  const [state, setState] = useState<BackendReadinessState>("checking");
  const [brainName, setBrainName] = useState("");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const ping = async () => {
      setAttempt((value) => value + 1);
      try {
        const response = await health();
        if (cancelled) return;
        setState("ready");
        setBrainName(response.brain?.provider ?? "");
        setError("");
        timer = setTimeout(ping, READY_POLL_MS);
      } catch (err) {
        if (cancelled) return;
        setState("offline");
        setBrainName("");
        setError(err instanceof Error ? err.message : "backend offline");
        timer = setTimeout(ping, BOOT_POLL_MS);
      }
    };

    setState((current) => (current === "ready" ? current : "checking"));
    ping();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [retryToken]);

  return {
    state,
    online: state === "checking" ? null : state === "ready",
    brainName,
    error,
    attempt,
    retry: () => setRetryToken((value) => value + 1),
  };
}
