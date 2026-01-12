"""
Geographic utilities for Raleigh Insights Ecosystem.
Shared across all components (Housing, Economy, Culture, Green Spaces).
"""
import math

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
}

# Ring display order for consistent UI
URBAN_RING_ORDER = ["Downtown", "Near Downtown", "Inner Suburb", "Outer Suburb", "Unknown"]


def get_urban_ring(zip_code: str) -> str:
    """Get urban ring classification for a zip code."""
    if not zip_code:
        return "Unknown"
    return URBAN_RING_MAP.get(zip_code, "Unknown")


# =============================================================================
# ZIP CODE CENTERS (City of Raleigh only)
# Format: (latitude, longitude, radius for matching)
# =============================================================================
ZIP_CODE_CENTERS = {
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
}

# Downtown Raleigh center coordinates
DOWNTOWN_CENTER = (35.7796, -78.6382)


# =============================================================================
# BRT CORRIDORS (approximate centerline coordinates)
# =============================================================================
BRT_CORRIDORS = {
    "New Bern Ave (Eastern)": [(35.7796, -78.6382), (35.7800, -78.5500)],
    "Capital Blvd (Southern)": [(35.7796, -78.6382), (35.7000, -78.6300)],
    "Western Blvd": [(35.7796, -78.6382), (35.7600, -78.7500)],
}


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

    DOWNTOWN_LAT, DOWNTOWN_LON = DOWNTOWN_CENTER

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
    if dist_to_downtown <= 2.0:
        score += 20
    elif dist_to_downtown <= 5.0:
        score += 15
    elif dist_to_downtown <= 8.0:
        score += 10
    elif dist_to_downtown <= 12.0:
        score += 5

    return round(min(100, score), 1)
