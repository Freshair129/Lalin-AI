import { expect, it } from "vitest";
// @ts-expect-error Node typings are not part of the frontend project.
import { readFileSync } from "node:fs";
const styles: string = readFileSync("src/styles.css", "utf8");

it("gives the content pane the full width at narrow viewports while retaining scrollable navigation", () => {
  const element = document.createElement("style");
  element.textContent = styles;
  document.head.appendChild(element);
  const sheet = element.sheet!;
  const breakpoint = Array.from(sheet.cssRules).find(rule => rule.cssText.includes("480px") && "cssRules" in rule) as CSSMediaRule;
  expect(breakpoint).toBeTruthy();
  const rules = Array.from(breakpoint.cssRules) as CSSStyleRule[];
  expect(rules.find(rule => rule.selectorText === ".workspace")?.style.getPropertyValue("flex-direction")).toBe("column");
  expect(rules.find(rule => rule.selectorText === "aside")?.style.getPropertyValue("overflow-x")).toBe("auto");
  element.remove();
});
