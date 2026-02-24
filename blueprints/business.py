"""
Business Blueprint - Commercial development and investment insights.
Part of the Raleigh Insights Ecosystem.

Data Source: City of Raleigh Building Permits (Non-Residential)
"""
from flask import Blueprint, render_template, jsonify
import requests
from datetime import datetime
from collections import defaultdict

from shared.cache import load_from_cache, save_to_cache
from shared.geography import get_urban_ring, get_zip_for_coords, ZIP_CODE_CENTERS

# Create blueprint
business_bp = Blueprint('business', __name__, url_prefix='/business')

# =============================================================================
# API URLS
# =============================================================================
BUILDING_PERMITS_URL = (
    "https://services.arcgis.com/v400IkDOw1ad7Yad/arcgis/rest/services/"
    "Building_Permits/FeatureServer/0/query"
)

# =============================================================================
# DATA FETCHING FUNCTIONS
# =============================================================================
def fetch_commercial_permits(start_year=2020):
    """
    Fetch new non-residential building permits with pagination.
    Filters to only NEW construction (not alterations).
    """
    cache_key = f"commercial_permits_new_{start_year}"
    cached = load_from_cache(cache_key, duration_hours=12)
    if cached:
        return cached

    print("Cache miss - fetching new commercial permits from API...")

    all_features = []
    offset = 0
    batch_size = 2000

    # Only fetch NEW construction, not alterations
    where_clause = (
        f"issueddate >= TIMESTAMP '{start_year}-01-01' "
        "AND permitclassmapped = 'Non-Residential' "
        "AND workclassmapped = 'New'"
    )

    while True:
        params = {
            "f": "geojson",
            "where": where_clause,
            "outFields": "*",
            "returnGeometry": "true",
            "resultOffset": offset,
            "resultRecordCount": batch_size,
            "orderByFields": "issueddate DESC"
        }

        try:
            response = requests.get(BUILDING_PERMITS_URL, params=params, timeout=60)
            response.raise_for_status()
            data = response.json()
            features = data.get("features", [])

            if not features:
                break

            all_features.extend(features)
            offset += batch_size

            if offset >= 50000:
                break

        except requests.RequestException as e:
            print(f"Error fetching commercial permits at offset {offset}: {e}")
            break

    result = {"type": "FeatureCollection", "features": all_features}
    save_to_cache(cache_key, result)
    return result


def fetch_pipeline_permits():
    """
    Fetch permits currently in the pipeline (not yet finaled).
    """
    cache_key = "commercial_pipeline"
    cached = load_from_cache(cache_key, duration_hours=6)
    if cached:
        return cached

    where_clause = (
        "permitclassmapped = 'Non-Residential' "
        "AND (statuscurrentmapped = 'In Review' OR statuscurrentmapped = 'Permit Issued')"
    )

    params = {
        "f": "geojson",
        "where": where_clause,
        "outFields": "*",
        "returnGeometry": "true",
        "resultRecordCount": 2000,
        "orderByFields": "applieddate DESC"
    }

    try:
        response = requests.get(BUILDING_PERMITS_URL, params=params, timeout=60)
        response.raise_for_status()
        data = response.json()
        save_to_cache(cache_key, data)
        return data
    except requests.RequestException as e:
        print(f"Error fetching pipeline permits: {e}")
        return {"type": "FeatureCollection", "features": []}


