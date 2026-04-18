// Enhanced Tenders Browsing - Phase 4
// Handles tender loading, filtering, search, expandable cards, and eligibility checking

const API_BASE = '/api';
let currentFilters = {};
let currentPage = 1;
let searchDebounceTimer = null;

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // Check if we're on the tenders module
    const tendersView = document.getElementById('tenders-enhanced-view');
    if (!tendersView) return;

    initializeTenders();
});

let isInitialized = false;

async function initializeTenders() {
    // Reset state
    currentFilters = {};
    currentPage = 1;

    // Reset search input UI
    const searchInput = document.getElementById('tender-search');
    if (searchInput) searchInput.value = '';

    // Reset filter dropdowns UI
    const filterSelects = ['filter-state', 'filter-category', 'filter-ministry', 'filter-level'];
    filterSelects.forEach(id => {
        const select = document.getElementById(id);
        if (select) select.value = '';
    });

    await loadFilterOptions();
    await loadTenders();

    if (!isInitialized) {
        setupEventListeners();
        isInitialized = true;
    }
}

// ============================================
// FILTER OPTIONS
// ============================================

async function loadFilterOptions() {
    try {
        const response = await fetch(`${API_BASE}/tenders/filters`);
        const data = await response.json();

        if (data.success) {
            populateFilterDropdowns(data.filters);
        }
    } catch (error) {
        console.error('Error loading filter options:', error);
    }
}

function populateFilterDropdowns(filters) {
    // Populate state filter
    const stateSelect = document.getElementById('filter-state');
    if (stateSelect && filters.states) {
        filters.states.forEach(state => {
            const option = document.createElement('option');
            option.value = state;
            option.textContent = state;
            stateSelect.appendChild(option);
        });
    }

    // Populate category filter
    const categorySelect = document.getElementById('filter-category');
    if (categorySelect && filters.categories) {
        filters.categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categorySelect.appendChild(option);
        });
    }

    // Populate ministry filter
    const ministrySelect = document.getElementById('filter-ministry');
    if (ministrySelect && filters.ministries) {
        filters.ministries.forEach(ministry => {
            const option = document.createElement('option');
            option.value = ministry;
            option.textContent = ministry;
            ministrySelect.appendChild(option);
        });
    }

    // Populate level filter
    const levelSelect = document.getElementById('filter-level');
    if (levelSelect && filters.levels) {
        filters.levels.forEach(level => {
            const option = document.createElement('option');
            option.value = level;
            option.textContent = level;
            levelSelect.appendChild(option);
        });
    }

    // Populate eligibility modal state dropdown (removed for tenders)
}

// ============================================
// LOAD TENDERS
// ============================================

async function loadTenders(page = 1) {
    currentPage = page;

    const queryParams = new URLSearchParams({
        page: currentPage,
        limit: 12,
        ...currentFilters
    });

    try {
        const response = await fetch(`${API_BASE}/tenders?${queryParams}`);
        const data = await response.json();

        if (data.success) {
            renderTenderCards(data.data);
            updatePagination(data.pagination);
            updateResultsCount(data.pagination.total);
        }
    } catch (error) {
        console.error('Error loading tenders:', error);
        showError('Failed to load tenders. Please try again.');
    }
}

function renderTenderCards(tenders) {
    const grid = document.getElementById('tenders-grid');

    if (!tenders || tenders.length === 0) {
        grid.innerHTML = '<div class="loading-state"><p>No tenders found. Try adjusting your filters.</p></div>';
        return;
    }

    grid.innerHTML = tenders.map(tender => createTenderCard(tender)).join('');
}

