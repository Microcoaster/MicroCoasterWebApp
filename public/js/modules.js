/**
 * Interface de contrôle des modules - Contrôles interactifs temps réel
 *
 * Gère l'interface de contrôle des modules incluant les contrôleurs de station,
 * de monte-charge, de blocs et cartes de modules interactives avec communication WebSocket.
 *
 * @module modules
 * @description Interface de contrôle des modules IoT avec mises à jour temps réel
 */

window.ws_sendCommand = window.ws_sendCommand || function () {};

const controllersByMid = new Map();

/**
 * Crée un contrôleur d'aiguillage interactif
 * Génère l'interface de contrôle pour un module de type aiguillage avec indicateurs de position
 * @param {HTMLElement} root - Élément DOM racine du panneau d'aiguillage
 * @returns {Object} Objet contrôleur avec méthodes de gestion d'aiguillage
 */
function makeSwitchController(root) {
  const transfer = root.querySelector('[data-role="swt_transfer"]');
  const ledL = root.querySelector('[data-role="swt_left"]');
  const ledR = root.querySelector('[data-role="swt_right"]');
  let left = true,
    lock = false;

  /**
   * Met à jour l'état visuel d'une LED
   * @param {HTMLElement} img - Élément image de la LED
   * @param {boolean} on - État de la LED (allumée/éteinte)
   * @returns {void}
   * @private
   */
  const setLED = (img, on) => {
    if (img) img.src = on ? urlImg('led_on.png') : urlImg('led_off.png');
  };

  /**
   * Met à jour la position visuelle du commutateur d'aiguillage
   * @param {boolean} isB - Position du commutateur (true=position B, false=position A)
   * @returns {void}
   * @private
   */
  const setSW = isB => {
    if (transfer) transfer.src = isB ? urlImg('switch_1.png') : urlImg('switch_0.png');
  };

  /**
   * Met à jour l'affichage complet de l'aiguillage
   * Synchronise les LEDs et la position du commutateur
   * @returns {void}
   * @private
   */
  const update = () => {
    const isOffline = root.classList.contains('offline');
    setLED(ledL, left && !isOffline);
    setLED(ledR, !left && !isOffline);
    setSW(!left);
  };

  transfer?.addEventListener('click', () => {
    if (lock) return;
    left = !left;
    update();
    window.ws_sendCommand(root, left ? 'left' : 'right', {}, transfer);
    lock = true;
    setTimeout(() => (lock = false), 3000);
  });

  /**
   * Callback exécuté lorsque l'aiguillage passe en ligne
   * @returns {void}
   * @private
   */
  function onPresenceOnline() {
    update();
  }

  /**
   * Callback exécuté lorsque l'aiguillage passe hors ligne
   * @returns {void}
   * @private
   */
  function onPresenceOffline() {
    setLED(ledL, false);
    setLED(ledR, false);
  }

  /**
   * Met à jour l'état de l'aiguillage avec les données de télémétrie
   * @param {Object} payload - Données reçues (position)
   * @returns {void}
   * @private
   */
  function updateTelemetry(payload) {
    if (payload.position) {
      left = String(payload.position).toLowerCase() === 'left';
      update();
    }
  }

  update();
  return { onPresenceOnline, onPresenceOffline, updateTelemetry, destroy() {} };
}

/**
 * Crée un contrôleur de lecteur audio interactif
 * Gère la lecture de pistes audio WAV depuis la carte SD de l'ESP32 avec contrôles complets
 * @param {HTMLElement} panel - Élément DOM du panneau du contrôleur audio
 * @returns {Object} Objet contrôleur avec méthodes de gestion de playlist et état
 */
