// js/command-center.js
import { 
    SUPABASE_URL, 
    SUPABASE_ANON_KEY, 
    MONTHLY_QUOTA, 
    formatDate, 
    formatCurrencyK, 
    addDays, 
    themes, 
    setupModalListeners, 
    showModal, 
    hideModal,
    updateActiveNavLink 
} from './shared_constants.js';

document.addEventListener("DOMContentLoaded", async () => {
    // --- Initialize Supabase client ---
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // --- State Management ---
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

    // --- DOM Element Selectors ---
    const logoutBtn = document.getElementById("logout-btn");
    const dashboardTable = document.querySelector("#dashboard-table tbody");
    const recentActivitiesTable = document.querySelector("#recent-activities-table tbody");
    const allTasksTable = document.querySelector("#all-tasks-table tbody");
    const myTasksTable = document.querySelector("#my-tasks-table tbody");
    const addNewTaskBtn = document.getElementById("add-new-task-btn");
    const themeToggleBtn = document.getElementById("theme-toggle-btn");
    const themeNameSpan = document.getElementById("theme-name");

    // --- Theme Logic ---
    let currentThemeIndex = 0;
    function applyTheme(themeName) {
        if (!themeNameSpan) return;
        document.body.className = ''; // Clear all previous theme classes
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
        
        const userSpecificTables = ["contacts", "accounts", "sequences", "activities", "contact_sequences", "deals", "tasks"];
        const publicTables = ["sequence_steps"];

        const userPromises = userSpecificTables.map((table) =>
            supabase.from(table).select("*").eq("user_id", state.currentUser.id)
        );
        const publicPromises = publicTables.map((table) =>
            supabase.from(table).select("*")
        );

        const allPromises = [...userPromises, ...publicPromises];
        const allTableNames = [...userSpecificTables, ...publicTables];

        try {
            const results = await Promise.allSettled(allPromises);
            results.forEach((result, index) => {
                const tableName = allTableNames[index];
                if (result.status === "fulfilled" && !result.value.error) {
                    state[tableName] = result.value.data || [];
                } else {
                    console.error(`Error fetching ${tableName}:`, result.status === 'fulfilled' ? result.value.error : result.reason);
                    state[tableName] = [];
                }
            });
        } catch (error) {
            console.error("Critical error in loadAllData:", error);
        } finally {
            renderDashboard();
        }
    }

    // --- Render Functions ---
    function renderDashboard() {
        if (!dashboardTable || !recentActivitiesTable || !allTasksTable || !myTasksTable) return;
        dashboardTable.innerHTML = "";
        recentActivitiesTable.innerHTML = "";
        allTasksTable.innerHTML = "";
        myTasksTable.innerHTML = "";
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Render "My Tasks"
        state.tasks
            .filter(task => task.status === 'Pending')
            .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
            .forEach(task => {
                const row = myTasksTable.insertRow();
                let linkedEntity = 'N/A';
                if (task.contact_id) {
                    const contact = state.contacts.find(c => c.id === task.contact_id);
                    if (contact) linkedEntity = `<a href="contacts.html?contactId=${contact.id}" class="contact-name-link">${contact.first_name} ${contact.last_name}</a> (Contact)`;
                }
                // (Add similar logic for account_id and deal_id if needed)
                
                row.innerHTML = `
                    <td>${formatDate(task.due_date)}</td>
                    <td>${task.description}</td>
                    <td>${linkedEntity}</td>
                    <td>
                        <button class="btn-primary mark-task-complete-btn" data-task-id="${task.id}">Complete</button>
                        <button class="btn-secondary edit-task-btn" data-task-id="${task.id}">Edit</button>
                        <button class="btn-danger delete-task-btn" data-task-id="${task.id}">Delete</button>
                    </td>
                `;
            });

        // Render "Sequence Steps Due"
        state.contact_sequences
            .filter(cs => new Date(cs.next_step_due_date) <= today && cs.status === "Active")
            .sort((a, b) => new Date(a.next_step_due_date) - new Date(b.next_step_due_date))
            .forEach(cs => {
                // (Code to render sequence steps...)
            });
        // (The rest of the rendering logic for other tables remains the same)
    }

    // --- Event Listener Setup ---
    function setupPageEventListeners() {
        setupModalListeners();
        themeToggleBtn.addEventListener("click", cycleTheme);
        logoutBtn.addEventListener("click", async () => {
            await supabase.auth.signOut();
            window.location.href = "index.html";
        });
        // (Add other dashboard-specific listeners here, e.g., for task buttons)
    }

    // --- INITIALIZATION LOGIC ---
    function initializePage() {
        // 1. Apply theme first to prevent flash of wrong theme
        const savedTheme = localStorage.getItem('crm-theme') || 'dark';
        const savedThemeIndex = themes.indexOf(savedTheme);
        currentThemeIndex = savedThemeIndex !== -1 ? savedThemeIndex : 0;
        applyTheme(themes[currentThemeIndex]);
        
        // 2. Set the active navigation link
        updateActiveNavLink();

        // 3. Check session and load data
        supabase.auth.getSession().then(async ({ data: { session } }) => {
            if (session) {
                state.currentUser = session.user;
                setupPageEventListeners();
                await loadAllData();
            } else {
                alert("No active session found. Redirecting to login.");
                window.location.href = "index.html";
            }
        });
    }

    initializePage();
});
