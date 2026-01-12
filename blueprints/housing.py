"""
Housing Blueprint - Building permits and residential development insights.
Part of the Raleigh Insights Ecosystem.
"""
from flask import Blueprint, render_template, jsonify, request
import requests
from datetime import datetime

from shared.cache import load_from_cache, save_to_cache
from shared.geography import (
    get_urban_ring, get_zip_for_coords, get_area_plan_for_coords,
    calculate_transit_score, ZIP_CODE_CENTERS
)
from shared.demographics import load_demographics

# Create blueprint
housing_bp = Blueprint('housing', __name__, url_prefix='/housing')

# =============================================================================
# API URLS
# =============================================================================
AREA_PLANS_URL = (
    "https://services.arcgis.com/v400IkDOw1ad7Yad/arcgis/rest/services/"
    "Area_Plan_Boundaries/FeatureServer/0/query"
)

BUILDING_PERMITS_URL = (
    "https://services.arcgis.com/v400IkDOw1ad7Yad/arcgis/rest/services/"
    "Building_Permits/FeatureServer/0/query"
)

ADU_PERMITS_URL = (
    "https://services.arcgis.com/v400IkDOw1ad7Yad/arcgis/rest/services/"
    "ADU_Building_Permits/FeatureServer/0/query"
)

BUS_STOPS_URL = (
    "https://services.arcgis.com/v400IkDOw1ad7Yad/arcgis/rest/services/"
    "GoRaleigh_Bus_Stops/FeatureServer/0/query"
)

# Legacy 180-day endpoint
ARCGIS_API_URL = (
    "https://services.arcgis.com/v400IkDOw1ad7Yad/arcgis/rest/services/"
    "Building_Permits_Issued_Past_180_days/FeatureServer/0/query"
)


# =============================================================================
# IN-MEMORY CACHES
# =============================================================================
_area_plans_cache = None
_bus_stops_cache = None


# =============================================================================
# DATA FETCHING FUNCTIONS
# =============================================================================
def fetch_area_plans():
    """Fetch area plan boundaries from Raleigh's ArcGIS API."""
    global _area_plans_cache
    if _area_plans_cache is not None:
        return _area_plans_cache

    params = {
        "f": "geojson",
        "where": "1=1",
        "outFields": "NAME",
        "returnGeometry": "true",
    }

    try:
        response = requests.get(AREA_PLANS_URL, params=params, timeout=30)
        response.raise_for_status()
        _area_plans_cache = response.json()
        return _area_plans_cache
    except requests.RequestException as e:
        print(f"Error fetching area plans: {e}")
        return {"type": "FeatureCollection", "features": []}


def fetch_bus_stops():
    """Fetch GoRaleigh bus stop locations with ridership data."""
    global _bus_stops_cache
    if _bus_stops_cache is not None:
        return _bus_stops_cache

    params = {
        "f": "geojson",
        "where": "1=1",
        "outFields": "*",
        "returnGeometry": "true"
    }
    try:
        response = requests.get(BUS_STOPS_URL, params=params, timeout=30)
        response.raise_for_status()
        _bus_stops_cache = response.json()
        return _bus_stops_cache
    except requests.RequestException as e:
        print(f"Error fetching bus stops: {e}")
        return {"type": "FeatureCollection", "features": []}


