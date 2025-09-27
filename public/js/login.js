/**
 * ================================================================================
 * MICROCOASTER WEBAPP - LOGIN PAGE
 * ================================================================================
 *
 * Purpose: Login page functionality and animations
 * Author: MicroCoaster Development Team
 * Created: 2024
 *
 * Description:
 * Manages the login page interface including form focus management and
 * entrance animations for enhanced user experience.
 *
 * Dependencies:
 * - None (standalone login functionality)
 *
 * ================================================================================
 */

// ================================================================================
// LOGIN PAGE INITIALIZATION
// ================================================================================

document.addEventListener('DOMContentLoaded', function () {
  initializeLoginPage();
});

function initializeLoginPage() {
  const codeInput = document.querySelector('input[name="code"]');
  if (!codeInput) return;

  codeInput.focus();

  const box = document.querySelector('.box');
  if (box) {
    box.style.opacity = '0';
    box.style.transform = 'translateY(20px)';

    setTimeout(() => {
      box.style.transition = 'all 0.5s ease';
      box.style.opacity = '1';
      box.style.transform = 'translateY(0)';
    }, 100);
  }
}