function makeAudioController(panel) {
  const list = panel.querySelector('[data-role="au_list"]');
  const playBtn = panel.querySelector('[data-role="au_play"]');
  const pauseBtn = panel.querySelector('[data-role="au_pause"]');
  const stopBtn = panel.querySelector('[data-role="au_stop"]');
  const volumeSlider = panel.querySelector('[data-role="au_volume"]');
  const volumeDisplay = panel.querySelector('[data-role="au_volume_display"]');
  const statusText = panel.querySelector('[data-role="au_status"] .status-text');
  const statusIndicator = panel.querySelector('[data-role="au_status"] .status-indicator');

  let tracks = [];
  let currentTrack = null;
  let isPlaying = false;
  let volume = 50;
  // uploadInProgress supprimé - fichiers directement sur SD

  /**
   * Met à jour l'affichage du statut de lecture
   * @param {string} status - Statut ('stopped', 'playing', 'paused', 'loading')
   * @param {string} [trackName] - Nom de la piste en cours
   * @returns {void}
   * @private
   */
  const updateStatus = (status, trackName = '') => {
    if (!statusText || !statusIndicator) return;

    let statusLabel = '';
    let indicatorClass = '';

    switch (status) {
      case 'playing':
        statusLabel = trackName ? `Playing: ${trackName}` : 'Playing';
        indicatorClass = 'playing';
        isPlaying = true;
        break;
      case 'paused':
        statusLabel = trackName ? `Paused: ${trackName}` : 'Paused';
        indicatorClass = 'paused';
        isPlaying = false;
        break;
      case 'stopped':
        statusLabel = 'Stopped';
        indicatorClass = 'stopped';
        isPlaying = false;
        currentTrack = null;
        break;
      case 'loading':
        statusLabel = 'Loading...';
        indicatorClass = 'loading';
        break;
      default:
        statusLabel = 'Unknown';
        indicatorClass = 'stopped';
    }

    statusText.textContent = statusLabel;
    statusIndicator.className = `status-indicator ${indicatorClass}`;
  };

  /**
   * Met à jour l'affichage de la liste des pistes
   * @returns {void}
   * @private
   */
  const renderPlaylist = () => {
    if (!list) return;

    if (tracks.length === 0) {
      list.innerHTML = '<div class="playlist-empty">No audio files</div>';
      return;
    }

    list.innerHTML = '';
    tracks.forEach((track, index) => {
      const trackElement = document.createElement('div');
      trackElement.className = `track clickable${currentTrack === track.file ? ' active' : ''}`;
      trackElement.innerHTML = `<span>${track.title || track.file}</span><small>${track.file}</small>`;
      trackElement.addEventListener('click', () => {
        if (panel.classList.contains('offline')) return; // uploadInProgress supprimé
        playTrack(track.file);
      });
      list.appendChild(trackElement);
    });
  };

  /**
   * Met à jour l'affichage du volume
   * @returns {void}
   * @private
   */
  const updateVolumeDisplay = () => {
    if (volumeDisplay) {
      volumeDisplay.textContent = `${volume}%`;
    }
  };

  /**
   * Joue une piste audio spécifique
   * @param {string} trackFile - Nom du fichier à jouer
   * @returns {void}
   * @private
   */
  const playTrack = (trackFile) => {
    currentTrack = trackFile;
    renderPlaylist();
    updateStatus('loading', trackFile);
    window.ws_sendCommand(panel, 'audio_play', { filename: trackFile, delay: 0 });
  };

  // Événements des boutons de contrôle
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      if (panel.classList.contains('offline')) return; // uploadInProgress supprimé
      if (currentTrack) {
        window.ws_sendCommand(panel, 'audio_play', { filename: currentTrack, delay: 0 });
      } else if (tracks.length > 0) {
        playTrack(tracks[0].file);
      }
    });
  }

  if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
      if (panel.classList.contains('offline')) return; // uploadInProgress supprimé
      window.ws_sendCommand(panel, 'audio_pause', {});
    });
  }

  if (stopBtn) {
    stopBtn.addEventListener('click', () => {
      if (panel.classList.contains('offline')) return; // uploadInProgress supprimé
      window.ws_sendCommand(panel, 'audio_stop', {});
    });
  }

  // Contrôle du volume
  if (volumeSlider) {
    let volumeTimeout;
    volumeSlider.addEventListener('input', (e) => {
      volume = parseInt(e.target.value);
      updateVolumeDisplay();
      // Debounce: attendre 100ms avant d'envoyer la commande
      clearTimeout(volumeTimeout);
      volumeTimeout = setTimeout(() => {
        if (!panel.classList.contains('offline')) {
          window.ws_sendCommand(panel, 'audio_volume', { level: volume });
        }
      }, 100);
    });
  }

  /**
   * Callback exécuté lorsque le module audio passe en ligne
   * @returns {void}
   * @private
   */
  function onPresenceOnline() {
    // Demander la liste des fichiers disponibles
    window.ws_sendCommand(panel, 'audio_list_request', {});
    // Mettre à jour le volume
    window.ws_sendCommand(panel, 'audio_volume', { level: volume });
  }

  /**
   * Callback exécuté lorsque le module audio passe hors ligne
   * @returns {void}
   * @private
   */
  function onPresenceOffline() {
    updateStatus('stopped');
  }

  /**
   * Met à jour l'état du lecteur audio avec les données de télémétrie
   * @param {Object} payload - Données reçues
   * @returns {void}
   * @private
   */
  function updateTelemetry(payload) {
    if (payload.audio_list) {
      tracks = payload.audio_list.map(file => ({
        file: file,
        title: file.replace('.wav', '').replace(/_/g, ' ')
      }));
      renderPlaylist();
    }

    if (payload.audio_status) {
      const status = payload.audio_status;
      let displayStatus = 'stopped';
      let trackName = '';

      if (status.playing) {
        displayStatus = 'playing';
        if (status.current_file) {
          trackName = status.current_file.replace('.wav', '').replace(/_/g, ' ');
          currentTrack = status.current_file;
        }
      } else if (status.paused) {
        displayStatus = 'paused';
        if (status.current_file) {
          trackName = status.current_file.replace('.wav', '').replace(/_/g, ' ');
        }
      }

      updateStatus(displayStatus, trackName);
      renderPlaylist();
    }

    if (payload.audio_volume !== undefined) {
      volume = payload.audio_volume;
      if (volumeSlider) {
        volumeSlider.value = volume;
      }
      updateVolumeDisplay();
    }
  }

  // Initialisation
  updateVolumeDisplay();
  updateStatus('stopped');
  renderPlaylist();

  return {
    onPresenceOnline,
    onPresenceOffline,
    updateTelemetry,
    destroy() {
      // Nettoyage si nécessaire
    },
  };
}

