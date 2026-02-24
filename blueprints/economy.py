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
# FRED SERIES DEFINITIONS - THREE GEOGRAPHIC LEVELS
# =============================================================================

# NATIONAL INDICATORS (headline metrics at top of dashboard)
NATIONAL_SERIES = {
    "real_gdp": {
        "series_id": "GDPC1",  # Real GDP in billions of chained 2017 dollars
        "name": "Real GDP",
        "unit": "billions $",
        "frequency": "quarterly",
        "description": "Real Gross Domestic Product"
    },
    "unemployment_rate": {
        "series_id": "UNRATE",
        "name": "Unemployment Rate",
        "unit": "%",
        "frequency": "monthly",
        "description": "Civilian unemployment rate"
    },
    "real_earnings": {
        "series_id": "LES1252881600Q",  # Real median weekly earnings
        "name": "Real Median Weekly Earnings",
        "unit": "$",
        "frequency": "quarterly",
        "description": "Inflation-adjusted weekly earnings"
    },
    "core_pce": {
        "series_id": "PCEPILFE",  # Core PCE price index
        "name": "Core PCE Inflation",
        "unit": "index",
        "frequency": "monthly",
        "description": "Core Personal Consumption Expenditures price index"
    },
}

# NC STATE-LEVEL INDICATORS
NC_STATE_SERIES = {
    "unemployment_rate": {
        "series_id": "NCUR",
        "name": "NC Unemployment Rate",
        "unit": "%",
        "category": "labor"
    },
    "employment": {
        "series_id": "NCNA",
        "name": "NC Nonfarm Employment",
        "unit": "thousands",
        "category": "labor"
    },
    "labor_force": {
        "series_id": "NCLF",
        "name": "NC Labor Force",
        "unit": "thousands",
        "category": "labor"
    },
    "personal_income": {
        "series_id": "NCPCPI",
        "name": "NC Per Capita Personal Income",
        "unit": "$",
        "category": "growth"
    },
}

# RALEIGH MSA INDICATORS (main dashboard content)
RALEIGH_SERIES = {
    # Labor Market (Raleigh-Cary MSA)
    "unemployment_rate": {
        "series_id": "RALE537URN",
        "name": "Unemployment Rate",
        "unit": "%",
        "frequency": "monthly",
        "category": "labor"
    },
    "labor_force": {
        "series_id": "RALE537LFN",
        "name": "Labor Force",
        "unit": "persons",
        "frequency": "monthly",
        "category": "labor"
    },
    "employment": {
        "series_id": "RALE537NAN",
        "name": "All Employees (Nonfarm)",
        "unit": "thousands",
        "frequency": "monthly",
        "category": "labor"
    },

    # Growth & Income (MSA 39580 = Raleigh-Cary)
    "gdp": {
        "series_id": "NGMP39580",
        "name": "GDP (Nominal)",
        "unit": "millions $",
        "frequency": "annual",
        "category": "growth"
    },
    "real_gdp": {
        "series_id": "RGMP39580",
        "name": "Real GDP",
        "unit": "millions $",
        "frequency": "annual",
        "category": "growth"
    },
    "per_capita_income": {
        "series_id": "RALE537PCPI",
        "name": "Per Capita Personal Income",
        "unit": "$",
        "frequency": "annual",
        "category": "growth"
    },

    # Housing Market
    "housing_price_index": {
        "series_id": "ATNHPIUS39580Q",
        "name": "House Price Index",
        "unit": "index",
        "frequency": "quarterly",
        "category": "housing"
    },
}

# Legacy alias for backward compatibility
FRED_SERIES = RALEIGH_SERIES

