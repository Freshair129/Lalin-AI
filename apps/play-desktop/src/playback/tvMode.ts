// @req FR-18.3 — TV keyboard focus and activation mapping
// @req FR-18.4 — semantic Gamepad API adapter with lifecycle cleanup

export type TvAction =
  | "up"
  | "down"
  | "left"
  | "right"
  | "confirm"
  | "back"
  | "menu";

export interface TvInputTarget {
  onAction: (action: TvAction) => void;
}

export interface GamepadAdapterOptions {
  getGamepads?: () => readonly (Gamepad | null)[];
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (handle: number) => void;
}

const KEY_ACTIONS: Record<string, TvAction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Enter: "confirm",
  Space: "confirm",
  Escape: "back",
  Start: "menu",
};

const BUTTON_ACTIONS: Record<number, TvAction> = {
  0: "confirm",
  1: "back",
  9: "menu",
  12: "up",
  13: "down",
  14: "left",
  15: "right",
};

/** Maps the documented keyboard code to a semantic TV action. */
export function mapTvKey(event: Pick<KeyboardEvent, "code" | "key">): TvAction | null {
  return KEY_ACTIONS[event.code] ?? KEY_ACTIONS[event.key] ?? null;
}

/** Maps standard Gamepad button indices to the same semantic action set. */
export function mapGamepadButton(buttonIndex: number): TvAction | null {
  return BUTTON_ACTIONS[buttonIndex] ?? null;
}

export function isTextEditingTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    Boolean(target.isContentEditable)
  );
}

export function tvFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>('button, input, select, [data-tv-focusable="true"]')
  ).filter((element) => !element.hasAttribute("disabled") && element.tabIndex >= 0);
}

/** Moves within the explicit TV focus order and wraps at either end. */
export function moveTvFocus(root: HTMLElement, direction: Extract<TvAction, "up" | "down" | "left" | "right">): boolean {
  const controls = tvFocusableElements(root);
  if (controls.length === 0) return false;

  const currentIndex = controls.indexOf(document.activeElement as HTMLElement);
  const step = direction === "up" || direction === "left" ? -1 : 1;
  const nextIndex = currentIndex < 0
    ? (step > 0 ? 0 : controls.length - 1)
    : (currentIndex + step + controls.length) % controls.length;
  controls[nextIndex]?.focus();
  return true;
}

export function activateTvFocus(root: HTMLElement): boolean {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !root.contains(active)) return false;
  if (!active.matches('button, input, select, [data-tv-focusable="true"]')) return false;
  active.click();
  return true;
}

/**
 * Polls semantic Gamepad API input only while TV Mode is mounted. Buttons are
 * edge-triggered so holding a button does not repeat a destructive action.
 */
export function createGamepadAdapter(
  target: TvInputTarget,
  options: GamepadAdapterOptions = {},
): () => void {
  const getGamepads = options.getGamepads ?? (() =>
    typeof navigator !== "undefined" && typeof navigator.getGamepads === "function"
      ? navigator.getGamepads()
      : []
  );
  const requestFrame = options.requestFrame ?? ((callback) => requestAnimationFrame(callback));
  const cancelFrame = options.cancelFrame ?? ((handle) => cancelAnimationFrame(handle));
  const previous = new Map<string, boolean>();
  let disposed = false;
  let frame = 0;

  const poll: FrameRequestCallback = () => {
    if (disposed) return;
    for (const gamepad of getGamepads()) {
      if (!gamepad) continue;
      gamepad.buttons.forEach((button, index) => {
        const key = `${gamepad.index}:${index}`;
        const pressed = Boolean(button?.pressed);
        if (pressed && !previous.get(key)) {
          const action = mapGamepadButton(index);
          if (action) target.onAction(action);
        }
        previous.set(key, pressed);
      });
    }
    frame = requestFrame(poll);
  };

  frame = requestFrame(poll);
  return () => {
    if (disposed) return;
    disposed = true;
    cancelFrame(frame);
    previous.clear();
  };
}
