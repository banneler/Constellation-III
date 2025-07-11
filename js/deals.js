// js/deals.js
import { SUPABASE_URL, SUPABASE_ANON_KEY, MONTHLY_QUOTA, formatMonthYear, formatCurrencyK, themes, setupModalListeners, showModal, hideModal } from './shared_constants.js';

document.addEventListener("DOMContentLoaded", async () => {
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let state = {
    currentUser: null,
    deals: [],
    accounts: [], // Needed to display account names in deals table
    dealsSortBy: "name",
    dealsSortDir: "asc",
    dealsViewMode: 'mine', // 'mine' or 'all'
    currentUserQuota: 0, // NEW: Default quota for current user
    allUsersQuotas: [] // NEW: For manager view to sum up all quotas
  };

  // Remove the hardcoded MONTHLY_QUOTA here (it's no longer used from shared_constants)
  // const MONTHLY_QUOTA = 5000; // This line is conceptually removed/overridden

  // --- DOM Element Selectors (Deals specific) ---
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

  // --- Theme Toggle Logic ---
  let currentThemeIndex = 0;
  function applyTheme(themeName) {
    if (!themeNameSpan) return;
    document.body.classList.remove('theme-dark', 'theme-light', 'theme-green');
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

    // Build the query for deals based on view mode
    const dealsQuery = supabase.from("deals").select("*");
    if (state.dealsViewMode === 'mine') {
        dealsQuery.eq("user_id", state.currentUser.id);
    }

    // NEW: Quota query - fetch current user's quota
    const currentUserQuotaQuery = supabase.from("user_quotas")
                                        .select("monthly_quota")
                                        .eq("user_id", state.currentUser.id)
                                        .single(); // Expect only one result

    // NEW: All quotas query (only for managers in 'all' view)
    let allQuotasQuery;
    if (state.dealsViewMode === 'all' && state.currentUser.user_metadata?.is_manager === true) {
        allQuotasQuery = supabase.from("user_quotas").select("monthly_quota");
    }


    const userSpecificTables = ["accounts"];
    const promises = [
        dealsQuery,
        ...userSpecificTables.map((table) => supabase.from(table).select("*").eq("user_id", state.currentUser.id)),
        currentUserQuotaQuery // Add current user's quota fetch
    ];
    const allTableNames = ["deals", ...userSpecificTables, "currentUserQuota"]; // Add a name for the quota result

    // If fetching all quotas, add that promise and name
    if (allQuotasQuery) {
        promises.push(allQuotasQuery);
        allTableNames.push("allUsersQuotas");
    }

    try {
      const results = await Promise.allSettled(promises);
      results.forEach((result, index) => {
        const tableName = allTableNames[index];
        if (result.status === "fulfilled") {
          if (result.value.error) {
            console.error(
              `loadAllData: Supabase error fetching ${tableName}:`,
              result.value.error.message
            );
            state[tableName] = []; // Default to empty array for data tables
            // Handle specific cases for quota and RLS
            if (tableName === 'currentUserQuota' && result.value.error.code === 'PGRST116') { // PGRST116 is 'no rows found' for .single()
                console.warn(`loadAllData: No quota found for current user (${state.currentUser.id}). Defaulting to 0.`);
                state.currentUserQuota = 0;
            } else if (tableName === 'deals' && state.dealsViewMode === 'all' && result.value.error.code === '42501' && dealsViewToggleDiv && !dealsViewToggleDiv.classList.contains('hidden')) {
                alert("RLS Warning: You might not have permission to view other users' deals. Please check Supabase RLS policies for the 'deals' table if you expect to see more data.");
            } else if (tableName === 'allUsersQuotas' && result.value.error.code === '42501') {
                 console.warn("RLS Warning: Not authorized to fetch all user quotas. Manager RLS for user_quotas might be missing.");
                 state.allUsersQuotas = []; // Clear all quotas if RLS blocks
            }
          } else {
            console.log(`loadAllData: Fetched ${tableName} data:`, result.value.data);
            if (tableName === "currentUserQuota") {
                state.currentUserQuota = result.value.data.monthly_quota || 0;
            } else if (tableName === "allUsersQuotas") {
                state.allUsersQuotas = result.value.data || [];
            }
            else {
                state[tableName] = result.value.data || [];
            }
          }
        } else {
          console.error(`loadAllData: Failed to fetch ${tableName}:`, result.reason);
          state[tableName] = [];
        }
      });
    } catch (error) {
      console.error("Critical error in loadAllData:", error);
    } finally {
      renderDealsPage();
      renderDealsMetrics(); // This will now use dynamic quota
    }
  }

  // --- Render Functions (Deals specific) ---
  const renderDealsPage = () => {
    if (!dealsTableBody) return;
    console.log("renderDealsPage: state.deals before rendering:", state.deals);

    const dealsWithAccount = state.deals.map((deal) => {
      const account = state.accounts.find((a) => a.id === deal.account_id);
      return { ...deal,
        account_name: account ? account.name : "N/A"
      };
    });
    dealsWithAccount.sort((a, b) => {
      const valA = a[state.dealsSortBy];
      const valB = b[state.dealsSortBy];
      let comparison = 0;
      if (typeof valA === "string") {
        comparison = (valA || "").localeCompare(valB || "");
      } else {
        if (valA > valB) comparison = 1;
        else if (valA < valB) comparison = -1;
      }
      return state.dealsSortDir === "desc" ? comparison * -1 : comparison;
    });
    dealsTableBody.innerHTML = "";
    dealsWithAccount.forEach((deal) => {
      const row = dealsTableBody.insertRow();
      row.innerHTML = `<td><input type="checkbox" class="commit-deal-checkbox" data-deal-id="${
        deal.id
      }" ${
        deal.is_committed ? "checked" : ""
      }></td><td class="deal-name-link" data-deal-id="${deal.id}">${
        deal.name
      }</td><td>${deal.term || ""}</td><td>${deal.account_name}</td><td>${
        deal.stage
      }</td><td>$${deal.mrc || 0}</td><td>${
        deal.close_month ? formatMonthYear(deal.close_month) : ""
      }</td><td>${
        deal.products || ""
      }</td><td><button class="btn-secondary edit-deal-btn" data-deal-id="${
        deal.id
      }">Edit</button></td>`;
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
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    let currentCommit = 0;
    let bestCase = 0;
    let totalFunnel = 0;

    // Determine the quota to use based on view mode and user type
    let effectiveMonthlyQuota = 0;
    if (state.dealsViewMode === 'mine' || state.currentUser.user_metadata?.is_manager !== true) {
        // If 'mine' view, or if not a manager (always sees 'mine' effectively)
        effectiveMonthlyQuota = state.currentUserQuota;
    } else if (state.dealsViewMode === 'all' && state.currentUser.user_metadata?.is_manager === true) {
        // If 'all' view AND manager, sum all quotas
        effectiveMonthlyQuota = state.allUsersQuotas.reduce((sum, quota) => sum + (quota.monthly_quota || 0), 0);
        if (effectiveMonthlyQuota === 0 && state.allUsersQuotas.length > 0) {
          console.warn("renderDealsMetrics: Sum of all quotas is 0, check monthly_quota values in DB.");
        }
    }
    // Fallback if no quota found (e.g., new user not in user_quotas table)
    if (effectiveMonthlyQuota === 0) {
      console.warn("renderDealsMetrics: Effective monthly quota is 0. Using fallback of 5000 for display only.");
      effectiveMonthlyQuota = 5000; // Temporary fallback for calculation display
    }
    console.log("renderDealsMetrics: Using effectiveMonthlyQuota:", effectiveMonthlyQuota);


    state.deals.forEach((deal) => {
      const dealCloseDate = deal.close_month ?
        new Date(deal.close_month) :
        null;
      const isCurrentMonth =
        dealCloseDate &&
        dealCloseDate.getMonth() === currentMonth &&
        dealCloseDate.getFullYear() === currentYear;
      totalFunnel += deal.mrc || 0;
      if (isCurrentMonth) {
        bestCase += deal.mrc || 0;
        if (deal.is_committed) {
          currentCommit += deal.mrc || 0;
        }
      }
    });

    // Use effectiveMonthlyQuota for percentage calculations
    const commitPercentage =
      effectiveMonthlyQuota > 0 ?
      ((currentCommit / effectiveMonthlyQuota) * 100).toFixed(1) :
      0;
    const bestCasePercentage =
      effectiveMonthlyQuota > 0 ? ((bestCase / effectiveMonthlyQuota) * 100).toFixed(1) : 0;

    metricCurrentCommit.textContent = formatCurrencyK(currentCommit);
    metricBestCase.textContent = formatCurrencyK(bestCase);
    metricFunnel.textContent = formatCurrencyK(totalFunnel);
    document.getElementById(
      "commit-quota-percent"
    ).textContent = `${commitPercentage}%`;
    document.getElementById(
      "best-case-quota-percent"
    ).textContent = `${bestCasePercentage}%`;
  };

  // --- Event Listener Setup ---
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
      await supabase.from("deals").update({
        is_committed
      }).eq("id", dealId);
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
        `<input type="hidden" id="modal-edit-deal-id" value="${
          deal.id
        }"><label>Deal Name</label><input type="text" id="modal-edit-deal-name" value="${
          deal.name || ""
        }" required><label>Stage</label><select id="modal-edit-deal-stage"><option>Discovery</option><option>Proposal</option><option>Negotiation</option><option>Closed Won</option><option>Closed Lost</option></select><label>Term</label><input type="text" id="modal-edit-deal-term" value="${
          deal.term || ""
        }"><label>Products</label><input type="text" id="modal-edit-deal-products" value="${
          deal.products || ""
        }"><label>Monthly Recurring Charge (MRC)</label><input type="number" id="modal-edit-deal-mrc" value="${
          deal.mrc || 0
        }" required><label>Estimated Close Month</label><input type="date" id="modal-edit-deal-close" value="${
          deal.close_month || ""
        }">`,
        async () => {
          const updatedDeal = {
            name: document.getElementById("modal-edit-deal-name").value,
            stage: document.getElementById("modal-edit-deal-stage").value,
            mrc: parseFloat(
              document.getElementById("modal-edit-deal-mrc").value
            ),
            close_month: document.getElementById("modal-edit-deal-close")
              .value,
            term: document.getElementById("modal-edit-deal-term").value,
            products: document.getElementById("modal-edit-deal-products")
              .value
          };
          if (!updatedDeal.name || isNaN(updatedDeal.mrc)) {
            alert("Deal Name and MRC are required.");
            return;
          }
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
        // Redirect to accounts page with the accountId
        window.location.href = `accounts.html?accountId=${deal.account_id}`;
      }
    }
  });

  // Deals View Toggle Event Listeners
  if (viewMyDealsBtn) {
    viewMyDealsBtn.addEventListener('click', async () => {
      console.log("View My Deals button clicked.");
      state.dealsViewMode = 'mine';
      console.log("dealsViewMode set to:", state.dealsViewMode);
      viewMyDealsBtn.classList.add('active');
      viewAllDealsBtn.classList.remove('active');
      await loadAllData();
    });
  }

  if (viewAllDealsBtn) {
    viewAllDealsBtn.addEventListener('click', async () => {
      console.log("View All Deals button clicked.");
      state.dealsViewMode = 'all';
      console.log("dealsViewMode set to:", state.dealsViewMode);
      viewAllDealsBtn.classList.add('active');
      viewMyDealsBtn.classList.remove('active');
      await loadAllData();
    });
  }

  // --- App Initialization (Deals Page) ---
  const savedTheme = localStorage.getItem('crm-theme') || 'dark';
  const savedThemeIndex = themes.indexOf(savedTheme);
  currentThemeIndex = savedThemeIndex !== -1 ? savedThemeIndex : 0;
  applyTheme(themes[currentThemeIndex]);

  // Check user session on page load
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    state.currentUser = session.user;
    // Conditional display for manager toggle buttons
    if (dealsViewToggleDiv) {
        const isManager = state.currentUser.user_metadata?.is_manager === true;
        if (!isManager) {
            dealsViewToggleDiv.classList.add('hidden');
            state.dealsViewMode = 'mine'; // Force to 'mine' view if not manager
        } else {
            dealsViewToggleDiv.classList.remove('hidden');
            // Ensure 'My Deals' is active on manager load by default, but allow toggle
            viewMyDealsBtn.classList.add('active');
            viewAllDealsBtn.classList.remove('active');
        }
    }
    await loadAllData();
  } else {
    window.location.href = "index.html"; // Redirect if not signed in
  }
});