# =============================================================================
# CATEGORY MAPPING
# =============================================================================
# Map proposed_use values to simplified categories (focused on new business activity)
CATEGORY_MAP = {
    "OFFICE, BANK, AND PROFESSIONAL BUILDING": "Office",
    "STORE AND MERCANTILE BUILDING": "Retail",
    "INDUSTRIAL BUILDING": "Industrial",
    "AMUSEMENT & RECREATIONAL BUILDING": "Entertainment",
    "SERVICE STATION OR REPAIR GARAGE": "Auto Services",
    # Hospitality - multiple naming variations in data
    "HOTEL, MOTEL, OR TOURIST CABIN": "Hospitality",
    "HOTEL, MOTEL AND TOURIST CABIN": "Hospitality",
    # Institutional - churches, schools
    "CHURCH OR RELIGIOUS BUILDING": "Institutional",
    "CHURCH OR OTHER RELIGIOUS BUILDING": "Institutional",
    "SCHOOL AND OTHER EDUCATIONAL BUILDING": "Institutional",
    "SCHOOL AND EDUCATIONAL BUILDING": "Institutional",
    "LODGE ASSOCIATION": "Institutional",
    # Healthcare
    "HOSPITAL AND MEDICAL OFFICE": "Healthcare",
    "HOSPITAL AND INSTITUTIONAL BUILDING": "Healthcare",
    # Public/Utilities
    "PUBLIC WORKS & UTILITIES BUILDINGS": "Institutional",
}

# Categories to exclude (not new business activity - residential, infrastructure, alterations)
EXCLUDED_CATEGORIES = {
    # Alterations and demolitions
    "ADDITION/ALTERATION NONRESIDENTIAL BLDG",
    "ADDITION/ALTERATION RESIDENTIAL BLDG",
    "DEMOLITION OF NONRESIDENTIAL BUILDING",
    # Residential (classified as non-residential but actually housing)
    "FIVE OR MORE FAMILY BUILDING",
    "TWO FAMILY BUILDING (DUPLEX)",
    "RESIDENTIAL TOWNHOUSE",
    "RESIDENTIAL CONDOMINIUM",
    "RESIDENTIAL GARAGE OR CARPORT",
    # Infrastructure and accessories
    "SHEDS, BOATHOUSES, ACCESSORY BUILDINGS",
    "MISCELLANEOUS SUCH AS FENCES",
    "PARKING GARAGE (BLDGS & OPEN DECKED)",
}

CATEGORY_COLORS = {
    "Office": "#722F37",        # burgundy
    "Retail": "#E9B44C",        # mustard
    "Industrial": "#8ECAE6",    # powder blue
    "Entertainment": "#9DC183", # sage
    "Auto Services": "#C9705F", # terracotta
    "Hospitality": "#C3B1E1",   # lavender
    "Institutional": "#D4A373", # ochre
    "Healthcare": "#E8998D",    # salmon
    "Other": "#D4A59A",         # dusty rose
}


def get_category(proposed_use):
    """Map proposed_use to a simplified category. Returns None for excluded categories."""
    if not proposed_use:
        return None
    # Strip leading/trailing whitespace (data has tabs and spaces)
    cleaned = proposed_use.strip()
    if cleaned in EXCLUDED_CATEGORIES:
        return None
    return CATEGORY_MAP.get(cleaned, None)  # Return None for unmapped = exclude


# =============================================================================
# DATA PROCESSING FUNCTIONS
# =============================================================================
def process_permit(feature):
    """Extract and normalize permit data from a GeoJSON feature."""
    props = feature.get("properties", {})
    coords = None

    if feature.get("geometry") and feature["geometry"].get("coordinates"):
        coords = feature["geometry"]["coordinates"]

    # Parse dates
    issued_ts = props.get("issueddate")
    issued_date = None
    if issued_ts:
        try:
            issued_date = datetime.fromtimestamp(issued_ts / 1000)
        except (TypeError, ValueError):
            pass

    applied_ts = props.get("applieddate")
    applied_date = None
    if applied_ts:
        try:
            applied_date = datetime.fromtimestamp(applied_ts / 1000)
        except (TypeError, ValueError):
            pass

    # Get zip code from coordinates (GeoJSON is [lng, lat], function expects lat, lng)
    zip_code = None
    if coords:
        zip_code = get_zip_for_coords(coords[1], coords[0])

    proposed_use = props.get("proposeduse", "")
    category = get_category(proposed_use)

    # Skip excluded categories (returns None to signal exclusion)
    if category is None:
        return None

    return {
        "permit_num": props.get("permitnum"),
        "project_name": props.get("projectname") or props.get("grouptenantname") or "Unnamed Project",
        "proposed_use": proposed_use,
        "category": category,
        "work_class": props.get("workclassmapped", ""),
        "status": props.get("statuscurrentmapped", ""),
        "est_cost": props.get("estprojectcost") or 0,
        "total_sqft": props.get("totalsqft") or 0,
        "address": f"{props.get('streetnum', '')} {props.get('streetname', '')}".strip(),
        "issued_date": issued_date,
        "applied_date": applied_date,
        "issued_year": issued_date.year if issued_date else None,
        "issued_month": issued_date.month if issued_date else None,
        "zip_code": zip_code,
        "urban_ring": get_urban_ring(zip_code) if zip_code else None,
        "coords": coords
    }


