// Metro Comparison Dashboard JavaScript
// Compares Raleigh to peer metros using FRED data

// Global state
let comparisonData = null;
let unemploymentChart = null;
let homePriceChart = null;
let employmentChart = null;

// Metro colors (matching blueprint config)
const metroColors = {
    raleigh: '#722F37',    // Burgundy
    nashville: '#E9B44C',  // Mustard
    austin: '#9DC183',     // Sage
    charlotte: '#8ECAE6',  // Powder Blue
    denver: '#C3B1E1'      // Lavender
};

const metroNames = {
    raleigh: 'Raleigh',
    nashville: 'Nashville',
    austin: 'Austin',
    charlotte: 'Charlotte',
    denver: 'Denver'
};

// =============================================================================
// API FUNCTIONS
// =============================================================================
async function fetchComparisonData() {
    const response = await fetch('/compare/api/overview');
    if (!response.ok) throw new Error('Failed to fetch comparison data');
    return response.json();
}

async function fetchTimeseries(metric) {
    const response = await fetch(`/compare/api/timeseries/${metric}`);
    if (!response.ok) throw new Error(`Failed to fetch ${metric} timeseries`);
    return response.json();
}

// =============================================================================
// TABLE POPULATION
// =============================================================================
function populateComparisonTable(data) {
    const comparison = data.comparison;
    const metros = ['raleigh', 'nashville', 'austin', 'charlotte', 'denver'];

    // Unemployment Rate
    metros.forEach(metro => {
        const val = comparison.unemployment?.values[metro]?.latest;
        document.getElementById(`${metro}-unemployment`).textContent =
            val != null ? `${val.toFixed(1)}%` : '--';
    });

    // Job Growth (YoY from employment)
    metros.forEach(metro => {
        const val = comparison.employment?.values[metro]?.yoy_change;
        document.getElementById(`${metro}-job-growth`).textContent =
            val != null ? `${val > 0 ? '+' : ''}${val.toFixed(1)}%` : '--';
    });

    // Home Price Growth (YoY)
    metros.forEach(metro => {
        const val = comparison.home_price_index?.values[metro]?.yoy_change;
        document.getElementById(`${metro}-home-price`).textContent =
            val != null ? `${val > 0 ? '+' : ''}${val.toFixed(1)}%` : '--';
    });

    // Per Capita Income
    metros.forEach(metro => {
        const val = comparison.per_capita_income?.values[metro]?.latest;
        document.getElementById(`${metro}-income`).textContent =
            val != null ? `$${Math.round(val / 1000)}K` : '--';
    });

    // Real GDP (in billions)
    metros.forEach(metro => {
        const val = comparison.real_gdp?.values[metro]?.latest;
        document.getElementById(`${metro}-gdp`).textContent =
            val != null ? `$${Math.round(val / 1000)}B` : '--';
    });
}

// =============================================================================
// CHART FUNCTIONS
// =============================================================================
function createUnemploymentChart(metroData) {
    const ctx = document.getElementById('unemployment-chart').getContext('2d');

    if (unemploymentChart) {
        unemploymentChart.destroy();
    }

    const datasets = [];
    const metros = ['raleigh', 'nashville', 'austin', 'charlotte', 'denver'];

    // Find common date range
    let allDates = new Set();
    metros.forEach(metro => {
        const obs = metroData[metro]?.metrics?.unemployment?.observations || [];
        obs.forEach(o => allDates.add(o.date));
    });
    const dates = Array.from(allDates).sort().slice(-60); // Last 5 years

    metros.forEach(metro => {
        const obs = metroData[metro]?.metrics?.unemployment?.observations || [];
        const obsMap = {};
        obs.forEach(o => { obsMap[o.date] = o.value; });

        datasets.push({
            label: metroNames[metro],
            data: dates.map(d => obsMap[d] || null),
            borderColor: metroColors[metro],
            backgroundColor: 'transparent',
            borderWidth: metro === 'raleigh' ? 3 : 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.3
        });
    });

    unemploymentChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates.map(d => d.substring(0, 7)),
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { usePointStyle: true }
                }
            },
            scales: {
                y: {
                    title: { display: true, text: 'Unemployment Rate (%)' }
                },
                x: {
                    ticks: { maxTicksLimit: 12 }
                }
            }
        }
    });
}

