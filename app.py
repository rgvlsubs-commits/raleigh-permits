from flask import Flask, render_template, jsonify, request
import requests
from datetime import datetime, timedelta
from pathlib import Path
import json
import os
import math

app = Flask(__name__)

# =============================================================================
# CACHE CONFIGURATION
# =============================================================================
CACHE_DIR = Path(__file__).parent / "cache"
CACHE_DURATION_HOURS = 24


def get_cache_path(cache_key: str) -> Path:
    """Generate cache file path from key."""
    CACHE_DIR.mkdir(exist_ok=True)
    return CACHE_DIR / f"{cache_key}.json"


def is_cache_valid(cache_path: Path) -> bool:
    """Check if cache exists and is less than 24 hours old."""
    if not cache_path.exists():
        return False
    mtime = datetime.fromtimestamp(cache_path.stat().st_mtime)
    return (datetime.now() - mtime) < timedelta(hours=CACHE_DURATION_HOURS)


def load_from_cache(cache_key: str):
    """Load data from cache if valid, else return None."""
    cache_path = get_cache_path(cache_key)
    if is_cache_valid(cache_path):
        with open(cache_path, 'r') as f:
            return json.load(f)
    return None


def save_to_cache(cache_key: str, data):
    """Save data to cache file."""
    cache_path = get_cache_path(cache_key)
    with open(cache_path, 'w') as f:
        json.dump(data, f)


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

# Legacy 180-day endpoint (kept for backwards compatibility)
ARCGIS_API_URL = (
    "https://services.arcgis.com/v400IkDOw1ad7Yad/arcgis/rest/services/"
    "Building_Permits_Issued_Past_180_days/FeatureServer/0/query"
)


# =============================================================================
# URBAN RING CLASSIFICATION
# =============================================================================
URBAN_RING_MAP = {
    # Downtown (core urban)
    "27601": "Downtown",

    # Near Downtown (walkable urban neighborhoods within ~3 miles)
    "27603": "Near Downtown",
    "27604": "Near Downtown",
    "27605": "Near Downtown",
    "27607": "Near Downtown",
    "27608": "Near Downtown",

    # Inner Suburb (established suburban, 3-6 miles from downtown)
    "27606": "Inner Suburb",
    "27609": "Inner Suburb",
    "27610": "Inner Suburb",
    "27612": "Inner Suburb",
    "27615": "Inner Suburb",
    "27616": "Inner Suburb",

    # Outer Suburb (newer edge development, 6+ miles)
    "27613": "Outer Suburb",
    "27614": "Outer Suburb",
    "27617": "Outer Suburb",

    # Neighboring municipalities
    "27502": "Outer Suburb",   # Apex
    "27511": "Inner Suburb",   # Cary West
    "27513": "Inner Suburb",   # Cary Central
    "27518": "Outer Suburb",   # Cary South
    "27519": "Outer Suburb",   # Cary Preston
    "27526": "Outer Suburb",   # Fuquay-Varina
    "27529": "Inner Suburb",   # Garner
    "27539": "Outer Suburb",   # Apex South
    "27540": "Outer Suburb",   # Holly Springs
    "27560": "Inner Suburb",   # Morrisville
    "27587": "Outer Suburb",   # Wake Forest
    "27591": "Outer Suburb",   # Wendell
    "27597": "Outer Suburb",   # Zebulon
}


def get_urban_ring(zip_code: str) -> str:
    """Get urban ring classification for a zip code."""
    if not zip_code:
        return "Unknown"
    return URBAN_RING_MAP.get(zip_code, "Unknown")


