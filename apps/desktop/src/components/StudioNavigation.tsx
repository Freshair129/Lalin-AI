import { useState } from "react";
import { Icon } from "./icons";

type NavigationItem<T extends string> = { id: T; icon: string; label: string };

export function StudioNavigation<T extends string>({ items, current, onNavigate }: {
  items: NavigationItem<T>[]; current: T; onNavigate: (id: T) => void;
}) {
  const [expanded, setExpanded] = useState(() => {
    try { return localStorage.getItem("lalin:sidebar-expanded") !== "false"; } catch { return true; }
  });
  const toggle = () => setExpanded((previous) => {
    const next = !previous;
    try { localStorage.setItem("lalin:sidebar-expanded", String(next)); } catch { /* optional preference */ }
    return next;
  });
  return <nav className={`rail studio-navigation ${expanded ? "expanded" : "collapsed"}`} aria-label="Lalin Studio navigation">
    <button type="button" className="rail-toggle" onClick={toggle} aria-label={expanded ? "Collapse navigation" : "Expand navigation"} aria-expanded={expanded} title={expanded ? "Collapse navigation" : "Expand navigation"}>{expanded ? "‹" : "›"}</button>
    {items.map((item) => <button key={item.id} type="button" className={`rail-btn ${current === item.id ? "active" : ""}`} onClick={() => onNavigate(item.id)} aria-label={item.label} aria-current={current === item.id ? "page" : undefined} title={item.label}><Icon name={item.icon} />{expanded && <span>{item.label}</span>}</button>)}
  </nav>;
}
