// @req NFR-04 — เอฟเฟกต์การ์ดเอียง (ปิดเองเมื่อ prefers-reduced-motion)
import { useRef, useState } from "react";

const prefersReducedMotion =
  typeof window !== "undefined"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

const RESET_TRANSFORM = "perspective(800px) rotateX(0deg) rotateY(0deg) scale(1)";

export function Tilt({
  children,
  max = 8,
  scale = 1.0,
  className,
  style,
}: {
  children: React.ReactNode;
  max?: number;
  scale?: number;
  className?: string;
  style?: React.CSSProperties;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<string>(RESET_TRANSFORM);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (prefersReducedMotion) return;
    const el = ref.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;

    const ry = (px - 0.5) * 2 * max;
    const rx = -(py - 0.5) * 2 * max;

    setTransform(
      `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg) scale(${scale})`,
    );
  }

  function handleMouseLeave() {
    setTransform(RESET_TRANSFORM);
  }

  const internalStyle: React.CSSProperties = {
    transform,
    transformStyle: "preserve-3d",
    transition: "transform 0.18s ease-out",
    willChange: "transform",
  };

  const mergedStyle: React.CSSProperties = { ...style, ...internalStyle };

  return (
    <div
      ref={ref}
      className={className}
      style={mergedStyle}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </div>
  );
}
