// Admin Dashboard JavaScript
const API_BASE = '/api/admin';
let token = localStorage.getItem('admin_token');
let currentReviewId = null;

// ============================================
// AUTH
// ============================================

document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
        const res = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await res.json();

        if (data.success) {
            token = data.data.token;
            localStorage.setItem('admin_token', token);
            localStorage.setItem('admin_name', data.data.admin.name || data.data.admin.email);
            showDashboard();
        } else {
            document.getElementById('login-error').textContent = data.message;
        }
    } catch (error) {
        document.getElementById('login-error').textContent = 'Login failed';
    }
});

document.getElementById('logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_name');
    token = null;
    showLogin();
});

function showLogin() {
    document.getElementById('login-screen').classList.add('active');
    document.getElementById('dashboard-screen').classList.remove('active');
}

function showDashboard() {
    document.getElementById('login-screen').classList.remove('active');
    document.getElementById('dashboard-screen').classList.add('active');
    document.getElementById('admin-name').textContent = localStorage.getItem('admin_name');
    loadDashboardStats();
}

// ============================================
// NAVIGATION
// ============================================

document.querySelectorAll('.nav-menu a').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const view = e.currentTarget.dataset.view;
        switchView(view);
    });
});

function switchView(view) {
    document.querySelectorAll('.nav-menu a').forEach(a => a.classList.remove('active'));
    document.querySelector(`[data-view="${view}"]`).classList.add('active');

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`${view}-view`).classList.add('active');

    if (view === 'dashboard') loadDashboardStats();
    if (view === 'pending') loadPendingReviews();
    if (view === 'crawlers') loadCrawlers();
    if (view === 'logs') loadLogs();
}

// ============================================
// API HELPERS
// ============================================

async function apiCall(endpoint, options = {}) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...options.headers
        }
    });

    if (res.status === 401) {
        // Token expired or invalid
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin_name');
        token = null;
        showLogin();
        return { success: false, message: 'Session expired. Please log in again.' };
    }

    return await res.json();
}

// ============================================
// DASHBOARD
// ============================================

async function loadDashboardStats() {
    const data = await apiCall('/stats');
    if (data.success) {
        document.getElementById('stat-pending').textContent = data.data.pendingReviews;
        document.getElementById('stat-schemes').textContent = data.data.approvedSchemes;
        document.getElementById('stat-tenders').textContent = data.data.approvedTenders;
        document.getElementById('stat-recruitments').textContent = data.data.approvedRecruitments;
    }
}

// ============================================
// PENDING REVIEWS
// ============================================

async function loadPendingReviews() {
    const type = document.getElementById('filter-type').value;
    const data = await apiCall(`/pending?type=${type}&limit=50`);

    const list = document.getElementById('pending-list');
    if (data.success && data.data.length > 0) {
        list.innerHTML = data.data.map(item => `
            <div class="list-item">
                <div class="item-info">
                    <h4>${item.normalized_data.title || item.normalized_data.tender_name || item.normalized_data.post_name}</h4>
                    <p><strong>Type:</strong> ${item.type} | <strong>State:</strong> ${item.normalized_data.state}</p>
                    <p><small>Crawled: ${new Date(item.created_at).toLocaleString()}</small></p>
                </div>
                <button class="btn btn-sm btn-primary" onclick="reviewItem('${item.id}')">Review</button>
            </div>
        `).join('');
    } else {
        list.innerHTML = '<p>No pending reviews</p>';
    }
}

async function reviewItem(id) {
    currentReviewId = id;
    const data = await apiCall(`/pending/${id}`);

    if (data.success) {
        const item = data.data;
        document.getElementById('review-content').innerHTML = `
            <pre>${JSON.stringify(item.normalized_data, null, 2)}</pre>
        `;
        document.getElementById('review-modal').style.display = 'block';
    }
}

