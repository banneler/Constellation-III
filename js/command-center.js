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
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

    // --- RENDER FUNCTION (with all table logic restored) ---
    function renderDashboard() {
        if (!dashboardTable || !recentActivitiesTable || !allTasksTable || !myTasksTable) return;
        myTasksTable.innerHTML = "";
        dashboardTable.innerHTML = "";
        allTasksTable.innerHTML = "";
        recentActivitiesTable.innerHTML = "";

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
                row.innerHTML = `<td>${formatDate(task.due_date)}</td><td>${task.description}</td><td>${linkedEntity}</td>
                    <td>
                        <button class="btn-primary mark-task-complete-btn" data-task-id="${task.id}">Complete</button>
                        <button class="btn-secondary edit-task-btn" data-task-id="${task.id}">Edit</button>
                        <button class="btn-danger delete-task-btn" data-task-id="${task.id}">Delete</button>
                    </td>`;
            });

        // Render "Sequence Steps Due"
        state.contact_sequences
            .filter(cs => new Date(cs.next_step_due_date) <= today && cs.status === "Active")
            .sort((a, b) => new Date(a.next_step_due_date) - new Date(b.next_step_due_date))
            .forEach(cs => {
                const contact = state.contacts.find(c => c.id === cs.contact_id);
                const sequence = state.sequences.find(s => s.id === cs.sequence_id);
                if (!contact || !sequence) return;
                const step = state.sequence_steps.find(s => s.sequence_id === sequence.id && s.step_number === cs.current_step_number);
                if (!step) return;
                const row = dashboardTable.insertRow();
                const desc = step.subject || step.message || "";
                let btnHtml = "";
                const type = step.type.toLowerCase();
                if (type === "email" && contact.email) {
                    btnHtml = `<button class="btn-primary send-email-btn" data-cs-id="${cs.id}">Send Email</button>`;
                } else {
                    btnHtml = `<button class="btn-primary complete-step-btn" data-id="${cs.id}">Complete</button>`;
                }
                row.innerHTML = `<td>${formatDate(cs.next_step_due_date)}</td><td>${contact.first_name} ${contact.last_name}</td><td>${sequence.name}</td><td>${step.step_number}: ${step.type}</td><td>${desc}</td><td>${btnHtml}</td>`;
            });

        // Render "Upcoming Sequence Tasks"
        state.contact_sequences
            .filter(cs => cs.status === "Active")
            .sort((a, b) => new Date(a.next_step_due_date) - new Date(b.next_step_due_date))
            .forEach(cs => {
                const contact = state.contacts.find(c => c.id === cs.contact_id);
                if (!contact) return;
                const account = contact.account_id ? state.accounts.find(a => a.id === contact.account_id) : null;
                const row = allTasksTable.insertRow();
                row.innerHTML = `<td>${formatDate(cs.next_step_due_date)}</td><td>${contact.first_name} ${contact.last_name}</td><td>${account ? account.name : "N/A"}</td><td><button class="btn-secondary revisit-step-btn" data-cs-id="${cs.id}">Revisit Last Step</button></td>`;
            });

        // Render "Recent Activities"
        state.activities
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 20)
            .forEach(act => {
                const contact = state.contacts.find(c => c.id === act.contact_id);
                const account = contact ? state.accounts.find(a => a.id === contact.account_id) : null;
                const row = recentActivitiesTable.insertRow();
                row.innerHTML = `<td>${formatDate(act.date)}</td><td>${account ? account.name : "N/A"}</td><td>${contact ? `${contact.first_name} ${contact.last_name}` : "N/A"}</td><td>${act.type}: ${act.description}</td>`;
            });
    }

    // --- EVENT LISTENER SETUP ---
    function setupPageEventListeners() {
        setupModalListeners();
        themeToggleBtn.addEventListener("click", cycleTheme);
        logoutBtn.addEventListener("click", async () => {
            await supabase.auth.signOut();
            window.location.href = "index.html";
        });
        // (Add other specific listeners for this page here)
    }

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
                setupPageEventListeners();
                await loadAllData();
            } else {
                window.location.href = "index.html";
            }
        });
    }

    initializePage();
});
