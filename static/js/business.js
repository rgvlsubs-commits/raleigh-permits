// Commercial Development Dashboard JavaScript
// Handles data fetching, chart rendering, and interactive map

// Global state
let permitData = null;
let pipelineData = null;
let mapData = null;
let trendChart = null;
let map = null;
let markerCluster = null;
let allMarkers = [];
let currentTrendMode = 'permits'; // 'permits' or 'investment'
let currentYearFilter = 'all';
let currentCategoryFilter = 'all';

// Wes Anderson Color Palette
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

// Raleigh center coordinates
const RALEIGH_CENTER = [35.7796, -78.6382];

// =============================================================================
// API FUNCTIONS
// =============================================================================
async function fetchPermitData() {
    const response = await fetch('/business/api/permits');
    if (!response.ok) throw new Error('Failed to fetch permit data');
    return response.json();
}

async function fetchPipelineData() {
    const response = await fetch('/business/api/pipeline');
    if (!response.ok) throw new Error('Failed to fetch pipeline data');
    return response.json();
}

async function fetchMapData() {
    const response = await fetch('/business/api/map');
    if (!response.ok) throw new Error('Failed to fetch map data');
    return response.json();
}

// =============================================================================
// FORMATTING HELPERS
// =============================================================================
function formatCurrency(value) {
    if (value >= 1000000000) {
        return `$${(value / 1000000000).toFixed(1)}B`;
    } else if (value >= 1000000) {
        return `$${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
        return `$${(value / 1000).toFixed(0)}K`;
    }
    return `$${value.toFixed(0)}`;
}

function formatNumber(value) {
    return value.toLocaleString();
}

// =============================================================================
// STATS DISPLAY
// =============================================================================
function updateStats(permits, pipeline) {
    const analytics = permits.analytics;

    document.getElementById('total-permits').textContent =
        formatNumber(analytics.total_permits);

    document.getElementById('total-investment').textContent =
        formatCurrency(analytics.total_investment);

    document.getElementById('pipeline-total').textContent =
        formatNumber(pipeline.total_pipeline.count);
}

// =============================================================================
// CHART FUNCTIONS
// =============================================================================
function createTrendChart(data, mode) {
    const ctx = document.getElementById('trend-chart').getContext('2d');

    if (trendChart) {
        trendChart.destroy();
    }

    const monthly = data.analytics.monthly;
    const recent = monthly.slice(-24);

    const isPermits = mode === 'permits';
    const chartData = isPermits
        ? recent.map(m => m.count)
        : recent.map(m => m.investment / 1000000);

    trendChart = new Chart(ctx, {
        type: isPermits ? 'bar' : 'line',
        data: {
            labels: recent.map(m => m.month),
            datasets: [{
                label: isPermits ? 'New Permits' : 'Investment ($M)',
                data: chartData,
                backgroundColor: isPermits ? wesAnderson.burgundy + 'CC' : wesAnderson.sage + '30',
                borderColor: isPermits ? wesAnderson.burgundy : wesAnderson.sage,
                borderWidth: 2,
                fill: !isPermits,
                tension: 0.3,
                pointRadius: isPermits ? 0 : 3,
                pointHoverRadius: isPermits ? 0 : 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => isPermits
                            ? `${ctx.raw} permits`
                            : `$${ctx.raw.toFixed(1)}M`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: wesAnderson.dustyRose + '30' },
                    title: {
                        display: true,
                        text: isPermits ? 'Permits' : 'Investment ($ Millions)'
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: { maxTicksLimit: 12 }
                }
            }
        }
    });
}


// =============================================================================
// MAP FUNCTIONS
// =============================================================================
function initMap() {
    map = L.map('map').setView(RALEIGH_CENTER, 11);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);

    markerCluster = L.markerClusterGroup({
        chunkedLoading: true,
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false
    });

    map.addLayer(markerCluster);
}

function createMarker(point) {
    const marker = L.circleMarker(point.coords, {
        radius: Math.min(12, Math.max(6, Math.log10(point.cost + 1) * 2.5)),
        fillColor: point.color,
        color: wesAnderson.burgundy,
        weight: 1,
        opacity: 1,
        fillOpacity: 0.8
    });

    const popupContent = `
        <div class="permit-popup">
            <strong>${point.name}</strong><br>
            <span style="color: ${point.color}; font-weight: 600;">${point.category}</span><br>
            ${point.address}<br>
            <strong>${formatCurrency(point.cost)}</strong><br>
            <small>${point.date}</small>
        </div>
    `;

    marker.bindPopup(popupContent);
    marker.category = point.category;
    marker.year = point.year;

    return marker;
}

function populateMap(data) {
    if (!map) {
        initMap();
    }

    markerCluster.clearLayers();
    allMarkers = [];

    data.points.forEach(point => {
        const marker = createMarker(point);
        allMarkers.push(marker);
        markerCluster.addLayer(marker);
    });

    // Build category toggle buttons
    buildCategoryToggles(data.category_colors);

    // Setup year slider
    setupYearSlider(data.year_range);
}

function buildCategoryToggles(categoryColors) {
    const container = document.getElementById('category-toggle');
    // Keep the "All" button
    container.innerHTML = '<button class="toggle-btn category-btn active" data-category="all">All</button>';

    Object.entries(categoryColors).forEach(([category, color]) => {
        const btn = document.createElement('button');
        btn.className = 'toggle-btn category-btn';
        btn.dataset.category = category;
        btn.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};margin-right:5px;"></span>${category}`;
        btn.addEventListener('click', () => {
            // Update active state
            container.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentCategoryFilter = category;
            filterMap();
            updateNeighborhoodTables();
        });
        container.appendChild(btn);
    });

    // Add click handler for "All" button
    container.querySelector('[data-category="all"]').addEventListener('click', (e) => {
        container.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentCategoryFilter = 'all';
        filterMap();
        updateNeighborhoodTables();
    });
}

