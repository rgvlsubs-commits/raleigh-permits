// Economy Dashboard JavaScript
// Handles data fetching from FRED and Census APIs, chart rendering

// Global state
let economyData = null;
let laborChart = null;
let industryChart = null;
let employmentSectorChart = null;
let growthChart = null;
let businessAppsChart = null;
let startupChart = null;

// Current selections
let currentLaborMetric = 'unemployment_rate';
let currentGrowthMetric = 'gdp';

// Wes Anderson Color Palette (matching housing)
const wesAnderson = {
    cream: '#FAF3E0',
    dustyRose: '#D4A59A',
    salmon: '#E8998D',
    mustard: '#E9B44C',
    ochre: '#D4A373',
    sage: '#9DC183',
    powderBlue: '#8ECAE6',
    burgundy: '#722F37',
    terracotta: '#C9705F',
    lavender: '#C3B1E1',
    peach: '#FFDAB9'
};

// Industry colors
const industryColors = [
    wesAnderson.powderBlue,
    wesAnderson.sage,
    wesAnderson.mustard,
    wesAnderson.salmon,
    wesAnderson.lavender,
    wesAnderson.terracotta,
    wesAnderson.ochre,
    wesAnderson.dustyRose,
    wesAnderson.peach,
    wesAnderson.burgundy
];

// =============================================================================
// API FUNCTIONS
// =============================================================================
async function fetchOverviewData() {
    const response = await fetch('/economy/api/overview');
    if (!response.ok) throw new Error('Failed to fetch economy overview');
    return response.json();
}

async function fetchIndustryData() {
    const response = await fetch('/economy/api/industries');
    if (!response.ok) throw new Error('Failed to fetch industry data');
    return response.json();
}

async function fetchZipData() {
    const response = await fetch('/economy/api/zip');
    if (!response.ok) throw new Error('Failed to fetch zip data');
    return response.json();
}

