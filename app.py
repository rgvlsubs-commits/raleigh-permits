from flask import Flask, render_template, jsonify
import requests
from datetime import datetime

app = Flask(__name__)

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

        permit = {
            "permit_num": permit_num,
            "type": permit_type,
            "status": status,
            "address": address,
            "description": description,
            "issue_date": issue_date.strftime("%Y-%m-%d") if issue_date else "Unknown",
            "lng": coords[0] if coords else None,
            "lat": coords[1] if coords else None,
        }
        permits.append(permit)

        # Count by type
        type_counts[permit_type] = type_counts.get(permit_type, 0) + 1

        # Group by week for timeline
        if issue_date:
            week_start = issue_date.strftime("%Y-%W")
            timeline_data[week_start] = timeline_data.get(week_start, 0) + 1

    # Sort timeline by date
    sorted_timeline = sorted(timeline_data.items())

    # Sort types by count
    sorted_types = sorted(type_counts.items(), key=lambda x: x[1], reverse=True)

    return {
        "permits": permits,
        "total_count": len(permits),
        "type_counts": dict(sorted_types),
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


if __name__ == "__main__":
    app.run(debug=True, port=5000)
