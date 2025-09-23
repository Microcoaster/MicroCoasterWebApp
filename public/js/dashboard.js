/* =========================================================
 * MicroCoaster - Dashboard Page JavaScript
 * Fonctions spécifiques au tableau de bord
 * =======================================================*/

document.addEventListener('DOMContentLoaded', function() {
  initializeDashboard();
});

function addNewModule() {
  window.location.href = '/modules#add';
}

function initializeDashboard() {
  // Animation d'entrée des cartes
  const cards = document.querySelectorAll('.dashboard-card');
  cards.forEach((card, index) => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(20px)';
    
    setTimeout(() => {
      card.style.transition = 'all 0.5s ease';
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
    }, index * 100);
  });
  
  console.log('📊 Dashboard initialized');
}