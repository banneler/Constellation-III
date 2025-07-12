// auth.js
console.log("auth.js script started parsing.");
import { SUPABASE_URL, SUPABASE_ANON_KEY, showModal, hideModal, setupModalListeners } from './shared_constants.js';

document.addEventListener("DOMContentLoaded", () => {
    console.log("DOMContentLoaded fired for auth.js.");

    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // --- DOM Element Selectors (Auth specific) ---
    const authContainer = document.getElementById("auth-container");
    const authForm = document.getElementById("auth-form");
    const authTitle = document.getElementById("auth-title"); // Removed from HTML, but still referenced, could be removed here too
    const authError = document.getElementById("auth-error");
    const authEmailInput = document.getElementById("auth-email");
    const authPasswordInput = document.getElementById("auth-password");
    const authSubmitBtn = document.getElementById("auth-submit-btn");
    const authToggleLink = document.getElementById("auth-toggle-link");
    const forgotPasswordLink = document.getElementById("forgot-password-link"); // NEW: Forgot Password link

    // Debugging console logs for element selection
    console.log("Auth Container:", authContainer);
    console.log("Auth Form:", authForm);
    console.log("Auth Email Input:", authEmailInput);
    console.log("Auth Password Input:", authPasswordInput);
    console.log("Auth Submit Button:", authSubmitBtn);
    console.log("Auth Toggle Link:", authToggleLink);
    console.log("Forgot Password Link:", forgotPasswordLink); // Debugging log for new element

    let isLoginMode = true;

    // Call setupModalListeners from shared_constants to ensure modal buttons work
    setupModalListeners();

    // --- Event Listener Setup (Auth specific) ---
    authToggleLink.addEventListener("click", (e) => {
        e.preventDefault();
        console.log("Toggle link clicked.");
        isLoginMode = !isLoginMode;
        // authTitle.textContent = isLoginMode ? "Login" : "Sign Up"; // Title is removed from HTML
        authSubmitBtn.textContent = isLoginMode ? "Login" : "Sign Up";
        authToggleLink.textContent = isLoginMode ?
            "Need an account? Sign Up" :
            "Have an account? Login";
        authError.textContent = "";

        // Hide/show forgot password link based on login mode
        if (forgotPasswordLink) {
            if (isLoginMode) {
                forgotPasswordLink.classList.remove('hidden');
            } else {
                forgotPasswordLink.classList.add('hidden');
            }
        }
    });

    // Handle Auth Form Submission (Login/Sign Up)
    console.log("Attaching form submit listener to:", authForm);
    authForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        console.log("Auth form submitted!");
        const email = authEmailInput.value;
        const password = authPasswordInput.value;
        authError.textContent = "";

        console.log("Attempting auth with email:", email);

        let error;
        if (isLoginMode) {
            const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
            error = signInError;
        } else {
            const { error: signUpError } = await supabase.auth.signUp({ email, password });
            error = signUpError;
        }

        if (error) {
            console.error("Supabase Auth Error:", error.message);
            authError.textContent = error.message;
        } else if (!isLoginMode) {
            console.log("Sign up successful. Check email for confirmation.");
            authError.textContent = "Check your email for a confirmation link!";
        } else {
            console.log("Login successful. Redirecting to command-center.html.");
            authForm.reset();
            window.location.href = "command-center.html"; // Corrected redirect to command-center.html
        }
    });

    // NEW: Forgot Password Link Listener
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', (e) => {
            e.preventDefault();
            console.log("Forgot Password link clicked.");
            showModal(
                'Reset Password',
                `<p>Enter your email address to receive a password reset link.</p>
                 <input type="email" id="reset-email-input" placeholder="Your Email" required autofocus>`,
                async () => {
                    const email = document.getElementById('reset-email-input').value.trim();
                    if (!email) {
                        alert('Please enter your email address.');
                        return;
                    }

                    authSubmitBtn.disabled = true; // Disable button to prevent multiple clicks
                    authSubmitBtn.textContent = 'Sending...';

                    // Send password reset email
                    const { error } = await supabase.auth.resetPasswordForEmail(email, {
                        redirectTo: window.location.origin + '/reset-password.html' // IMPORTANT: Create this page
                    });

                    if (error) {
                        console.error("Password Reset Error:", error.message);
                        alert(`Error sending reset link: ${error.message}`);
                    } else {
                        alert('Password reset link sent! Check your email (and spam folder).');
                    }
                    hideModal();
                    authSubmitBtn.disabled = false; // Re-enable button
                    authSubmitBtn.textContent = isLoginMode ? "Login" : "Sign Up"; // Reset button text
                }
            );
        });
    }


    // --- App Initialization (Auth Page) ---
    supabase.auth.onAuthStateChange(async (event, session) => {
        console.log("Auth event fired on auth page:", event);
        if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session) {
            console.log("User is signed in or has an initial session. Redirecting.");
            window.location.href = "command-center.html"; // Corrected redirect to command-center.html
        }
    });
});
