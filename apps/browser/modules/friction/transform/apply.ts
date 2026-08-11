/**
 * Transform interpreter — primitive 1 of 7, and the first of the five that were
 * typed in 2026-06 and left uninterpreted.
 *
 * Implemented as ONE injected stylesheet rather than DOM mutation. That is the
 * whole design, and it buys three things that a MutationObserver would have to
 * earn back:
 *
 *   • `persistAcrossSpaNavigation` needs no code. CSS matches whatever the page
 *     renders, whenever it renders it. A YouTube route change re-renders the
 *     shelf and the rule still applies.
 *   • No race with the page's own hydration — nothing to re-apply, so nothing
 *     to lose a race against.
 *   • Reversible in one node removal, which is what makes a stale mirror
 *     recoverable rather than a page permanently missing a third of itself.
 *
 * Every selector in a chain is emitted — primary AND fallbacks together, not
 * primary-then-fallback. The chain exists because selectors rot, and a stale
 * primary that matches nothing costs nothing next to a fallback that still
 * matches. The failure mode runs the other way: a fallback broad enough to hide
 * more than intended. That is an authoring error, and it is visible instantly.
 *
 * This hides; it does not block. A hidden Shorts shelf is still one URL away,
 * which is the Modification Rights constraint the gate obeys too (`rules.ts`,
 * §On walls) — every notch keel owns is escapable.
 */

import type { PageTransform } from "../policy/store";

/** The single style element keel owns on a page. */
export const STYLE_ID = "keel-transform";

/** Transforms whose domains cover `hostname`, `www.` disregarded.
 *
 * Suffix-matched so a rule naming `youtube.com` also covers `m.youtube.com`,
 * matching how rule authors already write `domains` for the dwell gate. The
 * boundary check on the preceding character is what keeps `notyoutube.com`
 * out. */
export function transformsFor(
  all: readonly PageTransform[],
  hostname: string
): PageTransform[] {
  const host = hostname.replace(/^www\./, "").toLowerCase();
  return all.filter((t) =>
    t.domains.some((raw) => {
      const d = raw.replace(/^www\./, "").toLowerCase().trim();
      return d !== "" && (host === d || host.endsWith(`.${d}`));
    })
  );
}

/** The stylesheet a set of transforms declares. Pure — this is the tested half.
 *
 * Returns `""` for an empty set, which the applier reads as "remove the style
 * element" rather than "inject an empty one". */
export function transformCss(transforms: readonly PageTransform[]): string {
  const blocks: string[] = [];
  for (const t of transforms) {
    const selectors = [t.targets.primary, ...t.targets.fallbacks]
      .map((s) => s.trim())
      .filter((s) => s !== "");
    if (selectors.length === 0) {
      continue;
    }
    const body =
      t.replacement.type === "restyle"
        ? Object.entries(t.replacement.style)
            .map(([prop, value]) => `${prop}: ${value} !important;`)
            .join(" ")
        : "display: none !important;";
    if (body === "") {
      continue;
    }
    blocks.push(`/* ${t.ruleId} */\n${selectors.join(",\n")} { ${body} }`);
  }
  return blocks.join("\n\n");
}

/** Write the stylesheet into the page, or remove it when nothing applies.
 *
 * Idempotent: called again with the same transforms it rewrites identical text.
 * Called with none, it removes the node — a rule the user disabled must stop
 * hiding things without a reload. */
export function applyTransforms(transforms: readonly PageTransform[]): void {
  const css = transformCss(transforms);
  const existing = document.getElementById(STYLE_ID);
  if (css === "") {
    existing?.remove();
    return;
  }
  const el = existing ?? document.createElement("style");
  if (existing === null) {
    el.id = STYLE_ID;
    // documentElement, not head: at document_start there may be no head yet,
    // and this script's whole point is running before first paint.
    (document.head ?? document.documentElement).append(el);
  }
  if (el.textContent !== css) {
    el.textContent = css;
  }
}