async function approveItem() {
    try {
        const data = await apiCall(`/pending/${currentReviewId}/approve`, { method: 'POST' });
        if (data.success) {
            alert('Item approved!');
            document.getElementById('review-modal').style.display = 'none';
            loadPendingReviews();
        } else {
            alert('Approval failed: ' + (data.message || 'Unknown error'));
        }
    } catch (e) {
        alert('Exception: ' + e.message);
    }
}

function showRejectForm() {
    document.getElementById('reject-form').style.display = 'block';
}

async function rejectItem() {
    const reason = document.getElementById('reject-reason').value;
    try {
        const data = await apiCall(`/pending/${currentReviewId}/reject`, {
            method: 'POST',
            body: JSON.stringify({ reason })
        });

        if (data.success) {
            alert('Item rejected!');
            document.getElementById('review-modal').style.display = 'none';
            loadPendingReviews();
        } else {
            alert('Rejection failed: ' + (data.message || 'Unknown error'));
        }
    } catch (e) {
        alert('Exception: ' + e.message);
    }
}

// ============================================
// CRAWLERS
// ============================================

async function loadCrawlers() {
    // Load MyScheme crawler status
    await refreshCrawlerStatus();

    // Load MyScheme jobs
    await loadMySchemeJobs();

    // Load Tenders crawler status & jobs
    await refreshTendersCrawlerStatus();
    await loadTendersJobs();

    // Load Recruitments crawler status & jobs
    await refreshRecruitmentsCrawlerStatus();
    await loadRecruitmentsJobs();

    // Load legacy sources
    const sources = await apiCall('/sources');

    if (sources.success) {
        document.getElementById('sources-list').innerHTML = sources.data.map(s => `
            <div class="list-item">
                <div class="item-info">
                    <h4>${s.name}</h4>
                    <p>${s.url} | Type: ${s.type}</p>
                    <p><small>Last crawled: ${s.last_crawled_at ? new Date(s.last_crawled_at).toLocaleString() : 'Never'}</small></p>
                </div>
                <button class="btn btn-sm btn-secondary" onclick="triggerCrawler('${s.id}')">
                    <i class="fas fa-play"></i> Run
                </button>
            </div>
        `).join('');
    }
}

async function triggerCrawler(sourceId) {
    const data = await apiCall('/crawler/trigger', {
        method: 'POST',
        body: JSON.stringify({ sourceId })
    });

    if (data.success) {
        alert('Crawler triggered!');
        loadCrawlers();
    }
}

// ============================================
// MYSCHEME CRAWLER CONTROL
// ============================================

let crawlerStatusInterval = null;

async function startMySchemeCrawler() {
    const batchSize = document.getElementById('batch-size').value;
    const location = document.getElementById('schemes-target-location')?.value?.trim();

    try {
        const data = await apiCall('/crawler/myscheme/start', {
            method: 'POST',
            body: JSON.stringify({ 
                batch_size: parseInt(batchSize),
                location: location || null
            })
        });

        if (data.success) {
            alert(`Crawler started with batch size ${batchSize}!`);
            await refreshCrawlerStatus();

            // Start auto-refresh
            startAutoRefresh();
        } else {
            alert(`Failed to start crawler: ${data.message}`);
        }
    } catch (error) {
        alert('Error starting crawler');
        console.error(error);
    }
}

async function pauseMySchemeCrawler() {
    try {
        const data = await apiCall('/crawler/myscheme/pause', {
            method: 'POST'
        });

        if (data.success) {
            alert('Crawler paused!');
            await refreshCrawlerStatus();
        } else {
            alert(`Failed to pause crawler: ${data.message}`);
        }
    } catch (error) {
        alert('Error pausing crawler');
        console.error(error);
    }
}

async function resumeMySchemeCrawler() {
    try {
        const data = await apiCall('/crawler/myscheme/resume', {
            method: 'POST'
        });

        if (data.success) {
            alert('Crawler resumed!');
            await refreshCrawlerStatus();
            startAutoRefresh();
        } else {
            alert(`Failed to resume crawler: ${data.message}`);
        }
    } catch (error) {
        alert('Error resuming crawler');
        console.error(error);
    }
}

