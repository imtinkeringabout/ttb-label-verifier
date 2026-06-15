# Test Labels

Sample labels for exercising the verifier.

## Synthetic labels (committed) — [`images/`](images/)

Six clean, generated labels with exact, legible text. These are the best inputs for
testing the **comparison logic**, because the ground truth is known. They were
produced from [`label.html`](label.html) rendered with headless Chrome (no AI image
gen — diffusion models garble fine print, which defeats a label *reader*).

| File | What it exercises | Expected |
|------|-------------------|----------|
| `01-bourbon-approved` | All fields present + correct warning | APPROVED |
| `02-vodka-case-mismatch` | "STONE'S THROW" all-caps vs "Stone's Throw" in the form | APPROVED (case-insensitive) |
| `03-gin-warning-titlecase` | "Government Warning:" not all-caps | NEEDS REVIEW |
| `04-tequila-missing-warning` | No government warning at all | REJECTED |
| `05-wine-cabernet` | Different category (wine, vintage, 13.5%) | depends on form data |
| `06-scotch-imported-glare` | Imported (country of origin) + skew/glare | tests degraded-image path |

Regenerate (Windows example):

```powershell
# for each id 1..6
chrome --headless=new --disable-gpu --window-size=820,1180 `
  --screenshot="images/01.png" "file:///ABS/PATH/test-labels/label.html?id=1"
```

## Real labels (local only) — `real/`

`real/` is **gitignored** — real-world label photos can carry licensing/attribution
requirements, so they're kept out of this public repo. Populate it yourself:

```bash
node test-labels/fetch-real-labels.mjs
```

That pulls a handful of **freely-licensed** labels from Wikimedia Commons into `real/`
along with an `ATTRIBUTION.txt`. Note: many are vintage and predate the modern U.S.
government warning — which makes them a realistic test of the "missing warning →
REJECTED" path.

## Make your own

The brief suggests AI image generation. Prompt an image model for a front label with
explicit text (brand, class/type, ABV, net contents, producer/address, and the full
government warning with "GOVERNMENT WARNING:" in bold all-caps), then vary it to create
edge cases (title-case warning header, missing warning, mismatched ABV, angled/glare
photo).
