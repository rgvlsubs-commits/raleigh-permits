// Economy Dashboard JavaScript
// Handles data fetching from FRED and Census APIs, chart rendering

// Global state
let economyData = null;
let laborChart = null;
let industryChart = null;
let employmentSectorChart = null;
let growthChart = null;
let metroComparisonChart = null;
let metroComparisonData = null;
let tradeData = null;
let exportIndustriesChart = null;
let exportDestinationsChart = null;
let exportTrendChart = null;

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

// Metro comparison colors (matching blueprint config)
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

async function fetchMetroComparison() {
    const response = await fetch('/economy/api/metro-comparison');
    if (!response.ok) throw new Error('Failed to fetch metro comparison data');
    return response.json();
}

async function fetchTradeData() {
    const response = await fetch('/economy/api/trade');
    if (!response.ok) throw new Error('Failed to fetch trade data');
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

    // Get top 10 industries by establishments
    const sorted = Object.values(industries)
        .sort((a, b) => b.establishments - a.establishments)
        .slice(0, 10);

    if (sorted.length === 0) {
        ctx.font = '16px Source Sans Pro';
        ctx.fillStyle = wesAnderson.burgundy;
        ctx.textAlign = 'center';
        ctx.fillText('No industry data available.', ctx.canvas.width / 2, ctx.canvas.height / 2);
        return;
    }

    industryChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sorted.map(i => i.name),
            datasets: [{
                label: 'Establishments',
                data: sorted.map(i => i.establishments),
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

// =============================================================================
// METRO COMPARISON FUNCTIONS
// =============================================================================
function populateMetroComparisonTable(data) {
    const comparison = data.comparison;
    const metros = ['raleigh', 'nashville', 'austin', 'charlotte', 'denver'];

    // Unemployment Rate
    metros.forEach(metro => {
        const val = comparison.unemployment?.values[metro]?.latest;
        const el = document.getElementById(`cmp-${metro}-unemployment`);
        if (el) el.textContent = val != null ? `${val.toFixed(1)}%` : '--';
    });

    // Job Growth (YoY from employment)
    metros.forEach(metro => {
        const val = comparison.employment?.values[metro]?.yoy_change;
        const el = document.getElementById(`cmp-${metro}-job-growth`);
        if (el) el.textContent = val != null ? `${val > 0 ? '+' : ''}${val.toFixed(1)}%` : '--';
    });

    // Home Price Growth (YoY)
    metros.forEach(metro => {
        const val = comparison.home_price_index?.values[metro]?.yoy_change;
        const el = document.getElementById(`cmp-${metro}-home-price`);
        if (el) el.textContent = val != null ? `${val > 0 ? '+' : ''}${val.toFixed(1)}%` : '--';
    });

    // Per Capita Income
    metros.forEach(metro => {
        const val = comparison.per_capita_income?.values[metro]?.latest;
        const el = document.getElementById(`cmp-${metro}-income`);
        if (el) el.textContent = val != null ? `$${Math.round(val / 1000)}K` : '--';
    });

    // Real GDP (in billions)
    metros.forEach(metro => {
        const val = comparison.real_gdp?.values[metro]?.latest;
        const el = document.getElementById(`cmp-${metro}-gdp`);
        if (el) el.textContent = val != null ? `$${Math.round(val / 1000)}B` : '--';
    });
}

function createMetroComparisonChart(metroData) {
    const canvas = document.getElementById('metro-unemployment-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    if (metroComparisonChart) {
        metroComparisonChart.destroy();
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

    metroComparisonChart = new Chart(ctx, {
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
                    title: { display: true, text: 'Unemployment Rate (%)' },
                    grid: { color: wesAnderson.dustyRose + '30' }
                },
                x: {
                    ticks: { maxTicksLimit: 12 },
                    grid: { color: wesAnderson.dustyRose + '30' }
                }
            }
        }
    });
}

// =============================================================================
// GLOBAL TRADE FUNCTIONS
// =============================================================================
function updateTradeStats(data) {
    const trade = data.trade_data;

    // Total exports
    document.getElementById('total-exports').textContent =
        `$${trade.raleigh_msa.total_exports}B`;

    // YoY growth
    const growth = trade.raleigh_msa.yoy_change;
    document.getElementById('export-growth').textContent =
        `${growth > 0 ? '+' : ''}${growth}%`;

    // Triangle total
    document.getElementById('triangle-exports').textContent =
        `$${trade.triangle_region.total_exports}B`;

    // NC share
    document.getElementById('nc-share').textContent =
        `${trade.context.raleigh_share_of_nc}%`;
}

function createExportIndustriesChart(data) {
    const ctx = document.getElementById('export-industries-chart').getContext('2d');

    if (exportIndustriesChart) {
        exportIndustriesChart.destroy();
    }

    const industries = data.trade_data.top_industries;

    exportIndustriesChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: industries.map(i => i.name),
            datasets: [{
                label: 'Exports ($B)',
                data: industries.map(i => i.value),
                backgroundColor: [
                    wesAnderson.burgundy,
                    wesAnderson.powderBlue,
                    wesAnderson.sage,
                    wesAnderson.mustard,
                    wesAnderson.salmon,
                    wesAnderson.lavender,
                    wesAnderson.terracotta,
                    wesAnderson.ochre
                ],
                borderColor: wesAnderson.burgundy,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `$${ctx.raw}B (${industries[ctx.dataIndex].percent}%)`
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: { color: wesAnderson.dustyRose + '30' },
                    title: { display: true, text: 'Exports ($ Billions)' }
                },
                y: {
                    grid: { display: false },
                    ticks: { font: { size: 10 } }
                }
            }
        }
    });
}