# =============================================================================
# METRO COMPARISON CONFIGURATION
# Peer metros for comparing Raleigh against similar growth cities
# =============================================================================
METRO_CONFIG = {
    "raleigh": {
        "name": "Raleigh",
        "full_name": "Raleigh-Cary, NC",
        "msa_code": "39580",
        "color": "#722F37",  # Burgundy - primary/highlighted
        "series": {
            "unemployment": "RALE537URN",
            "employment": "RALE537NAN",
            "real_gdp": "RGMP39580",
            "per_capita_income": "RALE537PCPI",
            "home_price_index": "ATNHPIUS39580Q"
        }
    },
    "nashville": {
        "name": "Nashville",
        "full_name": "Nashville-Davidson, TN",
        "msa_code": "34980",
        "color": "#E9B44C",  # Mustard
        "series": {
            "unemployment": "NASH947URN",
            "employment": "NASH947NA",
            "real_gdp": "RGMP34980",
            "per_capita_income": "NASH947PCPI",
            "home_price_index": "ATNHPIUS34980Q"
        }
    },
    "austin": {
        "name": "Austin",
        "full_name": "Austin-Round Rock, TX",
        "msa_code": "12420",
        "color": "#9DC183",  # Sage
        "series": {
            "unemployment": "AUST448URN",
            "employment": "AUST448NA",
            "real_gdp": "RGMP12420",
            "per_capita_income": "AUST448PCPI",
            "home_price_index": "ATNHPIUS12420Q"
        }
    },
    "charlotte": {
        "name": "Charlotte",
        "full_name": "Charlotte-Concord, NC-SC",
        "msa_code": "16740",
        "color": "#8ECAE6",  # Powder Blue
        "series": {
            "unemployment": "CHAR737URN",
            "employment": "CHAR737NA",
            "real_gdp": "RGMP16740",
            "per_capita_income": "CHAR737PCPI",
            "home_price_index": "ATNHPIUS16740Q"
        }
    },
    "denver": {
        "name": "Denver",
        "full_name": "Denver-Aurora, CO",
        "msa_code": "19740",
        "color": "#C3B1E1",  # Lavender
        "series": {
            "unemployment": "DENV708URN",
            "employment": "DENV708NA",
            "real_gdp": "RGMP19740",
            "per_capita_income": "DENV708PCPI",
            "home_price_index": "ATNHPIUS19740Q"
        }
    }
}

