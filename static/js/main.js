// Global state
let allPermits = [];
let permitData = null;
let demographicData = null;
let analyticsData = null;
let currentStatusFilter = 'all';  // 'all', 'approved', 'completed'

// Chart-specific view modes
const chartViews = {
    timeline: 'permits',
    housing: 'permits',
    ring: 'permits',
    yearly: 'permits',
    transit: 'permits',
    status: 'permits'
};

// Chart-specific ring filters
const chartRingFilters = {
    timeline: '',
    housing: '',
    yearly: '',
    transit: '',
    status: ''
};

// Table sorting state
let tableSortColumn = 'permits';
let tableSortDirection = 'desc';

// Cached chart data (permits and units)
let chartData = {
    housingPermits: {},
    housingUnits: {},
    ringPermits: {},
    ringUnits: {},
    yearlyPermits: {},
    yearlyUnits: {},
    timelinePermits: {},
    timelineUnits: {},
    transitPermits: { high: 0, medium: 0, low: 0, average: 0 },
    transitUnits: { high: 0, medium: 0, low: 0, average: 0, weightedAverage: 0 },
    statusPermits: {},
    statusUnits: {},
    zipPermits: {},
    zipUnits: {}
};
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
    'Small Multifamily': wesAnderson.ochre,
    'Townhome': wesAnderson.sage,
    'Duplex': wesAnderson.lavender,
    'ADU': wesAnderson.salmon,
    'Unknown': wesAnderson.dustyRose
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

    const label = chartViews.timeline === 'units' ? 'Units' : 'Permits';
    timelineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: formattedLabels,
            datasets: [{
                label: label,
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

    const dataLabel = chartViews.ring === 'units' ? 'Units' : 'Permits';
    urbanRingChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: dataLabel,
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
function createTransitChart(transitDist, isUnits = false) {
    const ctx = document.getElementById('transit-chart').getContext('2d');

    if (transitChart) {
        transitChart.destroy();
    }

    // Show weighted average for units view
    const avgScore = isUnits ? transitDist.weightedAverage : transitDist.average;
    const avgLabel = isUnits ? `Weighted Avg: ${avgScore}` : `Avg Score: ${avgScore}`;

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
                    text: avgLabel,
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

// Populate demographics table (initial load)
function populateDemographicsTable(data) {
    // Store demographic data for later updates
    window.demographicZipData = data.zip_data;
    updateDemographicsTable();
}

// Update demographics table with current permit/unit counts
function updateDemographicsTable() {
    const tbody = document.getElementById('demographics-tbody');
    tbody.innerHTML = '';

    if (!window.demographicZipData) return;

    // Create enriched data with permit/unit counts
    const enrichedData = window.demographicZipData.map(zip => ({
        ...zip,
        permits: chartData.zipPermits[zip.zip_code] || 0,
        units: chartData.zipUnits[zip.zip_code] || 0
    }));

    // Sort based on current sort column and direction
    const sortedData = [...enrichedData].sort((a, b) => {
        let aVal, bVal;

        switch(tableSortColumn) {
            case 'zip': aVal = a.zip_code; bVal = b.zip_code; break;
            case 'name': aVal = a.name; bVal = b.name; break;
            case 'ring': aVal = a.urban_ring || ''; bVal = b.urban_ring || ''; break;
            case 'permits': aVal = a.permits; bVal = b.permits; break;
            case 'units': aVal = a.units; bVal = b.units; break;
            case 'income': aVal = a.median_income; bVal = b.median_income; break;
            case 'population': aVal = a.population; bVal = b.population; break;
            case 'white': aVal = a.race.white; bVal = b.race.white; break;
            case 'black': aVal = a.race.black; bVal = b.race.black; break;
            case 'hispanic': aVal = a.race.hispanic; bVal = b.race.hispanic; break;
            case 'asian': aVal = a.race.asian; bVal = b.race.asian; break;
            default: aVal = a.permits; bVal = b.permits;
        }

        // String comparison for text columns
        if (typeof aVal === 'string') {
            const cmp = aVal.localeCompare(bVal);
            return tableSortDirection === 'asc' ? cmp : -cmp;
        }

        // Numeric comparison
        return tableSortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });

    sortedData.forEach(zip => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${zip.zip_code}</td>
            <td>${zip.name}</td>
            <td>${zip.urban_ring || 'N/A'}</td>
            <td><strong>${zip.permits.toLocaleString()}</strong></td>
            <td><strong>${zip.units.toLocaleString()}</strong></td>
            <td>$${zip.median_income.toLocaleString()}</td>
            <td>${zip.population.toLocaleString()}</td>
            <td>${zip.race.white}%</td>
            <td>${zip.race.black}%</td>
            <td>${zip.race.hispanic}%</td>
            <td>${zip.race.asian}%</td>
        `;
        tbody.appendChild(row);
    });

    // Update header sort indicators
    document.querySelectorAll('#demographics-table th.sortable').forEach(th => {
        th.classList.remove('asc', 'desc');
        if (th.dataset.sort === tableSortColumn) {
            th.classList.add(tableSortDirection);
        }
    });
}

// Sort demographics table by column
function sortDemographicsTable(column) {
    if (tableSortColumn === column) {
        // Toggle direction
        tableSortDirection = tableSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        // New column, default to descending for numbers, ascending for text
        tableSortColumn = column;
        tableSortDirection = ['zip', 'name', 'ring'].includes(column) ? 'asc' : 'desc';
    }
    updateDemographicsTable();
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

// Switch status filter
function switchStatusFilter(status) {
    currentStatusFilter = status;

    // Update toggle button states (only status buttons)
    document.querySelectorAll('.toggle-btn[data-status]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.status === status);
    });

    // Recalculate everything with new status filter
    recalculateChartData();
    updateStatsDisplay();
    updateAllCharts();
    updateDemographicsTable();
    filterPermits();
}

// Toggle individual chart between permits and units
function toggleChart(chartName, value) {
    chartViews[chartName] = value;

    // Update button states for this chart
    const toggleContainer = document.querySelector(`.chart-toggle[data-chart="${chartName}"]`);
    if (toggleContainer) {
        toggleContainer.querySelectorAll('.mini-toggle').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.value === value);
        });
    }

    // Update just this chart
    updateChart(chartName);
}

// Recalculate all chart data based on current status filter
function recalculateChartData() {
    const statusFiltered = filterByStatus(allPermits, currentStatusFilter);

    // Reset chart data
    chartData.housingPermits = {};
    chartData.housingUnits = {};
    chartData.ringPermits = {};
    chartData.ringUnits = {};
    chartData.yearlyPermits = {};
    chartData.yearlyUnits = {};
    chartData.timelinePermits = {};
    chartData.timelineUnits = {};
    chartData.transitPermits = { high: 0, medium: 0, low: 0, average: 0 };
    chartData.transitUnits = { high: 0, medium: 0, low: 0, average: 0, weightedAverage: 0 };
    chartData.statusPermits = {};
    chartData.statusUnits = {};
    chartData.zipPermits = {};
    chartData.zipUnits = {};

    let totalUnits = 0;
    let transitScoreSum = 0;
    let transitScoreCount = 0;
    let weightedTransitSum = 0;

    statusFiltered.forEach(p => {
        const ht = p.housing_type || 'Unknown';
        const units = p.units || 1;
        const ring = p.urban_ring || 'Unknown';
        const year = p.issue_year;
        const status = p.status || 'Unknown';
        const transitScore = p.transit_score;
        const zip = p.zip_code || 'Unknown';

        totalUnits += units;

        // Housing type
        chartData.housingPermits[ht] = (chartData.housingPermits[ht] || 0) + 1;
        chartData.housingUnits[ht] = (chartData.housingUnits[ht] || 0) + units;

        // Urban ring
        chartData.ringPermits[ring] = (chartData.ringPermits[ring] || 0) + 1;
        chartData.ringUnits[ring] = (chartData.ringUnits[ring] || 0) + units;

        // Zip code
        chartData.zipPermits[zip] = (chartData.zipPermits[zip] || 0) + 1;
        chartData.zipUnits[zip] = (chartData.zipUnits[zip] || 0) + units;

        // Yearly by type
        if (year) {
            if (!chartData.yearlyPermits[year]) chartData.yearlyPermits[year] = {};
            if (!chartData.yearlyUnits[year]) chartData.yearlyUnits[year] = {};
            chartData.yearlyPermits[year][ht] = (chartData.yearlyPermits[year][ht] || 0) + 1;
            chartData.yearlyUnits[year][ht] = (chartData.yearlyUnits[year][ht] || 0) + units;
        }

        // Timeline (by week)
        if (p.issue_date && p.issue_date !== 'Unknown') {
            const date = new Date(p.issue_date);
            const weekKey = `${date.getFullYear()}-${String(getWeekNumber(date)).padStart(2, '0')}`;
            chartData.timelinePermits[weekKey] = (chartData.timelinePermits[weekKey] || 0) + 1;
            chartData.timelineUnits[weekKey] = (chartData.timelineUnits[weekKey] || 0) + units;
        }

        // Transit score
        if (transitScore !== null && transitScore !== undefined) {
            transitScoreSum += transitScore;
            transitScoreCount++;
            weightedTransitSum += transitScore * units;

            if (transitScore >= 70) {
                chartData.transitPermits.high++;
                chartData.transitUnits.high += units;
            } else if (transitScore >= 40) {
                chartData.transitPermits.medium++;
                chartData.transitUnits.medium += units;
            } else {
                chartData.transitPermits.low++;
                chartData.transitUnits.low += units;
            }
        }

        // Status
        chartData.statusPermits[status] = (chartData.statusPermits[status] || 0) + 1;
        chartData.statusUnits[status] = (chartData.statusUnits[status] || 0) + units;
    });

    // Calculate averages
    chartData.transitPermits.average = transitScoreCount > 0 ? Math.round(transitScoreSum / transitScoreCount * 10) / 10 : 0;
    chartData.transitUnits.average = chartData.transitPermits.average; // Same average per permit
    chartData.transitUnits.weightedAverage = totalUnits > 0 ? Math.round(weightedTransitSum / totalUnits * 10) / 10 : 0;

    // Store totals
    chartData.totalPermits = statusFiltered.length;
    chartData.totalUnits = totalUnits;

    return statusFiltered;
}

// Update stats display
function updateStatsDisplay() {
    document.getElementById('total-permits').textContent = chartData.totalPermits.toLocaleString();
    document.getElementById('total-units').textContent = chartData.totalUnits.toLocaleString();
    document.getElementById('single-family-count').textContent = (chartData.housingPermits['Single Family'] || 0).toLocaleString();
    document.getElementById('multifamily-count').textContent = (chartData.housingPermits['Multifamily'] || 0).toLocaleString();
    document.getElementById('townhome-count').textContent = (chartData.housingPermits['Townhome'] || 0).toLocaleString();
}

// Update all charts based on their individual view modes
function updateAllCharts() {
    updateChart('timeline');
    updateChart('housing');
    updateChart('ring');
    updateChart('yearly');
    updateChart('transit');
    updateChart('status');
}

// Calculate chart data filtered by ring
function getFilteredChartData(chartName) {
    const ringFilter = chartRingFilters[chartName] || '';
    const isUnits = chartViews[chartName] === 'units';

    // If no ring filter, use cached data
    if (!ringFilter) {
        return { isUnits, ringFilter };
    }

    // Filter permits by ring and recalculate for this chart
    const filtered = filterByStatus(allPermits, currentStatusFilter)
        .filter(p => p.urban_ring === ringFilter);

    const data = {
        housing: { permits: {}, units: {} },
        timeline: { permits: {}, units: {} },
        yearly: { permits: {}, units: {} },
        transit: { permits: { high: 0, medium: 0, low: 0 }, units: { high: 0, medium: 0, low: 0 } },
        status: { permits: {}, units: {} }
    };

    let transitScoreSum = 0, transitScoreCount = 0, weightedTransitSum = 0, totalUnits = 0;

    filtered.forEach(p => {
        const ht = p.housing_type || 'Unknown';
        const units = p.units || 1;
        const year = p.issue_year;
        const status = p.status || 'Unknown';
        const transitScore = p.transit_score;

        totalUnits += units;

        // Housing type
        data.housing.permits[ht] = (data.housing.permits[ht] || 0) + 1;
        data.housing.units[ht] = (data.housing.units[ht] || 0) + units;

        // Yearly
        if (year) {
            if (!data.yearly.permits[year]) data.yearly.permits[year] = {};
            if (!data.yearly.units[year]) data.yearly.units[year] = {};
            data.yearly.permits[year][ht] = (data.yearly.permits[year][ht] || 0) + 1;
            data.yearly.units[year][ht] = (data.yearly.units[year][ht] || 0) + units;
        }

        // Timeline
        if (p.issue_date && p.issue_date !== 'Unknown') {
            const date = new Date(p.issue_date);
            const weekKey = `${date.getFullYear()}-${String(getWeekNumber(date)).padStart(2, '0')}`;
            data.timeline.permits[weekKey] = (data.timeline.permits[weekKey] || 0) + 1;
            data.timeline.units[weekKey] = (data.timeline.units[weekKey] || 0) + units;
        }

        // Transit
        if (transitScore !== null && transitScore !== undefined) {
            transitScoreSum += transitScore;
            transitScoreCount++;
            weightedTransitSum += transitScore * units;
            if (transitScore >= 70) {
                data.transit.permits.high++;
                data.transit.units.high += units;
            } else if (transitScore >= 40) {
                data.transit.permits.medium++;
                data.transit.units.medium += units;
            } else {
                data.transit.permits.low++;
                data.transit.units.low += units;
            }
        }

        // Status
        data.status.permits[status] = (data.status.permits[status] || 0) + 1;
        data.status.units[status] = (data.status.units[status] || 0) + units;
    });

    data.transit.permits.average = transitScoreCount > 0 ? Math.round(transitScoreSum / transitScoreCount * 10) / 10 : 0;
    data.transit.units.average = data.transit.permits.average;
    data.transit.units.weightedAverage = totalUnits > 0 ? Math.round(weightedTransitSum / totalUnits * 10) / 10 : 0;

    return { isUnits, ringFilter, data };
}

// Update a single chart based on its view mode and ring filter
function updateChart(chartName) {
    const { isUnits, ringFilter, data } = getFilteredChartData(chartName);

    switch(chartName) {
        case 'timeline':
            const timelineSource = ringFilter ? data.timeline : chartData;
            const timelineData = isUnits ?
                (ringFilter ? timelineSource.units : timelineSource.timelineUnits) :
                (ringFilter ? timelineSource.permits : timelineSource.timelinePermits);
            const sortedTimeline = Object.entries(timelineData).sort((a, b) => a[0].localeCompare(b[0]));
            createTimelineChart({
                labels: sortedTimeline.map(t => t[0]),
                values: sortedTimeline.map(t => t[1])
            });
            break;
        case 'housing':
            const housingSource = ringFilter ? data.housing : chartData;
            createHousingTypeChart(isUnits ?
                (ringFilter ? housingSource.units : housingSource.housingUnits) :
                (ringFilter ? housingSource.permits : housingSource.housingPermits));
            break;
        case 'ring':
            createUrbanRingChart(isUnits ? chartData.ringUnits : chartData.ringPermits);
            break;
        case 'yearly':
            const yearlySource = ringFilter ? data.yearly : chartData;
            createYearlyTypeChart(isUnits ?
                (ringFilter ? yearlySource.units : yearlySource.yearlyUnits) :
                (ringFilter ? yearlySource.permits : yearlySource.yearlyPermits));
            break;
        case 'transit':
            const transitSource = ringFilter ? data.transit : chartData;
            const transitData = isUnits ?
                (ringFilter ? transitSource.units : transitSource.transitUnits) :
                (ringFilter ? transitSource.permits : transitSource.transitPermits);
            createTransitChart(transitData, isUnits);
            break;
        case 'status':
            const statusSource = ringFilter ? data.status : chartData;
            createStatusChart(isUnits ?
                (ringFilter ? statusSource.units : statusSource.statusUnits) :
                (ringFilter ? statusSource.permits : statusSource.statusPermits));
            break;
    }
}

// Set ring filter for a chart
function setChartRingFilter(chartName, ring) {
    chartRingFilters[chartName] = ring;
    updateChart(chartName);
}

// Helper to get ISO week number
function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
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

        // Calculate chart data from permits
        recalculateChartData();

        // Update UI
        updateStatsDisplay();
        populateMap(permits.permits);
        updateAllCharts();
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

    // Status toggle listener
    document.querySelectorAll('.toggle-btn[data-status]').forEach(btn => {
        btn.addEventListener('click', () => {
            switchStatusFilter(btn.dataset.status);
        });
    });

    // Chart-specific toggle listeners
    document.querySelectorAll('.chart-toggle').forEach(toggleContainer => {
        const chartName = toggleContainer.dataset.chart;
        toggleContainer.querySelectorAll('.mini-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                toggleChart(chartName, btn.dataset.value);
            });
        });
    });

    // Ring filter listeners
    document.querySelectorAll('.ring-filter').forEach(select => {
        select.addEventListener('change', (e) => {
            const chartName = e.target.dataset.chart;
            setChartRingFilter(chartName, e.target.value);
        });
    });

    // Demographics table sorting
    document.querySelectorAll('#demographics-table th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            sortDemographicsTable(th.dataset.sort);
        });
    });

    // Load data
    loadData();
});
