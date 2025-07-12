// js/deals.js
import { 
    SUPABASE_URL, 
    SUPABASE_ANON_KEY, 
    formatMonthYear, 
    formatCurrencyK, 
    formatCurrency, 
    themes, 
    setupModalListeners, 
    showModal, 
    hideModal,
    updateActiveNavLink
} from './shared_constants.js';

document.addEventListener("DOMContentLoaded", async () => {
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    let state = {
        currentUser: null,
        deals: [],
        accounts: [],
        dealsSortBy: "name",
        dealsSortDir: "asc",
        dealsViewMode: 'mine',
        currentUserQuota: 0,
        allUsersQuotas: [],
        dealsByStageChart: null,
        dealsByTimeChart: null
    };

    // --- DOM Element Selectors ---
    const dealsByStageCanvas = document.getElementById('deals-by-stage-chart');
    const stageChartEmptyMessage = document.getElementById('chart-empty-message');
    const dealsByTimeCanvas = document.getElementById('deals-by-time-chart');
    const timeChartEmptyMessage = document.getElementById('time-chart-empty-message');
    const logoutBtn = document.getElementById("logout-btn");
    const dealsTable = document.getElementById("deals-table");
    const dealsTableBody = document.querySelector("#deals-table tbody");
    const themeToggleBtn = document.getElementById("theme-toggle-btn");
    const themeNameSpan = document.getElementById("theme-name");
    const metricCurrentCommit = document.getElementById("metric-current-commit");
    const metricBestCase = document.getElementById("metric-best-case");
    const metricFunnel = document.getElementById("metric-funnel");
    const viewMyDealsBtn = document.getElementById("view-my-deals-btn");
    const viewAllDealsBtn = document.getElementById("view-all-deals-btn");
    const dealsViewToggleDiv = document.querySelector('.deals-view-toggle');
    const metricCurrentCommitTitle = document.getElementById("metric-current-commit-title");
    const metricBestCaseTitle = document.getElementById("metric-best-case-title");
    const commitTotalQuota = document.getElementById("commit-total-quota");
    const bestCaseTotalQuota = document.getElementById("best-case-total-quota");

    // --- Theme Toggle Logic ---
    let currentThemeIndex = 0;
    function applyTheme(themeName) {
        if (!themeNameSpan) return;
        document.body.className = '';
        document.body.classList.add(`theme-${themeName}`);
        const capitalizedThemeName = themeName.charAt(0).toUpperCase() + themeName.slice(1);
        themeNameSpan.textContent = capitalizedThemeName;
        localStorage.setItem('crm-theme', themeName);
    }
    function cycleTheme() {
        currentThemeIndex = (currentThemeIndex + 1) % themes.length;
        const newTheme = themes[currentThemeIndex];
        applyTheme(newTheme);
    }

    // --- Data Fetching ---
    async function loadAllData() {
        if (!state.currentUser) return;

        const dealsQuery = supabase.from("deals").select("*");
        if (state.dealsViewMode === 'mine') {
            dealsQuery.eq("user_id", state.currentUser.id);
        }

        const accountsQuery = supabase.from("accounts").select("*").eq("user_id", state.currentUser.id);
        const currentUserQuotaQuery = supabase.from("user_quotas").select("monthly_quota").eq("user_id", state.currentUser.id);

        let allQuotasQuery;
        if (state.dealsViewMode === 'all' && state.currentUser.user_metadata?.is_manager === true) {
            allQuotasQuery = supabase.from("user_quotas").select("monthly_quota");
        }
        
        const promises = [dealsQuery, accountsQuery, currentUserQuotaQuery];
        const allTableNames = ["deals", "accounts", "currentUserQuota"];

        if (allQuotasQuery) {
            promises.push(allQuotasQuery);
            allTableNames.push("allUsersQuotas");
        }

        try {
            const results = await Promise.allSettled(promises);
            results.forEach((result, index) => {
                const tableName = allTableNames[index];
                if (result.status === "fulfilled" && !result.value.error) {
                    if (tableName === "currentUserQuota") {
                        state.currentUserQuota = result.value.data?.[0]?.monthly_quota || 0;
                    } else {
                        state[tableName] = result.value.data || [];
                    }
                } else {
                    console.error(`Error fetching ${tableName}:`, result.status === 'fulfilled' ? result.value.error?.message : result.reason);
                }
            });
        } catch (error) {
            console.error("Critical error in loadAllData:", error);
        } finally {
            renderDealsPage();
            renderDealsMetrics();
            renderDealsByStageChart();
            renderDealsByTimeChart();
        }
    }

    // --- RENDER FUNCTIONS ---
   function renderDealsByTimeChart() {
    if (!dealsByTimeCanvas || !timeChartEmptyMessage) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const funnel = {
        '0-30 Days': 0,
        '31-60 Days': 0,
        '61-90 Days': 0,
        '90+ Days': 0
    };

    const openDeals = state.deals.filter(
        deal => deal.stage !== 'Closed Won' && deal.stage !== 'Closed Lost' && deal.close_month
    );

    if (openDeals.length === 0) {
        dealsByTimeCanvas.classList.add('hidden');
        timeChartEmptyMessage.classList.remove('hidden');
        return;
    }
    dealsByTimeCanvas.classList.remove('hidden');
    timeChartEmptyMessage.classList.add('hidden');
    
    openDeals.forEach(deal => {
        const closeDate = new Date(deal.close_month);
        const diffTime = closeDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays >= 0 && diffDays <= 30) {
            funnel['0-30 Days'] += deal.mrc || 0;
        } else if (diffDays >= 31 && diffDays <= 60) {
            funnel['31-60 Days'] += deal.mrc || 0;
        } else if (diffDays >= 61 && diffDays <= 90) {
            funnel['61-90 Days'] += deal.mrc || 0;
        } else if (diffDays > 90) {
            funnel['90+ Days'] += deal.mrc || 0;
        }
    });

    const labels = Object.keys(funnel);
    const data = Object.values(funnel).map(val => val / 1000);

    if (state.dealsByTimeChart) {
        state.dealsByTimeChart.destroy();
    }

    state.dealsByTimeChart = new Chart(dealsByTimeCanvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                // The 'label' property has been removed from here
                data: data,
                backgroundColor: ['#50e3c2', '#4a90e2', '#f5a623', '#6d6d6d'],
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
            },
            scales: {
                x: {
                    ticks: { color: 'var(--text-medium)' },
                    grid: { color: 'var(--border-color)' }
                },
                y: {
                    ticks: { color: 'var(--text-medium)' },
                    grid: { display: false }
                }
            }
        }
    });
}

    function renderDealsByTimeChart() {
        if (!dealsByTimeCanvas || !timeChartEmptyMessage) return;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const funnel = {
            '0-30 Days': 0,
            '31-60 Days': 0,
            '61-90 Days': 0,
            '90+ Days': 0
        };

        const openDeals = state.deals.filter(
            deal => deal.stage !== 'Closed Won' && deal.stage !== 'Closed Lost' && deal.close_month
        );

        if (openDeals.length === 0) {
            dealsByTimeCanvas.classList.add('hidden');
            timeChartEmptyMessage.classList.remove('hidden');
            return;
        }
        dealsByTimeCanvas.classList.remove('hidden');
        timeChartEmptyMessage.classList.add('hidden');
        
        openDeals.forEach(deal => {
            const closeDate = new Date(deal.close_month);
            const diffTime = closeDate - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays >= 0 && diffDays <= 30) {
                funnel['0-30 Days'] += deal.mrc || 0;
            } else if (diffDays >= 31 && diffDays <= 60) {
                funnel['31-60 Days'] += deal.mrc || 0;
            } else if (diffDays >= 61 && diffDays <= 90) {
                funnel['61-90 Days'] += deal.mrc || 0;
            } else if (diffDays > 90) {
                funnel['90+ Days'] += deal.mrc || 0;
            }
        });

        const labels = Object.keys(funnel);
        const data = Object.values(funnel).map(val => val / 1000); // Display in thousands

        if (state.dealsByTimeChart) {
            state.dealsByTimeChart.destroy();
        }

        state.dealsByTimeChart = new Chart(dealsByTimeCanvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Funnel Value (in $K)',
                    data: data,
                    backgroundColor: ['#50e3c2', '#4a90e2', '#f5a623', '#6d6d6d'],
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                },
                scales: {
                    x: {
                        ticks: { color: 'var(--text-medium)' },
                        grid: { color: 'var(--border-color)' }
                    },
                    y: {
                        ticks: { color: 'var(--text-medium)' },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    const renderDealsPage = () => {
        if (!dealsTableBody) return;
        const dealsWithAccount = state.deals.map((deal) => {
            const account = state.accounts.find((a) => a.id === deal.account_id);
            return { ...deal, account_name: account ? account.name : "N/A" };
        });
        dealsWithAccount.sort((a, b) => {
            const valA = a[state.dealsSortBy];
            const valB = b[state.dealsSortBy];
            let comparison = 0;
            if (typeof valA === "string") { comparison = (valA || "").localeCompare(valB || ""); } 
            else { if (valA > valB) comparison = 1; else if (valA < valB) comparison = -1; }
            return state.dealsSortDir === "desc" ? comparison * -1 : comparison;
        });
        dealsTableBody.innerHTML = "";
        dealsWithAccount.forEach((deal) => {
            const row = dealsTableBody.insertRow();
            row.innerHTML = `<td><input type="checkbox" class="commit-deal-checkbox" data-deal-id="${deal.id}" ${deal.is_committed ? "checked" : ""}></td><td class="deal-name-link" data-deal-id="${deal.id}">${deal.name}</td><td>${deal.term || ""}</td><td>${deal.account_name}</td><td>${deal.stage}</td><td>$${deal.mrc || 0}</td><td>${deal.close_month ? formatMonthYear(deal.close_month) : ""}</td><td>${deal.products || ""}</td><td><button class="btn-secondary edit-deal-btn" data-deal-id="${deal.id}">Edit</button></td>`;
        });
        document.querySelectorAll("#deals-table th.sortable").forEach((th) => {
            th.classList.remove("asc", "desc");
            if (th.dataset.sort === state.dealsSortBy) {
                th.classList.add(state.dealsSortDir);
            }
        });
    };

    const renderDealsMetrics = () => {
        if (!metricCurrentCommit) return;
        const isManager = state.currentUser.user_metadata?.is_manager === true;
        const isMyTeamView = state.dealsViewMode === 'all' && isManager;
        if (metricCurrentCommitTitle && metricBestCaseTitle) {
            metricCurrentCommitTitle.textContent = isMyTeamView ? "My Team's Current Commit" : "My Current Commit";
            metricBestCaseTitle.textContent = isMyTeamView ? "My Team's Current Best Case" : "My Current Best Case";
        }
        let effectiveMonthlyQuota = 0;
        if (isMyTeamView) {
            effectiveMonthlyQuota = state.allUsersQuotas.reduce((sum, quota) => sum + (quota.monthly_quota || 0), 0);
        } else {
            effectiveMonthlyQuota = state.currentUserQuota;
        }
        if (commitTotalQuota && bestCaseTotalQuota) {
            if (isMyTeamView) {
                commitTotalQuota.textContent = formatCurrency(effectiveMonthlyQuota);
                bestCaseTotalQuota.textContent = formatCurrency(effectiveMonthlyQuota);
                commitTotalQuota.classList.remove('hidden');
                bestCaseTotalQuota.classList.remove('hidden');
            } else {
                commitTotalQuota.classList.add('hidden');
                bestCaseTotalQuota.classList.add('hidden');
            }
        }
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        let currentCommit = 0, bestCase = 0, totalFunnel = 0;
        state.deals.forEach((deal) => {
            const dealCloseDate = deal.close_month ? new Date(deal.close_month) : null;
            const isCurrentMonth = dealCloseDate && dealCloseDate.getMonth() === currentMonth && dealCloseDate.getFullYear() === currentYear;
            totalFunnel += deal.mrc || 0;
            if (isCurrentMonth) {
                bestCase += deal.mrc || 0;
                if (deal.is_committed) {
                    currentCommit += deal.mrc || 0;
                }
            }
        });
        metricCurrentCommit.textContent = formatCurrencyK(currentCommit);
        metricBestCase.textContent = formatCurrencyK(bestCase);
        metricFunnel.textContent = formatCurrencyK(totalFunnel);
        const commitPercentage = effectiveMonthlyQuota > 0 ? ((currentCommit / effectiveMonthlyQuota) * 100).toFixed(1) : 0;
        const bestCasePercentage = effectiveMonthlyQuota > 0 ? ((bestCase / effectiveMonthlyQuota) * 100).toFixed(1) : 0;
        document.getElementById("commit-quota-percent").textContent = `${commitPercentage}%`;
        document.getElementById("best-case-quota-percent").textContent = `${bestCasePercentage}%`;
    };

    function setupPageEventListeners() {
        setupModalListeners();
        themeToggleBtn.addEventListener("click", cycleTheme);
        logoutBtn.addEventListener("click", async () => {
            await supabase.auth.signOut();
            window.location.href = "index.html";
        });
        dealsTable.querySelector("thead").addEventListener("click", (e) => {
            const th = e.target.closest("th");
            if (!th || !th.classList.contains("sortable")) return;
            const sortKey = th.dataset.sort;
            if (state.dealsSortBy === sortKey) {
                state.dealsSortDir = state.dealsSortDir === "asc" ? "desc" : "asc";
            } else {
                state.dealsSortBy = sortKey;
                state.dealsSortDir = "asc";
            }
            renderDealsPage();
        });
        document.addEventListener("change", async (e) => {
            if (e.target.classList.contains("commit-deal-checkbox")) {
                const dealId = Number(e.target.dataset.dealId);
                const is_committed = e.target.checked;
                await supabase.from("deals").update({ is_committed }).eq("id", dealId);
                await loadAllData();
            }
        });
        document.addEventListener("click", async (e) => {
            if (e.target.classList.contains("edit-deal-btn")) {
                const dealId = Number(e.target.dataset.dealId);
                const deal = state.deals.find((d) => d.id === dealId);
                if (!deal) return;
                showModal(
                    "Edit Deal",
                    `<input type="hidden" id="modal-edit-deal-id" value="${deal.id}"><label>Deal Name</label><input type="text" id="modal-edit-deal-name" value="${deal.name || ""}" required><label>Stage</label><select id="modal-edit-deal-stage"><option>Discovery</option><option>Proposal</option><option>Negotiation</option><option>Closed Won</option><option>Closed Lost</option></select><label>Term</label><input type="text" id="modal-edit-deal-term" value="${deal.term || ""}"><label>Products</label><input type="text" id="modal-edit-deal-products" value="${deal.products || ""}"><label>Monthly Recurring Charge (MRC)</label><input type="number" id="modal-edit-deal-mrc" value="${deal.mrc || 0}" required><label>Estimated Close Month</label><input type="date" id="modal-edit-deal-close" value="${deal.close_month || ""}">`,
                    async () => {
                        const updatedDeal = { name: document.getElementById("modal-edit-deal-name").value, stage: document.getElementById("modal-edit-deal-stage").value, mrc: parseFloat(document.getElementById("modal-edit-deal-mrc").value), close_month: document.getElementById("modal-edit-deal-close").value, term: document.getElementById("modal-edit-deal-term").value, products: document.getElementById("modal-edit-deal-products").value };
                        if (!updatedDeal.name || isNaN(updatedDeal.mrc)) { alert("Deal Name and MRC are required."); return; }
                        await supabase.from("deals").update(updatedDeal).eq("id", deal.id);
                        await loadAllData();
                        hideModal();
                    }
                );
                document.getElementById("modal-edit-deal-stage").value = deal.stage;
            }
        });
        dealsTable.addEventListener("click", (e) => {
            const targetLink = e.target.closest(".deal-name-link");
            if (targetLink) {
                const dealId = Number(targetLink.dataset.dealId);
                const deal = state.deals.find((d) => d.id === dealId);
                if (deal && deal.account_id) {
                    window.location.href = `accounts.html?accountId=${deal.account_id}`;
                }
            }
        });
        if (viewMyDealsBtn) {
            viewMyDealsBtn.addEventListener('click', async () => {
                state.dealsViewMode = 'mine';
                viewMyDealsBtn.classList.add('active');
                viewAllDealsBtn.classList.remove('active');
                await loadAllData();
            });
        }
        if (viewAllDealsBtn) {
            viewAllDealsBtn.addEventListener('click', async () => {
                state.dealsViewMode = 'all';
                viewAllDealsBtn.classList.add('active');
                viewMyDealsBtn.classList.remove('active');
                await loadAllData();
            });
        }
    }
    
    function initializePage() {
        const savedTheme = localStorage.getItem('crm-theme') || 'dark';
        const savedThemeIndex = themes.indexOf(savedTheme);
        currentThemeIndex = savedThemeIndex !== -1 ? savedThemeIndex : 0;
        applyTheme(themes[currentThemeIndex]);
        updateActiveNavLink();
        supabase.auth.getSession().then(async ({ data: { session } }) => {
            if (session) {
                state.currentUser = session.user;
                if (dealsViewToggleDiv) {
                    const isManager = state.currentUser.user_metadata?.is_manager === true;
                    if (!isManager) {
                        dealsViewToggleDiv.classList.add('hidden');
                        state.dealsViewMode = 'mine';
                    } else {
                        dealsViewToggleDiv.classList.remove('hidden');
                        viewMyDealsBtn.classList.add('active');
                        viewAllDealsBtn.classList.remove('active');
                    }
                }
                setupPageEventListeners();
                await loadAllData();
            } else {
                window.location.href = "index.html";
            }
        });
    }

    initializePage();
});
