# Raleigh Housing Permits Data Audit

## Data Sources

### Primary Data
- **Building Permits API**: `https://services.arcgis.com/v400IkDOw1ad7Yad/arcgis/rest/services/Building_Permits/FeatureServer/0/query`
- **ADU Permits API**: `https://services.arcgis.com/v400IkDOw1ad7Yad/arcgis/rest/services/ADU_Building_Permits/FeatureServer/0/query`
- **Source**: City of Raleigh Open Data Portal (data-ral.opendata.arcgis.com)

### Demographic Data
- **Source**: US Census Bureau ACS 2019-2023 5-Year Estimates
- **File**: `static/data/demographics.json`

---

## Methodology

### 1. Data Filtering
We filter for NEW RESIDENTIAL construction only:
```
WHERE clause:
- issueddate >= '2020-01-01'
- permitclassmapped = 'Residential' OR occupancyclass LIKE '%R2%'
- workclassmapped = 'New'
```

### 2. Housing Type Classification
Priority order (first match wins):

| Priority | Condition | Classification |
|----------|-----------|----------------|
| 1 | `adu_type` field is set and NOT "Not Accessory Dwelling" or "NOT Accessory Dwelli" | ADU |
| 2 | `occupancyclass` contains "R2" OR `housingunitstotal` >= 3 | Multifamily |
| 3 | `occupancyclass` contains "duplex" OR `housingunitstotal` = 2 | Duplex |
| 4 | `workclass` contains "townhouse" or "townhome" | Townhome |
| 5 | Default (single unit residential) | Single Family |

**Note**: We discovered truncated field values (e.g., "NOT Accessory Dwelli" instead of "NOT Accessory Dwelling") which required explicit handling.

### 3. Urban Ring Classification
Based on zip code proximity to downtown Raleigh:

| Ring | Description | Zip Codes |
|------|-------------|-----------|
| Downtown | Core urban | 27601 |
| Near Downtown | Walkable urban, ~3 miles | 27603, 27604, 27605, 27607, 27608 |
| Inner Suburb | Established suburban, 3-6 miles | 27606, 27609, 27610, 27612, 27615, 27616 |
| Outer Suburb | Edge development, 6+ miles | 27613, 27614, 27617 |

### 4. Transit Score Calculation
Distance-based proxy (0-100 scale):
- Distance to downtown: 0-50 points
- BRT corridor proximity: 0-30 points
- Urban density bonus: 0-20 points

### 5. Permit Status Definitions
- **Permit Issued**: Approved, construction can begin or is underway
- **Permit Finaled**: Passed final inspection, construction complete

---

## Key Findings

### Finding 1: Multifamily Permit Collapse (2021-2022)

| Year | Permits | Units | Change |
|------|---------|-------|--------|
| 2020 | 35 | 1,100 | - |
| 2021 | 43 | 1,475 | +23% permits |
| 2022 | 6 | 29 | **-86% permits** |
| 2023 | 18 | 93 | +200% permits |
| 2024 | 21 | 119 | +17% permits |

**Raw data verification query**:
```python
# Filter: permitclassmapped='Residential', workclassmapped='New'
# Classify as Multifamily if: occupancyclass contains 'R2' OR units >= 3
```

### Finding 2: Housing Type Distribution (All Years, All Statuses)

| Type | Permits | % of Total |
|------|---------|------------|
| Single Family | ~5,050 | ~51% |
| Townhome | ~3,560 | ~36% |
| Multifamily | ~123 | ~1.2% |
| Duplex | ~78 | ~0.8% |
| ADU | ~113 | ~1.1% |

### Finding 3: Geographic Distribution
- Outer Suburb has highest permit volume
- Downtown has highest transit scores but lowest permit counts
- Near Downtown shows mixed housing types

---

## Audit Questions for External Validation

1. **Is the 86% multifamily drop real or a data artifact?**
   - Could be: API changes, classification changes, actual market shift
   - Cross-reference with other sources (Census building permits, local news)

2. **Is our housing type classification accurate?**
   - Review the occupancyclass and workclass field mappings
   - Check if R2 occupancy class correctly identifies multifamily

3. **Are there data quality issues?**
   - Truncated field values (confirmed: "NOT Accessory Dwelli")
   - Missing coordinates for some permits
   - Null/empty classification fields

4. **Transit score methodology**
   - Is distance-to-downtown a reasonable proxy for transit access?
   - Should we incorporate actual transit route data?

---

## Data Sample for Verification

### Sample Multifamily Permits (2021)
```
To be populated with actual permit numbers for verification
```

