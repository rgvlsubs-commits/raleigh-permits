// Global state
let allPermits = [];
let permitData = null;
let demographicData = null;
let map = null;
let markers = null;
let demographicCircles = [];
let timelineChart = null;
let classChart = null;
let statusChart = null;
let workChart = null;
let housingChart = null;

// Colors for categories
const colors = {
    residential: '#2563eb',
    commercial: '#f59e0b',
    new: '#10b981',
    existing: '#6b7280',
    issued: '#3b82f6',
    finaled: '#22c55e',
    housing: ['#2563eb', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4', '#f97316', '#84cc16']
};

// Color scales for demographics
function getIncomeColor(income) {
    const min = 30000, max = 150000;
    const normalized = Math.min(1, Math.max(0, (income - min) / (max - min)));
    const colors = ['#fee2e2', '#fecaca', '#fca5a5', '#f87171', '#ef4444', '#dc2626', '#b91c1c'];
    const index = Math.floor(normalized * (colors.length - 1));
    return colors[index];
}

function getRaceColor(percentage) {
    const normalized = Math.min(1, Math.max(0, percentage / 100));
    const colors = ['#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8'];
    const index = Math.floor(normalized * (colors.length - 1));
    return colors[index];
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
            const isResidential = permit.permit_class === 'Residential';
            const color = isResidential ? colors.residential : colors.commercial;

            const marker = L.circleMarker([permit.lat, permit.lng], {
                radius: 8,
                fillColor: color,
                color: '#fff',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8
            });

            marker.bindPopup(`
                <strong>${permit.address}</strong><br>
                <b>Permit:</b> ${permit.permit_num}<br>
                <b>Class:</b> ${permit.permit_class}<br>
                <b>Type:</b> ${permit.housing_type}<br>
                <b>Zip:</b> ${permit.zip_code || 'N/A'}<br>
                <b>Status:</b> ${permit.status}<br>
                <b>Issued:</b> ${permit.issue_date}
            `);

            markers.addLayer(marker);
        }
    });
}

// Update demographic overlay on map
function updateDemographicOverlay(overlayType) {
    // Remove existing circles
    demographicCircles.forEach(circle => map.removeLayer(circle));
    demographicCircles = [];

    const legend = document.getElementById('demographic-legend');

    if (overlayType === 'none' || !demographicData) {
        legend.classList.add('hidden');
        return;
    }

    legend.classList.remove('hidden');

    // Update legend
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

    // Add demographic circles
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
        return `W${week}`;
    });

    timelineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: formattedLabels,
            datasets: [{
                label: 'Permits Issued',
                data: data.values,
                borderColor: '#1e3a5f',
                backgroundColor: 'rgba(30, 58, 95, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

// Create pie/doughnut chart for Residential vs Non-Residential
function createClassChart(classCounts) {
    const ctx = document.getElementById('class-chart').getContext('2d');

    if (classChart) {
        classChart.destroy();
    }

    const labels = Object.keys(classCounts);
    const values = Object.values(classCounts);
    const chartColors = labels.map(l =>
        l === 'Residential' ? colors.residential : colors.commercial
    );

    classChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: chartColors,
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' }
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
    const chartColors = labels.map(l =>
        l.toLowerCase().includes('finaled') ? colors.finaled : colors.issued
    );

    statusChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: chartColors,
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });
}

// Create work type chart (New vs Existing)
function createWorkChart(workCounts) {
    const ctx = document.getElementById('work-chart').getContext('2d');

    if (workChart) {
        workChart.destroy();
    }

    const labels = Object.keys(workCounts);
    const values = Object.values(workCounts);
    const chartColors = labels.map(l =>
        l === 'New' ? colors.new : colors.existing
    );

    workChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: chartColors,
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });
}

