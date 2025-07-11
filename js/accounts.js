// js/accounts.js
import { SUPABASE_URL, SUPABASE_ANON_KEY, formatDate, formatMonthYear, parseCsvRow, themes, setupModalListeners, showModal, hideModal } from './shared_constants.js';

document.addEventListener("DOMContentLoaded", async () => {
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let state = {
    currentUser: null,
    contacts: [],
    accounts: [],
    activities: [],
    contact_sequences: [], // Needed for contacts list in account details
    deals: [],
    selectedAccountId: null,
    tasks: [] // Needed to create them (though not displayed here)
  };

  // --- DOM Element Selectors (Accounts specific) ---
  const logoutBtn = document.getElementById("logout-btn");
  const accountList = document.getElementById("account-list");
  const addAccountBtn = document.getElementById("add-account-btn");
  const bulkImportAccountsBtn = document.getElementById("bulk-import-accounts-btn");
  const accountCsvInput = document.getElementById("account-csv-input");
  const accountForm = document.getElementById("account-form");
  const deleteAccountBtn = document.getElementById("delete-account-btn");
  const addDealBtn = document.getElementById("add-deal-btn");
  const addTaskAccountBtn = document.getElementById("add-task-account-btn"); // NEW: Add Task button
  const accountContactsList = document.getElementById("account-contacts-list");
  const accountActivitiesList = document.getElementById("account-activities-list");
  const accountDealsTableBody = document.querySelector("#account-deals-table tbody");
  const themeToggleBtn = document.getElementById("theme-toggle-btn");
  const themeNameSpan = document.getElementById("theme-name");

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

    // UPDATED: Include 'tasks' in data fetch for dropdowns
    const userSpecificTables = ["contacts", "accounts", "activities", "contact_sequences", "deals", "tasks"];

    const promises = userSpecificTables.map((table) =>
      supabase.from(table).select("*").eq("user_id", state.currentUser.id)
    );

    try {
      const results = await Promise.allSettled(promises);
      results.forEach((result, index) => {
        const tableName = userSpecificTables[index];
        if (result.status === "fulfilled") {
          if (result.value.error) {
            console.error(
              `Supabase error fetching ${tableName}:`,
              result.value.error.message
            );
            state[tableName] = [];
          } else {
            state[tableName] = result.value.data || [];
          }
        } else {
          console.error(`Failed to fetch ${tableName}:`, result.reason);
          state[tableName] = [];
        }
      });
    } catch (error) {
      console.error("Critical error in loadAllData:", error);
    } finally {
      renderAccountList();
      renderAccountDetails();
    }
  }

  // --- Render Functions (Accounts specific) ---
  const renderAccountList = () => {
    if (!accountList) return;
    accountList.innerHTML = "";
    state.accounts
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
      .forEach((account) => {
        const i = document.createElement("div");
        i.className = "list-item";
        i.textContent = account.name;
        i.dataset.id = account.id;
        if (account.id === state.selectedAccountId) i.classList.add("selected");
        accountList.appendChild(i);
      });
  };

  const renderAccountDetails = () => {
    if (!accountForm) return;
    const account = state.accounts.find(
      (a) => a.id === state.selectedAccountId
    );

    if (!accountContactsList || !accountActivitiesList || !accountDealsTableBody) return;

    accountContactsList.innerHTML = "";
    accountActivitiesList.innerHTML = "";
    accountDealsTableBody.innerHTML = "";

    if (account) {
      accountForm.querySelector("#account-id").value = account.id;
      accountForm.querySelector("#account-name").value = account.name || "";
      accountForm.querySelector("#account-website").value =
        account.website || "";
      accountForm.querySelector("#account-industry").value =
        account.industry || "";
      accountForm.querySelector("#account-phone").value = account.phone || "";
      accountForm.querySelector("#account-address").value =
        account.address || "";
      accountForm.querySelector("#account-notes").value = account.notes || "";
      document.getElementById(
        "account-last-saved"
      ).textContent = account.last_saved ?
        `Last Saved: ${formatDate(account.last_saved)}` :
        "";

      state.deals
        .filter((d) => d.account_id === account.id)
        .forEach((deal) => {
          const row = accountDealsTableBody.insertRow();
          row.innerHTML = `<td><input type="checkbox" class="commit-deal-checkbox" data-deal-id="${
            deal.id
          }" ${deal.is_committed ? "checked" : ""}></td><td>${
            deal.name
          }</td><td>${deal.term || ""}</td><td>${deal.stage}</td><td>$${
            deal.mrc || 0
          }</td><td>${
            deal.close_month ? formatMonthYear(deal.close_month) : ""
          }</td><td>${
            deal.products || ""
          }</td><td><button class="btn-secondary edit-deal-btn" data-deal-id="${
            deal.id
          }">Edit</button></td>`;
        });

      state.contacts
        .filter((c) => c.account_id === account.id)
        .forEach((c) => {
          const li = document.createElement("li");
          const inSeq = state.contact_sequences.some(
            (cs) => cs.contact_id === c.id && cs.status === "Active"
          );
          li.innerHTML = `<span class="contact-name-link" data-contact-id="${
            c.id
          }">${c.first_name} ${c.last_name}</span> (${c.title || "No Title"}) ${
            inSeq
              ? '<span class="sequence-status-icon" style="color: var(--completed-color);">🔄</span>'
              : ""
          }`;
          accountContactsList.appendChild(li);
        });

      state.activities
        .filter((act) => act.account_id === account.id)
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .forEach((act) => {
          const c = state.contacts.find((c) => c.id === act.contact_id);
          const li = document.createElement("li");
          li.textContent = `[${formatDate(act.date)}] ${act.type} with ${
            c ? `${c.first_name} ${c.last_name}` : "Unknown"
          }: ${act.description}`;
          let borderColor = "var(--primary-blue)";
          const activityTypeLower = act.type.toLowerCase();
          if (activityTypeLower.includes("email")) {
            borderColor = "var(--warning-yellow)";
          } else if (activityTypeLower.includes("call")) {
            borderColor = "var(--completed-color)";
          } else if (activityTypeLower.includes("meeting")) {
            borderColor = "var(--meeting-purple)";
          }
          li.style.borderLeftColor = borderColor;
          accountActivitiesList.appendChild(li);
        });
    } else {
      accountForm.reset();
      accountForm.querySelector("#account-id").value = "";
      document.getElementById("account-last-saved").textContent = "";
    }
  };

  // --- Event Listener Setup (Accounts specific) ---
  setupModalListeners();

  themeToggleBtn.addEventListener("click", cycleTheme);

  logoutBtn.addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.href = "index.html";
  });

  addAccountBtn.addEventListener("click", async () => {
    showModal(
      "New Account Name",
      `<label>Account Name</label><input type="text" id="modal-account-name" required>`,
      async () => {
        const name = document
          .getElementById("modal-account-name")
          .value.trim();
        if (name) {
          await supabase
            .from("accounts")
            .insert([{
              name: name,
              user_id: state.currentUser.id
            }]);
          await loadAllData();
          hideModal();
        } else {
          alert("Account name is required.");
        }
      }
    );
  });

  accountList.addEventListener("click", (e) => {
    const item = e.target.closest(".list-item");
    if (item) {
      state.selectedAccountId = Number(item.dataset.id);
      renderAccountList();
      renderAccountDetails();
    }
  });

  accountForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = Number(accountForm.querySelector("#account-id").value);
    if (!id) return;
    const data = {
      name: accountForm.querySelector("#account-name").value.trim(),
      website: accountForm.querySelector("#account-website").value.trim(),
      industry: accountForm.querySelector("#account-industry").value.trim(),
      phone: accountForm.querySelector("#account-phone").value.trim(),
      address: accountForm.querySelector("#account-address").value.trim(),
      notes: accountForm.querySelector("#account-notes").value,
      last_saved: new Date().toISOString()
    };
    await supabase.from("accounts").update(data).eq("id", id);
    await loadAllData();
    alert("Account saved!");
  });

  deleteAccountBtn.addEventListener("click", async () => {
    if (!state.selectedAccountId) return;
    showModal(
      "Confirm Deletion",
      "Are you sure you want to delete this account? This cannot be undone.",
      async () => {
        await supabase
          .from("accounts")
          .delete()
          .eq("id", state.selectedAccountId);
        state.selectedAccountId = null;
        await loadAllData();
        hideModal();
      }
    );
  });

  bulkImportAccountsBtn.addEventListener("click", () =>
    accountCsvInput.click()
  );

  accountCsvInput.addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = async function(e) {
      const rows = e.target.result.split("\n").filter((r) => r.trim() !== "");
      const newRecords = rows.map((row) => {
        const c = parseCsvRow(row);
        return {
          name: c[0] || "",
          website: c[1] || "",
          industry: c[2] || "",
          address: c[3] || "",
          phone: c[4] || "",
          user_id: state.currentUser.id
        };
      });
      if (newRecords.length > 0) {
        await supabase.from("accounts").insert(newRecords);
        alert(`${newRecords.length} accounts imported.`);
        await loadAllData();
      }
    };
    r.readAsText(f);
    e.target.value = "";
  });

  addDealBtn.addEventListener("click", () => {
    if (!state.selectedAccountId)
      return alert("Please select an account first.");
    showModal(
      "Create New Deal",
      `<label>Deal Name</label><input type="text" id="modal-deal-name" required><label>Stage</label><select id="modal-deal-stage"><option>Discovery</option><option>Proposal</option><option>Negotiation</option><option>Closed Won</option><option>Closed Lost</option></select><label>Term</label><input type="text" id="modal-deal-term"><label>Products</label><input type="text" id="modal-deal-products"><label>Monthly Recurring Charge (MRC)</label><input type="number" id="modal-deal-mrc" required><label>Estimated Close Month</label><input type="date" id="modal-deal-close">`,
      async () => {
        const newDeal = {
          user_id: state.currentUser.id,
          account_id: state.selectedAccountId,
          name: document.getElementById("modal-deal-name").value,
          stage: document.getElementById("modal-deal-stage").value,
          mrc: parseFloat(document.getElementById("modal-deal-mrc").value),
          close_month: document.getElementById("modal-deal-close").value,
          term: document.getElementById("modal-deal-term").value,
          products: document.getElementById("modal-deal-products").value
        };
        if (!newDeal.name || isNaN(newDeal.mrc)) {
          alert("Deal Name and MRC are required.");
          return;
        }
        await supabase.from("deals").insert([newDeal]);
        await loadAllData();
        hideModal();
      }
    );
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

  document.getElementById("account-contacts-list")
    .addEventListener("click", (e) => {
      const targetLink = e.target.closest(".contact-name-link");
      if (targetLink) {
        const contactId = Number(targetLink.dataset.contactId);
        if (contactId) {
          // Navigate to the contacts page with the contactId as a query parameter
          window.location.href = `contacts.html?contactId=${contactId}`;
        }
      }
    });

  // NEW: Add Task button listener for Account page
  if (addTaskAccountBtn) { // Ensure button exists before adding listener
    addTaskAccountBtn.addEventListener("click", async () => {
        if (!state.selectedAccountId) {
            alert("Please select an account to link the task.");
            return;
        }
        const currentAccount = state.accounts.find(a => a.id === state.selectedAccountId);
        if (!currentAccount) {
            alert("Selected account not found.");
            return;
        }

        // Prepare options for linked entities, pre-selecting the current account
        const contactsOptions = state.contacts
            .sort((a,b) => (a.last_name || '').localeCompare(b.last_name || ''))
            .map(c => `<option value="c-${c.id}">${c.first_name} ${c.last_name}</option>`).join('');
        const accountsOptions = state.accounts
            .sort((a,b) => (a.name || '').localeCompare(b.name || ''))
            .map(a => `<option value="a-${a.id}" ${a.id === currentAccount.id ? 'selected' : ''}>${a.name}</option>`).join('');
        const dealsOptions = state.deals
            .sort((a,b) => (a.name || '').localeCompare(b.name || ''))
            .map(d => `<option value="d-${d.id}">${d.name}</option>`).join('');

        showModal(
            `Create Task for ${currentAccount.name}`,
            `
            <label>Description:</label><input type="text" id="modal-task-description" required><br>
            <label>Due Date:</label><input type="date" id="modal-task-due-date"><br>
            <label>Link To:</label>
            <select id="modal-task-linked-entity" disabled> <optgroup label="Contacts">${contactsOptions}</optgroup>
                <optgroup label="Accounts">${accountsOptions}</optgroup>
                <optgroup label="Deals">${dealsOptions}</optgroup>
            </select>
            `,
            async () => {
                const description = document.getElementById('modal-task-description').value.trim();
                const dueDate = document.getElementById('modal-task-due-date').value;
                const linkedEntityValue = document.getElementById('modal-task-linked-entity').value; // Will be pre-selected value

                if (!description) {
                    alert('Task description is required.');
                    return;
                }

                const newTask = {
                    user_id: state.currentUser.id,
                    description: description,
                    due_date: dueDate || null,
                    status: 'Pending'
                };

                // Determine linked entity type and set the correct ID based on pre-selection
                if (linkedEntityValue.startsWith('c-')) {
                    newTask.contact_id = Number(linkedEntityValue.substring(2));
                } else if (linkedEntityValue.startsWith('a-')) {
                    newTask.account_id = Number(linkedEntityValue.substring(2));
                } else if (linkedEntityValue.startsWith('d-')) {
                    newTask.deal_id = Number(linkedEntityValue.substring(2));
                }

                console.log('Creating new task from Account page:', newTask);
                const { error } = await supabase.from('tasks').insert([newTask]);

                if (error) {
                    console.error('Error creating task from Account page:', error.message);
                    alert('Error: ' + error.message);
                } else {
                    console.log('Task created from Account page. Reloading data (though not reflected here).');
                    alert('Task created successfully!');
                    hideModal();
                }
            }
        );
    });
  }


  // --- App Initialization (Accounts Page) ---
  const savedTheme = localStorage.getItem('crm-theme') || 'dark';
  const savedThemeIndex = themes.indexOf(savedTheme);
  currentThemeIndex = savedThemeIndex !== -1 ? savedThemeIndex : 0;
  applyTheme(themes[currentThemeIndex]);

  // Check user session on page load
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    state.currentUser = session.user;
    const urlParams = new URLSearchParams(window.location.search);
    const accountIdFromUrl = urlParams.get('accountId');
    if (accountIdFromUrl) {
        state.selectedAccountId = Number(accountIdFromUrl);
    }
    await loadAllData();
  } else {
    window.location.href = "index.html"; // Redirect to auth page if not signed in
  }
});
