// js/command-center.js (formerly dashboard.js)
import { SUPABASE_URL, SUPABASE_ANON_KEY, MONTHLY_QUOTA, formatDate, formatCurrencyK, addDays, themes, setupModalListeners, showModal, hideModal, updateActiveNavLink } from './shared_constants.js';

document.addEventListener("DOMContentLoaded", async () => {
  // --- Initialize Supabase client ---
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // --- Initialize State ---
  let state = {
    currentUser: null,
    contacts: [],
    accounts: [],
    sequences: [],
    sequence_steps: [],
    activities: [],
    contact_sequences: [],
    deals: [],
    tasks: [],
  };

  // All other DOM selectors...
  const logoutBtn = document.getElementById("logout-btn");
  const dashboardTable = document.querySelector("#dashboard-table tbody");
  // ... (rest of selectors)

  // All other functions (loadAllData, renderDashboard, etc.)...
  // ... (no changes needed inside these functions)
  
  // --- App Initialization (Command Center Page) ---

  // Check user session on page load
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    state.currentUser = session.user;
    
    // Call the function to set the active nav link!
    updateActiveNavLink(); 

    // Load all data
    await loadAllData(); 

    // Setup all other event listeners
    // setupModalListeners();
    // themeToggleBtn.addEventListener("click", cycleTheme);
    // etc.
    
  } else {
    // If no session, redirect to login
    window.location.href = "index.html";
  }
});
