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
    dealsViewMode: 'mine' // 'mine' or 'all'
  };

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
  const dealsViewToggleDiv = document.querySelector('.deals-view-toggle'); // NEW: Selector for the toggle container

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

    const dealsQuery = supabase.from("deals").select("*");
    // Only apply user_id filter if in 'mine' mode AND not a manager (to allow managers to see 'all' by default)
    // Or, more simply, filter only if mode is 'mine'
    if (state.dealsViewMode === 'mine') {
        dealsQuery.eq("user_id", state.currentUser.id);
    }
    // RLS NOTE: If RLS on 'deals' table only allows 'auth.uid() = user_id',
    // fetching 'all' will still only return the current user's deals unless RLS is updated.

    const userSpecificTables = ["accounts"]; // Accounts are still always user-specific
    const promises = [dealsQuery, ...userSpecificTables.map((table) =>
      supabase.from(table).select("*").eq("user_id", state.currentUser.id)
    )];
    const allTableNames = ["deals", ...userSpecificTables];

    try {
      const results = await Promise.allSettled(allPromises);
      results.forEach((result, index) => {
        const tableName = allTableNames[index];
        if (result.status === "fulfilled") {
          if (result.value.error) {
            console.error(
              `loadAllData: Supabase error fetching ${tableName}:`,
              result.value.error.message
            );
            state[tableName] = [];
            // Specific alert for RLS if in 'all' mode AND manager view is enabled
            if (tableName === 'deals' && state.dealsViewMode === 'all' && result.value.error.code === '42501' && dealsViewToggleDiv && !dealsViewToggleDiv.classList.contains('hidden')) {
                alert("RLS Warning: You might not have permission to view other users' deals. Please check Supabase RLS policies for the 'deals' table if you expect to see more data.");
            }
          } else {
            state[tableName] = result.value.data || [];
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
      renderDealsMetrics();
    }
  }

  // --- Render Functions (Deals specific) ---
  const renderDealsPage = () => {
    if (!dealsTableBody) return;
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
    const commitPercentage =
      MONTHLY_QUOTA > 0 ?
      ((currentCommit / MONTHLY_QUOTA) * 100).toFixed(1) :
      0;
    const bestCasePercentage =
      MONTHLY_QUOTA > 0 ? ((bestCase / MONTHLY_QUOTA) * 100).toFixed(1) : 0;
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
    // NEW: Conditional display for manager toggle buttons
    if (dealsViewToggleDiv) { // Ensure the div exists
        // Check if user_metadata exists and is_manager is true
        const isManager = state.currentUser.user_metadata?.is_manager === true;
        if (!isManager) {
            dealsViewToggleDiv.classList.add('hidden'); // Hide if not manager
            state.dealsViewMode = 'mine'; // Force to 'mine' view if not manager
        } else {
            dealsViewToggleDiv.classList.remove('hidden'); // Ensure visible if manager
            // If manager, default to 'mine' initially, but allow them to click 'all'
            viewMyDealsBtn.classList.add('active'); // Ensure 'My Deals' is active on manager load
            viewAllDealsBtn.classList.remove('active');
        }
    }
    await loadAllData(); // Initial data load on page entry
  } else {
    window.location.href = "index.html"; // Redirect if not signed in
  }
});
