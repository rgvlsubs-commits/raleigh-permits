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
[Paste response here]

### Gemini Response
[Paste response here]

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

- [x] Classification logic reviewed (Claude)
- [x] Multifamily drop explanation assessed (Claude + external sources)
- [x] Alternative data sources identified (Claude)
- [x] Methodology improvements suggested (Claude)
- [ ] GPT-4 validation completed
- [ ] Gemini validation completed
- [ ] Consensus on findings reached

---

## HOW TO COMPLETE CROSS-LLM VALIDATION

1. Copy the "PROMPT FOR EXTERNAL VALIDATION" section above (lines 7-55)
2. Paste into ChatGPT (GPT-4) and Gemini
3. Copy their responses back into this document
4. Compare findings across all three LLMs
5. Document any disagreements or unique insights