async function stopMySchemeCrawler() {
    try {
        const data = await apiCall('/crawler/myscheme/stop', {
            method: 'POST'
        });

        if (data.success) {
            alert('Crawler stopped!');
            await refreshCrawlerStatus();
            stopAutoRefresh();
        } else {
            alert(`Failed to stop crawler: ${data.message}`);
        }
    } catch (error) {
        alert('Error stopping crawler');
        console.error(error);
    }
}

async function refreshCrawlerStatus() {
    try {
        const data = await apiCall('/crawler/myscheme/status');

        if (data.success) {
            updateCrawlerUI(data.status, data.current_job);
        }
    } catch (error) {
        console.error('Error fetching crawler status:', error);
    }
}

function updateCrawlerUI(status, currentJob) {
    // Update status indicator
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');

    if (currentJob && currentJob.status === 'running') {
        statusDot.className = 'status-dot running';
        statusText.textContent = 'Running';
    } else if (currentJob && currentJob.status === 'paused') {
        statusDot.className = 'status-dot paused';
        statusText.textContent = 'Paused';
    } else if (status.last_error) {
        statusDot.className = 'status-dot error';
        statusText.textContent = 'Error';
    } else {
        statusDot.className = 'status-dot idle';
        statusText.textContent = 'Idle';
    }

    // Update status section
    document.getElementById('last-run').textContent = status.last_run_at
        ? new Date(status.last_run_at).toLocaleString()
        : 'Never';
    document.getElementById('total-runs').textContent = status.total_runs || 0;

    const successRate = status.total_runs > 0
        ? Math.round((status.total_success / status.total_runs) * 100)
        : 0;
    document.getElementById('success-rate').textContent = status.total_runs > 0
        ? `${successRate}%`
        : 'N/A';
    document.getElementById('last-error').textContent = status.last_error || 'None';

    // Update progress section
    const progressSection = document.getElementById('progress-section');
    if (currentJob && (currentJob.status === 'running' || currentJob.status === 'paused')) {
        progressSection.style.display = 'block';

        document.getElementById('current-batch').textContent = currentJob.current_batch || 0;
        document.getElementById('total-fetched').textContent = currentJob.total_fetched || 0;
        document.getElementById('success-count').textContent = currentJob.success_count || 0;
        document.getElementById('failed-count').textContent = currentJob.failed_count || 0;
        document.getElementById('duplicate-count').textContent = currentJob.duplicate_count || 0;

        const progress = currentJob.progress_percentage || 0;
        document.getElementById('progress-fill').style.width = `${progress}%`;
        document.getElementById('progress-percentage').textContent = `${progress}%`;
        document.getElementById('progress-detail').textContent =
            `Batch ${currentJob.current_batch} - ${currentJob.total_fetched} schemes fetched`;
    } else {
        progressSection.style.display = 'none';
    }

    // Update control buttons
    const startBtn = document.getElementById('start-crawler-btn');
    const pauseBtn = document.getElementById('pause-crawler-btn');
    const stopBtn = document.getElementById('stop-crawler-btn');

    if (currentJob && currentJob.status === 'running') {
        startBtn.style.display = 'none';
        pauseBtn.style.display = 'inline-block';
        stopBtn.style.display = 'inline-block';
    } else if (currentJob && currentJob.status === 'paused') {
        startBtn.style.display = 'inline-block';
        startBtn.innerHTML = '<i class="fas fa-play"></i> Resume';
        startBtn.onclick = resumeMySchemeCrawler;
        pauseBtn.style.display = 'none';
        stopBtn.style.display = 'inline-block';
    } else {
        startBtn.style.display = 'inline-block';
        startBtn.innerHTML = '<i class="fas fa-play"></i> Start Crawler';
        startBtn.onclick = startMySchemeCrawler;
        pauseBtn.style.display = 'none';
        stopBtn.style.display = 'none';
    }
}

