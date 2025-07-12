// js/contacts.js
import {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    formatDate,
    formatSimpleDate,
    themes,
    setupModalListeners,
    showModal,
    hideModal,
    updateActiveNavLink,
    parseCsvRow
} from './shared_constants.js';

document.addEventListener("DOMContentLoaded", async () => {
    console.log("contacts.js script started parsing."); // Debugging log
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    let state = {
        currentUser: null,
        contacts: [],
        accounts: [],
        sequences: [],
        sequence_steps: [],
        activities: [],
        contact_sequences: [],
        currentContact: null,
        contactsSortBy: "first_name",
        contactsSortDir: "asc",
    };

    // --- DOM Element Selectors ---
    const logoutBtn = document.getElementById("logout-btn");
    const contactList = document.getElementById("contact-list");
    const contactForm = document.getElementById("contact-form");
    const deleteContactBtn = document.getElementById("delete-contact-btn");
    const addContactBtn = document.getElementById("add-contact-btn");
    const contactCsvInput = document.getElementById("contact-csv-input");
    const bulkImportContactsBtn = document.getElementById("bulk-import-contacts-btn");
    const contactSearchInput = document.getElementById("contact-search");
    const contactIdInput = document.getElementById("contact-id");
    const contactFirstNameInput = document.getElementById("contact-first-name");
    const contactLastNameInput = document.getElementById("contact-last-name");
    const contactEmailInput = document.getElementById("contact-email");
    const contactPhoneInput = document.getElementById("contact-phone");
    const contactTitleInput = document.getElementById("contact-title");
    const contactAccountNameSelect = document.getElementById("contact-account-name");
    const contactNotesInput = document.getElementById("contact-notes");
    const contactLastSavedSpan = document.getElementById("contact-last-saved");
    const logActivityBtn = document.getElementById("log-activity-btn");
    const contactActivitiesList = document.getElementById("contact-activities-list");
    const assignSequenceBtn = document.getElementById("assign-sequence-btn");
    const contactSequenceStatusDiv = document.getElementById("contact-sequence-status");
    const removeContactFromSequenceBtn = document.getElementById("remove-from-sequence-btn");
    const addContactTaskBtn = document.getElementById("add-task-contact-btn");
    const themeToggleBtn = document.getElementById("theme-toggle-btn");
    const themeNameSpan = document.getElementById("theme-name");

    // Ring Chart related elements (UPDATED to match new HTML IDs/classes)
    const ringChartContainer = document.querySelector('.ring-chart-container');
    const ringChartFill = document.getElementById('ring-chart-fill'); // Use the new fill element
    const ringChartText = document.getElementById('ring-chart-text');
    const sequenceStatusContent = document.getElementById('sequence-status-content');
    const noSequenceText = document.getElementById('no-sequence-text');
    const contactSequenceInfoText = document.getElementById('contact-sequence-info-text');


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

    // --- Utility ---
    let debounceTimer;
    const debounce = (func, delay) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(func, delay);
    };

    // --- Data Fetching ---
    async function loadAllData() {
        if (!state.currentUser) return;
        const tables = ["contacts", "accounts", "sequences", "sequence_steps", "activities", "contact_sequences"];
        const promises = tables.map(table => {
            let query = supabase.from(table).select("*");
            // Only apply user_id filter if table has a user_id column
            if (["contacts", "accounts", "sequences", "activities", "contact_sequences"].includes(table)) {
                query = query.eq("user_id", state.currentUser.id);
            }
            return query;
        });

        try {
            const results = await Promise.allSettled(promises);
            results.forEach((result, index) => {
                const tableName = tables[index];
                if (result.status === "fulfilled" && !result.value.error) {
                    state[tableName] = result.value.data || [];
                } else {
                    console.error(`Error fetching ${tableName}:`, result.status === 'fulfilled' ? result.value.error?.message : result.reason);
                    state[tableName] = [];
                }
            });
        } catch (error) {
            console.error("Critical error in loadAllData:", error);
        } finally {
            renderContactList();
            if (state.currentContact) {
                const reloadedContact = state.contacts.find(c => c.id === state.currentContact.id);
                if (reloadedContact) {
                    state.currentContact = reloadedContact;
                    renderContactDetails(state.currentContact.id);
                } else {
                    hideContactDetails();
                }
            } else {
                hideContactDetails();
            }
        }
    }

    // --- Render Functions ---
    function renderContactList() {
        if (!contactList) return;
        contactList.innerHTML = "";
        let filteredContacts = state.contacts;
        const searchTerm = contactSearchInput.value.toLowerCase();
        if (searchTerm) {
            filteredContacts = filteredContacts.filter(contact =>
                (contact.first_name && contact.first_name.toLowerCase().includes(searchTerm)) ||
                (contact.last_name && contact.last_name.toLowerCase().includes(searchTerm)) ||
                (contact.email && contact.email.toLowerCase().includes(searchTerm))
            );
        }

        filteredContacts.sort((a, b) => {
            const valA = a[state.contactsSortBy];
            const valB = b[state.contactsSortBy];
            let comparison = 0;
            if (typeof valA === "string") {
                comparison = (valA || "").localeCompare(valB || "");
            } else {
                if (valA > valB) comparison = 1;
                else if (valA < valB) comparison = -1;
            }
            return state.contactsSortDir === "desc" ? comparison * -1 : comparison;
        });

        filteredContacts.forEach(contact => {
            const contactDiv = document.createElement("div");
            contactDiv.classList.add("list-item");
            if (state.currentContact && state.currentContact.id === contact.id) {
                contactDiv.classList.add("selected");
            }
            contactDiv.dataset.contactId = contact.id;

            const account = state.accounts.find(a => a.id === contact.account_id);
            const activeSequence = state.contact_sequences.find(cs => cs.contact_id === contact.id && cs.status === 'Active');

            // NEW: Add the small indicator dot beside the name
            let sequenceStatusIndicatorHtml = '';
            if (activeSequence) {
                sequenceStatusIndicatorHtml = `<span class="active-sequence-dot"></span>`;
            }

            contactDiv.innerHTML = `
                <div>${contact.first_name} ${contact.last_name} ${sequenceStatusIndicatorHtml}</div>
                <small>${account ? account.name : 'No Account'}</small>
            `;
            contactList.appendChild(contactDiv);
        });

        document.querySelectorAll("#contact-list .list-item").forEach(item => {
            item.removeEventListener('click', handleContactClick);
            item.addEventListener('click', handleContactClick);
        });
    }

    async function handleContactClick(e) {
        const contactId = Number(e.currentTarget.dataset.contactId);
        state.currentContact = state.contacts.find(c => c.id === contactId);
        if (state.currentContact) {
            document.querySelectorAll(".list-item").forEach(item => item.classList.remove("selected"));
            e.currentTarget.classList.add("selected");
            renderContactDetails(contactId);
        }
    }

    async function renderContactDetails(contactId) {
        console.log("Rendering contact details for ID:", contactId); // Debugging
        if (!contactForm) {
            console.error("Contact form not found in DOM.");
            return;
        }

        const contact = state.contacts.find(c => c.id === contactId);
        if (!contact) {
            console.error("Contact not found for details rendering:", contactId);
            hideContactDetails();
            return;
        }
        state.currentContact = contact;

        contactIdInput.value = contact.id;
        contactFirstNameInput.value = contact.first_name || "";
        contactLastNameInput.value = contact.last_name || "";
        contactEmailInput.value = contact.email || "";
        contactPhoneInput.value = contact.phone || "";
        contactTitleInput.value = contact.title || "";
        contactNotesInput.value = contact.notes || "";
        contactLastSavedSpan.textContent = contact.last_saved_at ? `Last saved: ${formatDate(contact.last_saved_at)}` : "Not yet saved.";

        // Populate accounts dropdown
        contactAccountNameSelect.innerHTML = '<option value="">-- Select Account --</option>';
        state.accounts.forEach(account => {
            const option = document.createElement("option");
            option.value = account.id;
            option.textContent = account.name;
            if (contact.account_id === account.id) {
                option.selected = true;
            }
            contactAccountNameSelect.appendChild(option);
        });

        // Render Sequence Status Ring
        const activeSequence = state.contact_sequences.find(cs => cs.contact_id === contact.id && cs.status === 'Active');

        // Check for all necessary elements before trying to manipulate them
        if (ringChartContainer && ringChartFill && ringChartText && sequenceStatusContent && noSequenceText && contactSequenceInfoText) {
            if (activeSequence) {
                const sequence = state.sequences.find(s => s.id === activeSequence.sequence_id);
                const allSequenceSteps = state.sequence_steps.filter(ss => ss.sequence_id === activeSequence.sequence_id);
                const totalSteps = allSequenceSteps.length;
                // completedSteps should be the number of steps *before* the current step
                const completedSteps = activeSequence.current_step_number - 1;

                // Ensure totalSteps is not zero for progress calculation
                const progressPercent = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

                // Set the conic-gradient background for the ring fill
                // Use var(--primary-blue) for progress color, and transparent for the unfilled part of this layer
                ringChartFill.style.backgroundImage = `conic-gradient(var(--primary-blue) 0% ${progressPercent}%, transparent ${progressPercent}% 100%)`;

                // Set ring text to fraction (e.g., 2/6)
                ringChartText.textContent = `${completedSteps}/${totalSteps || '0'}`; // Show 0 if totalSteps is 0

                // Set info text below the ring
                contactSequenceInfoText.textContent = `${sequence ? sequence.name : 'Unknown Sequence'}`;
                // Add current step to info text if available
                if (totalSteps > 0) {
                    contactSequenceInfoText.textContent += ` - Step ${activeSequence.current_step_number}/${totalSteps}`;
                }


                sequenceStatusContent.classList.remove('hidden');
                noSequenceText.classList.add('hidden');
                removeContactFromSequenceBtn.classList.remove('hidden');

            } else {
                // If not in active sequence, hide the ring and show "Not in a sequence"
                sequenceStatusContent.classList.add('hidden');
                noSequenceText.classList.remove('hidden');
                removeContactFromSequenceBtn.classList.add('hidden');
            }
        } else {
            console.warn("One or more ring chart related DOM elements not found (debug elements):", {ringChartContainer, ringChartFill, ringChartText, sequenceStatusContent, noSequenceText, contactSequenceInfoText});
        }

        // Render Contact Activities
        renderContactActivities(contactId);

        document.getElementById("contact-details").classList.remove("hidden");
    }

    function renderContactActivities(contactId) {
        if (!contactActivitiesList) return;
        contactActivitiesList.innerHTML = "";
        const activities = state.activities.filter(act => act.contact_id === contactId);
        activities.sort((a, b) => new Date(b.date) - new Date(a.date));
        if (activities.length === 0) {
            contactActivitiesList.innerHTML = '<li>No activities logged for this contact.</li>';
        } else {
            activities.forEach(act => {
                const li = document.createElement("li");
                li.innerHTML = `<strong>${act.type}</strong> on ${formatDate(act.date)}: ${act.description}`;
                contactActivitiesList.appendChild(li);
            });
        }
    }

    function hideContactDetails() {
        if (contactIdInput) contactIdInput.value = "";
        if (contactForm) contactForm.reset();
        if (contactLastSavedSpan) contactLastSavedSpan.textContent = "";
        if (contactAccountNameSelect) contactAccountNameSelect.innerHTML = '<option value="">-- Select Account --</option>';
        if (contactActivitiesList) contactActivitiesList.innerHTML = "";
        if (contactSequenceStatusDiv) {
            if (sequenceStatusContent) sequenceStatusContent.classList.add('hidden');
            if (noSequenceText) noSequenceText.classList.remove('hidden');
        }
        state.currentContact = null;
        document.querySelectorAll(".list-item").forEach(item => item.classList.remove("selected"));
        document.getElementById("contact-details").classList.add("hidden");
    }

    // --- Core Logic ---
    async function saveContact(e) {
        e.preventDefault();
        if (!state.currentUser) { console.error("No current user to save contact."); return; }

        const contactData = {
            first_name: contactFirstNameInput.value.trim(),
            last_name: contactLastNameInput.value.trim(),
            email: contactEmailInput.value.trim(),
            phone: contactPhoneInput.value.trim(),
            title: contactTitleInput.value.trim(),
            account_id: contactAccountNameSelect.value ? Number(contactAccountNameSelect.value) : null,
            notes: contactNotesInput.value.trim(),
            user_id: state.currentUser.id,
        };

        if (!contactData.first_name || !contactData.last_name) {
            alert("First Name and Last Name are required.");
            return;
        }

        let error;
        if (state.currentContact && state.currentContact.id) {
            const { error: updateError } = await supabase
                .from("contacts")
                .update(contactData)
                .eq("id", state.currentContact.id);
            error = updateError;
        } else {
            const { error: insertError } = await supabase
                .from("contacts")
                .insert(contactData);
            error = insertError;
        }

        if (error) {
            console.error("Error saving contact:", error);
            alert("Error saving contact: " + error.message);
        } else {
            alert("Contact saved successfully!");
            await loadAllData();
            if (state.currentContact) {
                const updatedContact = state.contacts.find(c => c.id === state.currentContact.id);
                if (updatedContact) {
                    state.currentContact = updatedContact;
                    renderContactDetails(updatedContact.id);
                }
            }
        }
    }

    async function deleteContact() {
        if (!state.currentContact || !state.currentContact.id) return;

        showModal(
            "Confirm Deletion",
            `Are you sure you want to delete ${state.currentContact.first_name} ${state.currentContact.last_name}? This action cannot be undone.`,
            async () => {
                const { error } = await supabase
                    .from("contacts")
                    .delete()
                    .eq("id", state.currentContact.id);

                if (error) {
                    alert("Error deleting contact: " + error.message);
                } else {
                    alert("Contact deleted successfully.");
                    await loadAllData();
                    hideModal();
                }
            }
        );
    }

    async function logActivity() {
        if (!state.currentContact) { alert("Please select a contact first."); return; }
        showModal(
            "Log Activity",
            `<label>Type:</label><input type="text" id="activity-type" required placeholder="e.g., Call, Email, Meeting">
             <label>Description:</label><textarea id="activity-description" required></textarea>
             <label>Date:</label><input type="datetime-local" id="activity-date" value="${new Date().toISOString().slice(0, 16)}" required>`,
            async () => {
                const type = document.getElementById("activity-type").value.trim();
                const description = document.getElementById("activity-description").value.trim();
                const date = document.getElementById("activity-date").value;
                if (!type || !description || !date) { alert("All fields are required."); return; }

                const { error } = await supabase.from("activities").insert({
                    contact_id: state.currentContact.id,
                    account_id: state.currentContact.account_id,
                    type,
                    description,
                    date: new Date(date).toISOString(),
                    user_id: state.currentUser.id,
                });

                if (error) { alert("Error logging activity: " + error.message); }
                else { await loadAllData(); hideModal(); }
            }
        );
    }

    async function assignSequence() {
        if (!state.currentContact) { alert("Please select a contact first."); return; }

        const sequencesOptions = state.sequences.map(seq => `<option value="${seq.id}">${seq.name}</option>`).join('');

        showModal(
            "Assign Sequence",
            `<label>Select Sequence:</label><select id="assign-sequence-select">${sequencesOptions}</select>`,
            async () => {
                const sequenceId = document.getElementById("assign-sequence-select").value;
                if (!sequenceId) { alert("Please select a sequence."); return; }

                const existingContactSequence = state.contact_sequences.find(cs => cs.contact_id === state.currentContact.id && cs.status === 'Active');
                if (existingContactSequence) {
                    alert(`This contact is already active in sequence: ${state.sequences.find(s => s.id === existingContactSequence.sequence_id)?.name || 'Unknown'}. Please remove them first.`);
                    return;
                }

                const firstStep = state.sequence_steps
                    .filter(step => step.sequence_id == sequenceId)
                    .sort((a, b) => a.step_number - b.step_number)[0];

                if (!firstStep) { alert("Selected sequence has no steps."); return; }

                const { error } = await supabase.from("contact_sequences").insert({
                    contact_id: state.currentContact.id,
                    sequence_id: Number(sequenceId),
                    current_step_number: firstStep.step_number,
                    status: "Active",
                    next_step_due_date: new Date().toISOString(),
                    user_id: state.currentUser.id,
                });

                if (error) { alert("Error assigning sequence: " + error.message); }
                else { alert("Sequence assigned successfully!"); await loadAllData(); hideModal(); }
            }
        );
    }

    async function removeContactFromSequence() {
        if (!state.currentContact) { alert("No contact selected."); return; }
        const activeSequence = state.contact_sequences.find(cs => cs.contact_id === state.currentContact.id && cs.status === 'Active');

        if (!activeSequence) { alert("Contact is not in an active sequence."); return; }

        showModal(
            "Confirm Removal",
            `Are you sure you want to remove this contact from the current sequence?`,
            async () => {
                const { error } = await supabase.from('contact_sequences')
                    .update({ status: 'Removed' })
                    .eq('id', activeSequence.id);

                if (error) { alert("Error removing from sequence: " + error.message); }
                else { alert("Contact removed from sequence."); await loadAllData(); hideModal(); }
            }
        );
    }

    async function addTaskForContact() {
        if (!state.currentContact) { alert("Please select a contact first."); return; }

        showModal('Add New Task', `
            <label>Description:</label><input type="text" id="modal-task-description" required>
            <label>Due Date:</label><input type="date" id="modal-task-due-date">
        `, async () => {
            const description = document.getElementById('modal-task-description').value.trim();
            const dueDate = document.getElementById('modal-task-due-date').value;
            if (!description) { alert('Description is required.'); return; }

            const taskData = {
                description,
                due_date: dueDate || null,
                contact_id: state.currentContact.id,
                account_id: state.currentContact.account_id,
                user_id: state.currentUser.id,
                status: 'Pending'
            };

            const { error } = await supabase.from('tasks').insert(taskData);
            if (error) { alert('Error adding task: ' + error.message); }
            else { alert('Task added successfully!'); await loadAllData(); hideModal(); }
        });
    }

    async function handleBulkImport() {
        contactCsvInput.click();
    }

    async function processCsvFile(event) {
        const file = event.target.files[0];
        if (!file) {
            alert('No file selected.');
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target.result;
            const lines = text.split('\n').filter(line => line.trim() !== '');

            if (lines.length === 0) {
                alert('CSV file is empty or malformed.');
                return;
            }

            const headers = parseCsvRow(lines[0]);
            const contactsToInsert = [];

            const headerMap = {
                'first_name': 'first_name', 'First Name': 'first_name',
                'last_name': 'last_name', 'Last Name': 'last_name',
                'email': 'email', 'Email': 'email',
                'phone': 'phone', 'Phone': 'phone',
                'title': 'title', 'Title': 'title',
                'account_name': 'account_name', 'Account Name': 'account_name',
                'notes': 'notes', 'Notes': 'notes'
            };

            for (let i = 1; i < lines.length; i++) {
                const values = parseCsvRow(lines[i]);
                if (values.length !== headers.length) {
                    console.warn(`Skipping malformed row ${i + 1}: ${lines[i]}`);
                    continue;
                }

                const contact = { user_id: state.currentUser.id };
                let isValid = true;

                headers.forEach((header, index) => {
                    const mappedHeader = headerMap[header.trim()];
                    if (mappedHeader) {
                        if (mappedHeader === 'account_name') {
                            const accountName = values[index].trim();
                            if (accountName) {
                                const existingAccount = state.accounts.find(a => a.name.toLowerCase() === accountName.toLowerCase());
                                if (existingAccount) {
                                    contact.account_id = existingAccount.id;
                                } else {
                                    console.warn(`Account "${accountName}" not found for contact on row ${i + 1}. Contact will be created without account.`);
                                    contact.account_id = null;
                                }
                            } else {
                                contact.account_id = null;
                            }
                        } else {
                            contact[mappedHeader] = values[index].trim();
                        }
                    }
                });

                if (!contact.first_name || !contact.last_name) {
                    console.warn(`Skipping row ${i + 1} due to missing first_name or last_name.`);
                    isValid = false;
                }

                if (isValid) {
                    contactsToInsert.push(contact);
                }
            }

            if (contactsToInsert.length === 0) {
                alert('No valid contacts found to import.');
                return;
            }

            showModal('Import Contacts', `Attempting to import ${contactsToInsert.length} contacts. Continue?`, async () => {
                const { error } = await supabase.from('contacts').insert(contactsToInsert);
                if (error) {
                    alert('Error importing contacts: ' + error.message);
                } else {
                    alert(`${contactsToInsert.length} contacts imported successfully!`);
                    await loadAllData();
                    hideModal();
                }
            });
        };
        reader.readAsText(file);
    }


    // --- Event Listener Setup ---
    function setupPageEventListeners() {
        setupModalListeners();
        themeToggleBtn.addEventListener("click", cycleTheme);
        logoutBtn.addEventListener("click", async () => {
            await supabase.auth.signOut();
            window.location.href = "index.html";
        });
        if (contactForm) {
            contactForm.addEventListener("submit", saveContact);
        }
        if (deleteContactBtn) {
            deleteContactBtn.addEventListener("click", deleteContact);
        }
        if (addContactBtn) {
            addContactBtn.addEventListener("click", () => {
                state.currentContact = null;
                contactForm.reset();
                contactIdInput.value = "";
                contactLastSavedSpan.textContent = "Not yet saved.";
                document.getElementById("contact-details").classList.remove("hidden");
                contactFirstNameInput.focus();
                // When adding a new contact, explicitly clear ring chart/status related elements
                if (sequenceStatusContent) sequenceStatusContent.classList.add('hidden');
                if (noSequenceText) noSequenceText.classList.remove('hidden');
                if (contactActivitiesList) contactActivitiesList.innerHTML = "";
            });
        }
        if (contactSearchInput) {
            contactSearchInput.addEventListener("input", () => debounce(renderContactList, 300));
        }
        document.querySelectorAll("#contact-list th.sortable").forEach(th => {
            th.addEventListener("click", (e) => {
                const sortKey = e.target.closest("th").dataset.sort;
                if (state.contactsSortBy === sortKey) {
                    state.contactsSortDir = state.contactsSortDir === "asc" ? "desc" : "asc";
                } else {
                    state.contactsSortBy = sortKey;
                    state.contactsSortDir = "asc";
                }
                renderContactList();
            });
        });
        if (logActivityBtn) {
            logActivityBtn.addEventListener('click', logActivity);
        }
        if (assignSequenceBtn) {
            assignSequenceBtn.addEventListener('click', assignSequence);
        }
        if (removeContactFromSequenceBtn) {
            removeContactFromSequenceBtn.addEventListener('click', removeContactFromSequence);
        }
        if (addContactTaskBtn) {
            addContactTaskBtn.addEventListener('click', addTaskForContact);
        }
        if (bulkImportContactsBtn) {
            bulkImportContactsBtn.addEventListener('click', handleBulkImport);
        }
        if (contactCsvInput) {
            contactCsvInput.addEventListener('change', processCsvFile);
        }
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

                const urlParams = new URLSearchParams(window.location.search);
                const contactIdFromUrl = urlParams.get('contactId');
                if (contactIdFromUrl) {
                    const contact = state.contacts.find(c => c.id === Number(contactIdFromUrl));
                    if (contact) {
                        renderContactDetails(Number(contactIdFromUrl));
                    }
                }
            } else {
                window.location.href = "index.html";
            }
        });
    }

    initializePage();
});