def fetch_historical_permits(start_year=2020):
    """
    Fetch 5 years of new residential building permits with pagination.
    ArcGIS limits results to ~2000 per request, so we paginate.
    """
    all_features = []
    offset = 0
    batch_size = 2000

    where_clause = (
        f"issueddate >= TIMESTAMP '{start_year}-01-01' "
        "AND (permitclassmapped = 'Residential' OR occupancyclass LIKE '%R2%') "
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
            print(f"Error fetching permits at offset {offset}: {e}")
            break

    return {"type": "FeatureCollection", "features": all_features}


def fetch_adu_permits(start_year=2020):
    """Fetch ADU-specific permits from dedicated endpoint - new construction only."""
    params = {
        "f": "geojson",
        "where": f"issueddate >= TIMESTAMP '{start_year}-01-01' AND workclassmapped = 'New'",
        "outFields": "*",
        "returnGeometry": "true"
    }
    try:
        response = requests.get(ADU_PERMITS_URL, params=params, timeout=30)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        print(f"Error fetching ADU permits: {e}")
        return {"type": "FeatureCollection", "features": []}


def merge_permit_sources(building_permits, adu_permits):
    """Merge building permits with ADU permits, avoiding duplicates."""
    existing_nums = {
        f.get("properties", {}).get("permitnum")
        for f in building_permits.get("features", [])
    }
    merged = list(building_permits.get("features", []))
    for feature in adu_permits.get("features", []):
        permit_num = feature.get("properties", {}).get("permitnum")
        if permit_num not in existing_nums:
            merged.append(feature)
    return {"type": "FeatureCollection", "features": merged}


def fetch_permits_cached():
    """Fetch permits with caching - first checks cache, then API."""
    cache_key = "new_residential_permits_2020_2025"
    cached = load_from_cache(cache_key)
    if cached:
        return cached

    print("Cache miss - fetching historical permits from API...")
    data = fetch_historical_permits(start_year=2020)
    adu_data = fetch_adu_permits()
    merged = merge_permit_sources(data, adu_data)
    save_to_cache(cache_key, merged)
    return merged


def fetch_permits():
    """Legacy function - Fetch building permits from 180-day API."""
    params = {
        "f": "geojson",
        "where": "1=1",
        "outFields": "*",
        "returnGeometry": "true",
    }

    try:
        response = requests.get(ARCGIS_API_URL, params=params, timeout=30)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        print(f"Error fetching permits: {e}")
        return {"type": "FeatureCollection", "features": []}


# =============================================================================
# HOUSING TYPE CLASSIFICATION
# =============================================================================
def classify_housing_type(props: dict) -> str:
    """
    Classify permit into housing type category.
    Returns one of: Single Family, Multifamily, Small Multifamily, Townhome, Duplex, ADU, Unknown

    Priority order (unit count takes precedence over workclass):
    1. ADU (explicit adu_type field)
    2. Multifamily (5+ units) - true apartment buildings
    3. Small Multifamily (3-4 units) - triplexes/fourplexes
    4. Duplex (2 units)
    5. Townhouse (workclass match)
    6. Single Family (workclass match or default)
    """
    workclass = (props.get("workclass") or "").strip().lower()
    occupancy = (props.get("occupancyclass") or "").strip().lower()
    adu_type = (props.get("adu_type") or "").strip()
    units = props.get("housingunitstotal") or 1

    # Priority 1: ADU (explicit field)
    if adu_type and adu_type.lower() not in ("null", "not accessory dwelling", "not accessory dwelli", ""):
        return "ADU"

    # Priority 2: Multifamily (5+ units)
    if units >= 5:
        return "Multifamily"

    # Priority 3: Small Multifamily (3-4 units)
    if units >= 3:
        return "Small Multifamily"

    # Priority 4: Duplex (2 units)
    if "duplex" in occupancy or units == 2:
        return "Duplex"

    # Priority 5: Townhouse (workclass match)
    if "townhouse" in workclass or "townhome" in workclass:
        return "Townhome"

    # Priority 6: Single Family (workclass match or default)
    if "single family" in workclass or "r3" in occupancy or "sfd" in occupancy or units == 1:
        return "Single Family"

    return "Unknown"


# =============================================================================
# PERMIT PROCESSING
# =============================================================================
def process_permits(geojson_data, area_plans=None, bus_stops=None):
    """Process permit data for visualization with enhanced classification."""
    features = geojson_data.get("features", [])

    permits = []
    type_counts = {}
    timeline_data = {}
    class_counts = {}
    housing_type_counts = {}
    work_counts = {}
    status_counts = {}
    zip_counts = {}
    neighborhood_counts = {}
    urban_ring_counts = {}
    yearly_counts = {}
    total_units = 0

    for feature in features:
        props = feature.get("properties", {})
        geometry = feature.get("geometry", {})
        coords = geometry.get("coordinates", [None, None]) if geometry else [None, None]

        permit_type = props.get("permittypemapped") or props.get("permittype") or "Unknown"
        issue_date_ms = props.get("issueddate")
        status = props.get("statuscurrentmapped") or props.get("statuscurrent") or "Unknown"
        permit_num = props.get("permitnum") or "N/A"
        description = props.get("proposedworkdescription") or props.get("description") or ""

        permit_class = props.get("permitclassmapped") or "Unknown"
        work_type = props.get("workclassmapped") or "Unknown"
        work_class = props.get("workclass") or "Unknown"
        units = props.get("housingunitstotal") or 1

        housing_type = classify_housing_type(props)

        addr_parts = [
            props.get("streetnum", ""),
            props.get("streetdirectionprefix", ""),
            props.get("streetname", ""),
            props.get("streettype", ""),
            props.get("streetdirectionsuffix", ""),
        ]
        address = " ".join(p for p in addr_parts if p).strip() or "No address"

        issue_date = None
        issue_year = None
        if issue_date_ms:
            try:
                issue_date = datetime.fromtimestamp(issue_date_ms / 1000)
                issue_year = issue_date.year
            except (ValueError, TypeError):
                pass

        lat = coords[1] if coords else None
        lng = coords[0] if coords else None

        zip_code = get_zip_for_coords(lat, lng)
        urban_ring = get_urban_ring(zip_code)
        neighborhood = get_area_plan_for_coords(lat, lng, area_plans) if area_plans else None
        transit_score = calculate_transit_score(lat, lng, bus_stops) if bus_stops else None

        permit = {
            "permit_num": permit_num,
            "type": permit_type,
            "status": status,
            "address": address,
            "description": description,
            "issue_date": issue_date.strftime("%Y-%m-%d") if issue_date else "Unknown",
            "issue_year": issue_year,
            "lng": lng,
            "lat": lat,
            "permit_class": permit_class,
            "housing_type": housing_type,
            "work_type": work_type,
            "work_class": work_class,
            "zip_code": zip_code,
            "neighborhood": neighborhood,
            "urban_ring": urban_ring,
            "transit_score": transit_score,
            "units": units,
        }
        permits.append(permit)
        total_units += units

        # Aggregations
        type_counts[permit_type] = type_counts.get(permit_type, 0) + 1
        class_counts[permit_class] = class_counts.get(permit_class, 0) + 1
        housing_type_counts[housing_type] = housing_type_counts.get(housing_type, 0) + 1
        work_counts[work_type] = work_counts.get(work_type, 0) + 1
        status_counts[status] = status_counts.get(status, 0) + 1
        urban_ring_counts[urban_ring] = urban_ring_counts.get(urban_ring, 0) + 1

        if zip_code:
            zip_counts[zip_code] = zip_counts.get(zip_code, 0) + 1

        if neighborhood:
            neighborhood_counts[neighborhood] = neighborhood_counts.get(neighborhood, 0) + 1

        if issue_year:
            yearly_counts[issue_year] = yearly_counts.get(issue_year, 0) + 1

        if issue_date:
            week_start = issue_date.strftime("%Y-%W")
            timeline_data[week_start] = timeline_data.get(week_start, 0) + 1

    sorted_timeline = sorted(timeline_data.items())

    return {
        "permits": permits,
        "total_count": len(permits),
        "total_units": total_units,
        "type_counts": dict(sorted(type_counts.items(), key=lambda x: x[1], reverse=True)),
        "class_counts": dict(sorted(class_counts.items(), key=lambda x: x[1], reverse=True)),
        "housing_type_counts": dict(sorted(housing_type_counts.items(), key=lambda x: x[1], reverse=True)),
        "work_counts": dict(sorted(work_counts.items(), key=lambda x: x[1], reverse=True)),
        "status_counts": dict(sorted(status_counts.items(), key=lambda x: x[1], reverse=True)),
        "zip_counts": dict(sorted(zip_counts.items(), key=lambda x: x[1], reverse=True)),
        "neighborhood_counts": dict(sorted(neighborhood_counts.items(), key=lambda x: x[1], reverse=True)),
        "urban_ring_counts": dict(sorted(urban_ring_counts.items(), key=lambda x: x[1], reverse=True)),
        "yearly_counts": dict(sorted(yearly_counts.items())),
        "timeline": {
            "labels": [t[0] for t in sorted_timeline],
            "values": [t[1] for t in sorted_timeline],
        },
    }


# =============================================================================
# ROUTES
# =============================================================================
@housing_bp.route("/")
def index():
    """Render the housing dashboard."""
    return render_template("housing/index.html", active_tab="housing")


@housing_bp.route("/api/permits")
def get_permits():
    """API endpoint to fetch and return processed permit data (legacy 180-day)."""
    geojson_data = fetch_permits()
    area_plans = fetch_area_plans()
    bus_stops = fetch_bus_stops()
    processed_data = process_permits(geojson_data, area_plans, bus_stops)
    return jsonify(processed_data)


@housing_bp.route("/api/permits/residential")
def get_residential_permits():
    """
    API endpoint for new residential construction permits (5 years).

    Query params:
    - year: Filter by year (2020-2025)
    - housing_type: Filter by type (Single Family, Multifamily, Townhome, Duplex, ADU)
    - zip: Filter by zip code
    - urban_ring: Filter by ring (Downtown, Near Downtown, Inner Suburb, Outer Suburb)
    - refresh: 'true' to bypass cache
    """
    refresh = request.args.get('refresh', 'false').lower() == 'true'

    if refresh:
        permits_data = fetch_historical_permits(start_year=2020)
        adu_data = fetch_adu_permits()
        merged = merge_permit_sources(permits_data, adu_data)
        save_to_cache("new_residential_permits_2020_2025", merged)
    else:
        merged = fetch_permits_cached()

    area_plans = fetch_area_plans()
    bus_stops = fetch_bus_stops()

    processed = process_permits(merged, area_plans, bus_stops)

    permits = processed["permits"]

    year_filter = request.args.get("year")
    if year_filter:
        year = int(year_filter)
        permits = [p for p in permits if p.get("issue_year") == year]

    housing_type_filter = request.args.get("housing_type")
    if housing_type_filter:
        permits = [p for p in permits if p.get("housing_type") == housing_type_filter]

    zip_filter = request.args.get("zip")
    if zip_filter:
        permits = [p for p in permits if p.get("zip_code") == zip_filter]

    urban_ring_filter = request.args.get("urban_ring")
    if urban_ring_filter:
        permits = [p for p in permits if p.get("urban_ring") == urban_ring_filter]

    filtered_housing_counts = {}
    filtered_ring_counts = {}
    filtered_yearly_counts = {}
    filtered_total_units = 0

    for p in permits:
        ht = p.get("housing_type", "Unknown")
        filtered_housing_counts[ht] = filtered_housing_counts.get(ht, 0) + 1

        ring = p.get("urban_ring", "Unknown")
        filtered_ring_counts[ring] = filtered_ring_counts.get(ring, 0) + 1

        year = p.get("issue_year")
        if year:
            filtered_yearly_counts[year] = filtered_yearly_counts.get(year, 0) + 1

        filtered_total_units += p.get("units", 1)

    return jsonify({
        "permits": permits,
        "total_count": len(permits),
        "total_units": filtered_total_units,
        "housing_type_counts": filtered_housing_counts,
        "urban_ring_counts": filtered_ring_counts,
        "yearly_counts": dict(sorted(filtered_yearly_counts.items())),
        "zip_counts": processed["zip_counts"],
        "unfiltered_totals": {
            "total_count": processed["total_count"],
            "total_units": processed["total_units"],
            "housing_type_counts": processed["housing_type_counts"],
            "urban_ring_counts": processed["urban_ring_counts"],
            "yearly_counts": processed["yearly_counts"],
        }
    })


@housing_bp.route("/api/analytics")
def get_analytics():
    """API endpoint for aggregate analytics."""
    merged = fetch_permits_cached()
    area_plans = fetch_area_plans()
    bus_stops = fetch_bus_stops()
    processed = process_permits(merged, area_plans, bus_stops)

    yearly_by_type = {}
    for permit in processed["permits"]:
        year = permit.get("issue_year")
        ht = permit.get("housing_type")
        if year and ht:
            yearly_by_type.setdefault(year, {})
            yearly_by_type[year][ht] = yearly_by_type[year].get(ht, 0) + 1

    scores = [p["transit_score"] for p in processed["permits"] if p.get("transit_score") is not None]
    transit_dist = {
        "high": len([s for s in scores if s >= 70]),
        "medium": len([s for s in scores if 40 <= s < 70]),
        "low": len([s for s in scores if s < 40]),
        "average": round(sum(scores) / len(scores), 1) if scores else 0,
    }

    ring_by_type = {}
    for permit in processed["permits"]:
        ring = permit.get("urban_ring", "Unknown")
        ht = permit.get("housing_type", "Unknown")
        ring_by_type.setdefault(ring, {})
        ring_by_type[ring][ht] = ring_by_type[ring].get(ht, 0) + 1

    units_by_type = {}
    for permit in processed["permits"]:
        ht = permit.get("housing_type", "Unknown")
        units = permit.get("units", 1)
        units_by_type[ht] = units_by_type.get(ht, 0) + units

    return jsonify({
        "summary": {
            "total_permits": processed["total_count"],
            "total_units": processed.get("total_units", 0),
        },
        "housing_type_counts": processed["housing_type_counts"],
        "units_by_type": units_by_type,
        "yearly_by_type": dict(sorted(yearly_by_type.items())),
        "transit_distribution": transit_dist,
        "urban_ring_counts": processed["urban_ring_counts"],
        "ring_by_type": ring_by_type,
        "timeline": processed["timeline"],
        "status_counts": processed["status_counts"],
    })


@housing_bp.route("/api/demographics")
def get_demographics():
    """API endpoint to return demographic data with permit counts."""
    demo_data = load_demographics()

    merged = fetch_permits_cached()
    processed_data = process_permits(merged)
    zip_counts = processed_data.get("zip_counts", {})

    result = []
    for zip_code, info in demo_data.get("zip_codes", {}).items():
        result.append({
            "zip_code": zip_code,
            "name": info.get("name", ""),
            "median_income": info.get("median_income", 0),
            "population": info.get("population", 0),
            "race": info.get("race", {}),
            "permit_count": zip_counts.get(zip_code, 0),
            "center": ZIP_CODE_CENTERS.get(zip_code, (None, None, None))[:2],
            "urban_ring": get_urban_ring(zip_code),
        })

    result.sort(key=lambda x: x["permit_count"], reverse=True)

    return jsonify({
        "source": demo_data.get("source", ""),
        "zip_data": result,
    })