async function loadMySchemeJobs(page = 1) {
    const statusFilter = document.getElementById('job-status-filter').value;

    try {
        const data = await apiCall(`/crawler/myscheme/jobs?page=${page}&limit=10&status=${statusFilter}`);

        if (data.success) {
            const tbody = document.getElementById('jobs-table-body');

            if (data.data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="text-center">No jobs found</td></tr>';
            } else {
                tbody.innerHTML = data.data.map(job => {
                    const duration = job.completed_at
                        ? Math.round((new Date(job.completed_at) - new Date(job.started_at)) / 1000)
                        : Math.round((new Date() - new Date(job.started_at)) / 1000);

                    return `
                        <tr>
                            <td>${new Date(job.started_at).toLocaleString()}</td>
                            <td><span class="badge badge-${job.status}">${job.status}</span></td>
                            <td>${job.batch_size}</td>
                            <td>${job.total_fetched || 0}</td>
                            <td class="success">${job.success_count || 0}</td>
                            <td class="error">${job.failed_count || 0}</td>
                            <td>${duration}s</td>
                            <td>${job.progress_percentage || 0}%</td>
                        </tr>
                    `;
                }).join('');
            }

            // Update pagination
            updatePagination(data.pagination, page);
        }
    } catch (error) {
        console.error('Error loading jobs:', error);
    }
}

function updatePagination(pagination, currentPage) {
    const paginationDiv = document.getElementById('jobs-pagination');

    if (!pagination || pagination.totalPages <= 1) {
        paginationDiv.innerHTML = '';
        return;
    }

    let html = '';

    // Previous button
    html += `<button ${currentPage === 1 ? 'disabled' : ''} onclick="loadMySchemeJobs(${currentPage - 1})">Previous</button>`;

    // Page numbers
    for (let i = 1; i <= pagination.totalPages; i++) {
        if (i === currentPage) {
            html += `<button class="active">${i}</button>`;
        } else if (i === 1 || i === pagination.totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
            html += `<button onclick="loadMySchemeJobs(${i})">${i}</button>`;
        } else if (i === currentPage - 3 || i === currentPage + 3) {
            html += `<button disabled>...</button>`;
        }
    }

    // Next button
    html += `<button ${currentPage === pagination.totalPages ? 'disabled' : ''} onclick="loadMySchemeJobs(${currentPage + 1})">Next</button>`;

    paginationDiv.innerHTML = html;
}

function startAutoRefresh() {
    if (crawlerStatusInterval) return;

    crawlerStatusInterval = setInterval(async () => {
        await refreshCrawlerStatus();
        await loadMySchemeJobs();
    }, 5000); // Refresh every 5 seconds
}

function stopAutoRefresh() {
    if (crawlerStatusInterval) {
        clearInterval(crawlerStatusInterval);
        crawlerStatusInterval = null;
    }
}

// ============================================
// TENDERS CRAWLER CONTROL
// ============================================

let tendersCrawlerStatusInterval = null;

async function startTendersCrawler() {
    const batchSize = document.getElementById('tenders-batch-size').value;
    const location = document.getElementById('tenders-target-location').value.trim();

    try {
        const data = await apiCall('/crawler/tenders/start', {
            method: 'POST',
            body: JSON.stringify({ 
                batch_size: parseInt(batchSize),
                location: location || null
            })
        });

        if (data.success) {
            alert(`Tenders Crawler started with batch size ${batchSize}!`);
            await refreshTendersCrawlerStatus();
            startTendersAutoRefresh();
        } else {
            alert(`Failed to start crawler: ${data.message}`);
        }
    } catch (error) {
        alert('Error starting Tenders crawler');
        console.error(error);
    }
}

async function pauseTendersCrawler() {
    try {
        const data = await apiCall('/crawler/tenders/pause', { method: 'POST' });
        if (data.success) {
            alert('Tenders Crawler paused!');
            await refreshTendersCrawlerStatus();
        } else {
            alert(`Failed to pause crawler: ${data.message}`);
        }
    } catch (error) { console.error(error); }
}