COMPARISON_METRIC_CONFIG = {
    "unemployment": {
        "name": "Unemployment Rate",
        "unit": "%",
        "frequency": "monthly",
        "format": "percent"
    },
    "employment": {
        "name": "Nonfarm Employment",
        "unit": "thousands",
        "frequency": "monthly",
        "format": "number"
    },
    "real_gdp": {
        "name": "Real GDP",
        "unit": "millions $",
        "frequency": "annual",
        "format": "billions"
    },
    "per_capita_income": {
        "name": "Per Capita Income",
        "unit": "$",
        "frequency": "annual",
        "format": "currency"
    },
    "home_price_index": {
        "name": "Home Price Index",
        "unit": "index",
        "frequency": "quarterly",
        "format": "yoy_change"
    }
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
# GLOBAL TRADE DATA
# Source: ITA Metropolitan Export Series (https://www.trade.gov/ita-metropolitan-export-series)
# Data updated annually - last update: 2023 data
# =============================================================================
TRADE_DATA = {
    "data_year": 2023,
    "source": "ITA Metropolitan Export Series",
    "source_url": "https://www.trade.gov/ita-metropolitan-export-series",

    # Raleigh-Cary MSA exports
    "raleigh_msa": {
        "name": "Raleigh-Cary MSA",
        "total_exports": 6.0,  # billions USD
        "yoy_change": 3.2,  # percent
        "export_intensity": 5.8,  # exports as % of GDP
    },

    # Combined Triangle region
    "triangle_region": {
        "name": "Research Triangle",
        "total_exports": 10.9,  # Raleigh + Durham-Chapel Hill
        "note": "Raleigh-Cary ($6.0B) + Durham-Chapel Hill ($4.9B)"
    },

    # Top export industries (Raleigh MSA)
    "top_industries": [
        {"name": "Pharmaceuticals & Medicines", "value": 1.8, "percent": 30.0},
        {"name": "Computer & Electronics", "value": 0.9, "percent": 15.0},
        {"name": "Machinery", "value": 0.7, "percent": 11.7},
        {"name": "Chemicals", "value": 0.5, "percent": 8.3},
        {"name": "Transportation Equipment", "value": 0.4, "percent": 6.7},
        {"name": "Electrical Equipment", "value": 0.3, "percent": 5.0},
        {"name": "Plastics & Rubber", "value": 0.2, "percent": 3.3},
        {"name": "Food & Beverages", "value": 0.2, "percent": 3.3},
    ],

    # Top destination countries (NC state data, representative of Triangle)
    "top_destinations": [
        {"country": "Canada", "value": 1.2, "percent": 20.2, "flag": "🇨🇦"},
        {"country": "China", "value": 0.8, "percent": 13.8, "flag": "🇨🇳"},
        {"country": "Mexico", "value": 0.7, "percent": 11.7, "flag": "🇲🇽"},
        {"country": "France", "value": 0.4, "percent": 6.7, "flag": "🇫🇷"},
        {"country": "Japan", "value": 0.3, "percent": 5.0, "flag": "🇯🇵"},
        {"country": "Germany", "value": 0.3, "percent": 5.0, "flag": "🇩🇪"},
        {"country": "United Kingdom", "value": 0.2, "percent": 3.3, "flag": "🇬🇧"},
        {"country": "Belgium", "value": 0.2, "percent": 3.3, "flag": "🇧🇪"},
    ],

    # Historical trend (Raleigh MSA total exports in billions)
    "export_trend": [
        {"year": 2018, "value": 4.8},
        {"year": 2019, "value": 5.1},
        {"year": 2020, "value": 4.6},  # COVID dip
        {"year": 2021, "value": 5.2},
        {"year": 2022, "value": 5.7},
        {"year": 2023, "value": 6.0},
    ],

    # Key trading context
    "context": {
        "nc_total_exports": 42.8,  # NC state total in billions
        "raleigh_share_of_nc": 14.0,  # percent
        "us_rank": 47,  # Raleigh MSA rank among US metros
        "top_50_msa": True,
    }
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
    Fetch all configured FRED series for Raleigh MSA.
    Uses caching to minimize API calls.

    YoY calculations based on frequency:
    - Monthly: compare to 12 months ago
    - Quarterly: compare to 4 quarters ago
    - Annual: compare to 1 year ago
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
            "category": config.get("category", ""),
            "frequency": config.get("frequency", "monthly"),
            "series_id": config["series_id"],
            "observations": series_data["data"],
            "error": series_data.get("error")
        }

        # Get latest value
        if series_data["data"]:
            latest = series_data["data"][-1]
            result[key]["latest_value"] = latest["value"]
            result[key]["latest_date"] = latest["date"]

            # Calculate YoY change based on frequency
            frequency = config.get("frequency", "monthly")
            if frequency == "monthly":
                periods_back = 12
            elif frequency == "quarterly":
                periods_back = 4
            else:  # annual
                periods_back = 1

            # Need at least periods_back + 1 observations for YoY calc
            if len(series_data["data"]) > periods_back:
                year_ago_idx = len(series_data["data"]) - periods_back - 1
                year_ago = series_data["data"][year_ago_idx]["value"]
                if year_ago != 0:
                    result[key]["yoy_change"] = round(
                        (latest["value"] - year_ago) / year_ago * 100, 1
                    )

    save_to_cache(cache_key, result)
    return result


def fetch_national_indicators(start_year=2020):
    """
    Fetch national economic indicators for context at top of dashboard.
    Returns latest values and YoY changes for GDP, unemployment, wages, inflation.

    YoY calculations:
    - Monthly series (UNRATE, PCEPILFE): compare to 12 months ago
    - Quarterly series (GDPC1, LES1252881600Q): compare to 4 quarters ago
    """
    cache_key = f"fred_national_{start_year}"
    cached = load_from_cache(cache_key, duration_hours=24)
    if cached:
        return cached

    start_date = f"{start_year}-01-01"
    result = {}

    for key, config in NATIONAL_SERIES.items():
        series_data = fetch_fred_series(config["series_id"], start_date=start_date)
        result[key] = {
            "name": config["name"],
            "unit": config["unit"],
            "series_id": config["series_id"],
            "frequency": config.get("frequency", "monthly"),
            "description": config.get("description", ""),
            "observations": series_data["data"],
            "error": series_data.get("error")
        }

        if series_data["data"]:
            latest = series_data["data"][-1]
            result[key]["latest_value"] = latest["value"]
            result[key]["latest_date"] = latest["date"]

            # Calculate YoY change based on frequency
            frequency = config.get("frequency", "monthly")
            if frequency == "monthly":
                periods_back = 12  # 12 months for YoY
            else:  # quarterly
                periods_back = 4   # 4 quarters for YoY

            # Need at least periods_back + 1 observations for YoY calc
            if len(series_data["data"]) > periods_back:
                year_ago_idx = len(series_data["data"]) - periods_back - 1
                year_ago = series_data["data"][year_ago_idx]["value"]
                if year_ago != 0:
                    result[key]["yoy_change"] = round(
                        (latest["value"] - year_ago) / year_ago * 100, 1
                    )

    save_to_cache(cache_key, result)
    return result


def fetch_nc_indicators(start_year=2015):
    """
    Fetch North Carolina state-level economic indicators.
    """
    cache_key = f"fred_nc_{start_year}"
    cached = load_from_cache(cache_key, duration_hours=24)
    if cached:
        return cached

    start_date = f"{start_year}-01-01"
    result = {}

    for key, config in NC_STATE_SERIES.items():
        series_data = fetch_fred_series(config["series_id"], start_date=start_date)
        result[key] = {
            "name": config["name"],
            "unit": config["unit"],
            "category": config.get("category", ""),
            "series_id": config["series_id"],
            "observations": series_data["data"],
            "error": series_data.get("error")
        }

        if series_data["data"]:
            latest = series_data["data"][-1]
            result[key]["latest_value"] = latest["value"]
            result[key]["latest_date"] = latest["date"]

            # Calculate YoY change
            if len(series_data["data"]) >= 12:
                year_ago_idx = max(0, len(series_data["data"]) - 13)
                year_ago = series_data["data"][year_ago_idx]["value"]
                if year_ago != 0:
                    result[key]["yoy_change"] = round(
                        (latest["value"] - year_ago) / year_ago * 100, 1
                    )

    save_to_cache(cache_key, result)
    return result


# =============================================================================
# METRO COMPARISON FUNCTIONS
# =============================================================================
def fetch_metro_data(metro_key, start_year=2015):
    """
    Fetch all metrics for a single metro.
    Returns dict with latest values and YoY changes.
    """
    cache_key = f"fred_metro_{metro_key}_{start_year}"
    cached = load_from_cache(cache_key, duration_hours=24)
    if cached:
        return cached

    metro = METRO_CONFIG.get(metro_key)
    if not metro:
        return {"error": f"Unknown metro: {metro_key}"}

    start_date = f"{start_year}-01-01"
    result = {
        "name": metro["name"],
        "full_name": metro["full_name"],
        "color": metro["color"],
        "metrics": {}
    }

    for metric_key, series_id in metro["series"].items():
        metric_config = COMPARISON_METRIC_CONFIG[metric_key]
        series_data = fetch_fred_series(series_id, start_date=start_date)

        metric_result = {
            "name": metric_config["name"],
            "unit": metric_config["unit"],
            "series_id": series_id,
            "observations": series_data["data"],
            "error": series_data.get("error")
        }

        if series_data["data"]:
            latest = series_data["data"][-1]
            metric_result["latest_value"] = latest["value"]
            metric_result["latest_date"] = latest["date"]

            # Calculate YoY change based on frequency
            frequency = metric_config["frequency"]
            if frequency == "monthly":
                periods_back = 12
            elif frequency == "quarterly":
                periods_back = 4
            else:  # annual
                periods_back = 1

            if len(series_data["data"]) > periods_back:
                year_ago_idx = len(series_data["data"]) - periods_back - 1
                year_ago = series_data["data"][year_ago_idx]["value"]
                if year_ago != 0:
                    metric_result["yoy_change"] = round(
                        (latest["value"] - year_ago) / year_ago * 100, 1
                    )

        result["metrics"][metric_key] = metric_result

    save_to_cache(cache_key, result)
    return result


def fetch_all_metros(start_year=2015):
    """Fetch data for all configured metros."""
    results = {}
    for metro_key in METRO_CONFIG.keys():
        results[metro_key] = fetch_metro_data(metro_key, start_year)
    return results


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

            # Only include 2-digit NAICS (sector level), excluding "00" total
            if (len(naics) == 2 or naics in ["31-33", "44-45", "48-49"]) and naics != "00":
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
    Returns hierarchical data: National → Raleigh MSA → NC State.
    """
    # Fetch all three geographic levels
    national_data = fetch_national_indicators(start_year=2020)
    raleigh_data = fetch_all_fred_data(start_year=2015)
    nc_data = fetch_nc_indicators(start_year=2015)
    cbp_data = fetch_census_cbp_county()

    # Calculate derived metrics for Raleigh
    health_score = calculate_economic_health_score(raleigh_data)
    diversity_score = calculate_industry_diversity(cbp_data)

    # Format national headline indicators
    national_summary = {
        "real_gdp_yoy": national_data.get("real_gdp", {}).get("yoy_change"),
        "real_gdp_date": national_data.get("real_gdp", {}).get("latest_date"),
        "unemployment_rate": national_data.get("unemployment_rate", {}).get("latest_value"),
        "unemployment_date": national_data.get("unemployment_rate", {}).get("latest_date"),
        "real_earnings": national_data.get("real_earnings", {}).get("latest_value"),
        "real_earnings_yoy": national_data.get("real_earnings", {}).get("yoy_change"),
        "core_pce_yoy": national_data.get("core_pce", {}).get("yoy_change"),
        "core_pce_date": national_data.get("core_pce", {}).get("latest_date"),
    }

    # Format Raleigh summary stats
    raleigh_summary = {
        "health_score": health_score,
        "diversity_score": diversity_score,
        "unemployment_rate": raleigh_data.get("unemployment_rate", {}).get("latest_value"),
        "total_employment": raleigh_data.get("employment", {}).get("latest_value"),
        "gdp": raleigh_data.get("real_gdp", {}).get("latest_value"),
        "per_capita_income": raleigh_data.get("per_capita_income", {}).get("latest_value"),
        "home_price_yoy": raleigh_data.get("housing_price_index", {}).get("yoy_change"),
        "home_price_index": raleigh_data.get("housing_price_index", {}).get("latest_value"),
        "total_establishments": cbp_data.get("totals", {}).get("establishments"),
        "total_employees_cbp": cbp_data.get("totals", {}).get("employees"),
    }

    # Format NC summary stats
    nc_summary = {
        "unemployment_rate": nc_data.get("unemployment_rate", {}).get("latest_value"),
        "employment": nc_data.get("employment", {}).get("latest_value"),
        "labor_force": nc_data.get("labor_force", {}).get("latest_value"),
        "personal_income": nc_data.get("personal_income", {}).get("latest_value"),
    }

    return jsonify({
        "national": {
            "summary": national_summary,
            "data": national_data
        },
        "raleigh": {
            "summary": raleigh_summary,
            "data": raleigh_data,
            "cbp_data": cbp_data
        },
        "nc": {
            "summary": nc_summary,
            "data": nc_data
        },
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


@economy_bp.route("/api/metro-comparison")
def get_metro_comparison():
    """
    API endpoint for metro comparison data.
    Returns all metrics for all peer metros.
    """
    all_data = fetch_all_metros(start_year=2015)

    # Build comparison summary table
    comparison = {}
    for metric_key in COMPARISON_METRIC_CONFIG.keys():
        comparison[metric_key] = {
            "name": COMPARISON_METRIC_CONFIG[metric_key]["name"],
            "unit": COMPARISON_METRIC_CONFIG[metric_key]["unit"],
            "format": COMPARISON_METRIC_CONFIG[metric_key]["format"],
            "values": {}
        }
        for metro_key, metro_data in all_data.items():
            metrics = metro_data.get("metrics", {})
            if metric_key in metrics:
                comparison[metric_key]["values"][metro_key] = {
                    "latest": metrics[metric_key].get("latest_value"),
                    "yoy_change": metrics[metric_key].get("yoy_change"),
                    "date": metrics[metric_key].get("latest_date")
                }

    # Build metro list with colors
    metros = []
    for metro_key, config in METRO_CONFIG.items():
        metros.append({
            "key": metro_key,
            "name": config["name"],
            "full_name": config["full_name"],
            "color": config["color"]
        })

    return jsonify({
        "metros": metros,
        "comparison": comparison,
        "metro_data": all_data,
        "api_status": {
            "fred_configured": bool(FRED_API_KEY)
        }
    })


@economy_bp.route("/api/trade")
def get_trade_data():
    """
    API endpoint for global trade data.
    Returns export data for Raleigh MSA from ITA Metropolitan Export Series.
    Data is updated annually.
    """
    return jsonify({
        "trade_data": TRADE_DATA,
        "data_year": TRADE_DATA["data_year"],
        "source": TRADE_DATA["source"],
        "source_url": TRADE_DATA["source_url"]
    })
