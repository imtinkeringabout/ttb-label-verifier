# Test Labels

This folder is for sample label images you use to exercise the app. Binary images
are intentionally **not** committed (keeps the repo light and avoids licensing
questions on brand photos).

## How to get test labels

**1. Generate synthetic ones (recommended).** The brief explicitly suggests AI image
generation. Prompt an image model with something like:

> A photorealistic front label for a 750 mL bottle of "OLD TOM DISTILLERY" Kentucky
> Straight Bourbon Whiskey. Show: brand name, "Kentucky Straight Bourbon Whiskey",
> "45% Alc./Vol. (90 Proof)", "750 mL", "Bottled by Old Tom Distillery, Louisville, KY",
> and the full U.S. Government Warning in small print with "GOVERNMENT WARNING:" in
> bold all-caps. Flat, evenly lit, straight-on.

Make deliberate variations to test the comparison logic:
- A label where the warning header is **title case** ("Government Warning:") — should REVIEW/FAIL.
- A label with a **missing** government warning — should FAIL.
- A brand name in a **different case** than the application data — should still PASS.
- A photo at a **slight angle / with glare** — see how extraction degrades (Jenny's edge case).

**2. Real label photos.** Photograph a bottle straight-on in good light. Don't commit
copyrighted brand photos to the public repo.

## Suggested test matrix

| Case | Expectation |
|------|-------------|
| Clean label, all fields match application | APPROVED |
| Brand case mismatch only (STONE'S THROW vs Stone's Throw) | APPROVED |
| Warning header not all-caps | NEEDS REVIEW |
| Warning absent | REJECTED |
| ABV on label differs from application | REJECTED |
| Angled/glare photo | Degraded extraction, note in `raw_notes` |