async function resumeTendersCrawler() {
    try {
        const data = await apiCall('/crawler/tenders/resume', { method: 'POST' });
        if (data.success) {
            alert('Tenders Crawler resumed!');
            await refreshTendersCrawlerStatus();
            startTendersAutoRefresh();
        } else {
            alert(`Failed to resume crawler: ${data.message}`);
        }
    } catch (error) { console.error(error); }
}

async function stopTendersCrawler() {
    try {
        const data = await apiCall('/crawler/tenders/stop', { method: 'POST' });
        if (data.success) {
            alert('Tenders Crawler stopped!');
            await refreshTendersCrawlerStatus();
            stopTendersAutoRefresh();
        } else {
            alert(`Failed to stop crawler: ${data.message}`);
        }
    } catch (error) { console.error(error); }
}

async function refreshTendersCrawlerStatus() {
    try {
        const data = await apiCall('/crawler/tenders/status');
        if (data.success) {
            updateTendersCrawlerUI(data.status || data.data, data.current_job);
        }
    } catch (error) { console.error('Error fetching Tenders crawler status:', error); }
}

function updateTendersCrawlerUI(status, currentJob) {
    const statusBadge = document.getElementById('tenders-crawler-status-badge');

    if (currentJob && currentJob.status === 'running') {
        statusBadge.className = 'status-badge status-running';
        statusBadge.textContent = 'Running';
    } else if (currentJob && currentJob.status === 'paused') {
        statusBadge.className = 'status-badge status-paused';
        statusBadge.textContent = 'Paused';
    } else if (status.last_error) {
        statusBadge.className = 'status-badge status-failed';
        statusBadge.textContent = 'Error';
    } else {
        statusBadge.className = 'status-badge status-completed';
        statusBadge.textContent = 'Idle';
    }

    if (currentJob && (currentJob.status === 'running' || currentJob.status === 'paused')) {
        document.getElementById('tenders-current-batch').textContent = currentJob.current_batch || 0;
        document.getElementById('tenders-total-fetched').textContent = currentJob.total_fetched || 0;
        document.getElementById('tenders-success-count').textContent = currentJob.success_count || 0;
        document.getElementById('tenders-failed-count').textContent = currentJob.failed_count || 0;
        document.getElementById('tenders-duplicate-count').textContent = currentJob.duplicate_count || 0;

        const progress = currentJob.progress_percentage || 0;
        document.getElementById('tenders-progress-fill').style.width = `${progress}%`;
        document.getElementById('tenders-progress-percentage').textContent = `${progress}%`;
        document.getElementById('tenders-progress-detail').textContent =
            `Batch ${currentJob.current_batch || 1} - ${currentJob.total_fetched || 0} tenders fetched`;
    }

    const startBtn = document.getElementById('tenders-start-crawler-btn');
    const pauseBtn = document.getElementById('tenders-pause-crawler-btn');
    const stopBtn = document.getElementById('tenders-stop-crawler-btn');

    if (currentJob && currentJob.status === 'running') {
        startBtn.style.display = 'none';
        pauseBtn.style.display = 'inline-block';
        stopBtn.style.display = 'inline-block';
    } else if (currentJob && currentJob.status === 'paused') {
        startBtn.style.display = 'inline-block';
        startBtn.innerHTML = '<i class="fas fa-play"></i> Resume';
        startBtn.onclick = resumeTendersCrawler;
        pauseBtn.style.display = 'none';
        stopBtn.style.display = 'inline-block';
    } else {
        startBtn.style.display = 'inline-block';
        startBtn.innerHTML = '<i class="fas fa-play"></i> Start Crawler';
        startBtn.onclick = startTendersCrawler;
        pauseBtn.style.display = 'none';
        stopBtn.style.display = 'none';
    }
}