# =============================================================================
# ZIP CODE CENTERS (extended with neighboring municipalities)
# =============================================================================
ZIP_CODE_CENTERS = {
    # Raleigh core
    "27601": (35.7796, -78.6382, 0.02),
    "27603": (35.7350, -78.6650, 0.04),
    "27604": (35.8050, -78.5800, 0.04),
    "27605": (35.7950, -78.6550, 0.025),
    "27606": (35.7600, -78.7100, 0.04),
    "27607": (35.8100, -78.6800, 0.03),
    "27608": (35.8050, -78.6350, 0.02),
    "27609": (35.8400, -78.6300, 0.04),
    "27610": (35.7500, -78.5500, 0.05),
    "27612": (35.8450, -78.7050, 0.04),
    "27613": (35.8900, -78.7500, 0.05),
    "27614": (35.9500, -78.6500, 0.05),
    "27615": (35.8700, -78.6200, 0.04),
    "27616": (35.8650, -78.5350, 0.05),
    "27617": (35.9000, -78.8000, 0.04),
    # Neighboring municipalities
    "27502": (35.7310, -78.8500, 0.05),  # Apex
    "27511": (35.7920, -78.7810, 0.04),  # Cary West
    "27513": (35.7870, -78.7970, 0.04),  # Cary Central
    "27518": (35.7340, -78.7720, 0.04),  # Cary South
    "27519": (35.8120, -78.8210, 0.05),  # Cary Preston
    "27526": (35.5840, -78.7990, 0.05),  # Fuquay-Varina
    "27529": (35.7110, -78.6140, 0.05),  # Garner
    "27539": (35.6890, -78.8540, 0.05),  # Apex South
    "27540": (35.6510, -78.8330, 0.05),  # Holly Springs
    "27560": (35.8230, -78.8250, 0.04),  # Morrisville
    "27587": (35.9800, -78.5100, 0.05),  # Wake Forest
    "27591": (35.7810, -78.3690, 0.04),  # Wendell
    "27597": (35.8230, -78.3150, 0.04),  # Zebulon
}


# =============================================================================
# BRT CORRIDORS (approximate centerline coordinates)
# =============================================================================
BRT_CORRIDORS = {
    "New Bern Ave (Eastern)": [(35.7796, -78.6382), (35.7800, -78.5500)],
    "Capital Blvd (Southern)": [(35.7796, -78.6382), (35.7000, -78.6300)],
    "Western Blvd": [(35.7796, -78.6382), (35.7600, -78.7500)],
}


# =============================================================================
# IN-MEMORY CACHES
# =============================================================================
_area_plans_cache = None
_bus_stops_cache = None


# =============================================================================
# GEOGRAPHIC UTILITIES
# =============================================================================
def haversine_distance(lat1, lon1, lat2, lon2):
    """Calculate distance between two points in miles."""
    R = 3959  # Earth radius in miles
    lat1_rad, lat2_rad = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon/2)**2
    return R * 2 * math.asin(math.sqrt(a))


def point_in_polygon(x, y, polygon):
    """Ray casting algorithm to check if point is in polygon."""
    n = len(polygon)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def get_area_plan_for_coords(lat, lng, area_plans):
    """Find which area plan a point falls within."""
    if not lat or not lng or not area_plans:
        return None

    for feature in area_plans.get("features", []):
        name = feature.get("properties", {}).get("NAME")
        geometry = feature.get("geometry", {})

        if geometry.get("type") == "Polygon":
            for ring in geometry.get("coordinates", []):
                if point_in_polygon(lng, lat, ring):
                    return name
        elif geometry.get("type") == "MultiPolygon":
            for polygon in geometry.get("coordinates", []):
                for ring in polygon:
                    if point_in_polygon(lng, lat, ring):
                        return name

    return None


def get_zip_for_coords(lat, lng):
    """Find the zip code for given coordinates."""
    if not lat or not lng:
        return None

    best_zip = None
    best_dist = float('inf')

    for zip_code, (clat, clng, radius) in ZIP_CODE_CENTERS.items():
        dist = ((lat - clat) ** 2 + (lng - clng) ** 2) ** 0.5
        if dist < radius and dist < best_dist:
            best_dist = dist
            best_zip = zip_code

    return best_zip


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
    Server-side filter reduces data from ~180k to ~15k permits.
    """
    all_features = []
    offset = 0
    batch_size = 2000

    # Server-side filter: New residential housing (includes R2 multifamily)
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

            # Safety limit to prevent infinite loops
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
    """
    Merge building permits with ADU permits.
    Uses permitnum as unique key to avoid duplicates.
    """
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
    Returns one of: Single Family, Multifamily, Townhome, Duplex, ADU, Unknown

    Priority order (unit count takes precedence over workclass):
    1. ADU (explicit adu_type field)
    2. Multifamily (R2 occupancy or 3+ units)
    3. Duplex (2 units)
    4. Townhouse (workclass match)
    5. Single Family (workclass match or default)
    """
    workclass = (props.get("workclass") or "").strip().lower()
    occupancy = (props.get("occupancyclass") or "").strip().lower()
    adu_type = (props.get("adu_type") or "").strip()
    units = props.get("housingunitstotal") or 1

    # Priority 1: ADU (explicit field)
    # Note: "NOT Accessory Dwelli" is a truncated version in the data
    if adu_type and adu_type.lower() not in ("null", "not accessory dwelling", "not accessory dwelli", ""):
        return "ADU"

    # Priority 2: Multifamily (R2 occupancy or 3+ units)
    if "r2" in occupancy or "residential 2" in occupancy or units >= 3:
        return "Multifamily"

    # Priority 3: Duplex (2 units)
    if "duplex" in occupancy or units == 2:
        return "Duplex"

    # Priority 4: Townhouse (workclass match)
    if "townhouse" in workclass or "townhome" in workclass:
        return "Townhome"

    # Priority 5: Single Family (workclass match or default)
    if "single family" in workclass or "r3" in occupancy or "sfd" in occupancy or units == 1:
        return "Single Family"

    return "Unknown"


