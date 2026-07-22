import { useEffect, useLayoutEffect, useRef, useState } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

export type MenuItem =
  | { type: "sep" }
  | {
      label: string;
      icon?: string;       // optional emoji / char shown at left
      shortcut?: string;   // e.g. "Ctrl+D" shown muted at right
      danger?: boolean;    // red text
      disabled?: boolean;
      onClick?: () => void;
    };

// ── Component ────────────────────────────────────────────────────────────────

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}): JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null);

  // Start at the raw click position; shift after layout measurement.
  const [pos, setPos] = useState<{ left: number; top: number }>({
    left: x,
    top: y,
  });

  // Clamp to viewport after the menu has been painted and we know its size.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const { offsetWidth: w, offsetHeight: h } = el;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setPos({
      left: x + w > vw ? Math.max(0, vw - w - 4) : x,
      top: y + h > vh ? Math.max(0, vh - h - 4) : y,
    });
  }, [x, y]);

  // Outside-click + Escape listeners.
  useEffect(() => {
    // Defer by one tick so the same right-click that opened the menu
    // doesn't fire the outside-click handler immediately.
    let active = false;
    const timer = setTimeout(() => {
      active = true;
    }, 0);

    function handleMouseDown(e: MouseEvent) {
      if (!active) return;
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        left: pos.left,
        top: pos.top,
        zIndex: 2000,
        background: "#16181d",
        border: "1px solid #2a2e38",
        borderRadius: 8,
        padding: 5,
        minWidth: 190,
        boxShadow: "0 16px 40px -12px rgba(0,0,0,0.7)",
        fontFamily: "inherit",
        userSelect: "none",
      }}
    >
      {items.map((item, idx) => {
        if ("type" in item && item.type === "sep") {
          return (
            <div
              key={idx}
              style={{
                height: 1,
                margin: "4px 0",
                background: "#2a2e38",
              }}
            />
          );
        }

        // After the sep guard, item is the action variant.
        const action = item as Exclude<MenuItem, { type: "sep" }>;
        const { label, icon, shortcut, danger = false, disabled = false, onClick } = action;

        function handleClick() {
          if (disabled) return;
          onClick?.();
          onClose();
        }

        return (
          <ItemRow
            key={idx}
            label={label}
            icon={icon}
            shortcut={shortcut}
            danger={danger}
            disabled={disabled}
            onClick={handleClick}
          />
        );
      })}
    </div>
  );
}

// ── ItemRow — extracted to isolate hover state per row ───────────────────────

function ItemRow({
  label,
  icon,
  shortcut,
  danger,
  disabled,
  onClick,
}: {
  label: string;
  icon?: string;
  shortcut?: string;
  danger: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  const labelColor = danger ? "#ff5163" : "#e7e9ee";
  const bgColor = hovered && !disabled ? "#222631" : "transparent";

  return (
    <div
      role="menuitem"
      aria-disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => !disabled && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "7px 12px",
        fontSize: 13,
        borderRadius: 5,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
        background: bgColor,
        transition: "background 0.1s",
      }}
    >
      {/* Icon slot — always reserve space if any item in the list has an icon;
          here we just render it when present */}
      {icon !== undefined && (
        <span
          style={{
            width: 16,
            textAlign: "center",
            color: "#7e8597",
            flexShrink: 0,
          }}
        >
          {icon}
        </span>
      )}

      {/* Label */}
      <span style={{ color: labelColor, flex: 1 }}>{label}</span>

      {/* Shortcut */}
      {shortcut !== undefined && (
        <span
          style={{
            marginLeft: "auto",
            fontSize: 11,
            color: "#565d6e",
            fontFamily: "monospace",
            flexShrink: 0,
          }}
        >
          {shortcut}
        </span>
      )}
    </div>
  );
}
