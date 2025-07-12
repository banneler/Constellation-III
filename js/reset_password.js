// js/reset_password.js
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './shared_constants.js';

document.addEventListener('DOMContentLoaded', async () => {
    console.log("reset_password.js script started parsing.");
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // --- DOM Element Selectors ---
    const resetTitle = document.getElementById('reset-title');
    const resetError = document.getElementById('reset-error');
    const resetPasswordForm = document.getElementById('reset-password-form');
    const newPasswordInput = document.getElementById('new-password');
    const confirmPasswordInput = document.getElementById('confirm-password');
    const setPasswordBtn = document.getElementById('set-password-btn');

    console.log("Reset page elements:", { resetTitle, resetError, resetPasswordForm, newPasswordInput, confirmPasswordInput, setPasswordBtn });

    // --- Initial Check and Auth State Handling ---
    // Supabase will automatically process the URL hash (#access_token=...) when this page loads.
    // We listen to auth state changes to know if a session has been established from the token.
    supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('Auth event on reset_password.js:', event);
        if (event === 'SIGNED_IN' && session) {
            // User is signed in because the reset token was successfully exchanged for a session.
            // Now, they can set the new password.
            console.log("User session detected, ready to set new password.");
            resetTitle.textContent = "Set New Password";
            // The form is already visible, just ensure feedback area is clear
            resetError.textContent = '';
        } else if (event === 'SIGNED_OUT') {
            // This might happen if the token is invalid or expired.
            console.warn("User signed out or no session detected on reset password page.");
            resetTitle.textContent = "Invalid or Expired Link";
            resetError.textContent = "Your password reset link is invalid or has expired. Please request a new one.";
            resetPasswordForm.classList.add('hidden'); // Hide the form if link is bad
        }
    });

    // --- Handle New Password Form Submission ---
    if (resetPasswordForm) {
        resetPasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            resetError.textContent = ''; // Clear previous errors

            const newPassword = newPasswordInput.value;
            const confirmPassword = confirmPasswordInput.value;

            if (newPassword.length < 6) {
                resetError.textContent = "Password must be at least 6 characters long.";
                return;
            }
            if (newPassword !== confirmPassword) {
                resetError.textContent = "Passwords do not match.";
                return;
            }

            setPasswordBtn.disabled = true;
            setPasswordBtn.textContent = 'Setting...';

            // Update the user's password in Supabase
            const { error } = await supabase.auth.updateUser({ password: newPassword });

            if (error) {
                console.error("Error updating password:", error.message);
                resetError.textContent = `Error setting password: ${error.message}`;
            } else {
                console.log("Password updated successfully.");
                alert("Your password has been successfully reset! You can now log in with your new password.");
                window.location.href = 'index.html'; // Redirect to login page
            }

            setPasswordBtn.disabled = false;
            setPasswordBtn.textContent = 'Set Password';
        });
    } else {
        console.error("Reset password form not found!");
    }

    // Optional: Immediately check session on load to handle direct access with token
    // (onAuthStateChange should catch this, but this can provide faster initial state)
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        // If no session on initial load, it means the token hasn't been exchanged yet
        // or the link is bad. The onAuthStateChange will eventually resolve this.
        console.log("No initial session on reset password page. Waiting for auth state change.");
    }
});