async function loadTendersJobs(page = 1) {
    const statusFilter = document.getElementById('tenders-job-status-filter').value;

    try {
        const data = await apiCall(`/crawler/tenders/jobs?page=${page}&limit=10&status=${statusFilter}`);

        if (data.success) {
            const tbody = document.getElementById('tenders-jobs-table-body');

            if (data.data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="text-center">No tenders found</td></tr>';
            } else {
                tbody.innerHTML = data.data.map(job => {
                    const duration = job.completed_at
                        ? Math.round((new Date(job.completed_at) - new Date(job.started_at)) / 1000)
                        : Math.round((new Date() - new Date(job.started_at)) / 1000);

                    return `
                        <tr>
                            <td>${new Date(job.started_at).toLocaleString()}</td>
                            <td><span class="badge badge-${job.status}">${job.status}</span></td>
                            <td>${job.batch_size}</td>
                            <td>${job.total_fetched || 0}</td>
                            <td class="success">${job.success_count || 0}</td>
                            <td class="error">${job.failed_count || 0}</td>
                            <td>${duration}s</td>
                            <td>${job.progress_percentage || 0}%</td>
                        </tr>
                    `;
                }).join('');
            }
            updateTendersPagination(data.pagination, page);
        }
    } catch (error) { console.error('Error loading Tenders jobs:', error); }
}

function updateTendersPagination(pagination, currentPage) {
    const paginationDiv = document.getElementById('tenders-jobs-pagination');
    if (!pagination || pagination.totalPages <= 1) {
        paginationDiv.innerHTML = '';
        return;
    }

    let html = '';
    html += `<button ${currentPage === 1 ? 'disabled' : ''} onclick="loadTendersJobs(${currentPage - 1})">Previous</button>`;
    for (let i = 1; i <= pagination.totalPages; i++) {
        if (i === currentPage) html += `<button class="active">${i}</button>`;
        else if (i === 1 || i === pagination.totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) html += `<button onclick="loadTendersJobs(${i})">${i}</button>`;
        else if (i === currentPage - 3 || i === currentPage + 3) html += `<button disabled>...</button>`;
    }
    html += `<button ${currentPage === pagination.totalPages ? 'disabled' : ''} onclick="loadTendersJobs(${currentPage + 1})">Next</button>`;
    paginationDiv.innerHTML = html;
}

function startTendersAutoRefresh() {
    if (tendersCrawlerStatusInterval) return;
    tendersCrawlerStatusInterval = setInterval(async () => {
        await refreshTendersCrawlerStatus();
        await loadTendersJobs();
    }, 5000);
}

function stopTendersAutoRefresh() {
    if (tendersCrawlerStatusInterval) {
        clearInterval(tendersCrawlerStatusInterval);
        tendersCrawlerStatusInterval = null;
    }
}

// ============================================
// RECRUITMENTS CRAWLER CONTROL
// ============================================

let recruitmentsCrawlerStatusInterval = null;

async function startRecruitmentsCrawler() {
    const batchSize = document.getElementById('recruitments-batch-size').value;
    const location = document.getElementById('recruitments-target-location').value.trim();

    try {
        const data = await apiCall('/crawler/recruitments/start', {
            method: 'POST',
            body: JSON.stringify({ 
                batch_size: parseInt(batchSize),
                location: location || null
            })
        });

        if (data.success) {
            alert(`Recruitments Crawler started with batch size ${batchSize}!`);
            await refreshRecruitmentsCrawlerStatus();
            startRecruitmentsAutoRefresh();
        } else {
            alert(`Failed to start crawler: ${data.message}`);
        }
    } catch (error) {
        alert('Error starting Recruitments crawler');
        console.error(error);
    }
}

async function pauseRecruitmentsCrawler() {
    try {
        const data = await apiCall('/crawler/recruitments/pause', { method: 'POST' });
        if (data.success) {
            alert('Recruitments Crawler paused!');
            await refreshRecruitmentsCrawlerStatus();
        } else {
            alert(`Failed to pause crawler: ${data.message}`);
        }
    } catch (error) { console.error(error); }
}