function createHomePriceChart(metroData) {
    const ctx = document.getElementById('home-price-chart').getContext('2d');

    if (homePriceChart) {
        homePriceChart.destroy();
    }

    const datasets = [];
    const metros = ['raleigh', 'nashville', 'austin', 'charlotte', 'denver'];

    let allDates = new Set();
    metros.forEach(metro => {
        const obs = metroData[metro]?.metrics?.home_price_index?.observations || [];
        obs.forEach(o => allDates.add(o.date));
    });
    const dates = Array.from(allDates).sort().slice(-40); // Last 10 years quarterly

    metros.forEach(metro => {
        const obs = metroData[metro]?.metrics?.home_price_index?.observations || [];
        const obsMap = {};
        obs.forEach(o => { obsMap[o.date] = o.value; });

        datasets.push({
            label: metroNames[metro],
            data: dates.map(d => obsMap[d] || null),
            borderColor: metroColors[metro],
            backgroundColor: 'transparent',
            borderWidth: metro === 'raleigh' ? 3 : 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.3
        });
    });

    homePriceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates.map(d => d.substring(0, 7)),
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { usePointStyle: true }
                }
            },
            scales: {
                y: {
                    title: { display: true, text: 'Home Price Index' }
                },
                x: {
                    ticks: { maxTicksLimit: 12 }
                }
            }
        }
    });
}

function createEmploymentChart(metroData) {
    const ctx = document.getElementById('employment-chart').getContext('2d');

    if (employmentChart) {
        employmentChart.destroy();
    }

    const datasets = [];
    const metros = ['raleigh', 'nashville', 'austin', 'charlotte', 'denver'];

    let allDates = new Set();
    metros.forEach(metro => {
        const obs = metroData[metro]?.metrics?.employment?.observations || [];
        obs.forEach(o => allDates.add(o.date));
    });
    const dates = Array.from(allDates).sort().slice(-60);

    // Normalize to index (first value = 100) for comparison
    metros.forEach(metro => {
        const obs = metroData[metro]?.metrics?.employment?.observations || [];
        const obsMap = {};
        obs.forEach(o => { obsMap[o.date] = o.value; });

        const firstVal = obsMap[dates[0]];
        const normalizedData = dates.map(d => {
            const val = obsMap[d];
            return val && firstVal ? (val / firstVal) * 100 : null;
        });

        datasets.push({
            label: metroNames[metro],
            data: normalizedData,
            borderColor: metroColors[metro],
            backgroundColor: 'transparent',
            borderWidth: metro === 'raleigh' ? 3 : 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.3
        });
    });

    employmentChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates.map(d => d.substring(0, 7)),
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { usePointStyle: true }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.dataset.label}: ${ctx.raw?.toFixed(1) || 'N/A'} (indexed)`
                    }
                }
            },
            scales: {
                y: {
                    title: { display: true, text: 'Employment Index (Start = 100)' }
                },
                x: {
                    ticks: { maxTicksLimit: 12 }
                }
            }
        }
    });
}

// =============================================================================
// MAIN DATA LOADING
// =============================================================================
async function loadData() {
    try {
        const data = await fetchComparisonData();
        comparisonData = data;

        // Check API status
        if (!data.api_status?.fred_configured) {
            const banner = document.getElementById('api-status');
            const message = document.getElementById('api-status-message');
            banner.classList.remove('hidden');
            message.textContent = 'FRED_API_KEY not configured. Using cached or sample data.';
        }

        // Populate comparison table
        populateComparisonTable(data);

        // Create charts
        createUnemploymentChart(data.metro_data);
        createHomePriceChart(data.metro_data);
        createEmploymentChart(data.metro_data);

        // Hide loading overlay
        document.getElementById('loading').classList.add('hidden');

    } catch (error) {
        console.error('Error loading comparison data:', error);
        document.getElementById('loading').innerHTML = `
            <p style="color: #ef4444;">Error loading data: ${error.message}</p>
            <p>Please check API configuration and refresh.</p>
        `;
    }
}

// =============================================================================
// EVENT LISTENERS
// =============================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Narrative box toggle
    document.querySelectorAll('.narrative-header').forEach(header => {
        header.addEventListener('click', () => {
            const box = header.closest('.narrative-box');
            box.classList.toggle('collapsed');
        });
    });

    // Load data
    loadData();
});
