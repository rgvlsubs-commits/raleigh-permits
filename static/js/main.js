// Global state
let allPermits = [];
let permitData = null;
let demographicData = null;
let analyticsData = null;
let currentView = 'permits';  // 'permits' or 'units'
let currentStatusFilter = 'all';  // 'all', 'approved', 'completed'
let housingTypeCounts = {};
let unitsByType = {};
let map = null;
let markers = null;
let demographicCircles = [];
let timelineChart = null;
let housingTypeChart = null;
let urbanRingChart = null;
let yearlyTypeChart = null;
let transitChart = null;
let statusChart = null;

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

// Colors for housing types - Wes Anderson palette
const housingTypeColors = {
    'Single Family': wesAnderson.powderBlue,
    'Multifamily': wesAnderson.mustard,
    'Townhome': wesAnderson.sage,
    'Duplex': wesAnderson.lavender,
    'ADU': wesAnderson.salmon,
    'Unknown': wesAnderson.ochre
};

// Colors for urban rings - Wes Anderson palette
const urbanRingColors = {
    'Downtown': wesAnderson.burgundy,
    'Near Downtown': wesAnderson.terracotta,
    'Inner Suburb': wesAnderson.mustard,
    'Outer Suburb': wesAnderson.sage,
    'Unknown': wesAnderson.ochre
};

// Transit score colors - Wes Anderson palette
const transitScoreColors = {
    high: wesAnderson.sage,
    medium: wesAnderson.mustard,
    low: wesAnderson.terracotta
};

// Color scales for demographics - Wes Anderson palette
function getIncomeColor(income) {
    const min = 30000, max = 150000;
    const normalized = Math.min(1, Math.max(0, (income - min) / (max - min)));
    // Cream -> Peach -> Salmon -> Dusty Rose -> Terracotta
    const colors = [wesAnderson.cream, wesAnderson.peach, wesAnderson.salmon, wesAnderson.dustyRose, wesAnderson.terracotta];
    const index = Math.floor(normalized * (colors.length - 1));
    return colors[index];
}

function getRaceColor(percentage) {
    const normalized = Math.min(1, Math.max(0, percentage / 100));
    // Cream -> Powder Blue -> Lavender -> Sage
    const colors = [wesAnderson.cream, wesAnderson.powderBlue, wesAnderson.lavender, wesAnderson.sage];
    const index = Math.floor(normalized * (colors.length - 1));
    return colors[index];
}

function getTransitScoreColor(score) {
    if (score >= 70) return transitScoreColors.high;
    if (score >= 40) return transitScoreColors.medium;
    return transitScoreColors.low;
}

// Filter permits by status
function filterByStatus(permits, statusFilter) {
    if (statusFilter === 'all') {
        return permits;
    }

    return permits.filter(p => {
        const status = (p.status || '').toLowerCase();
        if (statusFilter === 'approved') {
            // Approved = Issued or Finaled
            return status.includes('issued') || status.includes('finaled');
        } else if (statusFilter === 'completed') {
            // Completed = Finaled only
            return status.includes('finaled');
        }
        return true;
    });
}

// Initialize map
function initMap() {
    map = L.map('map').setView([35.7796, -78.6382], 11);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    markers = L.markerClusterGroup({
        chunkedLoading: true,
        maxClusterRadius: 50
    });
    map.addLayer(markers);
}

// Add markers to map
function populateMap(permits) {
    markers.clearLayers();

    permits.forEach(permit => {
        if (permit.lat && permit.lng) {
            const color = housingTypeColors[permit.housing_type] || housingTypeColors.Unknown;
            const radius = Math.min(12, Math.max(6, 6 + (permit.units || 1) * 0.5));

            const marker = L.circleMarker([permit.lat, permit.lng], {
                radius: radius,
                fillColor: color,
                color: wesAnderson.burgundy,
                weight: 2,
                opacity: 1,
                fillOpacity: 0.85
            });

            const transitDisplay = permit.transit_score !== null ? permit.transit_score : 'N/A';
            marker.bindPopup(`
                <strong>${permit.address}</strong><br>
                <b>Permit:</b> ${permit.permit_num}<br>
                <b>Type:</b> ${permit.housing_type}<br>
                <b>Units:</b> ${permit.units || 1}<br>
                <b>Zip:</b> ${permit.zip_code || 'N/A'}<br>
                <b>Ring:</b> ${permit.urban_ring || 'N/A'}<br>
                <b>Transit Score:</b> ${transitDisplay}<br>
                <b>Status:</b> ${permit.status}<br>
                <b>Issued:</b> ${permit.issue_date}
            `);

            markers.addLayer(marker);
        }
    });
}

