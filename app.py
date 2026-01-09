from flask import Flask, render_template, jsonify
import requests
from datetime import datetime
import json
import os

app = Flask(__name__)

# Load demographic data
DEMOGRAPHICS_FILE = os.path.join(app.static_folder, 'data', 'demographics.json')

def load_demographics():
    """Load demographic data from static file."""
    try:
        with open(DEMOGRAPHICS_FILE, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"zip_codes": {}}

# Approximate zip code centers for Raleigh area (lat, lng, radius in degrees)
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

ARCGIS_API_URL = (
    "https://services.arcgis.com/v400IkDOw1ad7Yad/arcgis/rest/services/"
    "Building_Permits_Issued_Past_180_days/FeatureServer/0/query"
)


def fetch_permits():
    """Fetch building permits from Raleigh's ArcGIS API."""
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


def process_permits(geojson_data):
    """Process permit data for visualization."""
    features = geojson_data.get("features", [])

    permits = []
    type_counts = {}
    timeline_data = {}
    class_counts = {}  # Residential vs Non-Residential
    housing_counts = {}  # Single Family, Multi-family, etc.
    work_counts = {}  # New vs Existing
    status_counts = {}  # Issued vs Finaled
    zip_counts = {}  # Permits by zip code

    for feature in features:
        props = feature.get("properties", {})
        geometry = feature.get("geometry", {})
        coords = geometry.get("coordinates", [None, None]) if geometry else [None, None]

        # Extract permit info (using actual field names from Raleigh's API)
        permit_type = props.get("permittypemapped") or props.get("permittype") or "Unknown"
        issue_date_ms = props.get("issueddate")
        status = props.get("statuscurrentmapped") or props.get("statuscurrent") or "Unknown"
        permit_num = props.get("permitnum") or "N/A"
        description = props.get("proposedworkdescription") or props.get("description") or ""

        # New category fields
        permit_class = props.get("permitclassmapped") or "Unknown"
        housing_type = props.get("censuslanduse") or "Unknown"
        work_type = props.get("workclassmapped") or "Unknown"
        work_class = props.get("workclass") or "Unknown"

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
        if issue_date_ms:
            try:
                issue_date = datetime.fromtimestamp(issue_date_ms / 1000)
            except (ValueError, TypeError):
                pass

        # Determine zip code from coordinates
        lat = coords[1] if coords else None
        lng = coords[0] if coords else None
        zip_code = get_zip_for_coords(lat, lng)

        permit = {
            "permit_num": permit_num,
            "type": permit_type,
            "status": status,
            "address": address,
            "description": description,
            "issue_date": issue_date.strftime("%Y-%m-%d") if issue_date else "Unknown",
            "lng": lng,
            "lat": lat,
            "permit_class": permit_class,
            "housing_type": housing_type,
            "work_type": work_type,
            "work_class": work_class,
            "zip_code": zip_code,
        }
        permits.append(permit)

        # Count by type
        type_counts[permit_type] = type_counts.get(permit_type, 0) + 1

        # Count by class (Residential vs Non-Residential)
        class_counts[permit_class] = class_counts.get(permit_class, 0) + 1

        # Count by housing type
        housing_counts[housing_type] = housing_counts.get(housing_type, 0) + 1

        # Count by work type (New vs Existing)
        work_counts[work_type] = work_counts.get(work_type, 0) + 1

        # Count by status
        status_counts[status] = status_counts.get(status, 0) + 1

        # Count by zip code
        if zip_code:
            zip_counts[zip_code] = zip_counts.get(zip_code, 0) + 1

        # Group by week for timeline
        if issue_date:
            week_start = issue_date.strftime("%Y-%W")
            timeline_data[week_start] = timeline_data.get(week_start, 0) + 1

    # Sort timeline by date
    sorted_timeline = sorted(timeline_data.items())

    # Sort all counts by value
    sorted_types = sorted(type_counts.items(), key=lambda x: x[1], reverse=True)
    sorted_classes = sorted(class_counts.items(), key=lambda x: x[1], reverse=True)
    sorted_housing = sorted(housing_counts.items(), key=lambda x: x[1], reverse=True)
    sorted_work = sorted(work_counts.items(), key=lambda x: x[1], reverse=True)
    sorted_status = sorted(status_counts.items(), key=lambda x: x[1], reverse=True)
    sorted_zips = sorted(zip_counts.items(), key=lambda x: x[1], reverse=True)

    return {
        "permits": permits,
        "total_count": len(permits),
        "type_counts": dict(sorted_types),
        "class_counts": dict(sorted_classes),
        "housing_counts": dict(sorted_housing),
        "work_counts": dict(sorted_work),
        "status_counts": dict(sorted_status),
        "zip_counts": dict(sorted_zips),
        "timeline": {
            "labels": [t[0] for t in sorted_timeline],
            "values": [t[1] for t in sorted_timeline],
        },
    }


@app.route("/")
def index():
    """Render the main page."""
    return render_template("index.html")


@app.route("/api/permits")
def get_permits():
    """API endpoint to fetch and return processed permit data."""
    geojson_data = fetch_permits()
    processed_data = process_permits(geojson_data)
    return jsonify(processed_data)


@app.route("/api/demographics")
def get_demographics():
    """API endpoint to return demographic data with permit counts."""
    # Load demographic data
    demo_data = load_demographics()

    # Get permit counts by zip
    geojson_data = fetch_permits()
    processed_data = process_permits(geojson_data)
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
        })

    # Sort by permit count
    result.sort(key=lambda x: x["permit_count"], reverse=True)

    return jsonify({
        "source": demo_data.get("source", ""),
        "zip_data": result,
    })


if __name__ == "__main__":
    app.run(debug=True, port=5000)
