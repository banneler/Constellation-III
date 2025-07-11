// js/dashboard.js
import { SUPABASE_URL, SUPABASE_ANON_KEY, MONTHLY_QUOTA, formatDate, formatCurrencyK, addDays, themes, setupModalListeners, showModal, hideModal } from './shared_constants.js';

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

  // --- DOM Element Selectors (Dashboard specific) ---
  const logoutBtn = document.getElementById("logout-btn");
  const dashboardTable = document.querySelector("#dashboard-table tbody");
  const recentActivitiesTable = document.querySelector("#recent-activities-table tbody");
  const allTasksTable = document.querySelector("#all-tasks-table tbody");
  const myTasksTable = document.querySelector("#my-tasks-table tbody");
  const addNewTaskBtn = document.getElementById("add-new-task-btn");
  const themeToggleBtn = document.getElementById("theme-toggle-btn");
  const themeNameSpan = document.getElementById("theme-name");
  const metricCurrentCommit = document.getElementById("metric-current-commit");
  const metricBestCase = document.getElementById("metric-best-case");
  const metricFunnel = document.getElementById("metric-funnel");

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

  // --- Utility for getting start of local day ---
  function getStartOfLocalDayISO() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today.toISOString();
  }

  // --- Data Fetching Function ---
  async function loadAllData() {
    if (!state.currentUser) return;
    console.log("loadAllData: Fetching all user data...");

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
        if (result.status === "fulfilled") {
          if (result.value.error) {
            console.error(
              `loadAllData: Supabase error fetching ${tableName}:`,
              result.value.error.message
            );
            state[tableName] = [];
          } else {
            state[tableName] = result.value.data || [];
          }
        } else {
          console.error(`loadAllData: Failed to fetch ${tableName}:`, result.reason);
          state[tableName] = [];
        }
      });
      console.log("loadAllData: All data fetched. Calling render functions.");
    } catch (error) {
      console.error("loadAllData: Critical error in loadAllData:", error);
    } finally {
      renderDashboard();
      renderDealsMetrics();
    }
  }

  // --- Render Functions ---
  function renderDashboard() {
    if (!dashboardTable || !recentActivitiesTable || !allTasksTable || !myTasksTable) return;
    console.log("renderDashboard: Starting render process.");
    dashboardTable.innerHTML = "";
    recentActivitiesTable.innerHTML = "";
    allTasksTable.innerHTML = "";
    myTasksTable.innerHTML = "";
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dueSequenceSteps = state.contact_sequences
      .filter(
        (cs) => {
          const nextStepDate = new Date(cs.next_step_due_date);
          nextStepDate.setHours(0, 0, 0, 0);

          const isDue = nextStepDate <= today;
          const isActive = cs.status === "Active";

          if (cs.id === 5) { // Debugging specific csId (from previous logs)
              console.log(`renderDashboard: Checking csId 5 -- Raw DB Date: ${cs.next_step_due_date}, Normalized Date for Comparison: ${nextStepDate.toISOString()}, IsDue: ${isDue}, Status: ${cs.status}, IsActive: ${isActive}`);
          }
          return isDue && isActive;
        }
      )
      .sort(
        (a, b) =>
        new Date(a.next_step_due_date) - new Date(b.next_step_due_date)
      );

    console.log("renderDashboard: Number of due sequence steps after filtering:", dueSequenceSteps.length);
    if (dueSequenceSteps.length === 0) {
        console.log("renderDashboard: No due sequence steps found to display.");
    }

    dueSequenceSteps.forEach((cs) => {
        const contact = state.contacts.find((c) => c.id === cs.contact_id);
        const sequence = state.sequences.find((s) => s.id === cs.sequence_id);
        if (!contact || !sequence) {
            console.warn(`renderDashboard: Missing contact or sequence for CS ID ${cs.id}`);
            return;
        }
        const step = state.sequence_steps.find(
            (s) =>
            s.sequence_id === sequence.id &&
            s.step_number === cs.current_step_number
        );
        if (!step) {
            console.warn(`renderDashboard: Missing step for CS ID ${cs.id}, Seq ID ${sequence.id}, Step Num ${cs.current_step_number}`);
            return;
        }

        const row = dashboardTable.insertRow();
        const desc = step.subject || step.message || "";
        let btnHtml = "";
        const type = step.type.toLowerCase();
        if (type === "email" && contact.email) {
            btnHtml = `<button class="btn-primary send-email-btn" data-cs-id="${cs.id}" data-contact-id="${contact.id}" data-subject="${encodeURIComponent(step.subject)}" data-message="${encodeURIComponent(step.message)}">Send Email</button>`;
        } else if (type === "linkedin") {
            btnHtml = `<button class="btn-primary linkedin-step-btn" data-id="${cs.id}">Go to LinkedIn</button>`;
        } else {
            btnHtml = `<button class="btn-primary complete-step-btn" data-id="${cs.id}">Complete</button>`;
        }
        row.innerHTML = `<td>${formatDate(cs.next_step_due_date)}</td><td>${contact.first_name} ${contact.last_name}</td><td>${sequence.name}</td><td>${step.step_number}: ${step.type}</td><td>${desc}</td><td>${btnHtml}</td>`;
    });

    // NEW: Render My Tasks
    state.tasks
        .filter(task => task.status === 'Pending')
        .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
        .forEach(task => {
            const row = myTasksTable.insertRow();
            let linkedEntity = 'N/A';
            if (task.contact_id) {
                const contact = state.contacts.find(c => c.id === task.contact_id);
                if (contact) linkedEntity = `<a href="contacts.html?contactId=${contact.id}" class="contact-name-link">${contact.first_name} ${contact.last_name}</a> (Contact)`;
            } else if (task.account_id) {
                const account = state.accounts.find(a => a.id === task.account_id);
                if (account) linkedEntity = `<a href="accounts.html?accountId=${account.id}" class="contact-name-link">${account.name}</a> (Account)`;
            } else if (task.deal_id) {
                const deal = state.deals.find(d => d.id === task.deal_id);
                if (deal) linkedEntity = `${deal.name} (Deal)`;
            }

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
    console.log("renderDashboard: My Tasks rendered. Number of pending tasks:", state.tasks.filter(t => t.status === 'Pending').length);


    state.contact_sequences
      .filter((cs) => cs.status === "Active")
      .sort(
        (a, b) =>
        new Date(a.next_step_due_date) - new Date(b.next_step_due_date)
      )
      .forEach((cs) => {
        const contact = state.contacts.find((c) => c.id === cs.contact_id);
        if (!contact) return;
        const account = contact.account_id ?
          state.accounts.find((a) => a.id === contact.account_id) :
          null;
        const row = allTasksTable.insertRow();
        row.innerHTML = `<td>${formatDate(cs.next_step_due_date)}</td><td>${contact.first_name} ${contact.last_name}</td><td>${account ? account.name : "N/A"}</td><td><button class="btn-secondary revisit-step-btn" data-cs-id="${cs.id}">Revisit Last Step</button></td>`;
      });

    state.activities
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 20)
      .forEach((act) => {
        const contact = state.contacts.find((c) => c.id === act.contact_id);
        const account = contact ?
          state.accounts.find((a) => a.id === contact.account_id) :
          null;
        const row = recentActivitiesTable.insertRow();
        row.innerHTML = `<td>${formatDate(act.date)}</td><td>${account ? account.name : "N/A"}</td><td>${contact ? `${contact.first_name} ${contact.last_name}` : "N/A"}</td><td>${act.type}: ${act.description}</td>`;
      });
  }

  function renderDealsMetrics() {
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
  }

  async function completeStep(csId) {
    console.log(`completeStep: Attempting to complete step for csId: ${csId}`);
    const cs = state.contact_sequences.find((c) => c.id === csId);
    if (!cs) {
      console.warn(`completeStep: Contact sequence with ID ${csId} not found.`);
      return;
    }
    const sequence = state.sequences.find((s) => s.id === cs.sequence_id);
    const contact = state.contacts.find((c) => c.id === cs.contact_id);
    const step = state.sequence_steps.find(
      (s) =>
      s.sequence_id === cs.sequence_id &&
      s.step_number === cs.current_step_number
    );
    if (contact && sequence && step) {
      console.log("completeStep: Inserting activity...");
      const { error: activityError } = await supabase.from("activities").insert([{
        contact_id: contact.id,
        account_id: contact.account_id,
        date: new Date().toISOString(),
        type: `Sequence: ${step.type}`,
        description: step.subject || step.message || "Completed step",
        user_id: state.currentUser.id
      }]);
      if (activityError) {
        console.error("completeStep: Error inserting activity:", activityError.message);
      } else {
        console.log("completeStep: Activity inserted successfully.");
      }
    }
    const nextStep = state.sequence_steps.find(
      (s) =>
      s.sequence_id === cs.sequence_id &&
      s.step_number === cs.current_step_number + 1
    );

    if (nextStep) {
      console.log(`completeStep: Moving to next step (${nextStep.step_number})...`);
      const { error: updateError } = await supabase
        .from("contact_sequences")
        .update({
          current_step_number: nextStep.step_number,
          last_completed_date: new Date().toISOString(),
          next_step_due_date: addDays(
            new Date(),
            nextStep.delay_days
          ).toISOString()
        })
        .eq("id", cs.id);
      if (updateError) {
        console.error("completeStep: Error updating contact_sequences for next step:", updateError.message);
      } else {
        console.log("completeStep: Contact sequence updated for next step successfully.");
      }
    } else {
      console.log("completeStep: No next step found. Setting sequence status to 'Completed'.");
      const { error: completionError } = await supabase
        .from("contact_sequences")
        .update({
          status: "Completed"
        })
        .eq("id", cs.id);
      if (completionError) {
        console.error("completeStep: Error setting contact_sequences status to 'Completed':", completionError.message);
      } else {
        console.log("completeStep: Contact sequence status set to 'Completed' successfully.");
      }
    }
    console.log("completeStep: Calling loadAllData after step completion.");
    await loadAllData();
  }

  // --- Event Listener Setup (Dashboard specific) ---
  setupModalListeners();

  themeToggleBtn.addEventListener("click", cycleTheme);

  logoutBtn.addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.href = "index.html";
  });

  dashboardTable.addEventListener("click", async (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.classList.contains("complete-step-btn")) {
      completeStep(Number(t.dataset.id));
    } else if (t.classList.contains("send-email-btn")) {
      const csId = Number(t.dataset.csId);
      const contactId = Number(t.dataset.contactId);
      const subject = decodeURIComponent(t.dataset.subject);
      let message = decodeURIComponent(t.dataset.message);
      const contact = state.contacts.find((c) => c.id === contactId);
      if (!contact) return alert("Contact not found.");
      message = message.replace(/{{firstName}}/g, contact.first_name);
      const mailtoLink = `mailto:${contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
      window.open(mailtoLink, "_blank");
      completeStep(csId);
    } else if (t.classList.contains("linkedin-step-btn")) {
      const csId = Number(t.dataset.id);
      window.open("https://www.linkedin.com/feed/", "_blank");
      completeStep(csId);
    }
  });

  allTasksTable.addEventListener("click", async (e) => {
    const targetButton = e.target.closest(".revisit-step-btn");
    if (!targetButton) {
      console.log("Revisit button not clicked or target is null.");
      return;
    }
    const csId = Number(targetButton.dataset.csId);
    console.log(`Revisit button clicked for csId: ${csId}`);
    const contactSequence = state.contact_sequences.find(
      (cs) => cs.id === csId
    );
    if (!contactSequence) {
      console.warn(`Contact sequence with ID ${csId} not found in state.`);
      return;
    }

    const originalStepNumber = contactSequence.current_step_number;
    const newStepNumber = Math.max(1, originalStepNumber - 1);
    console.log(`Proposed new step number: ${newStepNumber} (from original: ${originalStepNumber})`);

    showModal(
      "Revisit Step",
      `Are you sure you want to revisit step ${newStepNumber} for this sequence?`,
      async () => {
        console.log("Modal confirmed. Attempting Supabase update for revisit...");
        const { data, error } = await supabase
          .from("contact_sequences")
          .update({
            current_step_number: newStepNumber,
            next_step_due_date: getStartOfLocalDayISO(), // Uses the new utility function
            status: "Active"
          })
          .eq("id", csId)
          .select();

        if (error) {
          console.error("Supabase error revisiting step:", error.message);
          alert("Error revisiting step: " + error.message);
        } else {
          console.log("Supabase update successful for revisit:", data);
          const updatedCsInMemory = state.contact_sequences.find(cs => cs.id === csId);
          console.log("State of csId 5 IN-MEMORY BEFORE loadAllData:", updatedCsInMemory);

          await loadAllData();

          const updatedCsAfterFetch = state.contact_sequences.find(cs => cs.id === csId);
          console.log("State of csId 5 AFTER loadAllData (newly fetched):", updatedCsAfterFetch);

          alert("Sequence step updated successfully!");
          hideModal();
        }
      }
    );
  });

  // NEW: Event listeners for My Tasks section (Delegated)
  document.addEventListener('click', async (e) => {
    const targetButton = e.target;
    // Handlers for "My Tasks" buttons
    if (targetButton.classList.contains('mark-task-complete-btn')) {
        const taskId = targetButton.dataset.taskId; // CORRECTED
        console.log("Mark complete button clicked, taskId:", taskId); // ADDED LOG
        showModal('Confirm Completion', 'Mark this task as completed?', async () => {
            console.log(`Marking task ${taskId} as complete.`);
            const { error } = await supabase.from('tasks').update({ status: 'Completed' }).eq('id', taskId);
            if (error) {
                console.error('Error marking task complete:', error.message);
                alert('Error: ' + error.message);
            } else {
                console.log('Task marked complete. Reloading data.');
                await loadAllData();
                hideModal();
            }
        });
    } else if (targetButton.classList.contains('delete-task-btn')) {
        const taskId = targetButton.dataset.taskId; // CORRECTED
        console.log("Delete button clicked, taskId:", taskId); // ADDED LOG
        showModal('Confirm Deletion', 'Are you sure you want to delete this task? This cannot be undone.', async () => {
            console.log(`Deleting task ${taskId}.`);
            const { error } = await supabase.from('tasks').delete().eq('id', taskId);
            if (error) {
                console.error('Error deleting task:', error.message);
                alert('Error: ' + error.message);
            } else {
                console.log('Task deleted. Reloading data.');
                await loadAllData();
                hideModal();
            }
        });
    } else if (targetButton.classList.contains('edit-task-btn')) {
        const taskId = targetButton.dataset.taskId; // CORRECTED
        console.log("Edit button clicked, taskId:", taskId); // ADDED LOG
        const task = state.tasks.find(t => t.id === taskId);
        if (!task) {
            console.error('Task not found in state for ID:', taskId); // IMPROVED ERROR LOG
            alert('Task not found.');
            return;
        }

        // Fetch contacts, accounts, and deals for dropdowns
        // Ensure that IDs are used directly, not converted to Number, if linking by UUID.
        // If contact_id/account_id/deal_id are bigint (numbers) in DB, then Number() conversion might be needed for those specifically.
        // Assuming contact_id, account_id, deal_id are bigint (numbers) based on previous schema.
        const contactsOptions = state.contacts.map(c => `<option value="c-${c.id}" ${c.id === task.contact_id ? 'selected' : ''}>${c.first_name} ${c.last_name} (Contact)</option>`).join('');
        const accountsOptions = state.accounts.map(a => `<option value="a-${a.id}" ${a.id === task.account_id ? 'selected' : ''}>${a.name} (Account)</option>`).join('');
        const dealsOptions = state.deals.map(d => `<option value="d-${d.id}" ${d.id === task.deal_id ? 'selected' : ''}>${d.name} (Deal)</option>`).join('');

        showModal(
            'Edit Task',
            `
            <label>Description:</label><input type="text" id="modal-task-description" value="${task.description}" required><br>
            <label>Due Date:</label><input type="date" id="modal-task-due-date" value="${task.due_date ? task.due_date.substring(0, 10) : ''}"><br>
            <label>Link To:</label>
            <select id="modal-task-linked-entity">
                <option value="">-- None --</option>
                <optgroup label="Contacts">${contactsOptions}</optgroup>
                <optgroup label="Accounts">${accountsOptions}</optgroup>
                <optgroup label="Deals">${dealsOptions}</optgroup>
            </select>
            `,
            async () => {
                const newDescription = document.getElementById('modal-task-description').value.trim();
                const newDueDate = document.getElementById('modal-task-due-date').value;
                const linkedEntityValue = document.getElementById('modal-task-linked-entity').value;

                if (!newDescription) {
                    alert('Task description is required.');
                    return;
                }

                const updateData = {
                    description: newDescription,
                    due_date: newDueDate || null,
                    contact_id: null,
                    account_id: null,
                    deal_id: null
                };

                // Determine linked entity type and set the correct ID
                // Ensure correct type conversion for linked entity IDs (bigint in DB)
                if (linkedEntityValue.startsWith('c-')) {
                    updateData.contact_id = Number(linkedEntityValue.substring(2));
                } else if (linkedEntityValue.startsWith('a-')) {
                    updateData.account_id = Number(linkedEntityValue.substring(2));
                } else if (linkedEntityValue.startsWith('d-')) {
                    updateData.deal_id = Number(linkedEntityValue.substring(2));
                }

                console.log('Updating task:', taskId, updateData);
                const { error } = await supabase.from('tasks').update(updateData).eq('id', taskId); // taskId is UUID string here

                if (error) {
                    console.error('Error updating task:', error.message);
                    alert('Error: ' + error.message);
                } else {
                    console.log('Task updated. Reloading data.');
                    await loadAllData();
                    hideModal();
                }
            }
        );
    }
  });


  // --- App Initialization (Dashboard Page) ---
  const savedTheme = localStorage.getItem('crm-theme') || 'dark';
  const savedThemeIndex = themes.indexOf(savedTheme);
  currentThemeIndex = savedThemeIndex !== -1 ? savedThemeIndex : 0;
  applyTheme(themes[currentThemeIndex]);

  // Check user session on page load
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    state.currentUser = session.user;
    await loadAllData();
  } else {
    window.location.href = "index.html";
  }
});