// Update demographic overlay on map
function updateDemographicOverlay(overlayType) {
    demographicCircles.forEach(circle => map.removeLayer(circle));
    demographicCircles = [];

    const legend = document.getElementById('demographic-legend');

    if (overlayType === 'none' || !demographicData) {
        legend.classList.add('hidden');
        return;
    }

    legend.classList.remove('hidden');

    if (overlayType === 'income') {
        legend.innerHTML = `
            <span>$30k</span>
            <div class="gradient income"></div>
            <span>$150k+</span>
            <span style="margin-left: 1rem;">Median Household Income</span>
        `;
    } else {
        const label = overlayType.charAt(0).toUpperCase() + overlayType.slice(1);
        legend.innerHTML = `
            <span>0%</span>
            <div class="gradient race"></div>
            <span>100%</span>
            <span style="margin-left: 1rem;">% ${label} Population</span>
        `;
    }

    demographicData.zip_data.forEach(zip => {
        if (!zip.center || !zip.center[0]) return;

        let color, value;
        if (overlayType === 'income') {
            color = getIncomeColor(zip.median_income);
            value = `$${zip.median_income.toLocaleString()}`;
        } else {
            const pct = zip.race[overlayType] || 0;
            color = getRaceColor(pct);
            value = `${pct.toFixed(1)}%`;
        }

        const circle = L.circle([zip.center[0], zip.center[1]], {
            radius: 2500,
            fillColor: color,
            color: color,
            weight: 1,
            opacity: 0.6,
            fillOpacity: 0.4
        });

        circle.bindPopup(`
            <strong>${zip.zip_code} - ${zip.name}</strong><br>
            <b>Ring:</b> ${zip.urban_ring || 'N/A'}<br>
            <b>Permits:</b> ${zip.permit_count}<br>
            <b>Median Income:</b> $${zip.median_income.toLocaleString()}<br>
            <b>Population:</b> ${zip.population.toLocaleString()}<br>
            <b>% White:</b> ${zip.race.white}%<br>
            <b>% Black:</b> ${zip.race.black}%<br>
            <b>% Hispanic:</b> ${zip.race.hispanic}%<br>
            <b>% Asian:</b> ${zip.race.asian}%
        `);

        circle.addTo(map);
        demographicCircles.push(circle);
    });
}

// Create timeline chart
function createTimelineChart(data) {
    const ctx = document.getElementById('timeline-chart').getContext('2d');

    if (timelineChart) {
        timelineChart.destroy();
    }

    const formattedLabels = data.labels.map(label => {
        const [year, week] = label.split('-');
        return `${year} W${week}`;
    });

    timelineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: formattedLabels,
            datasets: [{
                label: 'Permits Issued',
                data: data.values,
                borderColor: wesAnderson.burgundy,
                backgroundColor: wesAnderson.peach + '40',
                fill: true,
                tension: 0.3,
                pointRadius: 3,
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
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: wesAnderson.dustyRose + '30' }
                },
                x: {
                    ticks: { maxTicksLimit: 20 },
                    grid: { color: wesAnderson.dustyRose + '30' }
                }
            }
        }
    });
}

// Create housing type chart
function createHousingTypeChart(counts) {
    const ctx = document.getElementById('housing-type-chart').getContext('2d');

    if (housingTypeChart) {
        housingTypeChart.destroy();
    }

    const labels = Object.keys(counts);
    const values = Object.values(counts);
    const colors = labels.map(l => housingTypeColors[l] || housingTypeColors.Unknown);

    housingTypeChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderWidth: 3,
                borderColor: wesAnderson.burgundy
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: wesAnderson.burgundy }
                }
            }
        }
    });
}

