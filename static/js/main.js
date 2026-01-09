// Global state
let allPermits = [];
let map = null;
let markers = null;
let timelineChart = null;
let typeChart = null;

// Permit type colors
const typeColors = {
    'Building': '#2563eb',
    'Electrical': '#f59e0b',
    'Mechanical': '#10b981',
    'Plumbing': '#8b5cf6',
    'Fire': '#ef4444',
    'Demolition': '#6b7280',
    'default': '#94a3b8'
};

function getTypeColor(type) {
    for (const [key, color] of Object.entries(typeColors)) {
        if (type && type.toLowerCase().includes(key.toLowerCase())) {
            return color;
        }
    }
    return typeColors.default;
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
            const color = getTypeColor(permit.type);
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
                <b>Type:</b> ${permit.type}<br>
                <b>Status:</b> ${permit.status}<br>
                <b>Issued:</b> ${permit.issue_date}
            `);

            markers.addLayer(marker);
        }
    });
}

// Create timeline chart
function createTimelineChart(data) {
    const ctx = document.getElementById('timeline-chart').getContext('2d');

    if (timelineChart) {
        timelineChart.destroy();
    }

    // Format labels (convert "2024-05" to "Week 5, 2024")
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
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

// Create type breakdown chart
function createTypeChart(typeCounts) {
    const ctx = document.getElementById('type-chart').getContext('2d');

    if (typeChart) {
        typeChart.destroy();
    }

    const labels = Object.keys(typeCounts).slice(0, 10); // Top 10 types
    const values = labels.map(l => typeCounts[l]);
    const colors = labels.map(l => getTypeColor(l));

    typeChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Count',
                data: values,
                backgroundColor: colors,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    beginAtZero: true
                }
            }
        }
    });
}

// Populate data table
function populateTable(permits) {
    const tbody = document.getElementById('permits-tbody');
    tbody.innerHTML = '';

    permits.forEach(permit => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${permit.permit_num}</td>
            <td>${permit.type}</td>
            <td>${permit.address}</td>
            <td>${permit.issue_date}</td>
            <td>${permit.status}</td>
        `;
        tbody.appendChild(row);
    });
}

// Populate type filter dropdown
function populateTypeFilter(typeCounts) {
    const select = document.getElementById('type-filter');
    select.innerHTML = '<option value="">All Types</option>';

    Object.keys(typeCounts).forEach(type => {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = `${type} (${typeCounts[type]})`;
        select.appendChild(option);
    });
}

// Update stats
function updateStats(data) {
    document.getElementById('total-permits').textContent = data.total_count.toLocaleString();

    const topType = Object.keys(data.type_counts)[0];
    document.getElementById('top-type').textContent = topType || '--';

    document.getElementById('unique-types').textContent = Object.keys(data.type_counts).length;
}

// Filter permits
function filterPermits() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const typeFilter = document.getElementById('type-filter').value;

    let filtered = allPermits;

    if (typeFilter) {
        filtered = filtered.filter(p => p.type === typeFilter);
    }

    if (searchTerm) {
        filtered = filtered.filter(p =>
            p.address.toLowerCase().includes(searchTerm) ||
            p.permit_num.toLowerCase().includes(searchTerm) ||
            p.type.toLowerCase().includes(searchTerm)
        );
    }

    populateTable(filtered);
    populateMap(filtered);
}

// Load data
async function loadData() {
    try {
        const response = await fetch('/api/permits');
        if (!response.ok) {
            throw new Error('Failed to fetch data');
        }

        const data = await response.json();

        allPermits = data.permits;

        // Update UI
        updateStats(data);
        populateMap(data.permits);
        createTimelineChart(data.timeline);
        createTypeChart(data.type_counts);
        populateTable(data.permits);
        populateTypeFilter(data.type_counts);

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

    // Set up event listeners
    document.getElementById('search-input').addEventListener('input', filterPermits);
    document.getElementById('type-filter').addEventListener('change', filterPermits);

    // Load data
    loadData();
});