/**
 * Initialise les contrôleurs pour tous les panneaux de modules
 * Bootstrap automatique des interfaces selon le type de module détecté
 * @returns {void}
 */
(function bootstrapPanels() {
  const panels = document.querySelectorAll('.panel[data-mid]');
  panels.forEach(panel => {
    const type = panel.dataset.type || 'Unknown';
    const mid = (panel.dataset.mid || '').trim();
    if (!mid) return;

    let controller = null;
    switch (type) {
      case 'Switch Track':
        controller = makeSwitchController(panel);
        break;
      case 'Audio Player':
        controller = makeAudioController(panel);
        break;
      default:
        controller = {
          onPresenceOnline() {},
          onPresenceOffline() {},
          updateTelemetry() {},
          destroy() {},
        };
    }
    controllersByMid.set(mid, controller);
  });
})();

document.querySelectorAll('.midchip[role="button"]').forEach(chip => {
  chip.addEventListener('click', () => {
    const id = chip.querySelector('.mid')?.textContent?.trim();
    if (!id || id === '—') return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(id).then(() => {
        chip.classList.add('copied');
        setTimeout(() => chip.classList.remove('copied'), 900);
      });
    }
  });
});

document.getElementById('disableOnlineFilter')?.addEventListener('click', () => {
  const cb = document.getElementById('filterOnlineOnly');
  if (cb) {
    cb.checked = false;
    localStorage.setItem('mc:onlineOnly', '0');
    window.applyOnlineFilter?.();
  }
});

/**
 * Système de filtrage des modules
 * Gère les filtres par statut en ligne et recherche textuelle
 * @returns {void}
 */