function setupYearSlider(yearRange) {
    const slider = document.getElementById('year-slider');
    const display = document.getElementById('year-display');

    if (!yearRange) return;

    // Set slider range: add one extra step at the beginning for "All Years"
    slider.min = yearRange.min - 1;  // Extra position for "all"
    slider.max = yearRange.max;
    slider.value = yearRange.min - 1;  // Start at "All Years"

    updateYearDisplay(slider.value, yearRange.min);
}

function updateYearDisplay(value, minYear) {
    const display = document.getElementById('year-display');
    if (parseInt(value) < minYear) {
        display.textContent = 'All Years';
        currentYearFilter = 'all';
    } else {
        display.textContent = value + '+';
        currentYearFilter = parseInt(value);
    }
}

function filterMap() {
    markerCluster.clearLayers();

    allMarkers.forEach(marker => {
        const matchesCategory = currentCategoryFilter === 'all' || marker.category === currentCategoryFilter;
        const matchesYear = currentYearFilter === 'all' || marker.year >= currentYearFilter;

        if (matchesCategory && matchesYear) {
            markerCluster.addLayer(marker);
        }
    });
}

// =============================================================================
// NEIGHBORHOOD TABLE FUNCTIONS
// =============================================================================
// Zip code to neighborhood name mapping
const ZIP_NEIGHBORHOODS = {
    '27601': 'Downtown',
    '27603': 'South Raleigh',
    '27604': 'Northeast Raleigh',
    '27605': 'Glenwood South / Five Points',
    '27606': 'NC State / Avent Ferry',
    '27607': 'North Hills',
    '27608': 'Mordecai / Oakwood',
    '27609': 'Midtown / Crabtree',
    '27610': 'East Raleigh',
    '27612': 'Northwest Raleigh',
    '27613': 'Falls of Neuse',
    '27614': 'Wake Forest Area',
    '27615': 'North Raleigh',
    '27616': 'Triangle Town',
    '27617': 'Brier Creek',
};

function getNeighborhoodName(zip) {
    return ZIP_NEIGHBORHOODS[zip] || `Zip ${zip}`;
}