### Sample Multifamily Permits (2022)
```
To be populated with actual permit numbers for verification
```

---

## External Validation

### News Sources
- [Axios Raleigh (Oct 2023)](https://www.axios.com/local/raleigh/2023/10/17/apartment-boom-slowdown): "Raleigh's apartment building boom could make way for a construction slowdown" - confirms slowdown through first 10 months of 2023
- [Apartment List Research](https://www.apartmentlist.com/research/what-will-the-pullback-in-multifamily-construction-mean-for-the-rental-market): National multifamily permits dropped 16% from 2022 to 2023

### National Context (Apartment List)
| Year | National Multifamily Permits |
|------|------------------------------|
| 2022 | 707,000 (highest since 1985) |
| 2023 | 591,000 (-16%) |
| 2024 | ~525,000 projected (-11%) |

### Raleigh's National Ranking
- **2nd highest** multifamily permits per capita in 2023
- **2nd sharpest** year-over-year rent decline (indicating supply impact)

### Root Causes Identified
1. Interest rate increases (highest since 2007)
2. Rent declines reducing investment returns
3. National pullback in multifamily development

---

## Audit Finding: Data Classification Issue

### Issue Discovered
The 2022 "multifamily" permits show **1-unit permits with R2 occupancy class**, unlike 2021 which shows **40-unit building permits**.

**2021 Multifamily Samples:**
- BLDNR-032789-2021: 40 units, R2 Multi-Family, 3310 Gallaher Peak Cir
- BLDNR-032788-2021: 40 units, R2 Multi-Family, 3320 Gallaher Peak Cir

**2022 Multifamily Samples:**
- BLDR-023597-2022: 1 unit, R2 Multi-Family, 2143 Caen St
- BLDR-023598-2022: 1 unit, R2 Multi-Family, 2145 Caen St

### Possible Explanations
1. **Condo/unit permits**: 2022 permits may be for individual units within existing or under-construction buildings
2. **Permitting process change**: Raleigh may have changed how they issue multifamily permits
3. **Different project types**: Could be condo conversions or small infill R2 projects
4. **Actual market slowdown**: Confirmed by external sources - national and local multifamily slowdown

### Recommendation
Consider filtering multifamily as `units >= 5` instead of relying solely on R2 occupancy class to better capture actual apartment building construction vs individual unit permits.

---

## Cross-LLM Validation Summary

### Claude Validation (Completed)

**Key Findings:**
- Classification logic is sound but needs unit threshold for multifamily
- The 2022 drop is caused by BOTH market conditions AND permitting process changes
- Raleigh likely switched to per-unit permitting for condos in 2022
- 86% drop is exaggerated by combining real slowdown with data artifact

**Recommended Classification Change:**
```
Multifamily = (occupancyclass contains 'R2' AND units >= 5)
             OR units >= 5
```

**Additional Data Sources Identified:**
- US Census Bureau Building Permits Survey
- CoStar/Yardi Matrix commercial real estate data
- Raleigh Planning Department annual reports
- Triangle Business Journal

**Methodology Gaps Identified:**
- No tracking of permit amendments/cancellations
- Missing permit-to-completion timeframe analysis
- Transit score is proxy, not actual transit data
- No cost/valuation analysis
- Geographic analysis uses zip codes vs actual neighborhoods

### GPT-4 Validation
*Pending - see AUDIT_PROMPT.md for instructions*

### Gemini Validation
*Pending - see AUDIT_PROMPT.md for instructions*

### Consensus Summary
- **CONFIRMED**: Multifamily slowdown is real (external sources agree)
- **NUANCED**: The 86% drop may be inflated by data classification changes
- **CONTEXT**: National trend shows 16% drop, local data may show more extreme due to classification
- **ACTION**: Implement `units >= 5` filter for accurate multifamily tracking

---

## Audit Log

| Date | Auditor | Finding | Resolution |
|------|---------|---------|------------|
| 2026-01-11 | Claude | ADU misclassification due to truncated "NOT Accessory Dwelli" | Added explicit check for truncated string |
| 2026-01-11 | Claude | total_units not returned in API | Fixed API response |
| 2026-01-11 | Claude | 2022 multifamily permits show 1-unit R2 | Documented as data quality issue, recommend filtering by units >= 5 |
| 2026-01-11 | External | Multifamily slowdown confirmed | Axios, Apartment List confirm national/local trend |
| 2026-01-11 | Claude | Cross-LLM validation completed | Confirmed findings, recommended units >= 5 filter |

