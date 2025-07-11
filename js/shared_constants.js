// shared_constants.js
export const SUPABASE_URL = "https://pjxcciepfypzrfmlfchj.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqeGNjaWVwZnlwenJmbWxmY2hqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIxMTU4NDQsImV4cCI6MjA2NzY5MTg0NH0.m_jyE0e4QFevI-mGJHYlGmA12lXf8XoMDoiljUav79c";

export const MONTHLY_QUOTA = 5000;
export const themes = ['dark', 'light', 'green'];

export const formatDate = (ds) => (ds ? new Date(ds).toLocaleString() : "");
export const formatMonthYear = (ds) => {
  if (!ds) return "";
  const date = new Date(ds);
  const adjustedDate = new Date(
    date.getTime() + date.getTimezoneOffset() * 60000
  );
  return adjustedDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long"
  });
};
export const formatCurrencyK = (value) => {
  if (value === null || isNaN(value)) return "$0.0K";
  const valInK = value / 1000;
  return `$${valInK.toFixed(1)}K`;
};
export const formatCurrency = (value) => {
    if (value === null || isNaN(value)) return "$0";
    return `$${value.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
};

export const addDays = (d, days) => {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
};
export const parseCsvRow = (row) => {
  const r = [];
  let c = "";
  let i = false;
  for (let h = 0; h < row.length; h++) {
    const a = row[h];
    if (a === '"') {
      i = !i;
    } else if (a === "," && !i) {
      r.push(c.trim());
      c = "";
    } else {
      c += a;
    }
  }
  r.push(c.trim());
  return r;
};

// Modal functions
let onConfirmCallback = null;
export const showModal = (title, bodyHtml, onConfirm) => {
  const modalTitle = document.getElementById("modal-title");
  const modalBody = document.getElementById("modal-body");
  const modalBackdrop = document.getElementById("modal-backdrop");

  if (!modalTitle || !modalBody || !modalBackdrop) {
      console.error("Modal elements not found!");
      return;
  }
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHtml;
  onConfirmCallback = onConfirm;
  modalBackdrop.classList.remove("hidden");
};
export const hideModal = () => {
  const modalBackdrop = document.getElementById("modal-backdrop");
  if (modalBackdrop) modalBackdrop.classList.add("hidden");
  onConfirmCallback = null;
};
export const setupModalListeners = () => {
    const modalConfirmBtn = document.getElementById("modal-confirm-btn");
    const modalCancelBtn = document.getElementById("modal-cancel-btn");
    if (modalConfirmBtn) {
        modalConfirmBtn.addEventListener(
            "click",
            () => onConfirmCallback && onConfirmCallback()
        );
    }
    if (modalCancelBtn) {
        modalCancelBtn.addEventListener("click", hideModal);
    }
};

// NEW: Hamburger menu toggle setup
export const setupHamburgerMenuToggle = () => {
  const hamburgerBtn = document.getElementById('hamburger-btn');
  const crmContainer = document.querySelector('.crm-container');

  if (hamburgerBtn && crmContainer) {
    hamburgerBtn.addEventListener('click', () => {
      crmContainer.classList.toggle('sidebar-open');
      // Prevent body scrolling when sidebar overlay is open
      document.body.style.overflow = crmContainer.classList.contains('sidebar-open') ? 'hidden' : '';
    });

    // Optional: Close sidebar if a nav button is clicked (on mobile)
    const navButtons = crmContainer.querySelectorAll('.nav-sidebar .nav-button');
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Only close if sidebar is currently open (mobile view)
            if (crmContainer.classList.contains('sidebar-open')) {
                // Check if the screen is actually small (to avoid closing on desktop clicks)
                if (window.innerWidth <= 768) { // Use the same breakpoint as in CSS
                    crmContainer.classList.remove('sidebar-open');
                    document.body.style.overflow = ''; // Restore body scroll
                }
            }
        });
    });
  }
};
