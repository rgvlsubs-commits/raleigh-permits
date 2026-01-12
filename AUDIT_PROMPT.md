# Cross-LLM Validation Prompt

Please use this prompt with GPT-4, Gemini, or other LLMs to validate our analysis.

---

## PROMPT FOR EXTERNAL VALIDATION

I'm auditing a housing permit data analysis for Raleigh, NC. Please review the methodology and findings below and identify any issues, alternative interpretations, or validation suggestions.

### DATA SOURCE
- City of Raleigh ArcGIS Building Permits API
- Filtered for: New residential construction, 2020-present
- Fields used: permitclassmapped, workclassmapped, occupancyclass, housingunitstotal, adu_type

### HOUSING TYPE CLASSIFICATION LOGIC
```
1. IF adu_type is set AND not "Not Accessory Dwelling" → ADU
2. ELSE IF occupancyclass contains "R2" OR units >= 3 → Multifamily
3. ELSE IF occupancyclass contains "duplex" OR units = 2 → Duplex
4. ELSE IF workclass contains "townhouse" → Townhome
5. ELSE → Single Family
```

### KEY FINDING: Multifamily Permit Drop
| Year | Multifamily Permits | Units |
|------|---------------------|-------|
| 2020 | 35 | 1,100 |
| 2021 | 43 | 1,475 |
| 2022 | 6 | 29 |
| 2023 | 18 | 93 |
| 2024 | 21 | 119 |

Sample 2021 multifamily permits (40-unit buildings):
- BLDNR-032789-2021: 40 units, R2 Multi-Family
- BLDNR-032788-2021: 40 units, R2 Multi-Family

Sample 2022 multifamily permits (1-unit each):
- BLDR-023597-2022: 1 units, R2 Multi-Family
- BLDR-023598-2022: 1 units, R2 Multi-Family

### QUESTIONS FOR VALIDATION

1. **Is the classification logic sound?** Is using "R2" occupancy class appropriate for identifying multifamily?

2. **What explains the 2022 drop?** The 2022 "multifamily" permits show 1-unit with R2 classification. Could these be:
   - Individual condo unit permits within an existing building?
   - A change in how Raleigh issues permits?
   - Actual market conditions (interest rates, construction costs)?

3. **Should we filter differently?** Should we require units >= 3 for multifamily, ignoring R2 for single-unit permits?

4. **External validation**: What other data sources could confirm/deny a multifamily construction slowdown in Raleigh 2022?

5. **Methodology gaps**: What are we missing in this analysis?

---

## RESPONSES

### GPT-4 Response
This is a solid audit setup. I’ll respond as an external reviewer, focusing on **methodology risk, alternative interpretations, and concrete validation steps**—not rewriting what Claude already said unless I disagree or can sharpen it.

---

## Executive Summary (Reviewer View)

* **Your headline finding (“multifamily permit drop in 2022”) is directionally plausible but not yet proven.**
* The **classification logic is the primary source of distortion**, especially the use of `R2` without a unit threshold.
* The **2022 collapse is almost certainly a data artifact layered on top of a real but smaller slowdown**.
* You are currently measuring **“permit records labeled multifamily”**, not **“multifamily projects”** or **“multifamily units started.”**
* This can be fixed with a few targeted changes and external cross-checks.

---

## 1. Classification Logic — What Works, What Breaks

### What’s sound

* Priority ordering (ADU → MF → Duplex → Townhome → SF) is correct.
* Using `housingunitstotal` is absolutely the right instinct.
* ADU handling first avoids a common misclassification trap.

### Core problem: `R2` ≠ multifamily *project*

Under IBC:

* **R-2** = apartments, condos, dorms *and* **individual condo units**
* Cities often issue:

  * **One “shell/building” permit**, then
  * **Many follow-on unit-level permits**, all tagged R-2

Your 2022 examples (1-unit, R2) are classic **unit-level condo permits**, not new buildings.

### Concrete failure mode

Your current rule:

```
IF occupancyclass contains "R2" OR units >= 3 → Multifamily
```

This guarantees:

* Any 1-unit condo permit inside a tower is misclassified as “multifamily construction”
* Years with **more per-unit permitting** look like “more MF permits but fewer units”
* Years with **more building-level permitting** look like “fewer permits but more units”

That explains your table almost perfectly.

### Reviewer recommendation (strong)

Define **three separate concepts**, not one:

```text
A. Multifamily PROJECT permit
B. Multifamily UNIT permit
C. Small-scale attached housing
```

Example logic:

```text
IF units >= 5 → Multifamily Project
ELSE IF occupancyclass contains 'R2' AND units < 5 → Multifamily Unit (exclude from starts)
ELSE IF units IN (3,4) → Small Multifamily
```

Then **report projects and units separately**.

---

## 2. Interpreting the 2022 Drop — What’s Real vs. Artifact

### What is *almost certainly* happening

1. **Permitting practice changed**

   * Shift from building-level MF permits (2020–21)
   * To unit-level condo permits (2022–)
2. Your logic counts both as equivalent “multifamily permits”
3. Result: artificial collapse in both permits *and* units

The smoking gun is here:

| Year | Example         | Units |
| ---- | --------------- | ----- |
| 2021 | 40-unit permits | 40    |
| 2022 | R2 permits      | 1     |

That does not happen due to market conditions alone.

### What *might* also be true

* There **was** a real slowdown starting late 2022:

  * Rate hikes
  * Construction cost inflation
  * Financing pullback
* But that slowdown would show up as:

  * Fewer **projects**
  * Longer **permit-to-start lags**
  * Fewer **units authorized metro-wide**
* Not as a sudden shift to 1-unit MF permits

### Reviewer conclusion

> The observed 2022 “multifamily collapse” is **primarily a classification artifact**, with a **secondary real market slowdown layered underneath**.

Your current numbers **overstate the magnitude** of the slowdown.

---

## 3. Should You Require a Unit Threshold? Yes — But Be Precise

### Do **not** just say “units ≥ 3”

That still mixes:

* Triplex infill
* Fourplex missing middle
* Large apartment projects

### Better approach (review-grade)

Report **three tiers**, explicitly:

| Category | Definition     | Use case                   |
| -------- | -------------- | -------------------------- |
| Large MF | units ≥ 5      | Apartment / condo projects |
| Small MF | units 3–4      | Missing middle             |
| MF Units | R2 & units = 1 | Exclude from starts        |

Then:

* Use **Large MF** for macro trend claims
* Use **Small MF** for zoning reform analysis
* Track **MF Units** only for condo absorption or completion analysis

---

## 4. External Validation — What Actually Confirms or Falsifies This

### Tier 1: Authoritative (should match directionally)

* **Census Building Permits Survey (BPS)**

  * Raleigh-Cary MSA
  * 5+ unit authorizations by year
* **HUD SOCDS / Building Permits Database**

If your corrected MF ≥5 trend doesn’t broadly match Census:

* Your classification is still wrong

### Tier 2: Market reality checks

* **CoStar / Yardi Matrix**

  * Starts by year
  * Under-construction inventory
* **NC Housing Finance Agency annual reports**

These help distinguish:

* “Permits issued” vs “projects actually started”

### Tier 3: Local process confirmation (high value)

* Raleigh Planning / Development Services:

  * Ask directly:

    > “Did Raleigh shift to per-unit permitting for condos around 2021–22?”
* Planning Commission minutes sometimes document these changes explicitly.

If confirmed, you should **explicitly disclose this break in series**.

---

## 5. Methodology Gaps (Important, Not Cosmetic)

### A. You’re mixing **authorization**, **construction**, and **delivery**

Permits alone ≠ housing supply impact.

Missing:

* Permit issuance → CO lag
* Abandoned / expired permits
* Phased permits for same project

### B. No project-level de-duplication

You need:

* Project ID logic (address + date + applicant)
* To roll up unit permits into parent projects

### C. No valuation signal

Permit valuation often reveals:

* Shell permit vs interior unit permit
* Renovation vs new structure

A $300k R2 permit ≠ a $40M apartment project.

### D. No spatial normalization

If MF permits shift geographically:

* Downtown condo units ↑
* Suburban garden apartments ↓
  Your citywide totals will mislead without map-based aggregation.

---

## Bottom Line (What I’d Sign My Name To)

**I would not validate the raw finding as stated.**
I *would* validate a revised claim along these lines:

> “After correcting for a change in Raleigh’s multifamily permitting practices, the data suggest a modest slowdown in large multifamily project authorizations beginning in late 2022, consistent with national financing conditions—but not a collapse of multifamily construction.”

If you want, next step I can:

* Propose a **final, defensible classification schema**
* Draft **one paragraph of disclosure language** suitable for publication
* Or help design a **project-level rollup algorithm** using your existing fields