def calculate_analytics(permits):
    """Calculate summary analytics from processed permits."""

    # Time series by month
    monthly_counts = defaultdict(int)
    monthly_investment = defaultdict(float)

    # By work class
    by_work_class = defaultdict(lambda: {"count": 0, "investment": 0})

    # By status
    by_status = defaultdict(int)

    # By zip code
    by_zip = defaultdict(lambda: {"count": 0, "investment": 0})

    # By year
    yearly_stats = defaultdict(lambda: {"count": 0, "investment": 0, "new_count": 0})

    # By category
    by_category = defaultdict(lambda: {"count": 0, "investment": 0})

    # Top projects
    top_projects = []

    total_investment = 0
    new_construction_count = 0

    for permit in permits:
        # Skip if no valid date
        if not permit["issued_year"]:
            continue

        year = permit["issued_year"]
        month_key = f"{year}-{permit['issued_month']:02d}"
        cost = permit["est_cost"] or 0

        # Monthly aggregation
        monthly_counts[month_key] += 1
        monthly_investment[month_key] += cost

        # Work class aggregation
        work_class = permit["work_class"] or "Unknown"
        by_work_class[work_class]["count"] += 1
        by_work_class[work_class]["investment"] += cost

        # Status aggregation
        status = permit["status"] or "Unknown"
        by_status[status] += 1

        # Zip code aggregation
        if permit["zip_code"]:
            by_zip[permit["zip_code"]]["count"] += 1
            by_zip[permit["zip_code"]]["investment"] += cost

        # Yearly aggregation
        yearly_stats[year]["count"] += 1
        yearly_stats[year]["investment"] += cost
        if work_class == "New":
            yearly_stats[year]["new_count"] += 1
            new_construction_count += 1

        # Category aggregation
        category = permit["category"]
        by_category[category]["count"] += 1
        by_category[category]["investment"] += cost

        total_investment += cost

        # Track top projects
        if cost > 100000:  # Only significant projects
            top_projects.append({
                "name": permit["project_name"],
                "cost": cost,
                "address": permit["address"],
                "use": permit["proposed_use"],
                "date": permit["issued_date"].strftime("%Y-%m-%d") if permit["issued_date"] else None,
                "status": permit["status"]
            })

    # Sort top projects by cost
    top_projects.sort(key=lambda x: x["cost"], reverse=True)

    # Convert to sorted lists for JSON
    monthly_data = [
        {"month": k, "count": monthly_counts[k], "investment": monthly_investment[k]}
        for k in sorted(monthly_counts.keys())
    ]

    yearly_data = [
        {"year": k, **v}
        for k, v in sorted(yearly_stats.items())
    ]

    zip_data = [
        {"zip_code": k, "urban_ring": get_urban_ring(k), **v}
        for k, v in sorted(by_zip.items(), key=lambda x: x[1]["investment"], reverse=True)
    ]

    category_data = [
        {"category": k, "color": CATEGORY_COLORS.get(k, "#888888"), **v}
        for k, v in sorted(by_category.items(), key=lambda x: x[1]["count"], reverse=True)
    ]

    return {
        "total_permits": len(permits),
        "total_investment": total_investment,
        "new_construction_count": new_construction_count,
        "monthly": monthly_data,
        "yearly": yearly_data,
        "by_work_class": dict(by_work_class),
        "by_status": dict(by_status),
        "by_zip": zip_data,
        "by_category": category_data,
        "top_projects": top_projects[:20]  # Top 20
    }


