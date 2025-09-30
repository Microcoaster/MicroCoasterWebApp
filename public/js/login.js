/**
 * Page de connexion - Gestion interface et animations
 *
 * Gère l'interface de la page de connexion incluant la gestion du focus
 * des formulaires et les animations d'entrée pour une expérience utilisateur améliorée.
 *
 * @module login
 * @description Interface de connexion avec animations et gestion de formulaires
 */

document.addEventListener('DOMContentLoaded', function () {
  initializeLoginPage();
});

/**
 * Initialise la fonctionnalité de la page de connexion
 * Configure les gestionnaires d'événements et animations pour l'interface de login
 * @returns {void}
 */
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