// Create urban ring chart
function createUrbanRingChart(counts) {
    const ctx = document.getElementById('urban-ring-chart').getContext('2d');

    if (urbanRingChart) {
        urbanRingChart.destroy();
    }

    const orderedRings = ['Downtown', 'Near Downtown', 'Inner Suburb', 'Outer Suburb', 'Unknown'];
    const labels = orderedRings.filter(r => counts[r]);
    const values = labels.map(l => counts[l]);
    const colors = labels.map(l => urbanRingColors[l] || urbanRingColors.Unknown);

    urbanRingChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Permits',
                data: values,
                backgroundColor: colors,
                borderColor: wesAnderson.burgundy,
                borderWidth: 2,
                borderRadius: 0
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
                    grid: { display: false }
                }
            }
        }
    });
}

// Create yearly trends by type chart
function createYearlyTypeChart(yearlyByType) {
    const ctx = document.getElementById('yearly-type-chart').getContext('2d');

    if (yearlyTypeChart) {
        yearlyTypeChart.destroy();
    }

    const years = Object.keys(yearlyByType).sort();
    const housingTypes = ['Single Family', 'Multifamily', 'Townhome', 'Duplex', 'ADU'];

    const datasets = housingTypes.map(type => ({
        label: type,
        data: years.map(year => yearlyByType[year]?.[type] || 0),
        backgroundColor: housingTypeColors[type],
        borderColor: wesAnderson.burgundy,
        borderWidth: 1
    }));

    yearlyTypeChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: years,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: wesAnderson.burgundy }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    grid: { display: false }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    grid: { color: wesAnderson.dustyRose + '30' }
                }
            }
        }
    });
}

// Create transit score chart
function createTransitChart(transitDist) {
    const ctx = document.getElementById('transit-chart').getContext('2d');

    if (transitChart) {
        transitChart.destroy();
    }

    transitChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['High (70+)', 'Medium (40-69)', 'Low (<40)'],
            datasets: [{
                data: [transitDist.high, transitDist.medium, transitDist.low],
                backgroundColor: [transitScoreColors.high, transitScoreColors.medium, transitScoreColors.low],
                borderWidth: 3,
                borderColor: wesAnderson.burgundy
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: wesAnderson.burgundy }
                },
                title: {
                    display: true,
                    text: `Average Score: ${transitDist.average}`,
                    color: wesAnderson.burgundy
                }
            }
        }
    });
}

// Create status chart
function createStatusChart(statusCounts) {
    const ctx = document.getElementById('status-chart').getContext('2d');

    if (statusChart) {
        statusChart.destroy();
    }

    const labels = Object.keys(statusCounts);
    const values = Object.values(statusCounts);
    const colors = labels.map(l =>
        l.toLowerCase().includes('finaled') ? wesAnderson.sage : wesAnderson.powderBlue
    );

    statusChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderWidth: 3,
                borderColor: wesAnderson.burgundy
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: wesAnderson.burgundy }
                }
            }
        }
    });
}

// Populate demographics table
function populateDemographicsTable(data) {
    const tbody = document.getElementById('demographics-tbody');
    tbody.innerHTML = '';

    data.zip_data.forEach(zip => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${zip.zip_code}</td>
            <td>${zip.name}</td>
            <td>${zip.urban_ring || 'N/A'}</td>
            <td><strong>${zip.permit_count}</strong></td>
            <td>$${zip.median_income.toLocaleString()}</td>
            <td>${zip.population.toLocaleString()}</td>
            <td>${zip.race.white}%</td>
            <td>${zip.race.black}%</td>
            <td>${zip.race.hispanic}%</td>
            <td>${zip.race.asian}%</td>
        `;
        tbody.appendChild(row);
    });
}

// Populate data table
function populateTable(permits) {
    const tbody = document.getElementById('permits-tbody');
    tbody.innerHTML = '';

    permits.slice(0, 500).forEach(permit => {
        const transitDisplay = permit.transit_score !== null ? permit.transit_score : 'N/A';
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${permit.permit_num}</td>
            <td>${permit.housing_type}</td>
            <td>${permit.address}</td>
            <td>${permit.zip_code || 'N/A'}</td>
            <td>${permit.urban_ring || 'N/A'}</td>
            <td>${transitDisplay}</td>
            <td>${permit.issue_date}</td>
            <td>${permit.status}</td>
        `;
        tbody.appendChild(row);
    });
}