// Create housing type chart
function createHousingChart(housingCounts) {
    const ctx = document.getElementById('housing-chart').getContext('2d');

    if (housingChart) {
        housingChart.destroy();
    }

    const sorted = Object.entries(housingCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);

    const labels = sorted.map(s => s[0]);
    const values = sorted.map(s => s[1]);

    housingChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Count',
                data: values,
                backgroundColor: colors.housing,
                borderRadius: 4
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
                x: { beginAtZero: true }
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
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${permit.permit_num}</td>
            <td>${permit.permit_class}</td>
            <td>${permit.housing_type}</td>
            <td>${permit.address}</td>
            <td>${permit.zip_code || 'N/A'}</td>
            <td>${permit.issue_date}</td>
            <td>${permit.status}</td>
        `;
        tbody.appendChild(row);
    });
}

// Populate filter dropdowns
function populateFilters(data) {
    // Class filter
    const classSelect = document.getElementById('class-filter');
    classSelect.innerHTML = '<option value="">All Classes</option>';
    Object.keys(data.class_counts).forEach(cls => {
        const option = document.createElement('option');
        option.value = cls;
        option.textContent = `${cls} (${data.class_counts[cls]})`;
        classSelect.appendChild(option);
    });

    // Housing filter
    const housingSelect = document.getElementById('housing-filter');
    housingSelect.innerHTML = '<option value="">All Housing Types</option>';
    Object.keys(data.housing_counts).forEach(type => {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = `${type} (${data.housing_counts[type]})`;
        housingSelect.appendChild(option);
    });

    // Status filter
    const statusSelect = document.getElementById('status-filter');
    statusSelect.innerHTML = '<option value="">All Statuses</option>';
    Object.keys(data.status_counts).forEach(status => {
        const option = document.createElement('option');
        option.value = status;
        option.textContent = `${status} (${data.status_counts[status]})`;
        statusSelect.appendChild(option);
    });

    // Zip filter
    const zipSelect = document.getElementById('zip-filter');
    zipSelect.innerHTML = '<option value="">All Zip Codes</option>';
    Object.keys(data.zip_counts).forEach(zip => {
        const option = document.createElement('option');
        option.value = zip;
        option.textContent = `${zip} (${data.zip_counts[zip]})`;
        zipSelect.appendChild(option);
    });
}

// Update stats
function updateStats(data) {
    document.getElementById('total-permits').textContent = data.total_count.toLocaleString();

    const residential = data.class_counts['Residential'] || 0;
    const commercial = data.class_counts['Non-Residential'] || 0;
    document.getElementById('residential-count').textContent = residential.toLocaleString();
    document.getElementById('commercial-count').textContent = commercial.toLocaleString();

    const newConstruction = data.work_counts['New'] || 0;
    document.getElementById('new-construction').textContent = newConstruction.toLocaleString();

    const finaled = data.status_counts['Permit Finaled'] || 0;
    document.getElementById('finaled-count').textContent = finaled.toLocaleString();
}

// Filter permits
function filterPermits() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const classFilter = document.getElementById('class-filter').value;
    const housingFilter = document.getElementById('housing-filter').value;
    const statusFilter = document.getElementById('status-filter').value;
    const zipFilter = document.getElementById('zip-filter').value;

    let filtered = allPermits;

    if (classFilter) {
        filtered = filtered.filter(p => p.permit_class === classFilter);
    }

    if (housingFilter) {
        filtered = filtered.filter(p => p.housing_type === housingFilter);
    }

    if (statusFilter) {
        filtered = filtered.filter(p => p.status === statusFilter);
    }

    if (zipFilter) {
        filtered = filtered.filter(p => p.zip_code === zipFilter);
    }

    if (searchTerm) {
        filtered = filtered.filter(p =>
            p.address.toLowerCase().includes(searchTerm) ||
            p.permit_num.toLowerCase().includes(searchTerm) ||
            p.housing_type.toLowerCase().includes(searchTerm) ||
            (p.zip_code && p.zip_code.includes(searchTerm))
        );
    }

    populateTable(filtered);
    populateMap(filtered);
}

// Load permit data
async function loadPermitData() {
    const response = await fetch('/api/permits');
    if (!response.ok) throw new Error('Failed to fetch permits');
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
        // Load both datasets in parallel
        const [permits, demographics] = await Promise.all([
            loadPermitData(),
            loadDemographicData()
        ]);

        permitData = permits;
        demographicData = demographics;
        allPermits = permits.permits;

        // Update UI with permit data
        updateStats(permits);
        populateMap(permits.permits);
        createTimelineChart(permits.timeline);
        createClassChart(permits.class_counts);
        createStatusChart(permits.status_counts);
        createWorkChart(permits.work_counts);
        createHousingChart(permits.housing_counts);
        populateTable(permits.permits);
        populateFilters(permits);

        // Update demographics table
        populateDemographicsTable(demographics);

        // Hide loading overlay
        document.getElementById('loading').classList.add('hidden');

    } catch (error) {
        console.error('Error loading data:', error);
        document.getElementById('loading').innerHTML = `
            <p style="color: #ef4444;">Error loading data. Please refresh the page.</p>
        `;
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initMap();

    // Set up filter event listeners
    document.getElementById('search-input').addEventListener('input', filterPermits);
    document.getElementById('class-filter').addEventListener('change', filterPermits);
    document.getElementById('housing-filter').addEventListener('change', filterPermits);
    document.getElementById('status-filter').addEventListener('change', filterPermits);
    document.getElementById('zip-filter').addEventListener('change', filterPermits);

    // Demographic overlay listener
    document.getElementById('demographic-overlay').addEventListener('change', (e) => {
        updateDemographicOverlay(e.target.value);
    });

    // Load data
    loadData();
});