(function () {
  const KEY_ONLINE = 'mc:onlineOnly';
  const KEY_QUERY = 'mc:moduleSearch';

  const cb = document.getElementById('filterOnlineOnly');
  const qInp = document.getElementById('moduleSearch');
  const empty = document.getElementById('emptyState');
  const clrBtn =
    document.querySelector('.searchbar .search-clear') || document.querySelector('.search-clear');

  /**
   * Applique les filtres de recherche et de statut aux modules
   * Gère le filtrage par statut en ligne et par recherche textuelle
   * @returns {void}
   * @private
   */
  function applyFilters() {
    const only = !!cb?.checked;
    const q = (qInp?.value || '').trim().toLowerCase();

    let visibleCount = 0;
    let totalModules = 0;

    document.querySelectorAll('.panel[data-mid], .mod[data-id]').forEach(panel => {
      totalModules++;
      let show = true;

      if (only) {
        show = panel.classList.contains('online');
      }

      if (show && q) {
        const title = panel.querySelector('.h1')?.textContent || '';
        const alias = panel.querySelector('.alias--type')?.textContent || '';
        const type = panel.dataset.type || '';
        const mid = panel.dataset.mid || '';
        const hay = `${title} ${alias} ${type} ${mid}`.toLowerCase();
        show = hay.includes(q);
      }

      const gridContainer = panel.closest('.col-12, .col-lg-6') || panel;

      const wasHidden = gridContainer.style.display === 'none';
      gridContainer.style.display = show ? '' : 'none';

      if (show) {
        visibleCount++;
        if (wasHidden) {
          panel.dispatchEvent(new CustomEvent('mc:visible'));
        }
      }
    });

    if (empty) {
      if (totalModules === 0) {
        empty.hidden = false;
      } else {
        empty.hidden = !(only && visibleCount === 0);
      }
    }

    if (qInp) localStorage.setItem(KEY_QUERY, q);
  }

  window.applyOnlineFilter = applyFilters;

  if (cb) {
    const savedOnline = localStorage.getItem(KEY_ONLINE);
    cb.checked = savedOnline !== null ? savedOnline === '1' : true;
    cb.addEventListener('change', () => {
      localStorage.setItem(KEY_ONLINE, cb.checked ? '1' : '0');
      applyFilters();
    });
  }

  if (qInp) {
    const savedQ = localStorage.getItem(KEY_QUERY) || '';
    if (savedQ) qInp.value = savedQ;

    /**
     * Met à jour la visibilité du bouton de nettoyage de recherche
     * @returns {void}
     * @private
     */
    function updateClearButton() {
      if (clrBtn) {
        clrBtn.classList.toggle('show', qInp.value.length > 0);
      }
    }

    updateClearButton();

    qInp.addEventListener('input', () => {
      updateClearButton();
      applyFilters();
    });
    qInp.addEventListener('keydown', e => {
      if (e.key === 'Escape' && qInp.value) {
        qInp.value = '';
        updateClearButton();
        applyFilters();
      }
    });
  }
  if (clrBtn && qInp) {
    clrBtn.addEventListener('click', () => {
      qInp.value = '';
      qInp.focus();
      if (clrBtn) clrBtn.classList.remove('show');
      applyFilters();
    });
  }

  requestAnimationFrame(applyFilters);
})();

/**
 * Gestion de la communication WebSocket pour les modules
 * Établit et maintient la connexion temps réel avec le serveur pour les mises à jour de statut
 * @returns {void}
 */