// Populate zip filter
function populateZipFilter(zipCounts) {
    const zipSelect = document.getElementById('zip-filter');
    zipSelect.innerHTML = '<option value="">All Zip Codes</option>';
    Object.entries(zipCounts).sort((a, b) => b[1] - a[1]).forEach(([zip, count]) => {
        const option = document.createElement('option');
        option.value = zip;
        option.textContent = `${zip} (${count})`;
        zipSelect.appendChild(option);
    });
}

// Update stats based on current view mode
function updateStats(data) {
    document.getElementById('total-permits').textContent = data.total_count.toLocaleString();
    document.getElementById('total-units').textContent = (data.total_units || 0).toLocaleString();

    // Use permits or units based on current view
    const counts = currentView === 'units' ? unitsByType : housingTypeCounts;
    document.getElementById('single-family-count').textContent = (counts['Single Family'] || 0).toLocaleString();
    document.getElementById('multifamily-count').textContent = (counts['Multifamily'] || 0).toLocaleString();
    document.getElementById('townhome-count').textContent = (counts['Townhome'] || 0).toLocaleString();
}

// Switch view mode between permits and units
function switchViewMode(mode) {
    currentView = mode;

    // Update toggle button states (only view buttons, not status buttons)
    document.querySelectorAll('.toggle-btn[data-view]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === mode);
    });

    // Recalculate with current status filter
    updateStatsFromFiltered();
}

// Switch status filter
function switchStatusFilter(status) {
    currentStatusFilter = status;

    // Update toggle button states (only status buttons)
    document.querySelectorAll('.toggle-btn[data-status]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.status === status);
    });

    // Recalculate everything with new status filter
    updateStatsFromFiltered();
    filterPermits();
}

// Recalculate stats based on current filters
function updateStatsFromFiltered() {
    const statusFiltered = filterByStatus(allPermits, currentStatusFilter);

    // Recalculate counts
    const newHousingCounts = {};
    const newUnitsByType = {};
    let totalUnits = 0;

    statusFiltered.forEach(p => {
        const ht = p.housing_type || 'Unknown';
        const units = p.units || 1;

        newHousingCounts[ht] = (newHousingCounts[ht] || 0) + 1;
        newUnitsByType[ht] = (newUnitsByType[ht] || 0) + units;
        totalUnits += units;
    });

    // Update stats display
    document.getElementById('total-permits').textContent = statusFiltered.length.toLocaleString();
    document.getElementById('total-units').textContent = totalUnits.toLocaleString();

    const counts = currentView === 'units' ? newUnitsByType : newHousingCounts;
    document.getElementById('single-family-count').textContent = (counts['Single Family'] || 0).toLocaleString();
    document.getElementById('multifamily-count').textContent = (counts['Multifamily'] || 0).toLocaleString();
    document.getElementById('townhome-count').textContent = (counts['Townhome'] || 0).toLocaleString();

    // Update housing type chart
    createHousingTypeChart(counts);

    // Update urban ring counts
    const ringCounts = {};
    statusFiltered.forEach(p => {
        const ring = p.urban_ring || 'Unknown';
        ringCounts[ring] = (ringCounts[ring] || 0) + 1;
    });
    createUrbanRingChart(ringCounts);
}

