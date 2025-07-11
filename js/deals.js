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
        dealsChart: null // NEW: To hold the chart instance
    };

    // --- DOM Element Selectors ---
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

    // --- Theme Logic ---
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

        const currentUserQuotaQuery = supabase.from("user_quotas").select("monthly_quota").eq("user_id", state.currentUser.id).single();
        let allQuotasQuery;
        if (state.dealsViewMode === 'all' && state.currentUser.user_metadata?.is_manager === true) {
            allQuotasQuery = supabase.from("user_quotas").select("monthly_quota");
        }
        
        const promises = [dealsQuery, supabase.from("accounts").select("*"), currentUserQuotaQuery];
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
                        state.currentUserQuota = result.value.data?.monthly_quota || 0;
                    } else {
                        state[tableName] = result.value.data || [];
                    }
                } else {
                    console.error(`Error fetching ${tableName}:`, result.status === 'fulfilled' ? result.value.error?.message : result.reason);
                    if(tableName === 'currentUserQuota') state.currentUserQuota = 0;
                    else state[tableName] = [];
                }
            });
        } catch (error) {
            console.error("Critical error in loadAllData:", error);
        } finally {
            renderDealsPage();
            renderDealsMetrics();
            renderDealsChart(); // NEW: Call the chart rendering function
        }
    }

    // --- RENDER FUNCTIONS ---
    
    // NEW: Function to render the deals chart
    function renderDealsChart() {
        const ctx = document.getElementById('deals-by-stage-chart');
        if (!ctx) return;

        // Group deals by stage and count them
        const stageCounts = state.deals.reduce((acc, deal) => {
            const stage = deal.stage || 'Uncategorized';
            acc[stage] = (acc[stage] || 0) + 1;
            return acc;
        }, {});

        const labels = Object.keys(stageCounts);
        const data = Object.values(stageCounts);

        // Define colors for the chart segments
        const chartColors = [
            '#4a90e2', '#50e3c2', '#f5a623', '#f8e71c', '#bd10e0', '#9013fe', '#4a4a4a'
        ];

        // Destroy the old chart instance if it exists, to prevent memory leaks
        if (state.dealsChart) {
            state.dealsChart.destroy();
        }

        // Create the new chart
        state.dealsChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Deals by Stage',
                    data: data,
                    backgroundColor: chartColors,
                    borderColor: 'var(--bg-medium)',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: 'var(--text-medium)'
                        }
                    }
                }
            }
        });
    }

    const renderDealsPage = () => {
        // ... this function remains unchanged
    };

    const renderDealsMetrics = () => {
        // ... this function remains unchanged
    };

    // --- EVENT LISTENER SETUP ---
    // ... all event listeners remain unchanged ...

    // --- INITIALIZATION ---
    function initializePage() {
        const savedTheme = localStorage.getItem('crm-theme') || 'dark';
        const savedThemeIndex = themes.indexOf(savedTheme);
        currentThemeIndex = savedThemeIndex !== -1 ? savedThemeIndex : 0;
        applyTheme(themes[currentThemeIndex]);
        updateActiveNavLink();
        supabase.auth.getSession().then(async ({ data: { session } }) => {
            if (session) {
                state.currentUser = session.user;
                // ... rest of initialization ...
                await loadAllData();
            } else {
                window.location.href = "index.html";
            }
        });
    }

    initializePage();
});