async function resumeRecruitmentsCrawler() {
    try {
        const data = await apiCall('/crawler/recruitments/resume', { method: 'POST' });
        if (data.success) {
            alert('Recruitments Crawler resumed!');
            await refreshRecruitmentsCrawlerStatus();
            startRecruitmentsAutoRefresh();
        } else {
            alert(`Failed to resume crawler: ${data.message}`);
        }
    } catch (error) { console.error(error); }
}

async function stopRecruitmentsCrawler() {
    try {
        const data = await apiCall('/crawler/recruitments/stop', { method: 'POST' });
        if (data.success) {
            alert('Recruitments Crawler stopped!');
            await refreshRecruitmentsCrawlerStatus();
            stopRecruitmentsAutoRefresh();
        } else {
            alert(`Failed to stop crawler: ${data.message}`);
        }
    } catch (error) { console.error(error); }
}

async function refreshRecruitmentsCrawlerStatus() {
    try {
        const data = await apiCall('/crawler/recruitments/status');
        if (data.success) {
            updateRecruitmentsCrawlerUI(data.status || data.data, data.current_job);
        }
    } catch (error) { console.error('Error fetching Recruitments crawler status:', error); }
}

function updateRecruitmentsCrawlerUI(status, currentJob) {
    const statusBadge = document.getElementById('recruitments-crawler-status-badge');

    if (currentJob && currentJob.status === 'running') {
        statusBadge.className = 'status-badge status-running';
        statusBadge.textContent = 'Running';
    } else if (currentJob && currentJob.status === 'paused') {
        statusBadge.className = 'status-badge status-paused';
        statusBadge.textContent = 'Paused';
    } else if (status.last_error) {
        statusBadge.className = 'status-badge status-failed';
        statusBadge.textContent = 'Error';
    } else {
        statusBadge.className = 'status-badge status-completed';
        statusBadge.textContent = 'Idle';
    }

    if (currentJob && (currentJob.status === 'running' || currentJob.status === 'paused')) {
        document.getElementById('recruitments-current-batch').textContent = currentJob.current_batch || 0;
        document.getElementById('recruitments-total-fetched').textContent = currentJob.total_fetched || 0;
        document.getElementById('recruitments-success-count').textContent = currentJob.success_count || 0;
        document.getElementById('recruitments-failed-count').textContent = currentJob.failed_count || 0;
        document.getElementById('recruitments-duplicate-count').textContent = currentJob.duplicate_count || 0;

        const progress = currentJob.progress_percentage || 0;
        document.getElementById('recruitments-progress-fill').style.width = `${progress}%`;
        document.getElementById('recruitments-progress-percentage').textContent = `${progress}%`;
        document.getElementById('recruitments-progress-detail').textContent =
            `Batch ${currentJob.current_batch || 1} - ${currentJob.total_fetched || 0} recruitments fetched`;
    }

    const startBtn = document.getElementById('recruitments-start-crawler-btn');
    const pauseBtn = document.getElementById('recruitments-pause-crawler-btn');
    const stopBtn = document.getElementById('recruitments-stop-crawler-btn');

    if (currentJob && currentJob.status === 'running') {
        startBtn.style.display = 'none';
        pauseBtn.style.display = 'inline-block';
        stopBtn.style.display = 'inline-block';
    } else if (currentJob && currentJob.status === 'paused') {
        startBtn.style.display = 'inline-block';
        startBtn.innerHTML = '<i class="fas fa-play"></i> Resume';
        startBtn.onclick = resumeRecruitmentsCrawler;
        pauseBtn.style.display = 'none';
        stopBtn.style.display = 'inline-block';
    } else {
        startBtn.style.display = 'inline-block';
        startBtn.innerHTML = '<i class="fas fa-play"></i> Start Crawler';
        startBtn.onclick = startRecruitmentsCrawler;
        pauseBtn.style.display = 'none';
        stopBtn.style.display = 'none';
    }
}