// Filter permits
function filterPermits() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const housingTypeFilter = document.getElementById('housing-type-filter').value;
    const yearFilter = document.getElementById('year-filter').value;
    const urbanRingFilter = document.getElementById('urban-ring-filter').value;
    const zipFilter = document.getElementById('zip-filter').value;

    // Start with status-filtered permits
    let filtered = filterByStatus(allPermits, currentStatusFilter);

    if (housingTypeFilter) {
        filtered = filtered.filter(p => p.housing_type === housingTypeFilter);
    }

    if (yearFilter) {
        const year = parseInt(yearFilter);
        filtered = filtered.filter(p => p.issue_year === year);
    }

    if (urbanRingFilter) {
        filtered = filtered.filter(p => p.urban_ring === urbanRingFilter);
    }

    if (zipFilter) {
        filtered = filtered.filter(p => p.zip_code === zipFilter);
    }

    if (searchTerm) {
        filtered = filtered.filter(p =>
            p.address.toLowerCase().includes(searchTerm) ||
            p.permit_num.toLowerCase().includes(searchTerm) ||
            (p.zip_code && p.zip_code.includes(searchTerm))
        );
    }

    populateTable(filtered);
    populateMap(filtered);
}

// Load residential permit data (new endpoint)
async function loadResidentialData() {
    const response = await fetch('/api/permits/residential');
    if (!response.ok) throw new Error('Failed to fetch residential permits');
    return response.json();
}

// Load analytics data
async function loadAnalyticsData() {
    const response = await fetch('/api/analytics');
    if (!response.ok) throw new Error('Failed to fetch analytics');
    return response.json();
}

// Load demographic data
async function loadDemographicData() {
    const response = await fetch('/api/demographics');
    if (!response.ok) throw new Error('Failed to fetch demographics');
    return response.json();
}

// Load all data
async function loadData() {
    try {
        // Load all datasets in parallel
        const [permits, analytics, demographics] = await Promise.all([
            loadResidentialData(),
            loadAnalyticsData(),
            loadDemographicData()
        ]);

        permitData = permits;
        analyticsData = analytics;
        demographicData = demographics;
        allPermits = permits.permits;
        
        // Store both permit counts and unit counts
        housingTypeCounts = analytics.housing_type_counts || {};
        unitsByType = analytics.units_by_type || {};

        // Update UI with permit data
        updateStats(permits);
        populateMap(permits.permits);
        createTimelineChart(analytics.timeline || { labels: [], values: [] });
        createHousingTypeChart(analytics.housing_type_counts);
        createUrbanRingChart(analytics.urban_ring_counts);
        createYearlyTypeChart(analytics.yearly_by_type);
        createTransitChart(analytics.transit_distribution);
        createStatusChart(analytics.status_counts || {});
        populateTable(permits.permits);
        populateZipFilter(permits.unfiltered_totals?.zip_counts || permits.zip_counts || {});

        // Update demographics table
        populateDemographicsTable(demographics);

        // Hide loading overlay
        document.getElementById('loading').classList.add('hidden');

    } catch (error) {
        console.error('Error loading data:', error);
        document.getElementById('loading').innerHTML = `
            <p style="color: #ef4444;">Error loading data: ${error.message}</p>
            <p>Please refresh the page to try again.</p>
        `;
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initMap();

    // Set up filter event listeners
    document.getElementById('search-input').addEventListener('input', filterPermits);
    document.getElementById('housing-type-filter').addEventListener('change', filterPermits);
    document.getElementById('year-filter').addEventListener('change', filterPermits);
    document.getElementById('urban-ring-filter').addEventListener('change', filterPermits);
    document.getElementById('zip-filter').addEventListener('change', filterPermits);

    // Demographic overlay listener
    document.getElementById('demographic-overlay').addEventListener('change', (e) => {
        updateDemographicOverlay(e.target.value);
    });

    // View toggle listener
    document.querySelectorAll('.toggle-btn[data-view]').forEach(btn => {
        btn.addEventListener('click', () => {
            switchViewMode(btn.dataset.view);
        });
    });

    // Status toggle listener
    document.querySelectorAll('.toggle-btn[data-status]').forEach(btn => {
        btn.addEventListener('click', () => {
            switchStatusFilter(btn.dataset.status);
        });
    });

    // Load data
    loadData();
});