(() => {
  let socket;

  // Par défaut, offline
  document.querySelectorAll('.panel[data-mid]').forEach(p => {
    p.classList.add('offline', 'disabled');
  });

  /**
   * Met à jour l'état de présence d'un module spécifique
   * Gère l'affichage visuel et les événements de connexion/déconnexion
   * @param {string} moduleId - Identifiant unique du module
   * @param {boolean} online - Statut de connexion (true=en ligne, false=hors ligne)
   * @returns {void}
   * @private
   */
  function setPresence(moduleId, online) {
    const panels = document.querySelectorAll(`.panel[data-mid="${moduleId}"]`);

    panels.forEach(p => {
      p.classList.toggle('online', online);
      p.classList.toggle('offline', !online);
      p.classList.toggle('disabled', !online);

      const badge = p.querySelector('.state');
      if (badge) {
        badge.textContent = online ? window.t('common.online') : window.t('common.offline');
        badge.classList.toggle('online', online);
        badge.classList.toggle('offline', !online);
      }

      p.dispatchEvent(new CustomEvent(online ? 'mc:online' : 'mc:offline'));

      // Notifier le contrôleur
      const ctl = controllersByMid.get(moduleId);
      if (online) {
        ctl?.onPresenceOnline?.();
      } else {
        ctl?.onPresenceOffline?.();
      }
    });
    window.applyOnlineFilter?.();
  }

  /**
   * Met à jour les données de télémétrie d'un module
   * Transmet les données au contrôleur associé pour mise à jour de l'interface
   * @param {string} moduleId - Identifiant du module concerné
   * @param {Object} payload - Données de télémétrie à appliquer
   * @returns {void}
   * @private
   */
  function updateTelemetry(moduleId, payload) {
    const panels = document.querySelectorAll(`.panel[data-mid="${moduleId}"]`);
    panels.forEach(() => {
      const ctl = controllersByMid.get(moduleId);
      ctl?.updateTelemetry?.(payload);
    });
  }

  /**
   * Établit la connexion WebSocket pour les modules
   * Utilise la connexion globale et configure les événements spécifiques
   * @returns {void}
   * @private
   */
  function connectSocket() {
    if (!window.socket) {
      window.addEventListener('websocket-ready', connectSocket);
      return;
    }

    socket = window.socket;
    // Socket global assigné

    // Configurer les événements spécifiques aux modules
    setupSocketEvents(socket);

    // Enregistrer cette page si la connexion est active
    if (socket.connected) {
      socket.emit('register_page', { page: 'modules' });

      // Demander synchronisation initiale des statuts
      requestInitialSync();
    } else {
      socket.on('connect', () => {
        socket.emit('register_page', { page: 'modules' });

        // Demander synchronisation initiale après connexion
        requestInitialSync();
      });
    }
  }

  /**
   * Demande la synchronisation initiale des états de modules
   * @returns {void}
   * @private
   */
  function requestInitialSync() {
    // Demander l'état actuel de tous les modules connectés
    if (socket && socket.connected) {
      socket.emit('request_module_states');
    }
  }

  /**
   * Configure tous les événements WebSocket pour les modules
   * @param {Object} socket - Instance Socket.io
   * @returns {void}
   * @private
   */
  function setupSocketEvents(socket) {
    // Setting up socket events...

    socket.on('user:module:online', data => {
      setPresence(data.moduleId, true);
    });

    socket.on('user:module:offline', data => {
      setPresence(data.moduleId, false);
    });

    // Événements globaux pour synchronisation avec toast.js (même logique que admin)
    socket.on('rt_module_offline', data => {
      setPresence(data.moduleId, false);
    });

    // Synchronisation initiale des statuts
    socket.on('module_states_sync', data => {
      if (data.states) {
        Object.entries(data.states).forEach(([moduleId, state]) => {
          setPresence(moduleId, state.online || false);
        });
      }
    });

    // Télémétrie des modules
    socket.on('module_telemetry', data => {
      // Mettre à jour la télémétrie sans changer le statut de présence
      updateTelemetry(data.moduleId, data);
    });

    // Réponses spécifiques aux modules audio
    socket.on('audio_list_response', data => {
      updateTelemetry(data.moduleId, { audio_list: data.files });
    });

    socket.on('audio_status_update', data => {
      updateTelemetry(data.moduleId, { audio_status: data });
    });

    socket.on('audio_volume_update', data => {
      updateTelemetry(data.moduleId, { audio_volume: data.volume });
    });

    // Confirmation de commande
    socket.on('command_sent', () => {
      // Commande envoyée avec succès
    });

    // Erreur de commande
    socket.on('command_error', () => {
      window.showToast?.('Command failed', 'error', 3000);
    });

    socket.on('error', () => {
      // Erreur WebSocket
    });

    // === ÉVÉNEMENTS TEMPS RÉEL ===

    // Module ajouté en temps réel
    socket.on('user:module:added', () => {
      // Real-time: Module added
      // Rafraîchir la liste des modules si nécessaire
      window.location.reload(); // Solution simple, pourrait être optimisée
    });

    // Module supprimé en temps réel
    socket.on('user:module:removed', data => {
      // Real-time: Module removed
      // Retirer le module de l'interface
      const panel = document.querySelector(`.panel[data-mid="${data.moduleId}"]`);
      if (panel) {
        panel.remove();
        controllersByMid.delete(data.moduleId);
      }
    });

    // Module mis à jour en temps réel
    socket.on('user:module:updated', data => {
      // Real-time: Module updated
      // Mettre à jour le nom/type du module dans l'interface
      const panel = document.querySelector(`.panel[data-mid="${data.moduleId}"]`);
      if (panel) {
        const nameElement = panel.querySelector('.module-name');
        const typeElement = panel.querySelector('.module-type');
        if (nameElement && data.name) nameElement.textContent = data.name;
        if (typeElement && data.type) typeElement.textContent = data.type;
      }
    });

    // Télémétrie mise à jour en temps réel
    socket.on('rt_telemetry_updated', data => {
      // Real-time: Telemetry updated
      updateTelemetry(data.moduleId, data.telemetry);
    });
  }

  /**
   * Fonction globale pour envoyer des commandes aux modules via WebSocket
   * Remplace l'ancienne implémentation ws_sendCommand avec sécurité renforcée
   * @param {HTMLElement} panel - Panneau du module cible
   * @param {string} command - Commande à envoyer au module
   * @param {Object} [params={}] - Paramètres de la commande
   * @param {HTMLElement} [buttonElement=null] - Élément bouton pour effet visuel
   * @returns {void}
   * @global
   */
  window.ws_sendCommand = function (panel, command, params = {}, buttonElement = null) {
    if (!socket || !socket.connected) {
      window.showToast?.('Server not connected', 'error', 2000);
      return;
    }

    const moduleId = panel.dataset.mid;
    if (!moduleId) {
      return;
    }

    // Effet visuel sur le bouton (cooldown)
    if (buttonElement) {
      buttonElement.style.opacity = '0.6';
      buttonElement.style.pointerEvents = 'none';
      setTimeout(() => {
        buttonElement.style.opacity = '';
        buttonElement.style.pointerEvents = '';
      }, 500);
    }

    // Envoi de la commande via Socket.io (système sécurisé)
    socket.emit('send_module_command', {
      moduleId,
      command,
      params,
    });
  };

  // Initialisation après chargement du DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', connectSocket);
  } else {
    connectSocket();
  }
})();

