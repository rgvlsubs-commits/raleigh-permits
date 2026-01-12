"""
Caching utilities for Raleigh Insights Ecosystem.
Provides file-based caching with configurable TTL.
"""
from datetime import datetime, timedelta
from pathlib import Path
import json

# Default cache directory (relative to project root)
CACHE_DIR = Path(__file__).parent.parent / "cache"
DEFAULT_CACHE_DURATION_HOURS = 24


def get_cache_path(cache_key: str, cache_dir: Path = None) -> Path:
    """Generate cache file path from key."""
    cache_dir = cache_dir or CACHE_DIR
    cache_dir.mkdir(exist_ok=True)
    return cache_dir / f"{cache_key}.json"


def is_cache_valid(cache_path: Path, duration_hours: int = DEFAULT_CACHE_DURATION_HOURS) -> bool:
    """Check if cache exists and is less than duration_hours old."""
    if not cache_path.exists():
        return False
    mtime = datetime.fromtimestamp(cache_path.stat().st_mtime)
    return (datetime.now() - mtime) < timedelta(hours=duration_hours)


def load_from_cache(cache_key: str, duration_hours: int = DEFAULT_CACHE_DURATION_HOURS):
    """Load data from cache if valid, else return None."""
    cache_path = get_cache_path(cache_key)
    if is_cache_valid(cache_path, duration_hours):
        with open(cache_path, 'r') as f:
            return json.load(f)
    return None


def save_to_cache(cache_key: str, data):
    """Save data to cache file."""
    cache_path = get_cache_path(cache_key)
    with open(cache_path, 'w') as f:
        json.dump(data, f)


def clear_cache(cache_key: str = None):
    """Clear specific cache key or all cache files."""
    if cache_key:
        cache_path = get_cache_path(cache_key)
        if cache_path.exists():
            cache_path.unlink()
    else:
        # Clear all cache files
        if CACHE_DIR.exists():
            for f in CACHE_DIR.glob("*.json"):
                f.unlink()
