"""
Raleigh Insights - Main Application
A data-driven analysis ecosystem for the City of Raleigh.

Components:
- Housing: Building permits and residential development
- Economy: Business growth, employment, and industry composition
- Culture: (Coming soon) Restaurants, entertainment, arts
- Green Spaces: (Coming soon) Parks, greenways, tree canopy
"""
import os
from pathlib import Path

# Load environment variables from .env file
from dotenv import load_dotenv
env_path = Path(__file__).parent / '.env'
load_dotenv(env_path)

from flask import Flask, redirect, url_for

# Import blueprints
from blueprints.housing import housing_bp
from blueprints.economy import economy_bp

app = Flask(__name__)

# Register blueprints
app.register_blueprint(housing_bp)
app.register_blueprint(economy_bp)


@app.route("/")
def index():
    """Redirect root to housing dashboard (default landing page)."""
    return redirect(url_for('housing.index'))


if __name__ == "__main__":
    app.run(debug=True, port=5000)