/**
 * Modal d'ajout de module - Gestion ouverture/fermeture
 * Interface pour ajouter de nouveaux modules au système
 */
const modalAdd = document.getElementById('modalAdd');
const openAddBtn = document.getElementById('openModal');
const cancelAdd = document.getElementById('btnCancelAdd');
const idField = document.getElementById('f_mod_id');
const codeField = document.getElementById('f_mod_code');

// Auto-formatage du Module ID (MC-XXXX-XXX)
if (idField) {
  idField.addEventListener('input', e => {
    let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');

    // Ajouter MC- au début si pas présent
    if (!value.startsWith('MC')) {
      if (value.length > 0) {
        value = `MC${value}`;
      }
    }

    // Formater MC-XXXX-XXX
    let formatted = '';
    if (value.length > 0) {
      formatted = value.substring(0, 2); // MC
      if (value.length > 2) {
        formatted += `-${value.substring(2, 6)}`; // -XXXX
        if (value.length > 6) {
          formatted += `-${value.substring(6, 9)}`; // -XXX
        }
      }
    }

    e.target.value = formatted;
  });

  // Placer le curseur à la fin
  idField.addEventListener('focus', e => {
    setTimeout(() => {
      e.target.setSelectionRange(e.target.value.length, e.target.value.length);
    }, 0);
  });
}

// Auto-formatage du Module Code (XXXX-XXXX)
if (codeField) {
  codeField.addEventListener('input', e => {
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');

    // Formater XXXX-XXXX
    let formatted = '';
    if (value.length > 0) {
      formatted = value.substring(0, 4); // XXXX
      if (value.length > 4) {
        formatted += `-${value.substring(4, 8)}`; // -XXXX
      }
    }

    e.target.value = formatted;
  });

  // Placer le curseur à la fin
  codeField.addEventListener('focus', e => {
    setTimeout(() => {
      e.target.setSelectionRange(e.target.value.length, e.target.value.length);
    }, 0);
  });
}

/**
 * Ouvre le modal d'ajout de module
 * Active l'affichage du modal et place le focus sur le champ ID
 * @returns {void}
 */
