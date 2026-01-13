"""
Economy Blueprint - Business growth, employment, and economic insights.
Part of the Raleigh Insights Ecosystem.

Data Sources:
- FRED API: Labor market, GDP, personal income, business applications
- Census County Business Patterns (CBP): Establishments by industry
"""
from flask import Blueprint, render_template, jsonify, request
import requests
from datetime import datetime, timedelta
import os

from shared.cache import load_from_cache, save_to_cache
from shared.geography import get_urban_ring, ZIP_CODE_CENTERS, URBAN_RING_MAP

# Create blueprint
economy_bp = Blueprint('economy', __name__, url_prefix='/economy')

# =============================================================================
# API CONFIGURATION
# =============================================================================
# FRED API - Free key from https://fred.stlouisfed.org/docs/api/api_key.html
FRED_API_KEY = os.environ.get('FRED_API_KEY', '')
FRED_BASE_URL = "https://api.stlouisfed.org/fred/series/observations"

# Census API - Free key from https://api.census.gov/data/key_signup.html
CENSUS_API_KEY = os.environ.get('CENSUS_API_KEY', '')
CENSUS_CBP_URL = "https://api.census.gov/data/2021/cbp"

# Raleigh MSA FIPS Code
RALEIGH_MSA = "39580"
WAKE_COUNTY_FIPS = "37183"

# =============================================================================
# FRED SERIES DEFINITIONS
# Comprehensive economic indicators for Raleigh MSA
# =============================================================================
FRED_SERIES = {
    # Labor Market (Raleigh-Cary MSA)
    "unemployment_rate": {
        "series_id": "RALE537URN",
        "name": "Unemployment Rate",
        "unit": "%",
        "category": "labor"
    },
    "labor_force": {
        "series_id": "RALE537LFN",
        "name": "Labor Force",
        "unit": "persons",
        "category": "labor"
    },
    "employment": {
        "series_id": "RALE537NAN",
        "name": "All Employees (Nonfarm)",
        "unit": "thousands",
        "category": "labor"
    },

    # Growth & Income (MSA 39580 = Raleigh-Cary)
    "gdp": {
        "series_id": "NGMP39580",
        "name": "GDP (Nominal)",
        "unit": "millions $",
        "category": "growth"
    },
    "real_gdp": {
        "series_id": "RGMP39580",
        "name": "Real GDP",
        "unit": "millions $",
        "category": "growth"
    },
    "personal_income": {
        "series_id": "PIPC39580",
        "name": "Per Capita Personal Income",
        "unit": "$",
        "category": "growth"
    },

    # Business & Investment
    "business_applications": {
        "series_id": "BUSAPPWNSARA39580",
        "name": "Business Applications",
        "unit": "applications",
        "category": "investment"
    },
    "high_propensity_applications": {
        "series_id": "HBAWNSARA39580",
        "name": "High-Propensity Business Applications",
        "unit": "applications",
        "category": "investment"
    },

    # Housing Market
    "housing_price_index": {
        "series_id": "ATNHPIUS39580Q",
        "name": "House Price Index",
        "unit": "index",
        "category": "housing"
    },
}

# Industry classification for Census CBP (NAICS 2-digit)
INDUSTRY_SECTORS = {
    "11": "Agriculture",
    "21": "Mining",
    "22": "Utilities",
    "23": "Construction",
    "31-33": "Manufacturing",
    "42": "Wholesale Trade",
    "44-45": "Retail Trade",
    "48-49": "Transportation",
    "51": "Information/Tech",
    "52": "Finance/Insurance",
    "53": "Real Estate",
    "54": "Professional Services",
    "55": "Management",
    "56": "Admin/Support",
    "61": "Education",
    "62": "Healthcare",
    "71": "Arts/Entertainment",
    "72": "Hospitality",
    "81": "Other Services",
    "92": "Public Admin"
}


