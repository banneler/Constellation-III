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
    // ... Supabase client, state object, DOM selectors ...

    // --- RENDER FUNCTIONS ---
    function renderDealsByStageChart() {
        if (!dealsByStageCanvas || !stageChartEmptyMessage) return;

        const openDeals = state.deals.filter(
            deal => deal.stage !== 'Closed Won' && deal.stage !== 'Closed Lost'
        );

        if (openDeals.length === 0) {
            dealsByStageCanvas.classList.add('hidden');
            stageChartEmptyMessage.classList.remove('hidden');
            return;
        }
        dealsByStageCanvas.classList.remove('hidden');
        stageChartEmptyMessage.classList.add('hidden');

        const stageCounts = openDeals.reduce((acc, deal) => {
            const stage = deal.stage || 'Uncategorized';
            acc[stage] = (acc[stage] || 0) + 1;
            return acc;
        }, {});

        const labels = Object.keys(stageCounts);
        const data = Object.values(stageCounts);
        
        // NEW: Monochrome blue color palette
        const chartColors = ['#1e3a8a', '#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd'];

        if (state.dealsByStageChart) {
            state.dealsByStageChart.destroy();
        }

        state.dealsByStageChart = new Chart(dealsByStageCanvas, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Deals by Stage',
                    data: data,
                    backgroundColor: chartColors, // Use new palette
                    borderColor: 'var(--bg-medium)',
                    borderWidth: 2
                }]
            },
            options: { /* ... options are unchanged ... */ }
        });
    }

    function renderDealsByTimeChart() {
        if (!dealsByTimeCanvas || !timeChartEmptyMessage) return;
        // ... function logic ...

        // NEW: Monochrome blue color palette
        const chartColors = ['#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8'];

        state.dealsByTimeChart = new Chart(dealsByTimeCanvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: chartColors, // Use new palette
                }]
            },
            options: { /* ... options are unchanged ... */ }
        });
    }

  });

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