async function loadRecruitmentsJobs(page = 1) {
    const statusFilter = document.getElementById('recruitments-job-status-filter').value;

    try {
        const data = await apiCall(`/crawler/recruitments/jobs?page=${page}&limit=10&status=${statusFilter}`);

        if (data.success) {
            const tbody = document.getElementById('recruitments-jobs-table-body');

            if (data.data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="text-center">No recruitments found</td></tr>';
            } else {
                tbody.innerHTML = data.data.map(job => {
                    const duration = job.completed_at
                        ? Math.round((new Date(job.completed_at) - new Date(job.started_at)) / 1000)
                        : Math.round((new Date() - new Date(job.started_at)) / 1000);

                    return `
                        <tr>
                            <td>${new Date(job.started_at).toLocaleString()}</td>
                            <td><span class="badge badge-${job.status}">${job.status}</span></td>
                            <td>${job.batch_size}</td>
                            <td>${job.total_fetched || 0}</td>
                            <td class="success">${job.success_count || 0}</td>
                            <td class="error">${job.failed_count || 0}</td>
                            <td>${duration}s</td>
                            <td>${job.progress_percentage || 0}%</td>
                        </tr>
                    `;
                }).join('');
            }
            updateRecruitmentsPagination(data.pagination, page);
        }
    } catch (error) { console.error('Error loading Recruitments jobs:', error); }
}

function updateRecruitmentsPagination(pagination, currentPage) {
    const paginationDiv = document.getElementById('recruitments-jobs-pagination');
    if (!pagination || pagination.totalPages <= 1) {
        paginationDiv.innerHTML = '';
        return;
    }

    let html = '';
    html += `<button ${currentPage === 1 ? 'disabled' : ''} onclick="loadRecruitmentsJobs(${currentPage - 1})">Previous</button>`;
    for (let i = 1; i <= pagination.totalPages; i++) {
        if (i === currentPage) html += `<button class="active">${i}</button>`;
        else if (i === 1 || i === pagination.totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) html += `<button onclick="loadRecruitmentsJobs(${i})">${i}</button>`;
        else if (i === currentPage - 3 || i === currentPage + 3) html += `<button disabled>...</button>`;
    }
    html += `<button ${currentPage === pagination.totalPages ? 'disabled' : ''} onclick="loadRecruitmentsJobs(${currentPage + 1})">Next</button>`;
    paginationDiv.innerHTML = html;
}

function startRecruitmentsAutoRefresh() {
    if (recruitmentsCrawlerStatusInterval) return;
    recruitmentsCrawlerStatusInterval = setInterval(async () => {
        await refreshRecruitmentsCrawlerStatus();
        await loadRecruitmentsJobs();
    }, 5000);
}

function stopRecruitmentsAutoRefresh() {
    if (recruitmentsCrawlerStatusInterval) {
        clearInterval(recruitmentsCrawlerStatusInterval);
        recruitmentsCrawlerStatusInterval = null;
    }
}

// ============================================
// LOGS
// ============================================

async function loadLogs() {
    const data = await apiCall('/logs?limit=100');

    if (data.success) {
        document.getElementById('logs-list').innerHTML = data.data.map(log => `
            <div class="list-item">
                <div class="item-info">
                    <p><strong>${log.admin_name}</strong> - ${log.action}</p>
                    <p><small>${new Date(log.created_at).toLocaleString()}</small></p>
                </div>
            </div>
        `).join('');
    }
}

// ============================================
// INIT
// ============================================

if (token) {
    showDashboard();
} else {
    showLogin();
}

// Add filter change listener for Pending Reviews
document.getElementById('filter-type')?.addEventListener('change', () => {
    loadPendingReviews();
});

// Modal close
document.querySelector('.close')?.addEventListener('click', () => {
    document.getElementById('review-modal').style.display = 'none';
});
