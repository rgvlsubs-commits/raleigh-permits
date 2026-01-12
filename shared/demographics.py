"""
Demographics data loader for Raleigh Insights Ecosystem.
Provides Census ACS data by zip code.
"""
import os
import json

# Path to demographics JSON file
DEMOGRAPHICS_FILE = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), 'static', 'data', 'demographics.json'
)


def load_demographics():
    """Load demographic data from static file."""
    try:
        with open(DEMOGRAPHICS_FILE, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"zip_codes": {}}


def get_zip_demographics(zip_code: str):
    """Get demographics for a specific zip code."""
    data = load_demographics()
    return data.get("zip_codes", {}).get(zip_code)


def get_all_zip_codes():
    """Get list of all zip codes with demographics data."""
    data = load_demographics()
    return list(data.get("zip_codes", {}).keys())