# =============================================================================
# TRANSIT SCORE CALCULATION
# =============================================================================
def calculate_brt_proximity(lat, lon):
    """Calculate BRT proximity bonus (0-30 points)."""
    min_dist = float('inf')
    for corridor, coords in BRT_CORRIDORS.items():
        for clat, clon in coords:
            dist = haversine_distance(lat, lon, clat, clon)
            min_dist = min(min_dist, dist)

    if min_dist <= 0.5:
        return 30
    elif min_dist <= 1.5:
        return 30 * (1 - (min_dist - 0.5) / 1.0)
    return 0


def calculate_transit_score(lat, lon, bus_stops=None):
    """
    Calculate transit accessibility score (0-100) using distance-based metrics.
    
    Uses distance to downtown and major transit corridors as proxies since
    the bus stops API requires authentication.
    
    Components:
    - Distance to downtown Raleigh: 0-50 points (closer = higher)
    - BRT/major corridor proximity: 0-30 points  
    - Urban density bonus: 0-20 points (based on zip code ring)
    """
    if not lat or not lon:
        return None

    score = 0
    
    # Downtown Raleigh center coordinates
    DOWNTOWN_LAT, DOWNTOWN_LON = 35.7796, -78.6382
    
    # Distance to downtown (0-50 points)
    dist_to_downtown = haversine_distance(lat, lon, DOWNTOWN_LAT, DOWNTOWN_LON)
    if dist_to_downtown <= 1.0:
        score += 50
    elif dist_to_downtown <= 3.0:
        score += 50 * (1 - (dist_to_downtown - 1.0) / 2.0)
    elif dist_to_downtown <= 6.0:
        score += 25 * (1 - (dist_to_downtown - 3.0) / 3.0)
    elif dist_to_downtown <= 10.0:
        score += 10 * (1 - (dist_to_downtown - 6.0) / 4.0)

    # BRT/Major corridor proximity (0-30 points)
    brt_bonus = calculate_brt_proximity(lat, lon)
    score += brt_bonus
    
    # Density bonus based on distance (0-20 points)
    # Inner areas tend to have better transit coverage
    if dist_to_downtown <= 2.0:
        score += 20
    elif dist_to_downtown <= 5.0:
        score += 15
    elif dist_to_downtown <= 8.0:
        score += 10
    elif dist_to_downtown <= 12.0:
        score += 5

    return round(min(100, score), 1)


# =============================================================================
# DEMOGRAPHICS
# =============================================================================
DEMOGRAPHICS_FILE = os.path.join(
    os.path.dirname(__file__), 'static', 'data', 'demographics.json'
)