# =============================================================================
# FRED API FUNCTIONS
# =============================================================================
def fetch_fred_series(series_id, start_date=None, end_date=None):
    """
    Fetch a single FRED series.
    Returns list of {date, value} observations.
    """
    if not FRED_API_KEY:
        return {"error": "FRED_API_KEY not configured", "data": []}

    params = {
        "series_id": series_id,
        "api_key": FRED_API_KEY,
        "file_type": "json",
        "sort_order": "asc"
    }

    if start_date:
        params["observation_start"] = start_date
    if end_date:
        params["observation_end"] = end_date

    try:
        response = requests.get(FRED_BASE_URL, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()

        observations = []
        for obs in data.get("observations", []):
            if obs.get("value") != ".":  # FRED uses "." for missing data
                observations.append({
                    "date": obs["date"],
                    "value": float(obs["value"])
                })

        return {"data": observations, "error": None}

    except requests.RequestException as e:
        print(f"Error fetching FRED series {series_id}: {e}")
        return {"error": str(e), "data": []}


def fetch_all_fred_data(start_year=2015):
    """
    Fetch all configured FRED series.
    Uses caching to minimize API calls.
    """
    cache_key = f"fred_economy_data_{start_year}"
    cached = load_from_cache(cache_key, duration_hours=24)
    if cached:
        return cached

    start_date = f"{start_year}-01-01"
    result = {}

    for key, config in FRED_SERIES.items():
        series_data = fetch_fred_series(config["series_id"], start_date=start_date)
        result[key] = {
            "name": config["name"],
            "unit": config["unit"],
            "category": config["category"],
            "series_id": config["series_id"],
            "observations": series_data["data"],
            "error": series_data.get("error")
        }

        # Get latest value
        if series_data["data"]:
            latest = series_data["data"][-1]
            result[key]["latest_value"] = latest["value"]
            result[key]["latest_date"] = latest["date"]

            # Calculate YoY change if enough data
            if len(series_data["data"]) >= 12:
                year_ago_idx = -13 if len(series_data["data"]) > 12 else 0
                year_ago = series_data["data"][year_ago_idx]["value"]
                if year_ago != 0:
                    result[key]["yoy_change"] = round(
                        (latest["value"] - year_ago) / year_ago * 100, 1
                    )

    save_to_cache(cache_key, result)
    return result


# =============================================================================
# CENSUS CBP FUNCTIONS
# =============================================================================
def fetch_census_cbp_county():
    """
    Fetch County Business Patterns data for Wake County.
    Returns establishment counts and employment by industry sector.
    """
    cache_key = "census_cbp_wake_county"
    cached = load_from_cache(cache_key, duration_hours=168)  # 7 days
    if cached:
        return cached

    if not CENSUS_API_KEY:
        # Try without key (limited access)
        api_key_param = ""
    else:
        api_key_param = f"&key={CENSUS_API_KEY}"

    # Fetch data for Wake County (FIPS 37183)
    # Variables: ESTAB (establishments), EMP (employees), PAYANN (annual payroll)
    url = f"{CENSUS_CBP_URL}?get=NAICS2017,NAICS2017_LABEL,ESTAB,EMP,PAYANN&for=county:183&in=state:37{api_key_param}"

    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        data = response.json()

        # Parse response (first row is headers)
        headers = data[0]
        rows = data[1:]

        result = {
            "by_industry": {},
            "totals": {
                "establishments": 0,
                "employees": 0,
                "payroll": 0
            }
        }

        for row in rows:
            naics = row[0]
            label = row[1]
            estab = int(row[2]) if row[2] else 0
            emp = int(row[3]) if row[3] else 0
            payroll = int(row[4]) if row[4] else 0

            # Only include 2-digit NAICS (sector level)
            if len(naics) == 2 or naics in ["31-33", "44-45", "48-49"]:
                sector_name = INDUSTRY_SECTORS.get(naics, label)
                result["by_industry"][naics] = {
                    "name": sector_name,
                    "naics": naics,
                    "establishments": estab,
                    "employees": emp,
                    "payroll": payroll,
                    "avg_wage": round(payroll * 1000 / emp) if emp > 0 else 0  # Payroll is in $1000s
                }

            # Total row (NAICS = "00")
            if naics == "00":
                result["totals"] = {
                    "establishments": estab,
                    "employees": emp,
                    "payroll": payroll
                }

        save_to_cache(cache_key, result)
        return result

    except requests.RequestException as e:
        print(f"Error fetching Census CBP data: {e}")
        return {"error": str(e), "by_industry": {}, "totals": {}}


def fetch_census_cbp_zip():
    """
    Fetch ZIP Code Business Patterns for Raleigh zip codes.
    """
    cache_key = "census_zbp_raleigh"
    cached = load_from_cache(cache_key, duration_hours=168)
    if cached:
        return cached

    # ZBP (ZIP Code Business Patterns) endpoint
    zbp_url = "https://api.census.gov/data/2021/zbp"

    if not CENSUS_API_KEY:
        api_key_param = ""
    else:
        api_key_param = f"&key={CENSUS_API_KEY}"

    result = {}

    for zip_code in ZIP_CODE_CENTERS.keys():
        url = f"{zbp_url}?get=ESTAB,EMP,PAYANN&for=zipcode:{zip_code}{api_key_param}"

        try:
            response = requests.get(url, timeout=15)
            if response.status_code == 200:
                data = response.json()
                if len(data) > 1:
                    row = data[1]
                    result[zip_code] = {
                        "establishments": int(row[0]) if row[0] else 0,
                        "employees": int(row[1]) if row[1] else 0,
                        "payroll": int(row[2]) if row[2] else 0,
                        "urban_ring": get_urban_ring(zip_code)
                    }
        except Exception as e:
            print(f"Error fetching ZBP for {zip_code}: {e}")
            continue

    save_to_cache(cache_key, result)
    return result


# =============================================================================
# DERIVED METRICS
# =============================================================================
def calculate_economic_health_score(fred_data):
    """
    Calculate a composite economic health score (0-100).
    Based on unemployment, job growth, income growth, and business formation.
    """
    score = 50  # Base score

    # Unemployment component (-20 to +20)
    unemployment = fred_data.get("unemployment_rate", {})
    if unemployment.get("latest_value"):
        # Lower is better: 3% = +20, 5% = 0, 7% = -20
        unemp_rate = unemployment["latest_value"]
        score += max(-20, min(20, (5 - unemp_rate) * 10))

    # Employment growth component (-15 to +15)
    employment = fred_data.get("employment", {})
    if employment.get("yoy_change"):
        # Higher is better: 3% growth = +15, 0% = 0, -3% = -15
        score += max(-15, min(15, employment["yoy_change"] * 5))

    # Income growth component (-10 to +10)
    income = fred_data.get("per_capita_income", {})
    if income.get("yoy_change"):
        score += max(-10, min(10, income["yoy_change"] * 2))

    # Business applications component (-5 to +5)
    business = fred_data.get("business_applications", {})
    if business.get("yoy_change"):
        score += max(-5, min(5, business["yoy_change"] * 0.5))

    return max(0, min(100, round(score)))


def calculate_industry_diversity(cbp_data):
    """
    Calculate Herfindahl-Hirschman Index (HHI) for industry diversity.
    Lower = more diverse, Higher = concentrated.
    Returns diversity score 0-100 (higher = more diverse).
    """
    industries = cbp_data.get("by_industry", {})
    total_emp = sum(ind.get("employees", 0) for ind in industries.values())

    if total_emp == 0:
        return 50

    # Calculate HHI
    hhi = sum((ind.get("employees", 0) / total_emp * 100) ** 2
              for ind in industries.values())

    # Convert to diversity score (HHI of 1000 = 100 diversity, 10000 = 0)
    diversity_score = max(0, min(100, 100 - (hhi - 1000) / 90))

    return round(diversity_score)


# =============================================================================
# ROUTES
# =============================================================================
@economy_bp.route("/")
def index():
    """Render the economy dashboard."""
    return render_template("economy/index.html", active_tab="economy")


@economy_bp.route("/api/overview")
def get_overview():
    """
    API endpoint for economy overview data.
    Returns key metrics from FRED + Census CBP.
    """
    fred_data = fetch_all_fred_data(start_year=2015)
    cbp_data = fetch_census_cbp_county()

    # Calculate derived metrics
    health_score = calculate_economic_health_score(fred_data)
    diversity_score = calculate_industry_diversity(cbp_data)

    # Format summary stats
    summary = {
        "health_score": health_score,
        "diversity_score": diversity_score,
        "unemployment_rate": fred_data.get("unemployment_rate", {}).get("latest_value"),
        "total_employment": fred_data.get("employment", {}).get("latest_value"),
        "gdp": fred_data.get("gdp", {}).get("latest_value"),
        "per_capita_income": fred_data.get("personal_income", {}).get("latest_value"),
        "total_establishments": cbp_data.get("totals", {}).get("establishments"),
        "total_employees_cbp": cbp_data.get("totals", {}).get("employees"),
        "business_applications": fred_data.get("business_applications", {}).get("latest_value"),
    }

    return jsonify({
        "summary": summary,
        "fred_data": fred_data,
        "cbp_data": cbp_data,
        "api_status": {
            "fred_configured": bool(FRED_API_KEY),
            "census_configured": bool(CENSUS_API_KEY)
        }
    })


@economy_bp.route("/api/labor")
def get_labor_market():
    """
    API endpoint for detailed labor market data.
    """
    fred_data = fetch_all_fred_data(start_year=2015)

    labor_series = {
        key: data for key, data in fred_data.items()
        if data.get("category") == "labor"
    }

    return jsonify({
        "labor_market": labor_series,
        "api_configured": bool(FRED_API_KEY)
    })


@economy_bp.route("/api/growth")
def get_growth_data():
    """
    API endpoint for GDP, income, and growth metrics.
    """
    fred_data = fetch_all_fred_data(start_year=2015)

    growth_series = {
        key: data for key, data in fred_data.items()
        if data.get("category") in ["growth", "investment"]
    }

    return jsonify({
        "growth_data": growth_series,
        "api_configured": bool(FRED_API_KEY)
    })


@economy_bp.route("/api/industries")
def get_industries():
    """
    API endpoint for industry breakdown from Census CBP.
    """
    cbp_data = fetch_census_cbp_county()

    # Sort industries by employment
    industries_sorted = sorted(
        cbp_data.get("by_industry", {}).items(),
        key=lambda x: x[1].get("employees", 0),
        reverse=True
    )

    return jsonify({
        "industries": dict(industries_sorted),
        "totals": cbp_data.get("totals", {}),
        "diversity_score": calculate_industry_diversity(cbp_data),
        "api_configured": bool(CENSUS_API_KEY)
    })


@economy_bp.route("/api/zip")
def get_zip_data():
    """
    API endpoint for business data by zip code.
    """
    zbp_data = fetch_census_cbp_zip()

    # Enrich with urban ring info
    enriched = []
    for zip_code, data in zbp_data.items():
        enriched.append({
            "zip_code": zip_code,
            "urban_ring": get_urban_ring(zip_code),
            **data
        })

    # Sort by establishments
    enriched.sort(key=lambda x: x.get("establishments", 0), reverse=True)

    return jsonify({
        "zip_data": enriched,
        "api_configured": bool(CENSUS_API_KEY)
    })


@economy_bp.route("/api/timeseries/<series_key>")
def get_timeseries(series_key):
    """
    API endpoint for a specific FRED time series.
    """
    if series_key not in FRED_SERIES:
        return jsonify({"error": f"Unknown series: {series_key}"}), 404

    fred_data = fetch_all_fred_data(start_year=2010)
    series_data = fred_data.get(series_key, {})

    return jsonify({
        "series": series_key,
        "data": series_data,
        "api_configured": bool(FRED_API_KEY)
    })