function updateNeighborhoodTables() {
    if (!mapData) return;

    const container = document.getElementById('neighborhood-tables');
    container.innerHTML = '';

    // Filter points by current filters
    const filteredPoints = mapData.points.filter(point => {
        const matchesCategory = currentCategoryFilter === 'all' || point.category === currentCategoryFilter;
        const matchesYear = currentYearFilter === 'all' || point.year >= currentYearFilter;
        return matchesCategory && matchesYear;
    });

    // Group by zip code
    const byNeighborhood = {};
    filteredPoints.forEach(point => {
        const zip = point.zip_code || 'Other';
        const neighborhood = getNeighborhoodName(zip);

        if (!byNeighborhood[neighborhood]) {
            byNeighborhood[neighborhood] = {
                zip: zip,
                projects: [],
                totalInvestment: 0
            };
        }
        byNeighborhood[neighborhood].projects.push(point);
        byNeighborhood[neighborhood].totalInvestment += point.cost || 0;
    });

    // Sort neighborhoods by total investment
    const sorted = Object.entries(byNeighborhood)
        .sort((a, b) => b[1].totalInvestment - a[1].totalInvestment);

    if (sorted.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:var(--burgundy);">No projects match the current filters.</p>';
        return;
    }

    sorted.forEach(([neighborhood, data], index) => {
        const section = document.createElement('div');
        section.className = 'neighborhood-section';

        // Sort projects by cost within neighborhood
        data.projects.sort((a, b) => (b.cost || 0) - (a.cost || 0));

        const isCollapsed = index > 2; // Collapse after first 3

        section.innerHTML = `
            <div class="neighborhood-header" data-target="neighborhood-${index}">
                <h3>${neighborhood}</h3>
                <div class="neighborhood-stats">
                    <span>${data.projects.length} projects</span>
                    <span>${formatCurrency(data.totalInvestment)}</span>
                    <span style="font-size:1.2rem;">${isCollapsed ? '▶' : '▼'}</span>
                </div>
            </div>
            <div class="neighborhood-content ${isCollapsed ? 'collapsed' : ''}" id="neighborhood-${index}">
                <table>
                    <thead>
                        <tr>
                            <th>Project</th>
                            <th>Address</th>
                            <th>Est. Cost</th>
                            <th>Category</th>
                            <th>Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.projects.slice(0, 10).map(p => `
                            <tr>
                                <td><strong>${(p.name || 'Unnamed').substring(0, 35)}${p.name?.length > 35 ? '...' : ''}</strong></td>
                                <td>${p.address || 'N/A'}</td>
                                <td>${formatCurrency(p.cost || 0)}</td>
                                <td><span style="color:${p.color}">${p.category}</span></td>
                                <td>${p.date || 'N/A'}</td>
                            </tr>
                        `).join('')}
                        ${data.projects.length > 10 ? `<tr><td colspan="5" style="text-align:center;font-style:italic;">+ ${data.projects.length - 10} more projects</td></tr>` : ''}
                    </tbody>
                </table>
            </div>
        `;

        // Add collapse toggle
        section.querySelector('.neighborhood-header').addEventListener('click', (e) => {
            const content = section.querySelector('.neighborhood-content');
            const arrow = section.querySelector('.neighborhood-stats span:last-child');
            content.classList.toggle('collapsed');
            arrow.textContent = content.classList.contains('collapsed') ? '▶' : '▼';
        });

        container.appendChild(section);
    });
}

// =============================================================================
// MAIN DATA LOADING
// =============================================================================
async function loadData() {
    try {
        // Fetch data in parallel
        const [permits, pipeline, mapPoints] = await Promise.all([
            fetchPermitData(),
            fetchPipelineData(),
            fetchMapData()
        ]);

        permitData = permits;
        pipelineData = pipeline;
        mapData = mapPoints;

        // Update stats
        updateStats(permits, pipeline);

        // Create trend chart
        createTrendChart(permits, currentTrendMode);

        // Populate map
        populateMap(mapPoints);

        // Populate neighborhood tables
        updateNeighborhoodTables();

        // Hide loading overlay
        document.getElementById('loading').classList.add('hidden');

    } catch (error) {
        console.error('Error loading business data:', error);
        document.getElementById('loading').innerHTML = `
            <p style="color: #ef4444;">Error loading data: ${error.message}</p>
            <p>Please refresh the page to try again.</p>
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

    // Chart toggle buttons
    document.getElementById('toggle-permits').addEventListener('click', (e) => {
        if (currentTrendMode !== 'permits') {
            currentTrendMode = 'permits';
            document.getElementById('toggle-permits').classList.add('active');
            document.getElementById('toggle-investment').classList.remove('active');
            createTrendChart(permitData, currentTrendMode);
        }
    });

    document.getElementById('toggle-investment').addEventListener('click', (e) => {
        if (currentTrendMode !== 'investment') {
            currentTrendMode = 'investment';
            document.getElementById('toggle-investment').classList.add('active');
            document.getElementById('toggle-permits').classList.remove('active');
            createTrendChart(permitData, currentTrendMode);
        }
    });

    // Year slider - updates both map and neighborhood tables
    document.getElementById('year-slider').addEventListener('input', (e) => {
        const minYear = mapData?.year_range?.min || 2020;
        updateYearDisplay(e.target.value, minYear);
        filterMap();
        updateNeighborhoodTables();
    });

    // Load data
    loadData();
});
