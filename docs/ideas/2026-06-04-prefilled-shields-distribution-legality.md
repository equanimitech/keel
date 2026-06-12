# Prefilled shields — distribution legality

> Captured 2026-06-04. Open question — needs real legal input.

## The question

> *technically if i distribute keel with prefilled shields its illegal no?*

If keel's browser extension ships with **vendor-prefilled shields** — most plausibly a bundled adult/porn-domain blocklist baked into the Drogue — does shipping that list create legal exposure? This doc frames the angles to investigate. It does **not** resolve them.

## Why it matters now

The porn-block Drogue is live, and its design already half-anticipates this question:

* `apps/browser/modules/drogues/blocklist/seed.ts` — the committed seed is **deliberately empty** in the public repo. Real domains live in `seed.local.ts`, which is gitignored.
* `apps/browser/modules/drogues/blocklist/seed.local.ts` — the *local, uncommitted* seed currently contains `pornhub.com` (i.e. the prefilled-list shape exists; it's just not in the public build).
* `apps/browser/modules/drogues/blocklist/store.ts` — effective list is `unique(seed ∪ user)`; seed domains are non-removable by design (edit + rebuild), user-added ones are freely removable.
* `apps/browser/modules/drogues/blocklist/sync.ts` — enforcement is a DNR `block` rule, no host permissions.
* `apps/browser/entrypoints/block/main.ts` — the block page is explicitly framed around porn.

So today's public build ships empty-seed + user-adds. The open question bites the moment we consider **flipping the seed on** — bundling a real adult/porn blocklist (or any third-party list) into the distributed extension. That's a product decision we haven't made; this is the legal homework before we do.

## Risk surfaces to investigate

* **Redistributing a third-party blocklist.** If the seed pulls from an existing public adult-domain list, what license governs it? Many community lists carry attribution / share-alike / non-commercial terms that a shipped commercial extension may violate.
* **Mislabeling a domain as "porn/adult."** Classifying a specific named site as adult content is a factual claim about that business. Wrong or contested classifications could invite defamation / trade-disparagement complaints — sharper because keel's framing is explicitly "porn."
* **Content-filtering software regulation by jurisdiction.** Some jurisdictions regulate content-filtering / "parental control" / censorship-adjacent software (disclosure, certification, what may be blocked, age-verification adjacency). Need a read on which markets and what triggers apply.
* **Extension-store policies.** Chrome Web Store (and Brave/Edge/Firefox) have rules on adult content, content blocking, and what an extension may bundle. A prefilled adult blocklist may hit category, disclosure, or review-policy lines that an empty + opt-in list does not.
* **Vendor-prefilled vs user-added — the consent line.** A user typing `pornhub.com` into their own list is the user's choice. keel *shipping* that classification is keel making the claim. The legal posture of "tool the user configures" differs materially from "list the vendor imposes."
* **Over-block / under-block liability.** A bundled list that blocks something legitimate (false positive → business harm / user complaint) or misses something it implied it would catch (false negative → reliance / "your filter failed" claims) is a liability surface — especially if marketing implies completeness.

## Mitigations worth weighing

(Not legal advice — these are design levers to discuss with counsel, not conclusions.)

* **Ship empty, opt-in shields** — the current posture. Strongest position: keel provides the mechanism, the user supplies the list. Keep the seed empty in the public build.
* **License-clean lists only.** If we ever bundle, audit the source list's license and honor attribution / commercial-use terms; document provenance.
* **"Community-maintained" framing.** A list maintained/curated by an external community (and clearly labeled as such) shifts the classification claim away from keel-the-vendor.
* **User-adds, vendor-doesn't-impose.** Lean on the existing freely-removable user list; avoid non-removable vendor seed for contestable classifications.
* **No completeness promises.** Marketing/UX should never imply the block is exhaustive or guaranteed.

## What we'd need to answer it

* **Lawyer review** — jurisdiction-aware read on content-filtering regulation and defamation/mislabeling exposure for shipping vs not shipping a prefilled adult list.
* **License audit** of any list we'd bundle — source, license terms, commercial-use + attribution compatibility.
* **Store-policy read** — Chrome Web Store + target browser stores on adult-content blocking, bundled lists, and disclosure requirements.

---

**Disclaimer:** This is not legal advice. Everything above is a list of questions and hunches from a non-lawyer. Before shipping any prefilled shield, flag for counsel.
