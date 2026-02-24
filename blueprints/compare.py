"""
Metro Comparison Blueprint - Compare Raleigh to peer metros.
Part of the Raleigh Insights Ecosystem.

Data Source: FRED API
Peer Metros: Nashville, Austin, Charlotte, Denver
"""
from flask import Blueprint, render_template, jsonify
import requests
import os

from shared.cache import load_from_cache, save_to_cache

# Create blueprint
compare_bp = Blueprint('compare', __name__, url_prefix='/compare')

# =============================================================================
# API CONFIGURATION
# =============================================================================
FRED_API_KEY = os.environ.get('FRED_API_KEY', '')
FRED_BASE_URL = "https://api.stlouisfed.org/fred/series/observations"

# =============================================================================
# METRO CONFIGURATION
# Each metro has its MSA code, display name, and FRED series IDs
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

# Metric display configuration
METRIC_CONFIG = {
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


# =============================================================================
# FRED API FUNCTIONS
# =============================================================================
def fetch_fred_series(series_id, start_date=None):
    """Fetch a single FRED series."""
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

    try:
        response = requests.get(FRED_BASE_URL, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()

        observations = []
        for obs in data.get("observations", []):
            if obs.get("value") != ".":
                observations.append({
                    "date": obs["date"],
                    "value": float(obs["value"])
                })

        return {"data": observations, "error": None}

    except requests.RequestException as e:
        print(f"Error fetching FRED series {series_id}: {e}")
        return {"error": str(e), "data": []}


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
        metric_config = METRIC_CONFIG[metric_key]
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
# ROUTES
# =============================================================================
@compare_bp.route("/")
def index():
    """Render the metro comparison dashboard."""
    return render_template("compare/index.html", active_tab="compare")


@compare_bp.route("/api/overview")
def get_overview():
    """
    API endpoint for metro comparison data.
    Returns all metrics for all metros.
    """
    all_data = fetch_all_metros(start_year=2015)

    # Build comparison summary table
    comparison = {}
    for metric_key in METRIC_CONFIG.keys():
        comparison[metric_key] = {
            "name": METRIC_CONFIG[metric_key]["name"],
            "unit": METRIC_CONFIG[metric_key]["unit"],
            "format": METRIC_CONFIG[metric_key]["format"],
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


@compare_bp.route("/api/timeseries/<metric>")
def get_timeseries(metric):
    """
    API endpoint for a specific metric's time series across all metros.
    Used for trend charts.
    """
    if metric not in METRIC_CONFIG:
        return jsonify({"error": f"Unknown metric: {metric}"}), 404

    all_data = fetch_all_metros(start_year=2015)

    result = {
        "metric": metric,
        "name": METRIC_CONFIG[metric]["name"],
        "unit": METRIC_CONFIG[metric]["unit"],
        "series": {}
    }

    for metro_key, metro_data in all_data.items():
        metrics = metro_data.get("metrics", {})
        if metric in metrics:
            result["series"][metro_key] = {
                "name": metro_data["name"],
                "color": metro_data["color"],
                "observations": metrics[metric].get("observations", [])
            }

    return jsonify(result)
