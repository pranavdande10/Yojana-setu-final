const states = [
    "All India", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
    "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand",
    "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
    "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
    "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
    "Uttar Pradesh", "Uttarakhand", "West Bengal", "Central"
];

let currentModule = 'home';
let currentState = null;
let currentPage = 1;
let currentSearch = '';
let currentSort = 'latest';

window.switchModule = (module) => {
    const navItem = document.querySelector(`.nav-item[data-module="${module}"]`);
    if (navItem) navItem.click();
};

const moduleConfigs = {
    home: {
        title: 'Unified Government Portal',
        description: 'Explore all government services in one place.',
        api: '/api/stats'
    },
    schemes: {
        title: 'Government Schemes',
        description: 'Empowering citizens through various welfare programs.',
        api: '/api/schemes',
        renderItem: (item) => `
            <div class="item-card">
                <h3>${item.title}</h3>
                <div class="item-meta">
                    <span><i class="fas fa-map-marker-alt"></i> ${item.state}</span>
                    <span><i class="fas fa-tag"></i> ${item.category}</span>
                    <span><i class="fas fa-calendar-alt"></i> Ends: ${item.end_date || 'N/A'}</span>
                </div>
                <p>${item.description}</p>
                <div style="margin-top: 1rem;">
                    <strong>Eligibility:</strong> ${item.eligibility_criteria}
                </div>
                <a href="${item.source_url}" target="_blank" class="btn-link" style="display:inline-block; margin-top: 1rem; color: var(--accent-color); text-decoration: none; font-weight: 600;">View Details <i class="fas fa-external-link-alt"></i></a>
            </div>
        `
    },
    tenders: {
        title: 'Latest Tenders',
        description: 'Explore business opportunities with the government.',
        api: '/api/tenders',
        renderItem: (item) => {
            window.tenderCache = window.tenderCache || {};
            window.tenderCache[item.id] = item;
            return `
            <div class="item-card tender-detailed-card" style="border-left-color: #0d6efd; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-bottom: 2rem; padding: 0; overflow: hidden; font-family: 'Inter', sans-serif;">
                
                <!-- Tender Overview Section -->
                <div style="background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); padding: 15px 20px; border-bottom: 2px solid #0d6efd;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
                        <h3 style="margin: 0; color: #212529; font-size: 1.3rem; line-height: 1.4; flex: 1;">${item.tender_name}</h3>
                        <span style="background: #0d6efd; color: white; padding: 4px 10px; border-radius: 4px; font-size: 0.8rem; font-weight: bold; white-space: nowrap;">${item.tender_type || 'Open Tender'}</span>
                    </div>
                    <div style="display: flex; gap: 20px; margin-top: 12px; color: #495057; font-size: 0.9rem; flex-wrap: wrap;">
                        <span><i class="fas fa-barcode" style="color: #6c757d;"></i> <strong>Ref No:</strong> ${item.reference_number || item.tender_id}</span>
                        <span><i class="fas fa-building" style="color: #6c757d;"></i> <strong>Authority:</strong> ${item.department}</span>
                        ${item.state && item.state !== 'Central' ? `<span><i class="fas fa-map-marker-alt" style="color: #dc3545;"></i> <strong>Location:</strong> ${item.state}</span>` : ''}
                    </div>
                </div>
                
                <div style="padding: 20px;">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
                        
                        <!-- Timeline Section -->
                        <div class="info-section">
                            <h4 style="margin: 0 0 10px 0; color: #0d6efd; border-bottom: 1px solid #dee2e6; padding-bottom: 5px; font-size: 1.05rem;"><i class="fas fa-calendar-alt"></i> Timeline</h4>
                            <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
                                <tr><td style="padding: 4px 0; color: #6c757d;">Publish Date</td><td style="padding: 4px 0; text-align: right; font-weight: 500;">${item.published_date || 'N/A'}</td></tr>
                                <tr><td style="padding: 4px 0; color: #6c757d;">Bid Opening</td><td style="padding: 4px 0; text-align: right; font-weight: 500;">${item.opening_date || 'N/A'}</td></tr>
                                <tr><td style="padding: 4px 0; color: #dc3545; font-weight: 600;">Submission Deadline</td><td style="padding: 4px 0; text-align: right; color: #dc3545; font-weight: bold;">${item.closing_date || 'N/A'}</td></tr>
                            </table>
                        </div>

                        <!-- Financials Section -->
                        <div class="info-section">
                            <h4 style="margin: 0 0 10px 0; color: #198754; border-bottom: 1px solid #dee2e6; padding-bottom: 5px; font-size: 1.05rem;"><i class="fas fa-coins"></i> Financials</h4>
                            <div style="font-size: 0.9rem; color: #212529;">
                                ${item.fee_details ? 
                                    item.fee_details.split('|').map(detail => {
                                        const [key, val] = detail.split(':');
                                        if (val) return `<div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span style="color:#6c757d;">${key.trim()}</span> <strong style="text-align:right;">${val.trim()}</strong></div>`;
                                        return `<div style="margin-bottom:4px;">${detail.trim()}</div>`;
                                    }).join('') 
                                : '<div style="color: #6c757d; font-style: italic;">Refer to official tender document for EMD & Value details.</div>'}
                            </div>
                        </div>

                        <!-- Scope & Specs Section -->
                        <div class="info-section" style="grid-column: 1 / -1;">
                            <h4 style="margin: 0 0 10px 0; color: #6f42c1; border-bottom: 1px solid #dee2e6; padding-bottom: 5px; font-size: 1.05rem;"><i class="fas fa-microscope"></i> Scope & Specs</h4>
                            <p style="margin: 0; font-size: 0.95rem; color: #333; line-height: 1.5;"><strong>Description:</strong> ${item.description || 'Detailed technical specs require downloading the official BOQ/PDF.'}</p>
                        </div>
                        
                        <!-- Eligibility Section -->
                        <div class="info-section">
                            <h4 style="margin: 0 0 10px 0; color: #fd7e14; border-bottom: 1px solid #dee2e6; padding-bottom: 5px; font-size: 1.05rem;"><i class="fas fa-id-card"></i> Eligibility</h4>
                            <ul style="margin: 0; padding-left: 20px; font-size: 0.9rem; color: #495057;">
                                <li style="margin-bottom: 4px;"><strong>Criteria:</strong> Refer to Pre-Qualification (NIT)</li>
                                <li style="margin-bottom: 4px;"><strong>Registrations:</strong> GST, PAN mandatory for CPPP</li>
                                <li><strong>Exemptions:</strong> MSME/UDYAM exemptions generally applicable</li>
                            </ul>
                        </div>

                        <!-- Submission Section -->
                        <div class="info-section">
                            <h4 style="margin: 0 0 10px 0; color: #20c997; border-bottom: 1px solid #dee2e6; padding-bottom: 5px; font-size: 1.05rem;"><i class="fas fa-file-upload"></i> Submission</h4>
                            <ul style="margin: 0; padding-left: 20px; font-size: 0.9rem; color: #495057;">
                                <li style="margin-bottom: 4px;"><strong>Required Docs:</strong> ${item.documents_required || 'Technical Bid (.pdf) & Financial BOQ (.xls)'}</li>
                                <li style="margin-bottom: 4px;"><strong>Mode:</strong> Online e-Procurement Portal</li>
                            </ul>
                        </div>

                    </div>

                    <div style="margin-top: 25px; display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 0.85rem; color: #6c757d;"><i class="fas fa-globe"></i> Source: ${item.source_website || 'Government Portal'}</span>
                        <div style="display: flex; gap: 10px;">
                            ${item.extended_details ? `<button onclick="showTenderDetailsModal(${item.id})" class="btn" style="background-color: #198754; color: white; padding: 10px 24px; border: none; border-radius: 6px; font-weight: 600; font-size: 0.95rem; cursor:pointer; transition: background 0.3s; box-shadow: 0 2px 4px rgba(25,135,84,0.3);"><i class="fas fa-table"></i> Read Raw Details</button>` : ''}
                            ${item.source_url && item.source_url.startsWith('/tender_docs') ? 
                                `<a href="/tender-captcha.html?doc=${encodeURIComponent(item.source_url)}" target="_blank" class="btn" style="background-color: #fd7e14; color: white; padding: 10px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 0.95rem; transition: background 0.3s; box-shadow: 0 2px 4px rgba(253,126,20,0.3);"><i class="fas fa-file-contract"></i> Tender Document</a>`
                                : 
                                `<a href="${item.source_url}" target="_blank" class="btn" style="background-color: #0d6efd; color: white; padding: 10px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 0.95rem; transition: background 0.3s; box-shadow: 0 2px 4px rgba(13,110,253,0.3);"><i class="fas fa-search"></i> Web Portal</a>`
                            }
                        </div>
                    </div>
                </div>
            </div>
        `;
        }
    },
    recruitments: {
        title: 'Government Recruitments',
        description: 'Build your career in the public sector.',
        api: '/api/recruitments',
        renderItem: (item) => {
            let applyLink = item.source_url;
            if (applyLink && applyLink.includes('betacloud.ncs.gov.in/job-listing/')) {
                applyLink = 'https://betacloud.ncs.gov.in/job-listing';
            }
            return `
            <div class="item-card tender-detailed-card" style="border-left-color: #6f42c1; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-bottom: 2rem; padding: 0; overflow: hidden; font-family: 'Inter', sans-serif;">
                
                <!-- Overview Section -->
                <div style="background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); padding: 15px 20px; border-bottom: 2px solid #6f42c1;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
                        <h3 style="margin: 0; color: #212529; font-size: 1.3rem; line-height: 1.4; flex: 1;">${item.post_name}</h3>
                        <span style="background: #e0cffc; color: #6f42c1; padding: 4px 10px; border-radius: 4px; font-size: 0.8rem; font-weight: bold; white-space: nowrap;">Vacancies: ${item.vacancy_count || 0}</span>
                    </div>
                    <div style="display: flex; gap: 20px; margin-top: 12px; color: #495057; font-size: 0.9rem; flex-wrap: wrap;">
                        <span><i class="fas fa-university" style="color: #6c757d;"></i> <strong>Body:</strong> ${item.organization}</span>
                        <span><i class="fas fa-map-marker-alt" style="color: #dc3545;"></i> <strong>Location:</strong> ${item.state || 'All India'}</span>
                    </div>
                </div>
                
                <div style="padding: 20px;">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
                        
                        <!-- Timeline Section -->
                        <div class="info-section">
                            <h4 style="margin: 0 0 10px 0; color: #0d6efd; border-bottom: 1px solid #dee2e6; padding-bottom: 5px; font-size: 1.05rem;"><i class="fas fa-calendar-alt"></i> Timeline</h4>
                            <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
                                <tr><td style="padding: 4px 0; color: #6c757d;">Start Date</td><td style="padding: 4px 0; text-align: right; font-weight: 500;">${item.application_start_date ? new Date(item.application_start_date).toLocaleDateString() : 'Not Announced'}</td></tr>
                                <tr><td style="padding: 4px 0; color: #dc3545; font-weight: 600;">Last Date</td><td style="padding: 4px 0; text-align: right; color: #dc3545; font-weight: bold;">${item.application_end_date ? new Date(item.application_end_date).toLocaleDateString() : 'N/A'}</td></tr>
                            </table>
                        </div>

                        <!-- Eligibility Section -->
                        <div class="info-section">
                            <h4 style="margin: 0 0 10px 0; color: #fd7e14; border-bottom: 1px solid #dee2e6; padding-bottom: 5px; font-size: 1.05rem;"><i class="fas fa-user-graduate"></i> Eligibility</h4>
                            <ul style="margin: 0; padding-left: 20px; font-size: 0.9rem; color: #495057;">
                                <li style="margin-bottom: 4px;"><strong>Qualification:</strong> ${item.qualification || 'Not Specified'}</li>
                                <li style="margin-bottom: 4px;"><strong>Age Limit:</strong> ${item.age_limit || 'Not Specified'}</li>
                            </ul>
                        </div>

                        <!-- Selection & Process Section -->
                        <div class="info-section" style="grid-column: 1 / -1; margin-top: -10px;">
                            <h4 style="margin: 0 0 10px 0; color: #198754; border-bottom: 1px solid #dee2e6; padding-bottom: 5px; font-size: 1.05rem;"><i class="fas fa-list-check"></i> Details</h4>
                            <ul style="margin: 0; padding-left: 20px; font-size: 0.9rem; color: #495057;">
                                <li style="margin-bottom: 4px;"><strong>Process & Pay:</strong> ${item.selection_process || 'Refer to notification'}</li>
                                <li style="margin-bottom: 4px;"><strong>Application Fee:</strong> ${item.application_fee || 'Not Specified'}</li>
                            </ul>
                        </div>

                    </div>

                    <div style="margin-top: 25px; display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 0.85rem; color: #6c757d;"><i class="fas fa-globe"></i> Source: ${item.source_website || 'Government Portal'}</span>
                        <div style="display: flex; gap: 10px;">
                            ${item.official_notification_link ? `
                                <a href="${applyLink}" target="_blank" class="btn" style="background-color: #6c757d; color: white; padding: 10px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 0.95rem; transition: background 0.3s;"><i class="fas fa-info-circle"></i> View Summary</a>
                                <a href="${item.official_notification_link}" target="_blank" class="btn" style="background-color: #6f42c1; color: white; padding: 10px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 0.95rem; transition: background 0.3s; box-shadow: 0 2px 4px rgba(111,66,193,0.3);"><i class="fas fa-external-link-alt"></i> Apply / Official</a>
                            ` : `
                                <a href="${applyLink}" target="_blank" class="btn" style="background-color: #6f42c1; color: white; padding: 10px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 0.95rem; transition: background 0.3s; box-shadow: 0 2px 4px rgba(111,66,193,0.3);"><i class="fas fa-external-link-alt"></i> Apply / View Info</a>
                            `}
                        </div>
                    </div>
                </div>
            </div>
        `;
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    init();
});

function init() {
    renderStates();
    setupEventListeners();
    loadStats();
}


async function loadStats() {
    try {
        const response = await fetch('/api/stats');
        const data = await response.json();
        if (data.success) {
            document.getElementById('scheme-count').innerText = `${data.schemesCount}+`;
            document.getElementById('tender-count').innerText = `${data.tendersCount}+`;
            document.getElementById('recruitment-count').innerText = `${data.recruitmentsCount}+`;
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

function renderStates() {
    const statesGrid = document.getElementById('states-grid');
    statesGrid.innerHTML = states.map(state => `
        <div class="state-card" onclick="selectState('${state}')">
            <i class="fas fa-map-location-dot"></i>
            <h3>${state}</h3>
        </div>
    `).join('');
}

window.selectState = (state) => {
    // Map "All India" directly to "Central" which is what the database holds
    currentState = (state === 'All India') ? 'Central' : state;
    currentPage = 1;
    document.getElementById('states-grid').classList.add('hidden');
    
    const dataView = document.getElementById('data-view');
    dataView.style.display = ''; // Defense against inline artifacts
    dataView.classList.remove('hidden');
    
    loadData();
};

async function loadData() {
    const config = moduleConfigs[currentModule];
    const itemsList = document.getElementById('items-list');

    itemsList.innerHTML = '<div class="loading">Loading...</div>';

    try {
        const url = new URL(config.api, window.location.origin);
        if (currentState) url.searchParams.append('state', currentState);
        if (currentSearch) url.searchParams.append('search', currentSearch);
        if (currentSort) url.searchParams.append('sort', currentSort);
        url.searchParams.append('page', currentPage);

        const response = await fetch(url);
        const result = await response.json();

        if (result.success && result.data.length > 0) {
            itemsList.innerHTML = result.data.map(item => config.renderItem(item)).join('');
            renderPagination(result.pagination);
        } else {
            itemsList.innerHTML = '<div class="no-data">No records found for this selection.</div>';
            document.getElementById('pagination').innerHTML = '';
        }
    } catch (error) {
        itemsList.innerHTML = '<div class="error">Failed to load data. Please try again later.</div>';
    }
}

function renderPagination(pagination) {
    const paginationDiv = document.getElementById('pagination');
    let html = '';

    if (pagination.totalPages > 1) {
        for (let i = 1; i <= pagination.totalPages; i++) {
            html += `<button class="page-btn ${i === pagination.page ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
        }
    }

    paginationDiv.innerHTML = html;
}

window.changePage = (page) => {
    currentPage = page;
    loadData();
    window.scrollTo(0, 0);
};

function setupEventListeners() {
    // Module switching
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', async (e) => {
            e.preventDefault();
            const module = item.dataset.module;

            // Reset navigation state when switching modules
            resetNavigation();

            // Update active state
            document.querySelectorAll('.nav-item a').forEach(link => link.classList.remove('active'));
            item.querySelector('a').classList.add('active');

            // Hide all sections
            document.getElementById('dashboard-view').classList.add('hidden');
            document.getElementById('state-navigation').classList.add('hidden');

            if (module === 'home') {
                document.getElementById('dashboard-view').classList.remove('hidden');
                loadStats();
            } else {
                // For schemes, tenders and recruitments, use appropriate view
                document.getElementById('state-navigation').classList.remove('hidden');
                document.getElementById('module-title').textContent = moduleConfigs[module].title;
                document.getElementById('module-description').textContent = moduleConfigs[module].description;

                currentModule = module;

                if (module === 'schemes') {
                    // Show enhanced schemes view
                    if (document.getElementById('schemes-enhanced-view')) {
                        document.getElementById('schemes-enhanced-view').style.display = 'flex';
                    }
                    if (document.getElementById('tenders-enhanced-view')) {
                        document.getElementById('tenders-enhanced-view').style.display = 'none';
                    }
                    // Hide legacy elements
                    document.querySelectorAll('.legacy-view').forEach(el => el.classList.add('hidden'));
                    // Initialize schemes if needed
                    if (window.initializeSchemes) window.initializeSchemes();
                } else {
                    // For recruitments/tenders, use legacy view
                    if (document.getElementById('schemes-enhanced-view')) {
                        document.getElementById('schemes-enhanced-view').style.display = 'none';
                    }
                    if (document.getElementById('tenders-enhanced-view')) {
                        document.getElementById('tenders-enhanced-view').style.display = 'none';
                    }
                    if (document.getElementById('recruitments-enhanced-view')) {
                        document.getElementById('recruitments-enhanced-view').style.display = 'none';
                    }
                    document.querySelectorAll('.legacy-view').forEach(el => {
                        el.style.display = ''; // Clear any rogue inline styles
                        if (!el.classList.contains('data-view')) {
                            el.classList.remove('hidden');
                        } else {
                            el.classList.add('hidden');
                        }
                    });
                    renderStates();
                }
            }
        });
    });

    // Search and Sort
    document.getElementById('main-search').addEventListener('input', (e) => {
        currentSearch = e.target.value;
        currentPage = 1;
        if (currentState) loadData();
    });

    document.getElementById('main-sort').addEventListener('change', (e) => {
        currentSort = e.target.value;
        currentPage = 1;
        if (currentState) loadData();
    });

    // Back button
    document.getElementById('back-to-states').addEventListener('click', backToStates);
}

function resetNavigation() {
    currentState = null;
    currentPage = 1;
    currentSearch = '';
    currentSort = 'latest';

    // Reset UI elements
    const itemsList = document.getElementById('items-list');
    if (itemsList) itemsList.innerHTML = '';

    const pagination = document.getElementById('pagination');
    if (pagination) pagination.innerHTML = '';

    const searchInput = document.getElementById('main-search');
    if (searchInput) searchInput.value = '';

    const sortSelect = document.getElementById('main-sort');
    if (sortSelect) sortSelect.value = 'latest';

    // Reset visibility for legacy view
    document.getElementById('states-grid').classList.remove('hidden');
    document.getElementById('data-view').classList.add('hidden');
}

function backToStates() {
    currentState = null;
    currentPage = 1;
    document.getElementById('states-grid').classList.remove('hidden');
    document.getElementById('data-view').classList.add('hidden');
}

window.showTenderDetailsModal = (id) => {
    const tender = window.tenderCache[id];
    if (!tender || !tender.extended_details) return;

    try {
        const details = typeof tender.extended_details === 'string' ? JSON.parse(tender.extended_details) : tender.extended_details;
        
        let htmlContent = '<table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">';
        
        for (const [key, value] of Object.entries(details)) {
            if (value && String(value).trim() !== '') {
                htmlContent += `
                    <tr style="border-bottom: 1px solid #dee2e6;">
                        <td style="padding: 12px; font-weight: 600; color: #495057; width: 40%; background-color: #f8f9fa;">${key}</td>
                        <td style="padding: 12px; color: #212529;">${value}</td>
                    </tr>
                `;
            }
        }
        
        htmlContent += '</table>';
        
        document.getElementById('tender-modal-title').innerHTML = `<i class="fas fa-file-contract"></i> ${tender.reference_number || tender.tender_id || 'Tender Details'}`;
        document.getElementById('tender-extended-content').innerHTML = htmlContent;
        document.getElementById('tender-extended-modal').style.display = 'flex';
    } catch(e) {
        console.error('Error parsing extended details:', e);
    }
};

window.closeTenderModal = () => {
    document.getElementById('tender-extended-modal').style.display = 'none';
};