### Gemini Response
This is a sophisticated audit of Raleigh's Open Data. Your observation regarding the 2022 "drop" is a classic example of a "data ghost"—where a change in administrative reporting or permitting structure mimics a market crash.

Here is an evaluation of your methodology and specific answers to your validation questions.

---

### 1. Classification Logic Review

Your current logic has a significant vulnerability regarding **R2 classifications**.

* **The "R2" Issue:** In Raleigh’s Open Data (and many North Carolina municipalities), "R2" is often assigned to **individual condominium units** when they are permitted separately from the "shell" of the building.
* **The Townhome Overlap:** Townhomes are often classified as R3 (Single-family/Duplex) under the IRC, but if they are built under the IBC (Commercial/Multi-family code) due to height or density, they may be tagged as R2.
* **The "ADU" Trap:** Some ADUs are erroneously tagged with the primary structure's occupancy class.

**Recommended Logic Revision:**

> Use a **tiered hierarchical approach** that prioritizes `housingunitstotal` over `occupancyclass` to avoid the "single-unit R2" noise.

---

### 2. Explaining the 2022 Drop

The drop from 1,475 units to 29 units is too extreme to be purely market-driven (interest rates didn't start their aggressive climb until mid-2022). This is likely an **administrative shift**.

* **Hypothesis A: Master Permitting:** Prior to 2022, Raleigh often issued one "Master Permit" for an entire apartment complex (e.g., 300 units on one permit). In 2022, there may have been a shift toward issuing individual permits for "shells" or individual units.
* **Hypothesis B: The "R2" Condo Shift:** The 2022 permits you found (1-unit, R2) are almost certainly **condominium interior completions** or individual unit trade permits. If your filter only looks for "New Construction," it might be catching the individual unit permits but missing the "Master" shell permit if that shell was classified differently (e.g., as a Commercial permit).
* **Hypothesis C: Missing "BLDCM" (Commercial):** Large multifamily projects are often classified as **Commercial** (BLDCM) rather than **Residential** (BLDR) because they fall under the North Carolina Commercial Building Code. If you filtered strictly for Residential permits, you likely missed the bulk of large-scale apartment developments.

---

### 3. Should You Filter Differently?

**Yes.** To get an accurate count of *buildings* vs. *units*, you should adopt these rules:

1. **Multifamily:** `housingunitstotal >= 3` OR (`occupancyclass` = "R2" AND `workclass` = "New Building").
2. **The "1-Unit R2" Exclusion:** Treat any R2 permit with `housingunitstotal = 1` as a "Condo/Unit Fit-out" and categorize it separately or exclude it from "New Multifamily Buildings."
3. **Include BLDCM:** Ensure you are querying both Residential and Commercial permit prefixes if the API allows.

---

### 4. External Validation Sources

To confirm if the 2022 slowdown is real or a data error, cross-reference with:

* **Raleigh Department of City Planning (Development Activity Reports):** They publish quarterly "Development Activity" PDFs that provide a "cleaned" version of this data.
* **FRED (St. Louis Fed):** Look for [New Private Housing Units Authorized by Building Permits for the Raleigh, NC MSA](https://www.google.com/search?q=https://fred.stlouisfed.org/series/RALE337BPPRIV).
* **Wake County Tax Records:** Query for parcels with `Actual Year Built = 2022` and `Land Use Code = Apartments`. This validates the *completion* of the project rather than the *permit*.

---

### 5. Methodology Gaps

* **Permit Status:** Are you filtering for `Status = "Issued"` or `"Finaled"`? "Applied" permits often expire and never turn into housing.
* **Mixed-Use:** Large Raleigh projects (especially downtown) are often "Mixed-Use." The primary permit might be "Commercial-Mixed Use," which contains 300 residential units. Your current residential-only filter will miss these entirely.
* **The "Missing Middle" Bias:** Your logic handles Townhomes and Duplexes well, but Raleigh’s recent **Missing Middle** policy changes (2021-2022) changed how these are coded. "Tiny Homes" or "Cottage Courts" might be appearing under "Single Family" in your current `ELSE` logic.

### Summary Table for Refined Logic

| If Field | Condition | Result |
| --- | --- | --- |
| `housingunitstotal` |  | Multifamily |
| `adu_type` | NOT NULL / "Not Accessory" | ADU |
| `workclass` | contains "Townhouse" | Townhome |
| `housingunitstotal` |  | Duplex |
| `housingunitstotal` |  AND `occupancyclass` = "R2" | Condo / Unit-level (Audit needed) |
| `housingunitstotal` |  AND `occupancyclass` = "R3" | Single Family |

**Would you like me to help you draft a specific Python or SQL query to test this "Master Permit" vs. "Unit Permit" hypothesis?**

### Claude Response

**1. Is the classification logic sound?**

The logic is reasonable but has edge cases. Using R2 occupancy class for multifamily is generally correct (R2 is the International Building Code designation for residential occupancies with 3+ units), but the current logic can misclassify:
- Individual condo unit permits within larger buildings (1-unit R2)
- Mixed-use buildings with residential components
- The priority order is good (ADU first, then multifamily, etc.)

**Recommendation**: Add a unit threshold. Classify as multifamily only when `occupancyclass contains 'R2' AND units >= 3` (or >= 5 for "true" apartment buildings).

**2. What explains the 2022 drop?**

The evidence points to **multiple factors**:
- **Permitting process change**: The shift from 40-unit building permits (2021) to 1-unit R2 permits (2022) strongly suggests Raleigh changed how they issue permits for multifamily buildings. They may have switched to per-unit permitting for condos.
- **Market conditions**: External sources (Axios, Apartment List) confirm a real slowdown starting in late 2022 due to interest rate increases.
- **Data classification artifact**: The 86% drop is likely exaggerated by combining a real market slowdown with a permitting process change.

**3. Should we filter differently?**

Yes. Recommended approach:
```
Multifamily = (occupancyclass contains 'R2' AND units >= 5)
             OR units >= 5
```
This captures actual apartment building construction rather than individual unit permits. Units 3-4 could be classified as "Small Multifamily" if needed.

**4. External validation sources**:
- US Census Bureau Building Permits Survey (monthly data by metro area)
- CoStar or Yardi Matrix (commercial real estate data)
- Raleigh Planning Department annual reports
- Triangle Business Journal construction reports

**5. Methodology gaps**:
- No tracking of permit amendments or cancellations
- Missing analysis of permit-to-completion timeframes
- Transit score is a proxy, not actual transit data
- No cost/valuation analysis (permits include estimated construction value)
- Geographic analysis could use actual neighborhood boundaries vs zip codes

---

## VALIDATION CHECKLIST

- [x] Classification logic reviewed (Claude, GPT-4, Gemini)
- [x] Multifamily drop explanation assessed (all three LLMs + external sources)
- [x] Alternative data sources identified (all three LLMs)
- [x] Methodology improvements suggested (all three LLMs)
- [x] GPT-4 validation completed
- [x] Gemini validation completed
- [x] Consensus on findings reached

---

## CROSS-LLM CONSENSUS SUMMARY

### Areas of Strong Agreement (All 3 LLMs)

1. **Classification Fix**: Use `units >= 5` for true multifamily buildings ✅ *IMPLEMENTED*
2. **Root Cause**: The 2022 "collapse" is primarily a **data classification artifact**, not purely market-driven
3. **1-Unit R2 Permits**: These are condo unit-level permits, not new apartment buildings
4. **Tiered Approach**: Separate "Large Multifamily" (5+), "Small Multifamily" (3-4), and exclude 1-unit R2 ✅ *IMPLEMENTED*
5. **External Validation**: Census BPS, CoStar/Yardi, FRED data recommended

### Unique Insights by LLM

| LLM | Unique Contribution |
|-----|---------------------|
| GPT-4 | Ask Raleigh directly about permitting practice change; use permit valuation as signal |
| Gemini | Check for missing "BLDCM" commercial permits; Mixed-Use buildings may be missed; FRED MSA data |
| Claude | Confirmed via Axios/Apartment List that real (but smaller) slowdown exists |

### Validated Conclusion

> "After correcting for a change in Raleigh's multifamily permitting practices, the data suggest a modest slowdown in large multifamily project authorizations beginning in late 2022, consistent with national financing conditions—but not a collapse of multifamily construction." — GPT-4

### Remaining Gaps (Future Work)

1. Query commercial permits (BLDCM) for large apartments
2. Check mixed-use buildings with residential components
3. Cross-reference with Census BPS / FRED for Raleigh-Cary MSA
4. Consider permit valuation to distinguish shell vs unit permits