function openAddModal() {
  modalAdd?.classList.add('open');
  modalAdd?.setAttribute('aria-hidden', 'false');
  setTimeout(() => idField?.focus(), 50);
}
/**
 * Ferme le modal d'ajout de module
 * Masque le modal et remet à zéro le formulaire d'ajout
 * @returns {void}
 */
function closeAddModal() {
  modalAdd?.classList.remove('open');
  modalAdd?.setAttribute('aria-hidden', 'true');
  const form = modalAdd?.querySelector('form');
  form && form.reset();
  // Retourner le focus au bouton d'ouverture pour éviter les problèmes d'accessibilité
  openAddBtn?.focus();
}

openAddBtn?.addEventListener('click', openAddModal);
cancelAdd?.addEventListener('click', closeAddModal);
modalAdd?.addEventListener('click', e => {
  if (e.target === modalAdd) closeAddModal();
});
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeAddModal();
});

/**
 * Modal de suppression de module
 * Interface pour supprimer des modules existants du système
 */
const modalDel = document.getElementById('modalDelete');
const delText = document.getElementById('dlgDelText');
const delForm = document.getElementById('deleteForm');
const delModuleIdInp = document.getElementById('del_moduleId');

let lastFocusedDeleteBtn = null; // Stocker le bouton qui a ouvert le modal

// Gestion du clic sur les boutons de suppression
document.addEventListener('click', e => {
  const kill = e.target.closest('.kill');
  if (!kill) return;
  const panel = kill.closest('.panel[data-mid]');
  if (!panel) return;

  // Stocker le bouton qui a ouvert le modal pour y retourner le focus
  lastFocusedDeleteBtn = kill;

  const moduleId = panel.dataset.mid || '';
  const title =
    (panel.querySelector('.h1')?.childNodes?.[0]?.textContent || panel.dataset.name || '').trim() ||
    'this module';

  delText.textContent = `Delete "${title}" (${moduleId}) ? This action cannot be undone.`;
  delModuleIdInp.value = moduleId;

  modalDel?.classList.add('open');
  modalDel?.setAttribute('aria-hidden', 'false');
});

// Annulation de la suppression
document.getElementById('btnCancelDel')?.addEventListener('click', () => {
  modalDel?.classList.remove('open');
  modalDel?.setAttribute('aria-hidden', 'true');
  // Retourner le focus au bouton qui a ouvert le modal
  lastFocusedDeleteBtn?.focus();
  lastFocusedDeleteBtn = null;
});

// Fermeture par clic sur l'overlay
modalDel?.addEventListener('click', e => {
  if (e.target === modalDel) {
    modalDel?.classList.remove('open');
    modalDel?.setAttribute('aria-hidden', 'true');
    // Retourner le focus au bouton qui a ouvert le modal
    lastFocusedDeleteBtn?.focus();
    lastFocusedDeleteBtn = null;
  }
});

// Gestion de la soumission du formulaire de suppression
delForm?.addEventListener('submit', async e => {
  e.preventDefault();

  const moduleId = delModuleIdInp.value;
  if (!moduleId) return;

  try {
    const response = await fetch(`/modules/delete/${moduleId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const result = await response.json();

    if (result.success) {
      // Fermer le modal
      modalDel?.classList.remove('open');
      modalDel?.setAttribute('aria-hidden', 'true');

      // Supprimer l'élément du DOM
      const panel = document.querySelector(`.panel[data-mid="${moduleId}"]`);
      const gridContainer = panel?.closest('.col-12, .col-lg-6');
      if (gridContainer) {
        gridContainer.remove();
      }

      // Nettoyer le contrôleur
      const controller = controllersByMid.get(moduleId);
      if (controller?.destroy) {
        controller.destroy();
      }
      controllersByMid.delete(moduleId);

      // Afficher un message de succès
      window.showToast?.(window.t('modules.module_deleted_successfully'), 'success', 2200);

      // Retourner le focus au bouton d'ajout de module
      openAddBtn?.focus();
      lastFocusedDeleteBtn = null;

      // Rafraîchir les filtres
      window.applyOnlineFilter?.();
    } else {
      window.showToast?.(result.error || 'Failed to delete module', 'error', 3000);
    }
  } catch {
    window.showToast?.('Network error', 'error', 3000);
  }
});
