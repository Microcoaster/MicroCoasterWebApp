/* =========================================================
 * MicroCoaster - Login Page JavaScript
 * Fonctions spécifiques à la page de connexion
 * =======================================================*/

document.addEventListener('DOMContentLoaded', function() {
  initializeLoginPage();
});

function initializeLoginPage() {
  // Vérifier si on est sur la page de login
  const codeInput = document.querySelector('input[name="code"]');
  if (!codeInput) return;
  
  // Auto-focus sur le champ de saisie
  codeInput.focus();
  
  // Animation d'entrée pour la box de login
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
  
  console.log('🔐 Login page initialized');
}