# =============================================================================
# ROUTES
# =============================================================================
@business_bp.route("/")
def index():
    """Render the business/commercial development dashboard."""
    return render_template("business/index.html", active_tab="business")


@business_bp.route("/api/permits")
def get_permits():
    """
    API endpoint for commercial permit data.
    Returns processed permits with analytics.
    """
    raw_data = fetch_commercial_permits(start_year=2020)

    # Filter out None (excluded categories)
    permits = [p for p in (process_permit(f) for f in raw_data.get("features", [])) if p is not None]
    analytics = calculate_analytics(permits)

    return jsonify({
        "analytics": analytics,
        "permit_count": len(permits)
    })


@business_bp.route("/api/pipeline")
def get_pipeline():
    """
    API endpoint for permits currently in the pipeline.
    """
    raw_data = fetch_pipeline_permits()

    # Filter out None (excluded categories)
    permits = [p for p in (process_permit(f) for f in raw_data.get("features", [])) if p is not None]

    # Group by status
    in_review = [p for p in permits if p and p["status"] == "In Review"]
    issued = [p for p in permits if p and p["status"] == "Permit Issued"]

    # Calculate totals
    in_review_investment = sum(p["est_cost"] for p in in_review)
    issued_investment = sum(p["est_cost"] for p in issued)

    return jsonify({
        "in_review": {
            "count": len(in_review),
            "investment": in_review_investment
        },
        "issued": {
            "count": len(issued),
            "investment": issued_investment
        },
        "total_pipeline": {
            "count": len(permits),
            "investment": in_review_investment + issued_investment
        },
        "recent_applications": sorted(
            [p for p in permits if p["applied_date"]],
            key=lambda x: x["applied_date"],
            reverse=True
        )[:10]
    })


@business_bp.route("/api/top-projects")
def get_top_projects():
    """
    API endpoint for largest commercial projects.
    """
    raw_data = fetch_commercial_permits(start_year=2020)
    # Filter out None (excluded categories)
    permits = [p for p in (process_permit(f) for f in raw_data.get("features", [])) if p is not None]

    # Filter and sort by cost
    significant = [p for p in permits if p and p["est_cost"] and p["est_cost"] > 100000]
    significant.sort(key=lambda x: x["est_cost"], reverse=True)

    # Serialize dates
    for p in significant[:25]:
        if p["issued_date"]:
            p["issued_date"] = p["issued_date"].strftime("%Y-%m-%d")
        if p["applied_date"]:
            p["applied_date"] = p["applied_date"].strftime("%Y-%m-%d")

    return jsonify({
        "top_projects": significant[:25]
    })


@business_bp.route("/api/map")
def get_map_data():
    """
    API endpoint for map visualization.
    Returns permit locations with category and cost data.
    """
    raw_data = fetch_commercial_permits(start_year=2020)
    # Filter out None (excluded categories)
    permits = [p for p in (process_permit(f) for f in raw_data.get("features", [])) if p is not None]

    # Filter permits with valid coordinates and build map points
    map_points = []
    for p in permits:
        if p and p["coords"] and p["issued_date"]:
            map_points.append({
                "coords": [p["coords"][1], p["coords"][0]],  # [lat, lng] for Leaflet
                "category": p["category"],
                "color": CATEGORY_COLORS.get(p["category"], "#888888"),
                "cost": p["est_cost"],
                "name": p["project_name"],
                "address": p["address"],
                "zip_code": p["zip_code"],
                "date": p["issued_date"].strftime("%Y-%m-%d"),
                "year": p["issued_year"],
                "work_class": p["work_class"]
            })

    # Get year range for slider
    years = sorted(set(p["year"] for p in map_points if p["year"]))
    min_year = min(years) if years else 2020
    max_year = max(years) if years else 2025

    return jsonify({
        "points": map_points,
        "category_colors": CATEGORY_COLORS,
        "total_count": len(map_points),
        "year_range": {"min": min_year, "max": max_year}
    })