function createTenderCard(tender) {
    const levelClass = tender.level === 'State' ? 'state' : '';
    const tags = tender.tags || [];

    return `
        <div class="scheme-card" data-slug="${tender.slug || tender.id}" style="border-left-color: #28a745;">
            <div class="card-header">
                <h3>${tender.tender_name}</h3>
                <span class="scheme-level ${levelClass}">${tender.tender_type || 'Open'}</span>
            </div>
            <div class="card-body">
                <p class="scheme-description">${tender.description || 'No description available.'}</p>
                <div class="scheme-meta">
                    <span><i class="fas fa-id-card"></i> ${tender.tender_id || 'N/A'}</span>
                    <span><i class="fas fa-building"></i> ${tender.department || 'N/A'}</span>
                    <span><i class="fas fa-clock"></i> Closes: ${tender.closing_date || 'N/A'}</span>
                </div>
                <div style="margin-top: 1rem;">
                    <strong>Fee:</strong> ${tender.fee_details || 'N/A'}
                </div>
            </div>
            <div class="card-footer">
                <a href="${tender.source_url}" target="_blank" class="btn-primary" style="text-decoration: none; padding: 0.5rem 1rem; background: #28a745; color: white; border-radius: 4px;">
                    <i class="fas fa-external-link-alt"></i> View Tender
                </a>
            </div>
        </div>
    `;
}

// ============================================
// EXPANDABLE CARD
// ============================================

// Expanding disabled for tenders. View button goes to custom URL.

// ============================================
// SEARCH
// ============================================

function setupSearch() {
    const searchInput = document.getElementById('tender-search');
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            searchTenders(e.target.value);
        }, 300);
    });
}

async function searchTenders(query) {
    if (!query || query.trim() === '') {
        delete currentFilters.q;
        await loadTenders(1);
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/tenders/search?q=${encodeURIComponent(query)}&limit=12`);
        const data = await response.json();

        if (data.success) {
            renderTenderCards(data.data);
            updateResultsCount(data.pagination.total);
        }
    } catch (error) {
        console.error('Error searching tenders:', error);
    }
}

// ============================================
// FILTERS
// ============================================

function setupFilters() {
    const filterSelects = ['filter-state', 'filter-category', 'filter-ministry', 'filter-level'];

    filterSelects.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            select.addEventListener('change', handleFilterChange);
        }
    });

    const clearBtn = document.getElementById('clear-filters');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearFilters);
    }
}

function handleFilterChange(e) {
    const filterName = e.target.id.replace('filter-', '');
    const value = e.target.value;

    if (value) {
        currentFilters[filterName] = value;
    } else {
        delete currentFilters[filterName];
    }

    loadTenders(1);
}

function clearFilters() {
    currentFilters = {};

    document.getElementById('filter-state').value = '';
    document.getElementById('filter-category').value = '';
    document.getElementById('filter-ministry').value = '';
    document.getElementById('filter-level').value = '';

    loadTenders(1);
}

// ============================================
// PAGINATION
// ============================================

function updatePagination(pagination) {
    const paginationDiv = document.getElementById('tenders-pagination');
    if (!paginationDiv || !pagination) return;

    if (pagination.totalPages <= 1) {
        paginationDiv.innerHTML = '';
        return;
    }

    let html = '';

    // Previous button
    html += `<button class="page-btn" ${pagination.page === 1 ? 'disabled' : ''} onclick="loadTenders(${pagination.page - 1})">Previous</button>`;

    // Page numbers
    for (let i = 1; i <= pagination.totalPages; i++) {
        if (i === pagination.page) {
            html += `<button class="page-btn active">${i}</button>`;
        } else if (i === 1 || i === pagination.totalPages || (i >= pagination.page - 2 && i <= pagination.page + 2)) {
            html += `<button class="page-btn" onclick="loadTenders(${i})">${i}</button>`;
        } else if (i === pagination.page - 3 || i === pagination.page + 3) {
            html += `<button class="page-btn" disabled>...</button>`;
        }
    }

    // Next button
    html += `<button class="page-btn" ${pagination.page === pagination.totalPages ? 'disabled' : ''} onclick="loadTenders(${pagination.page + 1})">Next</button>`;

    paginationDiv.innerHTML = html;
}

function updateResultsCount(total) {
    const countEl = document.getElementById('results-count');
    if (countEl) {
        countEl.textContent = `Showing ${total} tender${total !== 1 ? 's' : ''}`;
    }
}

// ============================================
// ELIGIBILITY CHECKER
// ============================================

// Eligibility checker removed for tenders.

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
    setupSearch();
    setupFilters();
}

// ============================================
// UTILITY
// ============================================

function showError(message) {
    const grid = document.getElementById('tenders-grid');
    if (grid) {
        grid.innerHTML = `<div class="loading-state"><p style="color: #e74c3c;">${message}</p></div>`;
    }
}

// Export for use in app.js
window.initializeTenders = initializeTenders;