def load_demographics():
    """Load demographic data from static file."""
    try:
        with open(DEMOGRAPHICS_FILE, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"zip_codes": {}}


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
    housing_type_counts = {}  # New 5-type classification
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

        # Extract permit info
        permit_type = props.get("permittypemapped") or props.get("permittype") or "Unknown"
        issue_date_ms = props.get("issueddate")
        status = props.get("statuscurrentmapped") or props.get("statuscurrent") or "Unknown"
        permit_num = props.get("permitnum") or "N/A"
        description = props.get("proposedworkdescription") or props.get("description") or ""

        # Category fields
        permit_class = props.get("permitclassmapped") or "Unknown"
        work_type = props.get("workclassmapped") or "Unknown"
        work_class = props.get("workclass") or "Unknown"
        units = props.get("housingunitstotal") or 1

        # Classify housing type using our 5-type system
        housing_type = classify_housing_type(props)

        # Build address from components
        addr_parts = [
            props.get("streetnum", ""),
            props.get("streetdirectionprefix", ""),
            props.get("streetname", ""),
            props.get("streettype", ""),
            props.get("streetdirectionsuffix", ""),
        ]
        address = " ".join(p for p in addr_parts if p).strip() or "No address"

        # Convert timestamp
        issue_date = None
        issue_year = None
        if issue_date_ms:
            try:
                issue_date = datetime.fromtimestamp(issue_date_ms / 1000)
                issue_year = issue_date.year
            except (ValueError, TypeError):
                pass

        # Get coordinates
        lat = coords[1] if coords else None
        lng = coords[0] if coords else None

        # Determine zip code
        zip_code = get_zip_for_coords(lat, lng)

        # Determine urban ring
        urban_ring = get_urban_ring(zip_code)

        # Determine neighborhood/area plan
        neighborhood = get_area_plan_for_coords(lat, lng, area_plans) if area_plans else None

        # Calculate transit score
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

        # Group by week for timeline
        if issue_date:
            week_start = issue_date.strftime("%Y-%W")
            timeline_data[week_start] = timeline_data.get(week_start, 0) + 1

    # Sort results
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
@app.route("/")
def index():
    """Render the main page."""
    return render_template("index.html")


@app.route("/api/permits")
def get_permits():
    """API endpoint to fetch and return processed permit data (legacy 180-day)."""
    geojson_data = fetch_permits()
    area_plans = fetch_area_plans()
    bus_stops = fetch_bus_stops()
    processed_data = process_permits(geojson_data, area_plans, bus_stops)
    return jsonify(processed_data)


@app.route("/api/permits/residential")
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

    # Fetch supporting data
    area_plans = fetch_area_plans()
    bus_stops = fetch_bus_stops()

    # Process permits
    processed = process_permits(merged, area_plans, bus_stops)

    # Apply filters
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

    # Recalculate counts based on filtered results
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


@app.route("/api/analytics")
def get_analytics():
    """API endpoint for aggregate analytics."""
    merged = fetch_permits_cached()
    area_plans = fetch_area_plans()
    bus_stops = fetch_bus_stops()
    processed = process_permits(merged, area_plans, bus_stops)

    # Yearly trends by housing type
    yearly_by_type = {}
    for permit in processed["permits"]:
        year = permit.get("issue_year")
        ht = permit.get("housing_type")
        if year and ht:
            yearly_by_type.setdefault(year, {})
            yearly_by_type[year][ht] = yearly_by_type[year].get(ht, 0) + 1

    # Transit score distribution
    scores = [p["transit_score"] for p in processed["permits"] if p.get("transit_score") is not None]
    transit_dist = {
        "high": len([s for s in scores if s >= 70]),
        "medium": len([s for s in scores if 40 <= s < 70]),
        "low": len([s for s in scores if s < 40]),
        "average": round(sum(scores) / len(scores), 1) if scores else 0,
    }

    # Urban ring breakdown by housing type
    ring_by_type = {}
    for permit in processed["permits"]:
        ring = permit.get("urban_ring", "Unknown")
        ht = permit.get("housing_type", "Unknown")
        ring_by_type.setdefault(ring, {})
        ring_by_type[ring][ht] = ring_by_type[ring].get(ht, 0) + 1

    # Units by housing type
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


@app.route("/api/demographics")
def get_demographics():
    """API endpoint to return demographic data with permit counts."""
    # Load demographic data
    demo_data = load_demographics()

    # Get permit counts by zip from residential endpoint
    merged = fetch_permits_cached()
    processed_data = process_permits(merged)
    zip_counts = processed_data.get("zip_counts", {})

    # Combine demographics with permit counts
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

    # Sort by permit count
    result.sort(key=lambda x: x["permit_count"], reverse=True)

    return jsonify({
        "source": demo_data.get("source", ""),
        "zip_data": result,
    })


if __name__ == "__main__":
    app.run(debug=True, port=5000)
