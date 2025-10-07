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
 * Gère la lecture de pistes audio avec playlist dynamique et contrôles de lecture
 * @param {HTMLElement} panel - Élément DOM du panneau du contrôleur audio
 * @returns {Object} Objet contrôleur avec méthodes de gestion de playlist et état
 */
function makeAudioController(panel) {
  const list = panel.querySelector('[data-role="au_list"]');
  const btn = panel.querySelector('[data-role="au_play"]');

  let tag = panel.querySelector('[data-role="au_tag"]');
  if (!tag) {
    tag = document.createElement('audio');
    tag.preload = 'metadata';
    tag.hidden = true;
    tag.dataset.role = 'au_tag';
    panel.appendChild(tag);
  }

  const IMG = { ON: urlImg('button_green_on.png'), OFF: urlImg('button_green_off.png') };
  preload(Object.values(IMG));

  let tracks = [
    { file: '001.mp3', title: 'Taron' },
    { file: '002.mp3', title: 'Fenrir' },
    { file: '003.mp3', title: 'Veloci' },
  ];

  let index = 0;
  let cooldown = false;
  let blinkTimer = null,
    lampOn = false;

  /**
   * Met à jour l'état visuel de la lampe du lecteur audio
   * @param {boolean} on - État de la lampe (allumée/éteinte)
   * @returns {void}
   * @private
   */
  const setLamp = on => {
    if (btn) btn.src = on ? IMG.ON : IMG.OFF;
  };

  /**
   * Démarre le clignotement de la lampe du lecteur audio
   * @returns {void}
   * @private
   */
  function startBlink() {
    if (blinkTimer || cooldown) return;
    lampOn = false;
    setLamp(false);
    blinkTimer = setInterval(() => {
      lampOn = !lampOn;
      setLamp(lampOn);
    }, 800);
  }

  /**
   * Arrête le clignotement de la lampe du lecteur audio
   * @param {boolean} [forceOff=true] - Force l'état éteint
   * @returns {void}
   * @private
   */
  function stopBlink(forceOff = true) {
    if (blinkTimer) {
      clearInterval(blinkTimer);
      blinkTimer = null;
    }
    lampOn = !forceOff;
    setLamp(!forceOff);
  }

  /**
   * Affiche la liste des pistes audio disponibles
   * @returns {void}
   * @private
   */
  function render() {
    if (!list) return;
    list.innerHTML = '';
    tracks.forEach((t, i) => {
      const el = document.createElement('div');
      el.className = 'track clickable' + (i === index ? ' active' : '');
      el.innerHTML = `<span>${t.title || t.file}</span><small>${t.file}</small>`;
      el.addEventListener('click', () => {
        if (cooldown) return;
        index = i;
        mark();
        load(false);
      });
      list.appendChild(el);
    });
  }

  /**
   * Marque la piste actuellement sélectionnée dans la liste
   * @returns {void}
   * @private
   */
  function mark() {
    if (!list) return;
    [...list.children].forEach((el, i) => el.classList.toggle('active', i === index));
  }

  /**
   * Charge une piste audio dans le lecteur
   * @param {boolean} autoplay - Lance automatiquement la lecture
   * @returns {void}
   * @private
   */
  function load(autoplay) {
    const t = tracks[index];
    if (!t) return;
    tag.src = t.file;
    if (autoplay && !cooldown) {
      const p = tag.play();
      if (p && p.catch) p.catch(() => {});
      stopBlink(false);
    } else {
      if (!panel.classList.contains('offline')) startBlink();
    }
  }

  /**
   * Démarre une période de refroidissement du lecteur audio
   * @returns {void}
   * @private
   */
  function beginCooldown() {
    cooldown = true;
    panel.classList.add('locked');
    stopBlink(true);
    setTimeout(() => {
      cooldown = false;
      panel.classList.remove('locked');
      if (tag.paused && !panel.classList.contains('offline')) startBlink();
    }, 30000);
  }

  btn?.addEventListener('click', () => {
    if (cooldown || panel.classList.contains('offline')) return;
    beginCooldown();

    if (!tag.src) load(false);
    const t = tracks[index];
    if (t) window.ws_sendCommand(panel, 'play', { track: t.file }, btn);

    const p = tag.play();
    if (p && p.catch) p.catch(() => {});
  });

  tag.addEventListener('play', () => {
    if (!cooldown) stopBlink(false);
  });
  tag.addEventListener('pause', () => {
    if (!cooldown && !panel.classList.contains('offline')) startBlink();
  });
  tag.addEventListener('ended', () => {
    if (!cooldown && !panel.classList.contains('offline')) startBlink();
  });

  /**
   * Callback exécuté lorsque le module audio passe en ligne
   * @returns {void}
   * @private
   */
  function onPresenceOnline() {
    panel.classList.remove('locked');
    if (tag.paused) startBlink();
  }

  /**
   * Callback exécuté lorsque le module audio passe hors ligne
   * @returns {void}
   * @private
   */
  function onPresenceOffline() {
    panel.classList.add('locked');
    stopBlink(true);
  }

  /**
   * Met à jour l'état du lecteur audio avec les données de télémétrie
   * Gère la playlist, la piste courante et l'état de lecture
   * @param {Object} [payload={}] - Données de télémétrie (playlist, current, track, playing)
   * @returns {void}
   * @private
   */
  function updateTelemetry(payload = {}) {
    if (payload.playlist) {
      const arr = Array.isArray(payload.playlist) ? payload.playlist : [];
      if (arr.length) {
        tracks = arr
          .map(x => {
            if (typeof x === 'string') {
              const [file, title] = x.split('|');
              return { file, title: title || file.split('/').pop() || file };
            }
            return {
              file: x.file || '',
              title: x.title || (x.file ? x.file.split('/').pop() : ''),
            };
          })
          .filter(t => t.file);
        index = Math.min(index, Math.max(0, tracks.length - 1));
        render();
        mark();
      }
    }
    if ('current' in payload) {
      const i = Number(payload.current);
      if (Number.isInteger(i) && tracks[i]) {
        index = i;
        mark();
      }
    }
    if ('track' in payload) {
      const f = String(payload.track);
      const i = tracks.findIndex(t => t.file === f);
      if (i >= 0) {
        index = i;
        mark();
      }
    }
    if ('playing' in payload) {
      const playing = !!payload.playing;
      const isOffline = panel.classList.contains('offline');
      if (playing) stopBlink(false);
      else if (!isOffline) startBlink();
    }
  }

  render();
  load(false);

  return {
    onPresenceOnline,
    onPresenceOffline,
    updateTelemetry,
    destroy() {
      if (blinkTimer) clearInterval(blinkTimer);
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

// Gestion du clic sur les boutons de suppression
document.addEventListener('click', e => {
  const kill = e.target.closest('.kill');
  if (!kill) return;
  const panel = kill.closest('.panel[data-mid]');
  if (!panel) return;

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
});

// Fermeture par clic sur l'overlay
modalDel?.addEventListener('click', e => {
  if (e.target === modalDel) {
    modalDel?.classList.remove('open');
    modalDel?.setAttribute('aria-hidden', 'true');
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

      // Rafraîchir les filtres
      window.applyOnlineFilter?.();
    } else {
      window.showToast?.(result.error || 'Failed to delete module', 'error', 3000);
    }
  } catch {
    window.showToast?.('Network error', 'error', 3000);
  }
});