// =============================================================================
// CHART FUNCTIONS
// =============================================================================
function createLaborChart(fredData, metric) {
    const ctx = document.getElementById('labor-chart').getContext('2d');

    if (laborChart) {
        laborChart.destroy();
    }

    const seriesData = fredData[metric];
    if (!seriesData || !seriesData.observations || seriesData.observations.length === 0) {
        ctx.font = '16px Source Sans Pro';
        ctx.fillStyle = wesAnderson.burgundy;
        ctx.textAlign = 'center';
        ctx.fillText('No data available. Configure FRED_API_KEY for live data.',
                     ctx.canvas.width / 2, ctx.canvas.height / 2);
        return;
    }

    const observations = seriesData.observations;
    const labels = observations.map(o => {
        const date = new Date(o.date);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    });
    const values = observations.map(o => o.value);

    laborChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: seriesData.name,
                data: values,
                borderColor: wesAnderson.burgundy,
                backgroundColor: wesAnderson.peach + '40',
                fill: true,
                tension: 0.3,
                pointRadius: 2,
                pointHoverRadius: 6,
                pointBackgroundColor: wesAnderson.burgundy,
                pointBorderColor: wesAnderson.cream,
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${seriesData.name}: ${ctx.raw}${seriesData.unit === '%' ? '%' : ''}`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: metric !== 'unemployment_rate',
                    grid: { color: wesAnderson.dustyRose + '30' },
                    title: {
                        display: true,
                        text: seriesData.unit
                    }
                },
                x: {
                    ticks: { maxTicksLimit: 12 },
                    grid: { color: wesAnderson.dustyRose + '30' }
                }
            }
        }
    });
}

function createIndustryChart(industries) {
    const ctx = document.getElementById('industry-chart').getContext('2d');

    if (industryChart) {
        industryChart.destroy();
    }

    // Get top 8 industries by establishments
    const sorted = Object.values(industries)
        .sort((a, b) => b.establishments - a.establishments)
        .slice(0, 8);

    if (sorted.length === 0) {
        ctx.font = '16px Source Sans Pro';
        ctx.fillStyle = wesAnderson.burgundy;
        ctx.textAlign = 'center';
        ctx.fillText('No industry data available.', ctx.canvas.width / 2, ctx.canvas.height / 2);
        return;
    }

    industryChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: sorted.map(i => i.name),
            datasets: [{
                data: sorted.map(i => i.establishments),
                backgroundColor: industryColors.slice(0, sorted.length),
                borderWidth: 3,
                borderColor: wesAnderson.burgundy
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: wesAnderson.burgundy,
                        font: { size: 11 }
                    }
                },
                title: {
                    display: true,
                    text: 'By Establishments',
                    color: wesAnderson.burgundy
                }
            }
        }
    });
}

function createEmploymentSectorChart(industries) {
    const ctx = document.getElementById('employment-sector-chart').getContext('2d');

    if (employmentSectorChart) {
        employmentSectorChart.destroy();
    }

    // Get top 10 industries by employment
    const sorted = Object.values(industries)
        .sort((a, b) => b.employees - a.employees)
        .slice(0, 10);

    if (sorted.length === 0) {
        return;
    }

    employmentSectorChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sorted.map(i => i.name),
            datasets: [{
                label: 'Employees',
                data: sorted.map(i => i.employees),
                backgroundColor: industryColors.slice(0, sorted.length),
                borderColor: wesAnderson.burgundy,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: { color: wesAnderson.dustyRose + '30' }
                },
                y: {
                    grid: { display: false },
                    ticks: { font: { size: 10 } }
                }
            }
        }
    });
}

function createGrowthChart(fredData, metric) {
    const ctx = document.getElementById('growth-chart').getContext('2d');

    if (growthChart) {
        growthChart.destroy();
    }

    const seriesData = fredData[metric];
    if (!seriesData || !seriesData.observations || seriesData.observations.length === 0) {
        ctx.font = '16px Source Sans Pro';
        ctx.fillStyle = wesAnderson.burgundy;
        ctx.textAlign = 'center';
        ctx.fillText('No data available. Configure FRED_API_KEY for live data.',
                     ctx.canvas.width / 2, ctx.canvas.height / 2);
        return;
    }

    const observations = seriesData.observations;
    const labels = observations.map(o => o.date.substring(0, 7));
    const values = observations.map(o => o.value);

    growthChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: seriesData.name,
                data: values,
                borderColor: wesAnderson.sage,
                backgroundColor: wesAnderson.sage + '30',
                fill: true,
                tension: 0.3,
                pointRadius: 2,
                pointHoverRadius: 6,
                pointBackgroundColor: wesAnderson.sage,
                pointBorderColor: wesAnderson.cream,
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    grid: { color: wesAnderson.dustyRose + '30' },
                    title: {
                        display: true,
                        text: seriesData.unit
                    }
                },
                x: {
                    ticks: { maxTicksLimit: 12 },
                    grid: { color: wesAnderson.dustyRose + '30' }
                }
            }
        }
    });
}

function createBusinessAppsChart(fredData) {
    const ctx = document.getElementById('business-apps-chart').getContext('2d');

    if (businessAppsChart) {
        businessAppsChart.destroy();
    }

    const seriesData = fredData['business_applications'];
    if (!seriesData || !seriesData.observations || seriesData.observations.length === 0) {
        ctx.font = '14px Source Sans Pro';
        ctx.fillStyle = wesAnderson.burgundy;
        ctx.textAlign = 'center';
        ctx.fillText('No data available', ctx.canvas.width / 2, ctx.canvas.height / 2);
        return;
    }

    // Get last 3 years of data
    const recent = seriesData.observations.slice(-36);
    const labels = recent.map(o => o.date.substring(0, 7));
    const values = recent.map(o => o.value);

    businessAppsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Business Applications',
                data: values,
                backgroundColor: wesAnderson.mustard,
                borderColor: wesAnderson.burgundy,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: wesAnderson.dustyRose + '30' }
                },
                x: {
                    ticks: { maxTicksLimit: 12 },
                    grid: { display: false }
                }
            }
        }
    });
}

function createStartupChart(fredData) {
    const ctx = document.getElementById('startup-chart').getContext('2d');

    if (startupChart) {
        startupChart.destroy();
    }

    const seriesData = fredData['high_propensity_applications'];
    if (!seriesData || !seriesData.observations || seriesData.observations.length === 0) {
        ctx.font = '14px Source Sans Pro';
        ctx.fillStyle = wesAnderson.burgundy;
        ctx.textAlign = 'center';
        ctx.fillText('No data available', ctx.canvas.width / 2, ctx.canvas.height / 2);
        return;
    }

    const recent = seriesData.observations.slice(-36);
    const labels = recent.map(o => o.date.substring(0, 7));
    const values = recent.map(o => o.value);

    startupChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'High-Propensity Applications',
                data: values,
                borderColor: wesAnderson.terracotta,
                backgroundColor: wesAnderson.terracotta + '30',
                fill: true,
                tension: 0.3,
                pointRadius: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: wesAnderson.dustyRose + '30' }
                },
                x: {
                    ticks: { maxTicksLimit: 12 },
                    grid: { display: false }
                }
            }
        }
    });
}

// =============================================================================
// TABLE FUNCTIONS
// =============================================================================
let zipSortColumn = 'establishments';
let zipSortDirection = 'desc';
let zipTableData = [];

function populateZipTable(data) {
    zipTableData = data;
    renderZipTable();
}

function renderZipTable() {
    const tbody = document.getElementById('zip-tbody');
    tbody.innerHTML = '';

    const sorted = [...zipTableData].sort((a, b) => {
        let aVal = a[zipSortColumn];
        let bVal = b[zipSortColumn];

        if (typeof aVal === 'string') {
            const cmp = aVal.localeCompare(bVal);
            return zipSortDirection === 'asc' ? cmp : -cmp;
        }

        return zipSortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });

    sorted.forEach(zip => {
        const row = document.createElement('tr');
        const payrollM = (zip.payroll / 1000).toFixed(1);
        const avgWage = zip.employees > 0 ? Math.round(zip.payroll * 1000 / zip.employees) : 0;

        row.innerHTML = `
            <td>${zip.zip_code}</td>
            <td>${zip.urban_ring || 'N/A'}</td>
            <td><strong>${zip.establishments.toLocaleString()}</strong></td>
            <td>${zip.employees.toLocaleString()}</td>
            <td>$${payrollM}</td>
            <td>$${avgWage.toLocaleString()}</td>
        `;
        tbody.appendChild(row);
    });

    // Update header sort indicators
    document.querySelectorAll('#zip-table th.sortable').forEach(th => {
        th.classList.remove('asc', 'desc');
        if (th.dataset.sort === zipSortColumn) {
            th.classList.add(zipSortDirection);
        }
    });
}

function sortZipTable(column) {
    if (zipSortColumn === column) {
        zipSortDirection = zipSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        zipSortColumn = column;
        zipSortDirection = ['zip', 'ring'].includes(column) ? 'asc' : 'desc';
    }
    renderZipTable();
}

// =============================================================================
// STATS DISPLAY
// =============================================================================
function updateStatsDisplay(summary, fredData) {
    // Unemployment Rate
    const unemp = summary.unemployment_rate;
    document.getElementById('unemployment-rate').textContent =
        unemp ? `${unemp.toFixed(1)}%` : '--';

    // Total Employment (in thousands)
    const emp = summary.total_employment;
    document.getElementById('total-employment').textContent =
        emp ? `${Math.round(emp)}K` : '--';

    // GDP (convert millions to billions)
    const gdp = summary.gdp;
    document.getElementById('gdp').textContent =
        gdp ? `$${(gdp / 1000).toFixed(1)}B` : '--';

    // Per Capita Income
    const pci = summary.per_capita_income;
    document.getElementById('per-capita-income').textContent =
        pci ? `$${Math.round(pci).toLocaleString()}` : '--';

    // Business Applications
    const bizApps = summary.business_applications;
    document.getElementById('business-apps').textContent =
        bizApps ? Math.round(bizApps).toLocaleString() : '--';
}

function showApiStatus(apiStatus) {
    const banner = document.getElementById('api-status');
    const message = document.getElementById('api-status-message');

    if (!apiStatus.fred_configured && !apiStatus.census_configured) {
        banner.classList.remove('hidden');
        message.textContent = 'API keys not configured. Set FRED_API_KEY and CENSUS_API_KEY environment variables for live data.';
    } else if (!apiStatus.fred_configured) {
        banner.classList.remove('hidden');
        message.textContent = 'FRED_API_KEY not configured. Labor market and growth data unavailable.';
    } else if (!apiStatus.census_configured) {
        banner.classList.remove('hidden');
        message.textContent = 'CENSUS_API_KEY not configured. Industry data may be limited.';
    }
}

// =============================================================================
// MAIN DATA LOADING
// =============================================================================
async function loadData() {
    try {
        // Fetch all data in parallel
        const [overview, industries, zipData] = await Promise.all([
            fetchOverviewData(),
            fetchIndustryData(),
            fetchZipData()
        ]);

        economyData = overview;

        // Show API status if needed
        showApiStatus(overview.api_status);

        // Update stats
        updateStatsDisplay(overview.summary, overview.fred_data);

        // Create charts
        createLaborChart(overview.fred_data, currentLaborMetric);
        createIndustryChart(industries.industries);
        createEmploymentSectorChart(industries.industries);
        createGrowthChart(overview.fred_data, currentGrowthMetric);
        createBusinessAppsChart(overview.fred_data);
        createStartupChart(overview.fred_data);

        // Populate zip table
        populateZipTable(zipData.zip_data);

        // Hide loading overlay
        document.getElementById('loading').classList.add('hidden');

    } catch (error) {
        console.error('Error loading economy data:', error);
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
    // Labor metric selector
    document.getElementById('labor-metric-select').addEventListener('change', (e) => {
        currentLaborMetric = e.target.value;
        if (economyData) {
            createLaborChart(economyData.fred_data, currentLaborMetric);
        }
    });

    // Growth metric selector
    document.getElementById('growth-metric-select').addEventListener('change', (e) => {
        currentGrowthMetric = e.target.value;
        if (economyData) {
            createGrowthChart(economyData.fred_data, currentGrowthMetric);
        }
    });

    // Zip table sorting
    document.querySelectorAll('#zip-table th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            sortZipTable(th.dataset.sort);
        });
    });

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
