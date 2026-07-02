import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Dialog.tsx — modal แทนที่ window.prompt / window.confirm
 *  - useDialogHost(): hook แบบ headless คืน { prompt, confirm, node }
 *  - prompt(message, defaultValue) → Promise<string | null> (null = ยกเลิก)
 *  - confirm(message) → Promise<boolean>
 *  - Enter = ตกลง, Esc = ยกเลิก, autofocus input
 */
type DialogState =
  | { kind: "prompt"; message: string; defaultValue: string; resolve: (v: string | null) => void }
  | { kind: "confirm"; message: string; resolve: (v: boolean) => void }
  | null;

export function useDialogHost() {
  const [state, setState] = useState<DialogState>(null);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const prompt = useCallback((message: string, defaultValue = ""): Promise<string | null> => {
    return new Promise((resolve) => {
      setValue(defaultValue);
      setState({ kind: "prompt", message, defaultValue, resolve });
    });
  }, []);

  const confirm = useCallback((message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({ kind: "confirm", message, resolve });
    });
  }, []);

  useEffect(() => {
    if (state?.kind === "prompt") {
      const id = requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
      return () => cancelAnimationFrame(id);
    }
  }, [state]);

  const close = useCallback((result: string | boolean | null) => {
    setState((s) => {
      if (!s) return null;
      if (s.kind === "prompt") s.resolve(result as string | null);
      else s.resolve(Boolean(result));
      return null;
    });
  }, []);

  const onOk = useCallback(() => {
    if (!state) return;
    if (state.kind === "prompt") {
      const v = value.trim();
      close(v ? v : null);
    } else {
      close(true);
    }
  }, [state, value, close]);

  const onCancel = useCallback(() => {
    if (!state) return;
    close(state.kind === "prompt" ? null : false);
  }, [state, close]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); onOk(); }
    else if (e.key === "Escape") { e.preventDefault(); onCancel(); }
  }, [onOk, onCancel]);

  const node = state ? (
    <div className="mkt-overlay" onClick={onCancel}>
      <div className="dialog-card glass" onClick={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <p className="dialog-msg">{state.message}</p>
        {state.kind === "prompt" && (
          <input
            ref={inputRef}
            className="dialog-input mono"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            spellCheck={false}
          />
        )}
        <div className="dialog-actions">
          <button className="dialog-btn cancel" onClick={onCancel}>ยกเลิก</button>
          <button className="dialog-btn ok" onClick={onOk}>ตกลง</button>
        </div>
      </div>
    </div>
  ) : (
    <></>
  );

  return { prompt, confirm, node };
}