function createExportDestinationsChart(data) {
    const ctx = document.getElementById('export-destinations-chart').getContext('2d');

    if (exportDestinationsChart) {
        exportDestinationsChart.destroy();
    }

    const destinations = data.trade_data.top_destinations;

    exportDestinationsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: destinations.map(d => `${d.flag} ${d.country}`),
            datasets: [{
                label: 'Exports ($B)',
                data: destinations.map(d => d.value),
                backgroundColor: [
                    wesAnderson.burgundy,
                    wesAnderson.mustard,
                    wesAnderson.sage,
                    wesAnderson.powderBlue,
                    wesAnderson.salmon,
                    wesAnderson.lavender,
                    wesAnderson.terracotta,
                    wesAnderson.ochre
                ],
                borderColor: wesAnderson.burgundy,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `$${ctx.raw}B (${destinations[ctx.dataIndex].percent}%)`
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: { color: wesAnderson.dustyRose + '30' },
                    title: { display: true, text: 'Exports ($ Billions)' }
                },
                y: {
                    grid: { display: false },
                    ticks: { font: { size: 11 } }
                }
            }
        }
    });
}

function createExportTrendChart(data) {
    const ctx = document.getElementById('export-trend-chart').getContext('2d');

    if (exportTrendChart) {
        exportTrendChart.destroy();
    }

    const trend = data.trade_data.export_trend;

    exportTrendChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: trend.map(t => t.year.toString()),
            datasets: [{
                label: 'Total Exports ($B)',
                data: trend.map(t => t.value),
                backgroundColor: wesAnderson.burgundy + 'CC',
                borderColor: wesAnderson.burgundy,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `$${ctx.raw}B in exports`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: wesAnderson.dustyRose + '30' },
                    title: { display: true, text: 'Exports ($ Billions)' }
                },
                x: {
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
// STATS DISPLAY - THREE GEOGRAPHIC LEVELS
// =============================================================================
function updateNationalStats(nationalSummary) {
    // Real GDP Growth (YoY)
    const gdpGrowth = nationalSummary.real_gdp_yoy;
    document.getElementById('us-gdp-growth').textContent =
        gdpGrowth != null ? `${gdpGrowth.toFixed(1)}%` : '--';

    // US Unemployment Rate
    const unemp = nationalSummary.unemployment_rate;
    document.getElementById('us-unemployment').textContent =
        unemp != null ? `${unemp.toFixed(1)}%` : '--';

    // Real Wage Growth (YoY)
    const wageGrowth = nationalSummary.real_earnings_yoy;
    document.getElementById('us-wage-growth').textContent =
        wageGrowth != null ? `${wageGrowth > 0 ? '+' : ''}${wageGrowth.toFixed(1)}%` : '--';

    // Core PCE Inflation (YoY)
    const inflation = nationalSummary.core_pce_yoy;
    document.getElementById('us-inflation').textContent =
        inflation != null ? `${inflation.toFixed(1)}%` : '--';
}

function updateRaleighStats(raleighSummary) {
    // Unemployment Rate
    const unemp = raleighSummary.unemployment_rate;
    document.getElementById('unemployment-rate').textContent =
        unemp != null ? `${unemp.toFixed(1)}%` : '--';

    // Total Employment (in thousands)
    const emp = raleighSummary.total_employment;
    document.getElementById('total-employment').textContent =
        emp != null ? `${Math.round(emp)}K` : '--';

    // Real GDP (convert millions to billions)
    const gdp = raleighSummary.gdp;
    document.getElementById('gdp').textContent =
        gdp != null ? `$${(gdp / 1000).toFixed(0)}B` : '--';

    // Per Capita Income
    const pci = raleighSummary.per_capita_income;
    document.getElementById('per-capita-income').textContent =
        pci != null ? `$${Math.round(pci).toLocaleString()}` : '--';

    // Home Price Growth (YoY)
    const hpg = raleighSummary.home_price_yoy;
    document.getElementById('home-price-growth').textContent =
        hpg != null ? `${hpg > 0 ? '+' : ''}${hpg.toFixed(1)}%` : '--';
}

function updateNCStats(ncSummary) {
    // NC Unemployment Rate
    const unemp = ncSummary.unemployment_rate;
    document.getElementById('nc-unemployment').textContent =
        unemp != null ? `${unemp.toFixed(1)}%` : '--';

    // NC Employment (in millions - divide thousands by 1000)
    const emp = ncSummary.employment;
    document.getElementById('nc-employment').textContent =
        emp != null ? `${(emp / 1000).toFixed(2)}M` : '--';

    // NC Per Capita Income
    const pci = ncSummary.personal_income;
    document.getElementById('nc-income').textContent =
        pci != null ? `$${Math.round(pci).toLocaleString()}` : '--';
}

function updateStatsDisplay(data) {
    // Update all three geographic levels
    if (data.national && data.national.summary) {
        updateNationalStats(data.national.summary);
    }
    if (data.raleigh && data.raleigh.summary) {
        updateRaleighStats(data.raleigh.summary);
    }
    if (data.nc && data.nc.summary) {
        updateNCStats(data.nc.summary);
    }
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
        const [overview, industries, zipData, metroComparison, trade] = await Promise.all([
            fetchOverviewData(),
            fetchIndustryData(),
            fetchZipData(),
            fetchMetroComparison(),
            fetchTradeData()
        ]);

        economyData = overview;
        metroComparisonData = metroComparison;
        tradeData = trade;

        // Show API status if needed
        showApiStatus(overview.api_status);

        // Update stats for all three geographic levels
        updateStatsDisplay(overview);

        // Get Raleigh FRED data for charts
        const raleighFredData = overview.raleigh?.data || {};

        // Create charts using Raleigh MSA data
        createLaborChart(raleighFredData, currentLaborMetric);
        createIndustryChart(industries.industries);
        createEmploymentSectorChart(industries.industries);
        createGrowthChart(raleighFredData, currentGrowthMetric);

        // Populate zip table
        populateZipTable(zipData.zip_data);

        // Populate metro comparison (embedded in Economy tab)
        if (metroComparison) {
            populateMetroComparisonTable(metroComparison);
            createMetroComparisonChart(metroComparison.metro_data);
        }

        // Populate global trade section
        if (trade) {
            updateTradeStats(trade);
            createExportIndustriesChart(trade);
            createExportDestinationsChart(trade);
            createExportTrendChart(trade);
        }

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
        if (economyData && economyData.raleigh) {
            createLaborChart(economyData.raleigh.data, currentLaborMetric);
        }
    });

    // Growth metric selector
    document.getElementById('growth-metric-select').addEventListener('change', (e) => {
        currentGrowthMetric = e.target.value;
        if (economyData && economyData.raleigh) {
            createGrowthChart(economyData.raleigh.data, currentGrowthMetric);
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
