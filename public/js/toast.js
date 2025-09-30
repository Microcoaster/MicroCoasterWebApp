/**
 * ================================================================================
 * MICROCOASTER WEBAPP - SYSTÈME DE TOASTS CENTRALISÉ + ÉVÉNEMENTS
 * ================================================================================
 * Gestion unifiée des notifications toast et événements temps réel
 * Auteur: MicroCoaster Team
 * Version: 2.1 - Style global + Events intégrés
 * ================================================================================
 */

(function(window) {
    'use strict';

    // Configuration par défaut
    const TOAST_CONFIG = {
        position: 'top-right',
        defaultDuration: 2400,
        maxToasts: 5,
        animationDuration: 180
    };

    // Container des toasts
    let toastContainer = null;

    /**
     * Initialise le container des toasts avec le style original
     */
    function initToastContainer() {
        if (toastContainer) return toastContainer;

        // Vérifier que le DOM est prêt
        if (!document.body) {
            return null;
        }

        toastContainer = document.createElement('div');
        toastContainer.id = 'toasts';
        toastContainer.className = 'toasts';
        document.body.appendChild(toastContainer);
        return toastContainer;
    }

    /**
     * Crée les styles CSS compatibles avec le style global du site
     */
    function createToastStyles() {
        const styleId = 'toast-styles';
        if (document.getElementById(styleId)) return;

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            /* Toast styles compatibles avec le style global du site */
            .toasts {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 9999;
                pointer-events: none;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .toast {
                background: var(--panel);
                color: var(--text);
                padding: 12px 16px;
                border-radius: 8px;
                box-shadow: var(--shadow);
                pointer-events: auto;
                min-width: 300px;
                max-width: 420px;
                word-wrap: break-word;
                display: flex;
                align-items: center;
                gap: 12px;
                transform: translateX(100%);
                animation: toast-slide-in 0.3s ease forwards;
            }

            .toast.hide {
                animation: toast-slide-out 0.18s ease forwards;
            }

            .toast-icon {
                width: 20px;
                height: 20px;
                flex-shrink: 0;
            }

            .toast-message {
                flex: 1;
                font-size: 14px;
                line-height: 1.4;
            }

            .toast-close {
                background: none;
                border: none;
                color: inherit;
                cursor: pointer;
                padding: 4px;
                border-radius: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                width: 24px;
                height: 24px;
                flex-shrink: 0;
                opacity: 0.7;
                transition: opacity 0.2s ease;
            }

            .toast-close:hover {
                opacity: 1;
                background: rgba(0, 0, 0, 0.1);
            }

            .toast-close svg {
                width: 16px;
                height: 16px;
            }

            .toast.success {
                border-left: 4px solid #10b981;
            }

            .toast.success .toast-icon {
                color: #10b981;
            }

            .toast.error {
                border-left: 4px solid #ef4444;
            }

            .toast.error .toast-icon {
                color: #ef4444;
            }

            .toast.info {
                border-left: 4px solid #3b82f6;
            }

            .toast.info .toast-icon {
                color: #3b82f6;
            }

            .toast.warning {
                border-left: 4px solid #f59e0b;
            }

            .toast.warning .toast-icon {
                color: #f59e0b;
            }

            @keyframes toast-slide-in {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }

            @keyframes toast-slide-out {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(100%);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Génère l'icône SVG pour le type de toast (style original)
     */
    function getToastIcon(type) {
        switch (type) {
            case 'success':
                return `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                </svg>`;
            case 'error':
                return `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
                </svg>`;
            case 'info':
                return `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
                </svg>`;
            case 'warning':
                return `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                </svg>`;
            default:
                return `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
                </svg>`;
        }
    }

    /**
     * Affiche un toast avec le style original du site
     * @param {string} message - Message à afficher  
     * @param {string} type - Type de toast (success, error, warning, info)
     * @param {number} duration - Durée d'affichage en millisecondes
     */
    function showToast(message, type = 'success', duration = TOAST_CONFIG.defaultDuration) {
        // Validation des paramètres
        if (!message || typeof message !== 'string') {
            return null;
        }

        // Initialisation si nécessaire
        const wrap = initToastContainer();
        if (!wrap) {
            // Queue le toast pour plus tard si le DOM n'est pas prêt
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    showToast(message, type, duration);
                }, { once: true });
            }
            return null;
        }

        createToastStyles();

        // Création du toast avec le style original
        const el = document.createElement('div');
        el.className = 'toast ' + type;
        el.innerHTML = `
            ${getToastIcon(type)}
            <span class="toast-message">${message}</span>
            <button class="toast-close" aria-label="Close">
                <svg viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
                </svg>
            </button>
        `;
        
        wrap.appendChild(el);
        
        const close = () => {
            if (el.parentNode) {
                el.classList.add('hide');
                setTimeout(() => {
                    if (el.parentNode) {
                        el.remove();
                    }
                }, TOAST_CONFIG.animationDuration);
            }
        };
        
        const closeButton = el.querySelector('.toast-close');
        if (closeButton) {
            closeButton.addEventListener('click', close);
        }
        
        if (duration > 0) {
            setTimeout(close, duration);
        }
        
        return el;
    }

    /**
     * Supprime tous les toasts
     */
    function clearAllToasts() {
        if (!toastContainer) return;
        const toasts = toastContainer.querySelectorAll('.toast');
        toasts.forEach(toast => {
            toast.classList.add('hide');
            setTimeout(() => toast.remove(), TOAST_CONFIG.animationDuration);
        });
    }

    /**
     * Méthodes de raccourci pour chaque type
     */
    const toastAPI = {
        show: showToast,
        success: (message, duration) => showToast(message, 'success', duration),
        error: (message, duration) => showToast(message, 'error', duration),
        warning: (message, duration) => showToast(message, 'warning', duration),
        info: (message, duration) => showToast(message, 'info', duration),
        clear: clearAllToasts
    };

    // Export vers window pour compatibilité globale
    window.showToast = showToast;
    window.Toast = toastAPI;

    // ================================================================================
    // ÉVÉNEMENTS TEMPS RÉEL INTÉGRÉS
    // ================================================================================
    
    /**
     * Initialise les événements WebSocket avec gestion des toasts
     */
    function initToastEvents() {
        if (!window.socket) return;

        const socket = window.socket;
        
        // Éviter les doublons d'événements
        if (socket._toastEventsInitialized) {
            return;
        }
        socket._toastEventsInitialized = true;

        // Événements utilisateurs avec correction du nom
        socket.on('rt_user_logged_in', function (data) {
            // Le nom est dans data.user.name
            const userName = data.user?.name || data.name || data.username || 'Utilisateur';
            
            // Toast global pour toutes les pages
            showToast(`👤 ${userName} s'est connecté`, 'info', 4000);
            
            // Actions spécifiques à l'admin
            if (getCurrentPageName() === 'admin' && window.showRealTimeNotification) {
                window.showRealTimeNotification(`<span class="user-connected">👤 ${userName} <strong>s'est connecté</strong></span>`, 'success');
            }
        });

        socket.on('rt_user_logged_out', function (data) {
            // Le nom est dans data.user.name
            const userName = data.user?.name || data.name || data.username || 'Utilisateur';
            
            // Toast global pour toutes les pages
            showToast(`👤 ${userName} s'est déconnecté`, 'warning', 4000);
            
            // Actions spécifiques à l'admin
            if (getCurrentPageName() === 'admin' && window.showRealTimeNotification) {
                window.showRealTimeNotification(`<span class="user-disconnected">👤 ${userName} <strong>s'est déconnecté</strong></span>`, 'warning');
            }
        });

        // Événements modules (globaux sur toutes les pages)
        socket.on('rt_module_online', function (data) {
            // Notification globale de connexion
            showToast(`🟢 Module ${data.moduleId} connecté`, 'success', 3000);
            
            // Mise à jour interface admin si on est sur cette page
            if (getCurrentPageName() === 'admin' && window.updateModuleStatus) {
                window.updateModuleStatus(data.moduleId, true);
                if (data.lastSeen && window.updateModuleLastSeen) {
                    window.updateModuleLastSeen(data.moduleId, data.lastSeen, data.lastSeenFormatted);
                }
            }
        });

        socket.on('rt_module_offline', function (data) {
            // Notification globale de déconnexion
            showToast(`🔴 Module ${data.moduleId} déconnecté`, 'error', 4000);
            
            // Mise à jour interface admin si on est sur cette page
            if (getCurrentPageName() === 'admin' && window.updateModuleStatus) {
                window.updateModuleStatus(data.moduleId, false);
                if (data.lastSeen && window.updateModuleLastSeen) {
                    window.updateModuleLastSeen(data.moduleId, data.lastSeen, data.lastSeenFormatted);
                }
            }
        });

        // Événements de gestion des modules (admin uniquement mais avec toasts globaux)
        socket.on('rt_module_added', function (data) {
            showToast(`➕ Nouveau module ajouté: ${data.moduleId}`, 'success', 5000);
            
            if (getCurrentPageName() === 'admin' && window.loadModulesTable) {
                window.loadModulesTable();
            }
        });

        socket.on('rt_module_removed', function (data) {
            showToast(`🗑️ Module supprimé: ${data.moduleId}`, 'warning', 5000);
            
            if (getCurrentPageName() === 'admin' && window.loadModulesTable) {
                window.loadModulesTable();
            }
        });

        socket.on('rt_module_updated', function (data) {
            showToast(`🔧 Module mis à jour: ${data.moduleId}`, 'info', 4000);
            
            if (getCurrentPageName() === 'admin' && window.loadModulesTable) {
                window.loadModulesTable();
            }
        });

        socket.on('rt_user_profile_updated', function (data) {
            const userName = data.user?.name || data.name || data.username || 'Utilisateur';
            showToast(`👤 Profil mis à jour: ${userName}`, 'info', 3000);
        });

        // Événements télémétrie et dernière activité
        socket.on('rt_telemetry_updated', function (data) {
            if (getCurrentPageName() === 'admin' && data.lastSeen && window.updateModuleLastSeen) {
                window.updateModuleLastSeen(data.moduleId, data.lastSeen, data.lastSeenFormatted);
            }
        });

        socket.on('rt_module_last_seen_updated', function (data) {
            if (getCurrentPageName() === 'admin' && window.updateModuleLastSeen) {
                window.updateModuleLastSeen(data.moduleId, data.lastSeen, data.lastSeenFormatted);
            }
        });

        // Événements directs (de esp-server.js)
        socket.on('module_online', function (data) {
            showToast(`🟢 Module ${data.moduleId} connecté`, 'success', 3000);
            
            if (getCurrentPageName() === 'admin' && window.updateModuleStatus) {
                window.updateModuleStatus(data.moduleId, true);
                window.socket.emit('request_stats');
            }
        });

        socket.on('module_offline', function (data) {
            showToast(`🔴 Module ${data.moduleId} déconnecté`, 'error', 4000);
            
            if (getCurrentPageName() === 'admin' && window.updateModuleStatus) {
                window.updateModuleStatus(data.moduleId, false);
                window.socket.emit('request_stats');
            }
        });
    }

    /**
     * Fonction helper pour obtenir le nom de la page courante
     */
    function getCurrentPageName() {
        const path = window.location.pathname;
        if (path.includes('/admin')) return 'admin';
        if (path.includes('/dashboard')) return 'dashboard';
        if (path.includes('/modules')) return 'modules';
        if (path.includes('/timelines')) return 'timelines';
        return 'unknown';
    }

    // Éviter la double initialisation globale
    if (window._toastSystemInitialized) return;
    window._toastSystemInitialized = true;

    // Auto-initialisation quand le DOM est prêt
    function initializeToastSystem() {
        initToastContainer();
        createToastStyles();
        
        // Attendre que le socket soit disponible sans polling agressif
        function waitForSocket() {
            if (window.socket && window.socket.connected) {
                initToastEvents();
            } else {
                // Attendre 500ms avant de réessayer (moins agressif)
                setTimeout(waitForSocket, 500);
            }
        }
        
        // Démarrer l'attente du socket après un délai pour éviter les conflits
        setTimeout(waitForSocket, 1000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeToastSystem);
    } else {
        // DOM déjà prêt, initialiser immédiatement
        initializeToastSystem();
    }

})(window);