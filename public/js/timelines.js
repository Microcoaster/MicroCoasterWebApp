/**
 * Séquenceur de chronologies - Éditeur interactif de séquences
 *
 * Éditeur de chronologies interactif pour séquences de modules et automation
 * avec fonctionnalités de zoom, configuration, placement et lecture.
 *
 * @module timelines
 * @description Éditeur de chronologies avec gestion complète de séquences temporelles
 */

const MODULE_CONFIGS = {
  'Audio Player': {
    name: 'Lecteur Audio',
    icon: '🎵',
    color: '#ff6b6b',
    actions: {
      audio_play: {
        name: 'Jouer audio',
        duration: { min: 1, max: 300, default: 10 },
        params: {
          filename: {
            type: 'audio_file_select',
            label: 'Fichier audio',
            default: '',
          },
          volume: {
            type: 'range',
            label: 'Volume (%)',
            min: 0,
            max: 100,
            step: 1,
            default: 50,
          },
          start_seconds: {
            type: 'number',
            label: 'Commencer à (secondes)',
            min: 0,
            max: 3600,
            step: 0.1,
            default: 0,
          },
        },
      },
    },
  },
  'Switch Track': {
    name: 'Aiguillage',
    icon: '↔️',
    color: '#3742fa',
    actions: {
      switch_left: {
        name: 'Basculer à gauche',
        duration: { min: 3, max: 3, default: 3 }, // Temps fixe de 3 secondes
        params: {},
      },
      switch_right: {
        name: 'Basculer à droite',
        duration: { min: 3, max: 3, default: 3 }, // Temps fixe de 3 secondes
        params: {},
      },
    },
  },
};

/**
 * Configuration du système de zoom timeline
 * Paramètres de zoom et navigation avec molette
 */
const MIN_ZOOM = 0.25; // Zoom minimum (plus large)
const MAX_ZOOM = 5; // Zoom maximum (plus détaillé)
const ZOOM_STEP = 0.1; // Incrément du zoom

// Configuration du viewport timeline
const DEFAULT_VIEWPORT_DURATION = 15; // Durée par défaut de la fenêtre (15s)
const SCROLL_STEP = 1; // Pas de déplacement en secondes avec Shift+molette

/**
 * Classe principale du séquenceur de chronologies
 * Gère l'éditeur interactif de séquences temporelles avec zoom et lecture
 * @class TimelineSequencer
 */
class TimelineSequencer {
  /**
   * Crée une instance du séquenceur de chronologies
   * Initialise l'interface, les états et configure les éléments DOM
   */
  constructor() {
    this.track = document.getElementById('timelineTrack');
    this.timeMarkers = document.getElementById('timeMarkers');
    this.playbackIndicator = document.getElementById('playbackIndicator');
    this.instructions = document.getElementById('instructions');

    // Timeline state
    this.elements = [];
    this.isPlaying = false;
    this.currentTime = 0;
    this.totalDuration = 60;
    this.selectedElement = null;
    this.draggedElement = null;

    // Timeline sélectionnée
    this.currentTimeline = null; // {id, name, data}

    // Indicateur de temps pendant le drag & drop
    this.dragTimeIndicator = null;
    this.isDraggingModule = false; // Flag pour savoir si on drag un module
    this.dragToastShown = false; // Flag pour éviter le spam de toast pendant le drag

    // Indicateur de temps pendant le redimensionnement
    this.resizeTimeIndicator = null;
    this.resizingElement = null;
    this.resizeHandle = null;
    this.resizeType = null;
    this.wasResizing = false;

    // Zoom state simple
    this.zoomLevel = 1; // Facteur de zoom (1 = normal)
    this.pixelsPerSecond = 10; // Base: 10px par seconde

    // Viewport timeline infinie
    this.viewportStart = 0; // Début de la fenêtre (en secondes)
    this.viewportDuration = DEFAULT_VIEWPORT_DURATION; // Durée de la fenêtre visible

    // WebSocket manager
    this.websocketManager = {
      isConnected: false,
      send: (message) => this.sendWebSocketMessage(message)
    };

    // Auto-save state
    this.autoSaveTimeout = null;
    this.isAutoSaving = false;
    this.autoSaveIndicator = null;

    // Audio file list cache to prevent spam requests
    this.audioFileCache = {}; // { moduleId: { files: [], timestamp: Date.now() } }

    this.init();
  }

  init() {
    this.setupEventListeners();
    this.setupDragAndDrop();
    this.setupZoom();
    this.updateViewport(); // Initialiser le viewport
    this.switchToTab('modules'); // Initialiser avec l'onglet modules
    this.initializeWebSocket();
    this.updateInstructions(); // Mettre à jour les instructions selon l'état
    this.loadLastTimeline(); // Charger la dernière timeline utilisée
  }

  // ================================================================================
  // GESTION DE LA TIMELINE SÉLECTIONNÉE
  // ================================================================================

  /**
   * Met à jour les messages d'instruction selon l'état de la timeline sélectionnée
   * @returns {void}
   * @private
   */
  updateInstructions() {
    if (!this.instructions) return;

    if (this.currentTimeline) {
      // Timeline sélectionnée - messages normaux
      this.instructions.innerHTML = `
        <h4>${window.timelineTranslations?.create_sequence || '🎬 Créez votre séquence'}</h4>
        <p>${window.timelineTranslations?.drag_modules_here || 'Glissez vos modules ici pour créer une chronologie'}</p>
        <p>${window.timelineTranslations?.click_module_configure || 'Cliquez sur un module pour le configurer'}</p>
      `;
    } else {
      // Aucune timeline sélectionnée - messages d'avertissement
      this.instructions.innerHTML = `
        <h4>${window.timelineTranslations?.select_timeline_first || '📋 Sélectionnez d\'abord une chronologie'}</h4>
        <p>${window.timelineTranslations?.create_or_select_timeline || 'Créez ou sélectionnez une chronologie pour commencer à ajouter des modules'}</p>
      `;
    }
  }

  /**
   * Définit la timeline actuellement sélectionnée
   * @param {Object} timeline - Données de la timeline (id, name, data)
   * @returns {void}
   * @public
   */
  setCurrentTimeline(timeline) {
    this.currentTimeline = timeline;
    this.updateInstructions();

    // Sauvegarder dans localStorage pour persister entre les sessions
    if (timeline && timeline.id) {
      localStorage.setItem('lastTimelineId', timeline.id.toString());
    } else {
      localStorage.removeItem('lastTimelineId');
    }
  }

  /**
   * Déclenche la sauvegarde automatique avec debounce
   * Attend 2 secondes après la dernière modification avant de sauvegarder
   * @returns {void}
   * @private
   */
  triggerAutoSave() {
    if (!this.currentTimeline) return;

    // Annuler le timeout précédent
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
    }

    // Montrer l'indicateur de sauvegarde en cours
    this.showAutoSaveIndicator('pending');

    // Programmer la sauvegarde dans 2 secondes
    this.autoSaveTimeout = setTimeout(() => {
      this.performAutoSave();
    }, 2000);
  }

  /**
   * Effectue la sauvegarde automatique réelle
   * @returns {void}
   * @private
   */
  async performAutoSave() {
    if (!this.currentTimeline || this.isAutoSaving) return;

    this.isAutoSaving = true;
    this.showAutoSaveIndicator('saving');

    try {
      // Préparer les données
      const timelineData = {
        name: this.currentTimeline.name,
        data: this.generateSequence()
      };

      // Envoyer à l'API pour mettre à jour la timeline
      const response = await fetch(`/timelines/api/${this.currentTimeline.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(timelineData)
      });

      const data = await response.json();

      if (data.success) {
        // Mettre à jour la timeline courante avec les nouvelles données
        this.currentTimeline.data = timelineData.data;
        this.currentTimeline.updated_at = new Date().toISOString();

        this.showAutoSaveIndicator('saved');

        // Masquer l'indicateur après 2 secondes
        setTimeout(() => {
          this.hideAutoSaveIndicator();
        }, 2000);
      } else {
        throw new Error(data.error || 'Erreur lors de l\'auto-sauvegarde');
      }
    } catch (error) {
      console.error('Erreur lors de l\'auto-sauvegarde:', error);
      this.showAutoSaveIndicator('error');

      // Masquer l'indicateur d'erreur après 3 secondes
      setTimeout(() => {
        this.hideAutoSaveIndicator();
      }, 3000);
    } finally {
      this.isAutoSaving = false;
      this.autoSaveTimeout = null;
    }
  }

  /**
   * Affiche l'indicateur de sauvegarde automatique
   * @param {string} state - État de la sauvegarde ('pending', 'saving', 'saved', 'error')
   * @returns {void}
   * @private
   */
  showAutoSaveIndicator(state) {
    if (!this.autoSaveIndicator) {
      this.autoSaveIndicator = document.getElementById('autoSaveIndicator');
      if (!this.autoSaveIndicator) return;
    }

    const translations = window.timelineTranslations || {};

    switch (state) {
      case 'pending':
        this.autoSaveIndicator.textContent = translations.autoSavePending || 'Sauvegarde en attente...';
        this.autoSaveIndicator.style.backgroundColor = '#ffa502';
        this.autoSaveIndicator.style.color = 'white';
        break;
      case 'saving':
        this.autoSaveIndicator.textContent = translations.autoSaveSaving || 'Sauvegarde en cours...';
        this.autoSaveIndicator.style.backgroundColor = '#3742fa';
        this.autoSaveIndicator.style.color = 'white';
        break;
      case 'saved':
        this.autoSaveIndicator.textContent = translations.autoSaveSaved || '✓ Sauvegardé';
        this.autoSaveIndicator.style.backgroundColor = '#2ed573';
        this.autoSaveIndicator.style.color = 'white';
        break;
      case 'error':
        this.autoSaveIndicator.textContent = translations.autoSaveError || '⚠ Erreur de sauvegarde';
        this.autoSaveIndicator.style.backgroundColor = '#ff4757';
        this.autoSaveIndicator.style.color = 'white';
        break;
    }

    this.autoSaveIndicator.style.display = 'inline-block';
  }

  /**
   * Masque l'indicateur de sauvegarde automatique
   * @returns {void}
   * @private
   */
  hideAutoSaveIndicator() {
    if (this.autoSaveIndicator) {
      this.autoSaveIndicator.style.display = 'none';
    }
  }

  /**
   * Charge la dernière timeline utilisée depuis localStorage
   * @returns {void}
   * @private
   */
  loadLastTimeline() {
    const lastTimelineId = localStorage.getItem('lastTimelineId');
    if (!lastTimelineId) {
      // Aucune timeline précédente, vérifier s'il y a des timelines disponibles
      this.checkForAvailableTimelines();
      return;
    }

    // Vérifier d'abord combien de timelines sont disponibles
    fetch('/timelines/api', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    .then(response => response.json())
    .then(data => {
      if (data.success && data.timelines && data.timelines.length > 0) {
        if (data.timelines.length === 1) {
          // Une seule timeline - charger celle-ci (qui devrait être la même que lastTimelineId)
          const timeline = data.timelines[0];
          this.setCurrentTimeline(timeline);
          this.loadTimelineData(timeline);
          this.switchToTab('modules');
        } else {
          // Plusieurs timelines - ne pas charger automatiquement, rester sur savedTimelinesTab
          this.switchToTab('saved');
        }
      } else {
        // Aucune timeline disponible ou erreur, supprimer de localStorage et vérifier
        localStorage.removeItem('lastTimelineId');
        this.checkForAvailableTimelines();
      }
    })
    .catch(error => {
      console.error('Erreur lors du chargement de la dernière timeline:', error);
      localStorage.removeItem('lastTimelineId');
      this.checkForAvailableTimelines();
    });
  }

  /**
   * Vérifie s'il y a des timelines disponibles et en charge une si possible
   * Si une seule timeline : la charger automatiquement
   * Si plusieurs timelines : rester sur l'onglet savedTimelinesTab sans charger
   * @returns {void}
   * @private
   */
  checkForAvailableTimelines() {
    // Charger toutes les timelines de l'utilisateur
    fetch('/timelines/api', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    .then(response => response.json())
    .then(data => {
      if (data.success && data.timelines && data.timelines.length > 0) {
        if (data.timelines.length === 1) {
          // Une seule timeline - la charger automatiquement
          const timeline = data.timelines[0];
          this.setCurrentTimeline(timeline);
          this.loadTimelineData(timeline);
          this.switchToTab('modules');
        } else {
          // Plusieurs timelines - rester sur l'onglet savedTimelinesTab
          this.switchToTab('saved');
        }
      } else {
        // Aucune timeline disponible, ouvrir la modale de création
        setTimeout(() => {
          this.createNewTimeline();
        }, 500); // Petit délai pour laisser la page se charger
      }
    })
    .catch(error => {
      console.error('Erreur lors de la vérification des timelines disponibles:', error);
      // En cas d'erreur, ouvrir quand même la modale de création
      setTimeout(() => {
        this.createNewTimeline();
      }, 500);
    });
  }

  // ================================================================================
  // WEBSOCKET MANAGEMENT
  // ================================================================================

  /**
   * Initialise la connexion WebSocket avec le serveur
   * Utilise la connexion Socket.IO globale pour communiquer avec les modules
   * @returns {void}
   * @private
   */
  initializeWebSocket() {
    // Attendre que WebSocket soit prêt
    if (window.socket && window.socket.connected) {
      this.onWebSocketReady();
    } else {
      // Écouter l'événement de disponibilité WebSocket
      window.addEventListener('websocket-ready', () => {
        this.onWebSocketReady();
      });

      // Timeout de sécurité
      setTimeout(() => {
        if (!this.websocketManager.isConnected) {
          console.warn('WebSocket connection timeout for timeline');
        }
      }, 10000);
    }
  }

  /**
   * Callback appelé quand WebSocket est prêt
   * Configure les écouteurs d'événements WebSocket
   * @returns {void}
   * @private
   */
  onWebSocketReady() {
    if (!window.socket) return;

    this.websocketManager.isConnected = true;

    window.socket.on('command_error', (data) => {
      console.error('Command failed:', data);
      const moduleName = data.moduleId || 'Module inconnu';
      const errorMsg = data.error || 'Erreur inconnue';
      window.showToast?.(`Erreur ${moduleName}: ${errorMsg}`, 'error', 3000);
    });

    // Écouter les événements de présence des modules (comme dans modules.js)
    window.socket.on('user:module:online', (data) => {
      this.setModulePresence(data.moduleId, true);
    });

    window.socket.on('user:module:offline', (data) => {
      this.setModulePresence(data.moduleId, false);
    });

    // Synchronisation initiale des statuts
    window.socket.on('module_states_sync', (data) => {
      if (data.states) {
        Object.entries(data.states).forEach(([moduleId, state]) => {
          this.setModulePresence(moduleId, state.online || false);
        });
      }
    });

    // Demander la synchronisation initiale des statuts des modules
    if (window.socket.connected) {
      window.socket.emit('request_module_states');
    } else {
      window.socket.on('connect', () => {
        window.socket.emit('request_module_states');
      });
    }

    // Écouter les erreurs générales
    window.socket.on('error', (data) => {
      console.error('WebSocket error:', data);
      window.showToast?.('Erreur de communication', 'error', 3000);
    });

    // Écouter les réponses de liste de fichiers audio
    window.socket.on('audio_list_response', (data) => {
      if (data.files && data.moduleId) {
        this.populateAudioFileSelect(data.moduleId, data.files);
      }
    });
  }

  /**
   * Met à jour l'état de présence d'un module dans la sidebar
   * Synchronise l'affichage avec l'état réel du module (comme dans modules.js)
   * @param {string} moduleId - Identifiant unique du module
   * @param {boolean} online - Statut de connexion (true=en ligne, false=hors ligne)
   * @returns {void}
   * @private
   */
  setModulePresence(moduleId, online) {
    // Update sidebar module items and module panels (keep parity with modules.js behavior)
    const selectors = [
      `.module-item[data-module-id="${moduleId}"]`,
      `.panel[data-mid="${moduleId}"]`
    ];

    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(element => {
        // Mettre à jour les classes CSS
        element.classList.toggle('online', online);
        element.classList.toggle('offline', !online);

        // Mettre à jour l'attribut data
        element.dataset.isOnline = online.toString();

        // Mettre à jour le badge de statut si présent
        const stateBadge = element.querySelector('.state');
        if (stateBadge) {
          stateBadge.textContent = online ? (window.t ? window.t('common.online') : 'En ligne') : (window.t ? window.t('common.offline') : 'Hors ligne');
          stateBadge.classList.toggle('online', online);
          stateBadge.classList.toggle('offline', !online);
        }

        // Dispatch a presence event so any controllers can react
        element.dispatchEvent(new CustomEvent(online ? 'mc:online' : 'mc:offline'));
      });
    });

    // Also update any timeline action cards that reference this module
    document.querySelectorAll(`.timeline-action[data-module-id="${moduleId}"]`).forEach(el => {
      el.classList.toggle('online', online);
      el.classList.toggle('offline', !online);
      el.dataset.isOnline = online.toString();

      // Update status-dot classes and tooltip for accessibility
      const dot = el.querySelector('.status-dot');
      if (dot) {
        dot.classList.toggle('online', online);
        dot.classList.toggle('offline', !online);
        dot.setAttribute('title', online ? (window.t ? window.t('common.online') : 'En ligne') : (window.t ? window.t('common.offline') : 'Hors ligne'));
        dot.setAttribute('aria-hidden', 'true');
      }
    });

    // Re-apply any online filters if present (mirrors modules.js behavior)
    window.applyOnlineFilter?.();
  }

  /**
   * Envoie un message via WebSocket au serveur
   * Adapte le format pour correspondre à l'API du serveur
   * @param {Object} message - Message à envoyer
   * @returns {void}
   * @private
   */
  sendWebSocketMessage(message) {
    if (!window.socket || !this.websocketManager.isConnected) {
      console.error('WebSocket not connected');
      window.showToast?.('Connexion WebSocket perdue', 'error', 3000);
      return;
    }

    // Adapter le format du message pour l'API serveur
    const serverMessage = {
      moduleId: message.moduleId,
      command: message.command,
      ...message.parameters,
      duration: message.duration
    };

    console.log('Sending WebSocket message:', serverMessage);
    window.socket.emit('send_module_command', serverMessage);
  }

  /**
   * Envoie une commande de contrôle de timeline à tous les modules actifs
   * Utilisé pour pause, stop et autres contrôles globaux
   * @param {string} command - Commande à envoyer ('timeline_pause', 'timeline_stop', etc.)
   * @returns {void}
   * @private
   */
  sendTimelineControlCommand(command) {
    if (!window.socket || !this.websocketManager.isConnected) {
      console.error('WebSocket not connected');
      window.showToast?.('Connexion WebSocket perdue', 'error', 3000);
      return;
    }

    // Envoyer la commande à tous les modules actifs dans la timeline
    this.elements.forEach(element => {
      const moduleId = element.moduleData.id;
      const serverMessage = {
        moduleId: moduleId,
        command: command,
        parameters: {}
      };

      console.log('Sending timeline control command:', serverMessage);
      window.socket.emit('send_module_command', serverMessage);
    });
  }

  /**
   * Remplit la liste des fichiers audio dans un select de configuration
   * Met à jour le select avec les fichiers reçus via WebSocket
   * @param {string} moduleId - ID du module Audio Player
   * @param {Array<string>} files - Liste des noms de fichiers audio
   * @returns {void}
   * @private
   */
  populateAudioFileSelect(moduleId, files) {
    // Mettre à jour le cache avec les nouvelles données
    this.audioFileCache[moduleId] = {
      files: files,
      timestamp: Date.now()
    };

    // Trouver tous les selects audio pour ce module
    const audioSelects = document.querySelectorAll(`.audio-file-select[data-module-id="${moduleId}"]`);
    
    audioSelects.forEach(select => {
      // Sauvegarder la valeur actuellement sélectionnée
      const currentValue = select.value || select.dataset.currentValue || '';
      
      // Vider les options existantes
      select.innerHTML = '<option value="">Sélectionnez un fichier audio</option>';
      
      // Ajouter les fichiers comme options
      files.forEach(file => {
        const option = document.createElement('option');
        option.value = file;
        option.textContent = file;
        select.appendChild(option);
      });
      
      // Restaurer la valeur précédemment sélectionnée si elle existe dans la nouvelle liste
      if (currentValue && files.includes(currentValue)) {
        select.value = currentValue;
      }
      // Si la valeur actuelle n'existe pas dans la liste, ne rien sélectionner (valeur vide)
    });
  }

  // ================================================================================
  // SYSTÈME DE ZOOM SIMPLE
  // ================================================================================

  /**
   * Configure le système de zoom et navigation dans la timeline
   * Gère Ctrl+molette pour le zoom et Shift+molette pour la navigation horizontale
   * @returns {void}
   * @private
   */
  setupZoom() {
    // Zoom avec Ctrl+molette et navigation avec Shift+molette
    this.track.addEventListener('wheel', e => {
      if (e.ctrlKey) {
        // Zoom In/Out avec Ctrl+molette
        e.preventDefault();

        const direction = e.deltaY < 0 ? 1 : -1; // Molette vers le haut = zoom in
        const newZoom = this.zoomLevel + direction * ZOOM_STEP;

        // Limiter le zoom
        this.zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));

        this.updateZoom();
      } else if (e.shiftKey) {
        // Navigation horizontale dans la timeline avec Shift+molette
        e.preventDefault();

        const direction = e.deltaY < 0 ? -1 : 1; // Molette vers le haut = reculer
        const newStart = this.viewportStart + direction * SCROLL_STEP;

        // Empêcher de descendre en dessous de 0
        this.viewportStart = Math.max(0, newStart);

        this.updateViewport();
      }
    }, { passive: false }); // Explicitement marquer comme non-passive car on utilise preventDefault()
  }

  /**
   * Met à jour le niveau de zoom et recalcule la durée du viewport
   * Ajuste la vue selon le niveau de zoom actuel
   * @returns {void}
   * @private
   */
  updateZoom() {
    // Mettre à jour la durée du viewport selon le zoom
    this.viewportDuration = DEFAULT_VIEWPORT_DURATION / this.zoomLevel;

    this.updateViewport();
  }

  /**
   * Met à jour complètement le viewport de la timeline
   * Recalcule les marqueurs, positions d'éléments et indicateurs
   * @returns {void}
   * @public
   */
  updateViewport() {
    // Mettre à jour les marqueurs temporels
    this.updateTimeMarkers();

    // Mettre à jour la position et visibilité des éléments
    this.elements.forEach(el => {
      this.updateElementInViewport(el);
    });

    // Mettre à jour l'indicateur de viewport
    this.updateViewportIndicator();
  }

  /**
   * Met à jour l'indicateur de plage temporelle du viewport
   * Affiche la plage de temps actuellement visible
   * @returns {void}
   * @private
   */
  updateViewportIndicator() {
    const indicator = document.getElementById('viewportIndicator');
    if (indicator) {
      const start = this.formatTime(this.viewportStart);
      const end = this.formatTime(this.viewportStart + this.viewportDuration);
      indicator.textContent = `${start} - ${end}`;
    }
  }

  /**
   * Met à jour la position et visibilité d'un élément dans le viewport
   * Calcule la position relative et gère l'affichage selon la visibilité
   * @param {Object} elementData - Données de l'élément à positionner
   * @returns {void}
   * @private
   */
  updateElementInViewport(elementData) {
    const element = elementData.element;
    const startTime = elementData.startTime;
    const duration = elementData.duration;
    const trackIndex = elementData.trackIndex || 0;
    const endTime = startTime + duration;
    const trackWidth = this.track.offsetWidth;

    // Position relative au viewport
    const relativeStart = startTime - this.viewportStart;
    const relativeEnd = endTime - this.viewportStart;

    // Vérifier si l'élément est visible dans le viewport
    const isVisible = relativeEnd > 0 && relativeStart < this.viewportDuration;

    if (isVisible) {
      // Calculer la position et taille en pourcentage de la largeur totale
      const leftPercent = Math.max(0, relativeStart / this.viewportDuration);
      const widthPercent = Math.min(
        (relativeEnd - Math.max(0, relativeStart)) / this.viewportDuration,
        1
      );

      const left = leftPercent * trackWidth;
      const width = Math.max(widthPercent * trackWidth, 50); // Minimum 50px

      element.style.left = `${left}px`;
      element.style.width = `${width}px`;
      element.style.display = 'block';
      element.style.opacity = '1';

      // Position verticale basée sur la piste
      const trackHeight = this.track.offsetHeight - 60; // Hauteur disponible (sans la règle)
      const laneHeight = trackHeight / 8; // 8 pistes
      const baseTop = 60 + (trackIndex * laneHeight) + 5; // +5px pour un petit padding
      const top = baseTop;
      
      element.style.top = `${top}px`;
      element.style.height = `${laneHeight - 10}px`; // -10px pour le padding
    } else {
      // Masquer l'élément s'il est hors du viewport
      element.style.display = 'none';
    }
  }

  /**
   * Retourne la durée actuellement visible dans le viewport
   * @returns {number} Durée du viewport actuel en secondes
   * @public
   */
  getCurrentDuration() {
    return this.viewportDuration; // Durée du viewport actuel
  }

  /**
   * Convertit une position en pixels en temps absolu dans la timeline
   * Applique un snapping intelligent vers les valeurs temporelles les plus proches
   * @param {number} pixelPosition - Position en pixels à convertir
   * @returns {number} Temps correspondant en secondes avec snapping
   * @public
   */
  pixelToTime(pixelPosition) {
    // Convertir la position en pixels en temps absolu dans la timeline
    const trackWidth = this.track.offsetWidth;
    const relativePosition = pixelPosition / trackWidth; // Position en pourcentage
    const absoluteTime = this.viewportStart + relativePosition * this.viewportDuration;

    // Appliquer le snapping vers les valeurs les plus proches
    return this.snapToNearestRoundTime(absoluteTime);
  }

  /**
   * Applique un snapping intelligent vers les valeurs temporelles les plus proches
   * Priorité : chiffres ronds (1s, 2s...) > demi-secondes (0.5s, 1.5s...) > centièmes libres
   * @param {number} time - Temps en secondes à ajuster
   * @returns {number} Temps ajusté avec snapping ou précision native
   * @private
   */
  snapToNearestRoundTime(time) {
    // Distance maximale pour le snapping (en pixels)
    const maxSnapDistance = 15; // pixels pour les chiffres ronds (distance modérée)
    const maxSnapDistanceHalves = 6; // pixels pour les demi-secondes (distance plus petite)
    const trackWidth = this.track.offsetWidth;
    const viewportDuration = this.viewportDuration || DEFAULT_VIEWPORT_DURATION;
    const pixelsPerSecond = trackWidth / viewportDuration;

    // Calculer les seuils en secondes
    const snapThresholdRound = maxSnapDistance / pixelsPerSecond;
    const snapThresholdHalves = maxSnapDistanceHalves / pixelsPerSecond;

    // Générer les cibles de snapping par ordre de priorité
    const snapTargets = [];

    // Priorité 1: Chiffres ronds (1s, 2s, 3s, etc.) - snapping fort
    for (let i = 0; i <= Math.ceil(time + 5); i++) {
      snapTargets.push({ time: i, priority: 1, threshold: snapThresholdRound });
    }

    // Priorité 2: Demi-secondes (0.5s, 1.5s, 2.5s, etc.) - snapping plus faible
    for (let i = 0; i <= Math.ceil(time + 5); i++) {
      snapTargets.push({ time: i + 0.5, priority: 2, threshold: snapThresholdHalves });
    }

    // Pas de snapping pour les centièmes de seconde (0.01s, 0.02s, etc.)

    // Trouver la cible la plus proche dans le seuil
    let bestSnap = null;
    let bestDistance = Infinity;

    for (const target of snapTargets) {
      const distance = Math.abs(time - target.time);
      if (distance < target.threshold && distance < bestDistance) {
        bestDistance = distance;
        bestSnap = target;
      } else if (distance === bestDistance && target.priority < bestSnap.priority) {
        // Même distance, mais priorité plus haute
        bestSnap = target;
      }
    }

    // Retourner le temps arrondi si un snapping a été trouvé, sinon le temps original arrondi à 2 décimales
    return bestSnap ? Math.round(bestSnap.time * 100) / 100 : Math.round(time * 100) / 100;
  }

  /**
   * Met à jour les marqueurs temporels de la règle selon le zoom
   * Affiche des traits pour chaque seconde et des labels selon le zoom
   * @returns {void}
   * @private
   */
  updateTimeMarkers() {
    if (!this.timeMarkers) return;

    this.timeMarkers.innerHTML = '';
    const trackWidth = this.track.offsetWidth;

    // Recalculer pixelsPerSecond pour utiliser toute la largeur
    this.pixelsPerSecond = trackWidth / this.viewportDuration;

    // Intervalle des labels selon le zoom (les traits sont toujours à chaque seconde)
    let labelInterval = 5; // Par défaut 5s
    if (this.zoomLevel >= 3)
      labelInterval = 1; // Zoom élevé: 1s
    else if (this.zoomLevel >= 1.5)
      labelInterval = 2; // Zoom moyen: 2s
    else if (this.zoomLevel <= 0.5) labelInterval = 10; // Zoom faible: 10s

    // Calculer le temps de début et fin visibles
    const startTime = Math.floor(this.viewportStart);
    const endTime = Math.ceil(this.viewportStart + this.viewportDuration);

    for (let time = startTime; time <= endTime; time += 1) {
      const relativeTime = time - this.viewportStart;
      const position = (relativeTime / this.viewportDuration) * trackWidth;

      // Seulement afficher les marqueurs visibles
      if (position >= 0 && position <= trackWidth) {
        const marker = document.createElement('div');
        marker.className = 'time-marker';
        marker.style.left = `${position}px`;
        
        // Toujours afficher la ligne
        const isMajorMarker = time % labelInterval === 0;
        const lineClass = isMajorMarker ? 'marker-line' : 'marker-line secondary';
        let markerHTML = `<div class="${lineClass}"></div>`;
        
        // Afficher le label seulement selon l'intervalle de zoom
        if (isMajorMarker) {
          markerHTML += `<div class="marker-label">${this.formatTime(time)}</div>`;
        }
        
        marker.innerHTML = markerHTML;
        this.timeMarkers.appendChild(marker);
      }
    }
  }

  /**
   * Formate un temps en secondes pour l'affichage
   * Affiche sans décimales pour les nombres entiers, avec 2 décimales sinon
   * @param {number} seconds - Temps en secondes
   * @returns {string} Durée formatée (ex: '5s', '1.50s', '2min30s')
   * @private
   */
  formatTime(seconds) {
    if (seconds < 60) {
      return seconds % 1 === 0 ? `${seconds}s` : `${seconds.toFixed(2)}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (remainingSeconds % 1 === 0) {
      const remainingInt = Math.round(remainingSeconds);
      return remainingInt === 0 ? `${minutes}min` : `${minutes}min${remainingInt}s`;
    } else {
      return `${minutes}min${remainingSeconds.toFixed(2)}s`;
    }
  }

  // ================================================================================
  // ÉVÉNEMENTS ET INTERACTIONS
  // ================================================================================

  /**
   * Configure tous les écouteurs d'événements de la timeline
   * Gère drag & drop, clics, touches clavier et boutons de contrôle
   * @returns {void}
   * @private
   */
  setupEventListeners() {
    // Drag & drop
    this.track.addEventListener('dragover', e => this.handleDragOver(e));
    this.track.addEventListener('drop', e => this.handleDrop(e));
    this.track.addEventListener('dragleave', e => this.handleDragLeave(e));

    // Écouteur global pour la fin du drag
    document.addEventListener('dragend', e => {
      this.isDraggingModule = false;
      this.track.classList.remove('drag-over-module');
      this.hideDragTimeIndicator();
      this.dragToastShown = false; // Réinitialiser le flag du toast
      
      // Si le drag s'est terminé sans drop et que la timeline est vide, remettre les instructions
      if (this.elements.length === 0) {
        this.showInstructions();
      }
    });

    // Interactions timeline
    this.track.addEventListener('click', e => this.handleTrackClick(e));
    document.addEventListener('keydown', e => this.handleKeyDown(e));
    document.addEventListener('keyup', e => this.handleKeyUp(e));

    // Boutons de contrôle
    const clearBtn = document.getElementById('clearBtn');
    const saveBtn = document.getElementById('saveBtn');
    const playFromStartBtn = document.getElementById('playFromStartBtn');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const modulesTab = document.getElementById('modulesTab');
    const savedTimelinesTab = document.getElementById('savedTimelinesTab');
    const createTimelineBtn = document.getElementById('createTimelineBtn');

    // Initialiser les propriétés des boutons
    this.playFromStartButton = playFromStartBtn;
    this.playPauseButton = playPauseBtn;

    if (clearBtn) clearBtn.addEventListener('click', () => this.clear());
    if (saveBtn) saveBtn.addEventListener('click', () => this.save());
    if (playFromStartBtn) playFromStartBtn.addEventListener('click', () => this.playFromStart());
    if (playPauseBtn) playPauseBtn.addEventListener('click', () => this.togglePlayPause());
    if (modulesTab) modulesTab.addEventListener('click', () => this.switchToTab('modules'));
    if (savedTimelinesTab) savedTimelinesTab.addEventListener('click', () => this.switchToTab('saved'));
    if (createTimelineBtn) createTimelineBtn.addEventListener('click', () => this.createNewTimeline());
  }

  /**
   * Configure le drag & drop pour les modules vers la timeline
   * Rend les éléments modules déplaçables vers la zone de timeline
   * @returns {void}
   * @private
   */
  setupDragAndDrop() {
    document.querySelectorAll('.module-item').forEach(item => {
      item.addEventListener('dragstart', e => {
        this.isDraggingModule = true; // Marquer qu'on drag un module
        const moduleData = {
          id: item.dataset.moduleId,
          name: item.dataset.moduleName,
          type: item.dataset.moduleType,
          isOnline: item.dataset.isOnline === 'true',
        };
        e.dataTransfer.setData('text/plain', JSON.stringify(moduleData));
      });
    });
  }

  /**
   * Gère l'événement dragover sur la timeline
   * @param {DragEvent} e - Événement de drag
   * @returns {void}
   * @private
   */
  handleDragOver(e) {
    e.preventDefault();

    // Vérifier si c'est bien un module qui est en train d'être déplacé
    if (this.isDraggingModule) {
      // Vérifier si une timeline est sélectionnée
      if (this.currentTimeline) {
        this.track.classList.add('drag-over-module');
        // Masquer les instructions dès qu'on commence à drag un module
        this.hideInstructions();
        // Afficher l'indicateur de temps pendant le drag
        const rect = this.track.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const timePosition = Math.max(0, this.pixelToTime(x));
        this.showDragTimeIndicator(timePosition, e.clientX, e.clientY);
      } else {
        // Aucune timeline sélectionnée - montrer un feedback d'interdiction
        this.track.classList.add('drag-disabled');
        // Afficher le toast seulement une fois pendant le drag
        if (!this.dragToastShown) {
          window.showToast?.('Sélectionnez d\'abord une chronologie', 'warning', 2000);
          this.dragToastShown = true;
        }
      }
    } else {
      // Ce n'est pas un module valide, ne rien faire
      this.track.classList.remove('drag-over-module');
      this.track.classList.remove('drag-disabled');
      this.hideDragTimeIndicator();
    }
  }

  /**
   * Gère la sortie du drag de la zone de timeline
   * @returns {void}
   * @private
   */
  handleDragLeave() {
    this.track.classList.remove('drag-over-module');
    this.track.classList.remove('drag-disabled');
    this.hideDragTimeIndicator();
    this.dragToastShown = false; // Réinitialiser le flag du toast
    // Ne pas réinitialiser isDraggingModule ici car on pourrait revenir
  }

  /**
   * Gère le dépôt d'un module sur la timeline
   * @param {DragEvent} e - Événement de drop
   * @returns {void}
   * @private
   */
  handleDrop(e) {
    e.preventDefault();
    this.track.classList.remove('drag-over-module');
    this.track.classList.remove('drag-disabled');
    this.hideDragTimeIndicator();
    this.isDraggingModule = false; // Réinitialiser le flag

    // Vérifier qu'une timeline est sélectionnée
    if (!this.currentTimeline) {
      window.showToast?.('Veuillez d\'abord sélectionner ou créer une chronologie', 'error', 3000);
      return;
    }

    try {
      const moduleData = JSON.parse(e.dataTransfer.getData('text/plain'));
      const rect = this.track.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Stocker le type et l'action du module pour la vérification de durée
      this.dragModuleType = moduleData.type;
      this.dragModuleAction = Object.keys(this.getModuleConfig(moduleData.type).actions)[0];

      // Convertir la position en temps et piste
      const timePosition = Math.max(0, this.pixelToTime(x));
      const initialTrackIndex = this.getTrackIndexFromY(y);

      // Trouver la première piste disponible à partir de la piste détectée
      const trackIndex = this.findAvailableTrackIndex(timePosition, initialTrackIndex);

      if (trackIndex === null) {
        // Aucune piste disponible, afficher un message d'erreur
        window.showToast?.('Impossible de placer le module ici : toutes les pistes sont occupées à cette position', 'error', 3000);
      } else {
        // Vérifier les conflits temporels pour le même module avant de placer
        const defaultDuration = this.getModuleConfig(moduleData.type).actions[this.dragModuleAction].duration.default;
        const hasConflict = this.hasModuleTimeConflict(moduleData.id, timePosition, defaultDuration);

        if (hasConflict) {
          // Conflit détecté - annuler le placement et afficher un toast d'avertissement
          window.showToast?.('Impossible de placer ce module : conflit temporel avec une action existante du même module', 'error', 3000);

          // Remettre l'élément dans la sidebar (pas de placement sur la timeline)
          // L'élément reste dans la sidebar, pas de nettoyage nécessaire
        } else {
          // Pas de conflit - placer le module normalement
          this.addElementToTimeline(moduleData, x, trackIndex);
        }
      }

      // Nettoyer les variables temporaires
      delete this.dragModuleType;
      delete this.dragModuleAction;
    } catch {
      // Ignorer les erreurs de drop
    }
  }

  /**
   * Détermine l'index de la piste à partir d'une position Y
   * @param {number} y - Position Y en pixels relative à la timeline
   * @returns {number} Index de la piste (0-7)
   * @private
   */
  getTrackIndexFromY(y) {
    const trackHeight = this.track.offsetHeight - 60; // Hauteur disponible (sans la règle)
    const laneHeight = trackHeight / 8; // 8 pistes
    const relativeY = y - 60; // Position relative sans la règle
    
    // Calculer l'index de la piste
    const trackIndex = Math.floor(relativeY / laneHeight);
    return Math.max(0, Math.min(7, trackIndex)); // Limiter entre 0 et 7
  }

  /**
   * Trouve la première piste disponible à partir d'un index donné
   * Recherche d'abord vers le bas (indices plus élevés), puis vers le haut si nécessaire
   * @param {number} timePosition - Position temporelle en secondes
   * @param {number} startTrackIndex - Index de piste de départ (0-7)
   * @returns {number|null} Index de la première piste disponible (0-7) ou null si aucune disponible
   * @private
   */
  findAvailableTrackIndex(timePosition, startTrackIndex) {
    // Récupérer la durée par défaut du module à placer
    const defaultDuration = this.getModuleConfig(this.dragModuleType || 'generic-module').actions[this.dragModuleAction || Object.keys(this.getModuleConfig(this.dragModuleType || 'generic-module').actions)[0]].duration.default;

    // Vérifier d'abord si la piste de départ est libre sur toute la durée
    if (this.isTrackAvailableForDuration(timePosition, defaultDuration, startTrackIndex)) {
      return startTrackIndex;
    }

    // Chercher vers le bas (indices plus élevés) pour une piste libre
    for (let trackIndex = startTrackIndex + 1; trackIndex <= 7; trackIndex++) {
      if (this.isTrackAvailableForDuration(timePosition, defaultDuration, trackIndex)) {
        return trackIndex;
      }
    }

    // Si rien trouvé vers le bas, chercher vers le haut (indices plus petits)
    for (let trackIndex = startTrackIndex - 1; trackIndex >= 0; trackIndex--) {
      if (this.isTrackAvailableForDuration(timePosition, defaultDuration, trackIndex)) {
        return trackIndex;
      }
    }

    // Si aucune piste libre n'est trouvée dans aucune direction, retourner null
    return null;
  }

  /**
   * Trouve la meilleure piste disponible pour le déplacement d'un élément
   * Privilégie les pistes adjacentes au module existant en cas de collision
   * @param {number} timePosition - Position temporelle souhaitée
   * @param {number} preferredTrackIndex - Index de piste préféré (calculé depuis la souris)
   * @param {HTMLElement} draggedElement - Élément en cours de déplacement
   * @returns {Object|null} Objet {trackIndex, timePosition} ou null si aucune piste disponible
   * @private
   */
  findBestTrackForDrag(timePosition, preferredTrackIndex, draggedElement) {
    const duration = parseFloat(draggedElement.dataset.duration);
    const draggedElementData = this.elements.find(e => e.element === draggedElement);

    // Distance maximale pour considérer qu'on est "proche" de la bordure d'un module (en pixels)
    const maxSnapDistance = 20; // pixels
    const trackWidth = this.track.offsetWidth;
    const pixelsPerSecond = trackWidth / this.viewportDuration;
    const snapThresholdSeconds = maxSnapDistance / pixelsPerSecond;

    // Chercher si on est proche de la bordure d'un module existant sur la piste préférée
    let bestSnapPosition = timePosition; // Position par défaut
    let bestSnapDistance = snapThresholdSeconds;

    for (const element of this.elements) {
      if (element === draggedElementData) continue;
      if (element.trackIndex !== preferredTrackIndex) continue;

      const elementStart = element.startTime;
      const elementEnd = element.startTime + element.duration;

      // Vérifier proximité avec la bordure gauche (fin du module existant)
      const leftDistance = Math.abs(timePosition - elementEnd);
      if (leftDistance < bestSnapDistance) {
        bestSnapPosition = elementEnd;
        bestSnapDistance = leftDistance;
      }

      // Vérifier proximité avec la bordure droite (début du module existant)
      const rightDistance = Math.abs((timePosition + duration) - elementStart);
      if (rightDistance < bestSnapDistance) {
        bestSnapPosition = elementStart - duration;
        bestSnapDistance = rightDistance;
      }
    }

    // Utiliser la position d'accrochage si elle est disponible
    const finalTimePosition = bestSnapDistance < snapThresholdSeconds ? bestSnapPosition : timePosition;

    // Vérifier si la position finale est disponible sur la piste préférée
    if (this.isTrackAvailableForDuration(finalTimePosition, duration, preferredTrackIndex, draggedElementData)) {
      return { trackIndex: preferredTrackIndex, timePosition: finalTimePosition };
    }

    // Logique de collision normale si pas d'accrochage trouvé ou position occupée
    // Chercher un module existant qui cause la collision sur la piste préférée
    const conflictingElement = this.elements.find(element => {
      if (element === draggedElementData || element.trackIndex !== preferredTrackIndex) return false;
      const startA = finalTimePosition;
      const endA = finalTimePosition + duration;
      const startB = element.startTime;
      const endB = element.startTime + element.duration;
      return startA < endB && endA > startB;
    });

    if (conflictingElement) {
      // Il y a un conflit avec un module existant
      // Essayer les pistes adjacentes (gauche et droite du module existant)
      const conflictingTrack = conflictingElement.trackIndex;

      // Essayer d'abord la piste au-dessus (index plus petit)
      if (conflictingTrack > 0 && this.isTrackAvailableForDuration(finalTimePosition, duration, conflictingTrack - 1, draggedElementData)) {
        return { trackIndex: conflictingTrack - 1, timePosition: finalTimePosition };
      }

      // Puis la piste en-dessous (index plus grand)
      if (conflictingTrack < 7 && this.isTrackAvailableForDuration(finalTimePosition, duration, conflictingTrack + 1, draggedElementData)) {
        return { trackIndex: conflictingTrack + 1, timePosition: finalTimePosition };
      }
    }

    // Si pas de conflit spécifique trouvé ou que les pistes adjacentes ne marchent pas,
    // chercher une piste disponible dans l'ordre de proximité
    const availableTracks = [];
    for (let trackIndex = 0; trackIndex <= 7; trackIndex++) {
      if (this.isTrackAvailableForDuration(finalTimePosition, duration, trackIndex, draggedElementData)) {
        availableTracks.push(trackIndex);
      }
    }

    if (availableTracks.length === 0) {
      return null; // Aucune piste disponible
    }

    // Retourner la piste disponible la plus proche de la piste préférée
    const bestTrackIndex = availableTracks.reduce((closest, current) => {
      const currentDistance = Math.abs(current - preferredTrackIndex);
      const closestDistance = Math.abs(closest - preferredTrackIndex);
      return currentDistance < closestDistance ? current : closest;
    });

    return { trackIndex: bestTrackIndex, timePosition: finalTimePosition };
  }

  /**
   * Vérifie si une piste est disponible sur toute la durée d'un module à une position temporelle donnée
   * @param {number} timePosition - Position temporelle de début en secondes
   * @param {number} duration - Durée du module à placer
   * @param {number} trackIndex - Index de la piste à vérifier (0-7)
   * @param {Object} [excludeElement=null] - Élément à exclure de la vérification (utile pour le drag)
   * @returns {boolean} True si la piste est disponible sur toute la durée
   * @private
   */
  isTrackAvailableForDuration(timePosition, duration, trackIndex, excludeElement = null) {
    // Vérifier si un élément existe déjà sur cette piste pendant toute la durée
    const startA = timePosition;
    const endA = timePosition + duration;

    return !this.elements.some(element => {
      // Ignorer l'élément exclu (utile pour le drag & drop)
      if (element === excludeElement) return false;

      // Vérifier seulement les éléments sur la même piste
      if (element.trackIndex !== trackIndex) return false;

      const startB = element.startTime;
      const endB = element.startTime + element.duration;

      return startA < endB && endA > startB;
    });
  }

  /**
   * Vérifie s'il y a un conflit temporel pour un module donné
   * Un conflit existe si deux actions du même module se chevauchent dans le temps
   * @param {string} moduleId - ID du module à vérifier
   * @param {number} startTime - Temps de début de la nouvelle action
   * @param {number} duration - Durée de la nouvelle action
   * @param {Object} [excludeElement=null] - Élément à exclure de la vérification (utile pour éviter de se comparer à soi-même)
   * @returns {boolean} True s'il y a un conflit, false sinon
   * @private
   */
  hasModuleTimeConflict(moduleId, startTime, duration, excludeElement = null) {
    const endTime = startTime + duration;

    // Vérifier tous les éléments du même module (sauf celui exclu)
    return this.elements.some(element => {
      // Ignorer l'élément exclu (utile pour le drag & drop)
      if (element === excludeElement) return false;

      // Vérifier seulement les éléments du même module
      if (element.moduleData.id !== moduleId) return false;

      const elementStart = element.startTime;
      const elementEnd = element.startTime + element.duration;

      // Vérifier s'il y a un chevauchement temporel
      return startTime < elementEnd && endTime > elementStart;
    });
  }

  /**
   * Trouve la prochaine position temporelle disponible pour un module
   * Suggère automatiquement le prochain créneau libre après la dernière action du module
   * @param {string} moduleId - ID du module
   * @param {number} preferredDuration - Durée souhaitée pour la nouvelle action
   * @param {Object} [excludeElement=null] - Élément à exclure de la vérification de conflit
   * @returns {number|null} Position temporelle suggérée ou null si aucune position trouvée
   * @private
   */
  findNextAvailableTimeForModule(moduleId, preferredDuration, excludeElement = null) {
    // Récupérer toutes les actions du module, triées par temps de début
    // Exclure l'élément en cours de déplacement pour éviter les faux positifs
    const moduleActions = this.elements
      .filter(element => element.moduleData.id === moduleId && element !== excludeElement)
      .sort((a, b) => a.startTime - b.startTime);

    if (moduleActions.length === 0) {
      // Aucun action pour ce module (ou seulement l'élément exclu), suggérer le début (0s)
      return 0;
    }

    // Trouver la première plage libre après chaque action
    for (let i = 0; i < moduleActions.length; i++) {
      const currentAction = moduleActions[i];
      const currentEndTime = currentAction.startTime + currentAction.duration;

      // Vérifier si on peut placer après cette action
      if (!this.hasModuleTimeConflict(moduleId, currentEndTime, preferredDuration, excludeElement)) {
        return currentEndTime;
      }
    }

    // Si aucune plage trouvée entre les actions existantes, placer après la dernière
    const lastAction = moduleActions[moduleActions.length - 1];
    const afterLastAction = lastAction.startTime + lastAction.duration;

    // Vérifier que cette position est disponible
    if (!this.hasModuleTimeConflict(moduleId, afterLastAction, preferredDuration, excludeElement)) {
      return afterLastAction;
    }

    // Si toujours conflit, essayer quelques secondes plus tard (jusqu'à 10s)
    for (let offset = 1; offset <= 10; offset++) {
      const testTime = afterLastAction + offset;
      if (!this.hasModuleTimeConflict(moduleId, testTime, preferredDuration, excludeElement)) {
        return testTime;
      }
    }

    return null; // Aucune position disponible trouvée
  }

  /**
   * Affiche les zones de suggestion de placement pour un module
   * Montre visuellement les positions disponibles pour éviter les conflits
   * @param {string} moduleId - ID du module pour lequel afficher les suggestions
   * @param {number} duration - Durée de l'action à placer
   * @param {Object} [excludeElement=null] - Élément à exclure des vérifications de conflit
   * @returns {void}
   * @private
   */
  showPlacementSuggestions(moduleId, duration, excludeElement = null) {
    // Supprimer les suggestions précédentes
    this.hidePlacementSuggestions();

    // Trouver les positions suggérées
    const suggestedTime = this.findNextAvailableTimeForModule(moduleId, duration, excludeElement);

    if (suggestedTime !== null) {
      // Créer une zone de suggestion visuelle
      const zone = document.createElement('div');
      zone.className = 'placement-zone suggestion';

      // Calculer la position et largeur de la zone
      const pixelStart = this.timeToPixel(suggestedTime);
      const pixelEnd = this.timeToPixel(suggestedTime + duration);

      zone.style.left = `${pixelStart}px`;
      zone.style.width = `${pixelEnd - pixelStart}px`;

      // Ajouter au track
      this.track.appendChild(zone);

      // Stocker la référence pour pouvoir la supprimer plus tard
      this.currentPlacementZone = zone;
    }
  }

  /**
   * Masque les zones de suggestion de placement
   * @returns {void}
   * @private
   */
  hidePlacementSuggestions() {
    if (this.currentPlacementZone) {
      this.currentPlacementZone.remove();
      this.currentPlacementZone = null;
    }
  }

  /**
   * Affiche l'indicateur de temps pendant le drag & drop
   * @param {number} timePosition - Position temporelle en secondes
   * @param {number} mouseX - Position X de la souris
   * @param {number} mouseY - Position Y de la souris
   * @returns {void}
   * @private
   */
  showDragTimeIndicator(timePosition, mouseX, mouseY) {
    if (!this.dragTimeIndicator) {
      this.dragTimeIndicator = document.createElement('div');
      this.dragTimeIndicator.className = 'drag-time-indicator';
      this.dragTimeIndicator.style.position = 'fixed';
      this.dragTimeIndicator.style.pointerEvents = 'none';
      this.dragTimeIndicator.style.zIndex = '1000';
      this.dragTimeIndicator.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
      this.dragTimeIndicator.style.color = 'white';
      this.dragTimeIndicator.style.padding = '4px 8px';
      this.dragTimeIndicator.style.borderRadius = '4px';
      this.dragTimeIndicator.style.fontSize = '12px';
      this.dragTimeIndicator.style.fontWeight = 'bold';
      this.dragTimeIndicator.style.whiteSpace = 'nowrap';
      document.body.appendChild(this.dragTimeIndicator);
    }

    // Mettre à jour le texte et la position
    this.dragTimeIndicator.textContent = `Temps: ${this.formatTime(timePosition)}`;
    this.dragTimeIndicator.style.left = `${mouseX + 15}px`;
    this.dragTimeIndicator.style.top = `${mouseY - 30}px`;
    this.dragTimeIndicator.style.display = 'block';
  }

  /**
   * Masque l'indicateur de temps du drag & drop
   * @returns {void}
   * @private
   */
  hideDragTimeIndicator() {
    if (this.dragTimeIndicator) {
      this.dragTimeIndicator.style.display = 'none';
    }
  }

  // ================================================================================
  // GESTION DES ÉLÉMENTS DE TIMELINE
  // ================================================================================

  /**
   * Ajoute un élément module à la timeline à une position donnée
   * Crée l'élément DOM et configure ses propriétés par défaut
   * @param {Object} moduleData - Données du module à ajouter
   * @param {number} x - Position X en pixels
   * @param {number} trackIndex - Index de la piste (0-7)
   * @param {boolean} [triggerAutoSave=true] - Si true, déclenche l'auto-sauvegarde après ajout
   * @returns {void}
   * @public
   */
  addElementToTimeline(moduleData, x, trackIndex, triggerAutoSave = true) {
    const timePosition = Math.max(0, this.pixelToTime(x));
    const moduleConfig = this.getModuleConfig(moduleData.type);
    const defaultAction = Object.keys(moduleConfig.actions)[0];
    const defaultDuration = moduleConfig.actions[defaultAction].duration.default;

    const element = document.createElement('div');
    element.className = `timeline-action ${moduleData.type} visible`;
    element.dataset.moduleId = moduleData.id;
    element.dataset.moduleType = moduleData.type;
    element.dataset.actionType = defaultAction;
    element.dataset.startTime = timePosition.toFixed(2);
    element.dataset.duration = defaultDuration.toString();
    element.dataset.trackIndex = trackIndex.toString();

    this.positionElement(element, timePosition, defaultDuration, trackIndex);

    // Vérifier si la durée peut être modifiée (min != max)
    const actionConfig = moduleConfig.actions[defaultAction];
    const canResize = actionConfig && actionConfig.duration && actionConfig.duration.min !== actionConfig.duration.max;

    element.innerHTML = `
      <div class="element-header">
        <div class="element-icon">${moduleConfig.icon}</div>
        <div class="element-name">${moduleData.name}</div>
      </div>
      <div class="element-action">${moduleConfig.actions[defaultAction].name}</div>
      <div class="element-footer">
        <div class="element-module-id">${moduleData.id}</div>
        <div class="element-duration">${this.formatTime(defaultDuration)}</div>
      </div>
      <div class="status-dot" aria-hidden="true"></div>
      ${canResize ? '<div class="resize-handle resize-left" data-resize="left"></div>' : ''}
      ${canResize ? '<div class="resize-handle resize-right" data-resize="right"></div>' : ''}
    `;

    // Events
    element.addEventListener('click', e => {
      e.stopPropagation();
      
      // Ne pas ouvrir la modale si c'était un drag ou un resize récent
      if (this.wasDragging || this.wasResizing) {
        this.wasDragging = false;
        this.wasResizing = false;
        return;
      }
      
      this.selectElement(element);
      this.openConfig(element);
    });

    element.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
      
      // Vérifier si on clique sur une poignée de redimensionnement
      const resizeHandle = e.target.closest('.resize-handle');
      if (resizeHandle) {
        this.startResize(element, resizeHandle, e);
        return;
      }
      
      // Marquer le début du drag potentiel
      this.dragStartTime = Date.now();
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.wasDragging = false;
      
      this.startDrag(element, e);
    });

    this.track.appendChild(element);
    // set initial online/offline class on the action card
    if (moduleData.isOnline) {
      element.classList.add('online');
      element.classList.remove('offline');
    } else {
      element.classList.add('offline');
      element.classList.remove('online');
    }

    // Also set initial classes on the status-dot
    const dot = element.querySelector('.status-dot');
    if (dot) {
      if (moduleData.isOnline) {
        dot.classList.add('online');
        dot.classList.remove('offline');
      } else {
        dot.classList.add('offline');
        dot.classList.remove('online');
      }
    }
    this.elements.push({
      element: element,
      moduleData: moduleData,
      startTime: timePosition,
      duration: defaultDuration,
      actionType: defaultAction,
      actionParams: {},
      trackIndex: trackIndex,
    });

    // Repositionner l'élément avec le scroll offset actuel
    this.updateElementInViewport(this.elements[this.elements.length - 1]);

    this.hideInstructions();

    // Déclencher l'auto-sauvegarde seulement si demandé
    if (triggerAutoSave) {
      this.triggerAutoSave();
    }
  }

  positionElement(element, startTime, duration, trackIndex) {
    // Stocker les données temporelles sur l'élément
    element.dataset.startTime = startTime;
    element.dataset.duration = duration;
    element.dataset.trackIndex = trackIndex;

    // Trouver l'élément dans notre liste pour le mettre à jour
    const elementData = this.elements.find(e => e.element === element);
    if (elementData) {
      elementData.startTime = startTime;
      elementData.duration = duration;
      elementData.trackIndex = trackIndex;
      this.updateElementInViewport(elementData);
    }

    // Position verticale basée sur la piste (sans scroll offset pour le positionnement initial)
    const trackHeight = this.track.offsetHeight - 60; // Hauteur disponible (sans la règle)
    const laneHeight = trackHeight / 8; // 8 pistes
    const baseTop = 60 + (trackIndex * laneHeight) + 5; // +5px pour un petit padding

    element.style.top = `${baseTop}px`;
    element.style.height = `${laneHeight - 10}px`; // -10px pour le padding
  }

  updateElementPositions() {
    // Cette méthode n'est plus nécessaire car updateZoom() gère déjà les positions
  }

  /**
   * Récupère la configuration d'un type de module
   * @param {string} moduleType - Type du module
   * @returns {Object} Configuration du module ou configuration générique
   * @private
   */
  getModuleConfig(moduleType) {
    return MODULE_CONFIGS[moduleType] || {
      name: 'Module inconnu',
      icon: '❓',
      color: '#666666',
      actions: {
        unknown: {
          name: 'Action inconnue',
          duration: { min: 1, max: 10, default: 1 },
          params: {},
        },
      },
    };
  }

  /**
   * Sélectionne un élément de timeline et désélectionne les autres
   * @param {HTMLElement} element - Élément à sélectionner
   * @returns {void}
   * @public
   */
  selectElement(element) {
    document
      .querySelectorAll('.timeline-action.selected, .timeline-element.selected')
      .forEach(el => {
        el.classList.remove('selected');
      });
    element.classList.add('selected');
    this.selectedElement = element;
  }

  // ================================================================================
  // CONFIGURATION DES MODULES
  // ================================================================================

  /**
   * Ouvre la fenêtre de configuration pour un élément de timeline
   * Affiche une modale avec les paramètres configurables du module
   * @param {HTMLElement} element - Élément à configurer
   * @returns {void}
   * @public
   */
  openConfig(element) {
    const timelineElement = this.elements.find(e => e.element === element);
    if (!timelineElement) return;

    const existingModal = document.querySelector('.action-config-modal');
    if (existingModal) existingModal.remove();

    const moduleType = timelineElement.element.dataset.moduleType;
    const actionType = timelineElement.element.dataset.actionType;
    const moduleConfig = this.getModuleConfig(moduleType);

    const modal = document.createElement('div');
    modal.className = 'action-config-modal';
    modal.innerHTML = `
      <div class="action-config-content">
        <div class="config-section">
          <h3>${moduleConfig.icon} ${timelineElement.moduleData.name}</h3>
          <div class="config-row">
            <label class="config-label">Action</label>
            <select class="config-select" id="actionTypeSelect">
              ${Object.entries(moduleConfig.actions)
                .map(
                  ([key, action]) =>
                    `<option value="${key}" ${key === actionType ? 'selected' : ''}>${action.name}</option>`
                )
                .join('')}
            </select>
          </div>
        </div>

        <div class="config-section" id="actionConfigContainer">
          ${this.generateActionConfigUI(moduleType, actionType, {
            startTime: parseFloat(timelineElement.element.dataset.startTime),
            duration: parseFloat(timelineElement.element.dataset.duration),
            ...timelineElement.actionParams,
          }, timelineElement.element.dataset.moduleId)}
        </div>

        <div class="config-section">
          <div style="display: flex; gap: 10px; justify-content: space-between;">
            <button class="control-btn delete-btn" id="deleteElement" style="background-color: #ff4757; color: white; border: none;">Supprimer</button>
            <div style="display: flex; gap: 10px;">
              <button class="control-btn" id="cancelConfig">Annuler</button>
              <button class="btn btn-primary" id="saveConfig">Sauvegarder</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Events
    modal.querySelector('#cancelConfig').addEventListener('click', () => modal.remove());
    modal
      .querySelector('#deleteElement')
      .addEventListener('click', () => {
        this.deleteElement(timelineElement.element);
        modal.remove();
      });
    modal
      .querySelector('#saveConfig')
      .addEventListener('click', () => this.saveConfig(timelineElement, modal));
    modal.querySelector('#actionTypeSelect').addEventListener('change', e => {
      const container = modal.querySelector('#actionConfigContainer');
      container.innerHTML = this.generateActionConfigUI(moduleType, e.target.value, {
        startTime: parseFloat(timelineElement.element.dataset.startTime),
        duration: parseFloat(timelineElement.element.dataset.duration),
      }, timelineElement.element.dataset.moduleId);
    });
    modal.addEventListener('click', e => {
      if (e.target === modal) modal.remove();
    });

    // Mise à jour temps réel des ranges
    modal.addEventListener('input', e => {
      if (e.target.classList.contains('config-range')) {
        const valueSpan = e.target.parentElement.querySelector('.range-value');
        if (valueSpan) valueSpan.textContent = e.target.value;
      }
    });

    // Validation des décimales pour les inputs numériques
    modal.addEventListener('input', e => {
      if (e.target.type === 'number' && e.target.classList.contains('config-input')) {
        const value = parseFloat(e.target.value);
        if (!isNaN(value)) {
          // Arrondir à 2 décimales maximum
          const roundedValue = Math.round(value * 100) / 100;
          if (roundedValue !== value) {
            e.target.value = roundedValue;
          }
        }
      }
    });
  }

  /**
   * Génère l'interface de configuration pour une action de module
   * Crée dynamiquement les contrôles de configuration selon le type d'action
   * @param {string} moduleType - Type du module
   * @param {string} actionType - Type d'action à configurer
   * @param {Object} [currentValues={}] - Valeurs actuelles des paramètres
   * @param {string} [moduleId=null] - ID du module pour les paramètres dépendants du module
   * @returns {string} HTML de l'interface de configuration
   * @private
   */
  generateActionConfigUI(moduleType, actionType, currentValues = {}, moduleId = null) {
    const config = this.getModuleConfig(moduleType);
    if (!config || !config.actions[actionType]) return '';

    const action = config.actions[actionType];
    let html = `<div class="action-config-section">`;

    // Temps de début (toujours modifiable)
    const currentStartTime = currentValues.startTime !== undefined ? currentValues.startTime : 0;
    html += `<div class="config-row">
      <label class="config-label">Temps de début (secondes)</label>
      <input type="number" class="config-input start-time-input" name="startTime"
             min="0" max="3600" step="0.01"
             value="${currentStartTime}">
    </div>`;

    // N'afficher la durée que si elle peut être modifiée (min != max)
    if (action.duration.min !== action.duration.max) {
      html += `<div class="config-row">
        <label class="config-label">Durée (secondes)</label>
        <input type="number" class="config-input duration-input" name="duration"
               min="${action.duration.min}" max="${action.duration.max}" step="0.01"
               value="${currentValues.duration || action.duration.default}">
      </div>`;
    }

    // Paramètres spécifiques
    Object.entries(action.params).forEach(([paramName, paramConfig]) => {
      html += this.generateParameterInput(paramName, paramConfig, currentValues[paramName], moduleId);
    });

    html += `</div>`;
    return html;
  }

  /**
   * Génère un champ de saisie pour un paramètre de configuration
   * Crée le contrôle approprié selon le type de paramètre
   * @param {string} paramName - Nom du paramètre
   * @param {Object} config - Configuration du paramètre
   * @param {*} [currentValue=null] - Valeur actuelle du paramètre
   * @param {string} [moduleId=null] - ID du module pour les paramètres dépendants du module
   * @returns {string} HTML du champ de saisie
   * @private
   */
  generateParameterInput(paramName, config, currentValue = null, moduleId = null) {
    const value = currentValue !== null ? currentValue : config.default;
    let html = `<div class="config-row">
                  <label class="config-label">${config.label || paramName}</label>`;

    switch (config.type) {
      case 'audio_file_select':
        // Vérifier si le module est en ligne
        const moduleElement = document.querySelector(`.module-item[data-module-id="${moduleId}"]`);
        const isOnline = moduleElement && moduleElement.classList.contains('online');

        if (isOnline) {
          // Module en ligne - récupérer la liste des fichiers
          const fileId = `audio-files-${moduleId}-${Date.now()}`;
          let selectHtml = `<select class="config-select audio-file-select" name="${paramName}" id="${fileId}" data-module-id="${moduleId}" data-current-value="${value}">
            <option value="">Chargement...</option>`;
          
          // Si on a déjà une valeur, l'ajouter comme option temporaire
          if (value) {
            selectHtml += `<option value="${value}" selected>${value}</option>`;
          }
          
          selectHtml += `</select>`;
          html += selectHtml;

          // Vérifier le cache avant d'envoyer une requête
          const cachedData = this.audioFileCache[moduleId];
          const CACHE_DURATION = 10000; // 10 secondes
          const now = Date.now();

          if (cachedData && (now - cachedData.timestamp) < CACHE_DURATION) {
            // Utiliser les données du cache
            setTimeout(() => {
              this.populateAudioFileSelect(moduleId, cachedData.files);
            }, 50); // Petit délai pour laisser le DOM se mettre à jour
          } else {
            // Envoyer une nouvelle requête
            setTimeout(() => {
              if (window.socket && window.socket.connected) {
                window.socket.emit('send_module_command', {
                  moduleId: moduleId,
                  command: 'audio_list_request',
                  params: {}
                });
              }
            }, 100);
          }
        } else {
          // Module hors ligne
          html += `<div class="offline-message">
            <span class="offline-text">Module hors ligne - Connectez le module pour sélectionner un fichier audio</span>
            <input type="hidden" name="${paramName}" value="${value}">
          </div>`;
        }
        break;
      case 'range':
        html += `<div class="range-container">
          <input type="range" class="config-range" name="${paramName}"
                 min="${config.min}" max="${config.max}" step="${config.step || 1}" value="${value}">
          <span class="range-value">${value}</span>
        </div>`;
        break;
      case 'boolean':
        html += `<label class="checkbox-container">
          <input type="checkbox" class="config-checkbox" name="${paramName}" ${value ? 'checked' : ''}>
          <span class="checkmark"></span>
        </label>`;
        break;
      case 'select':
        html += `<select class="config-select" name="${paramName}">
          ${config.options.map(option => `<option value="${option}" ${option === value ? 'selected' : ''}>${option}</option>`).join('')}
        </select>`;
        break;
      case 'color':
        html += `<input type="color" class="config-color" name="${paramName}" value="${value}">`;
        break;
      default:
        html += `<input type="number" class="config-input" name="${paramName}" value="${value}" step="${config.step || 1}" min="${config.min || ''}" max="${config.max || ''}">`;
    }

    html += `</div>`;
    return html;
  }

  /**
   * Sauvegarde la configuration d'un élément de timeline
   * Met à jour les paramètres et l'affichage de l'élément
   * @param {Object} timelineElement - Élément de timeline à configurer
   * @param {HTMLElement} modal - Modale de configuration
   * @returns {void}
   * @public
   */
  saveConfig(timelineElement, modal) {
    const actionType = modal.querySelector('#actionTypeSelect').value;
    const startTimeInput = modal.querySelector('.start-time-input');
    const durationInput = modal.querySelector('.duration-input');

    const startTime = startTimeInput ? parseFloat(startTimeInput.value) : parseFloat(timelineElement.element.dataset.startTime);
    const duration = durationInput ? parseFloat(durationInput.value) : timelineElement.duration;

    const actionParams = {};
    modal
      .querySelectorAll(
        '.config-input, .config-range, .config-select, .config-checkbox, .config-color'
      )
      .forEach(input => {
        if (input.name && input.name !== 'startTime' && input.name !== 'duration') {
          if (input.type === 'checkbox') {
            actionParams[input.name] = input.checked;
          } else if (input.type === 'number' || input.type === 'range') {
            actionParams[input.name] = parseFloat(input.value);
          } else {
            actionParams[input.name] = input.value;
          }
        }
      });

    // Mise à jour
    timelineElement.element.dataset.actionType = actionType;
    timelineElement.element.dataset.startTime = startTime.toFixed(2);
    timelineElement.element.dataset.duration = duration.toString();
    timelineElement.actionType = actionType;
    timelineElement.startTime = startTime;
    timelineElement.duration = duration;
    timelineElement.actionParams = actionParams;

    const moduleConfig = this.getModuleConfig(timelineElement.element.dataset.moduleType);
    const actionConfig = moduleConfig.actions[actionType];

    timelineElement.element.querySelector('.element-duration').textContent = this.formatTime(duration);
    
    // Construire le texte de l'action avec le nom du fichier audio si applicable
    let actionText = actionConfig.name;
    if (timelineElement.element.dataset.moduleType === 'Audio Player' && actionParams.filename) {
      actionText = `${actionConfig.name} - ${actionParams.filename}`;
    }
    timelineElement.element.querySelector('.element-action').textContent = actionText;

    const trackIndex = parseInt(timelineElement.element.dataset.trackIndex) || 0;
    this.positionElement(timelineElement.element, startTime, duration, trackIndex);

    modal.remove();

    // Déclencher l'auto-sauvegarde
    this.triggerAutoSave();
  }

  /**
   * Initie le déplacement d'un élément par glisser-déposer
   * Gère le drag & drop interactif des éléments sur la timeline
   * @param {HTMLElement} element - Élément à déplacer
   * @param {MouseEvent} e - Événement de souris déclencheur
   * @returns {void}
   * @public
   */
  startDrag(element, e) {
    this.draggedElement = element;
    this.selectElement(element);

    // Ajouter une classe visuelle pendant le drag
    element.classList.add('dragging');

    const rect = element.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    // Stocker la position d'origine pour pouvoir revenir en arrière en cas de conflit
    const originalStartTime = parseFloat(element.dataset.startTime);
    const originalDuration = parseFloat(element.dataset.duration);
    const originalTrackIndex = parseInt(element.dataset.trackIndex);

    let hasMoved = false;
    let conflictIndicator = null;

    const handleMouseMove = e => {
      if (!this.draggedElement) return;

      e.preventDefault();

      // Si on n'a pas encore détecté de mouvement, vérifier la distance
      if (!hasMoved) {
        const deltaX = Math.abs(e.clientX - this.dragStartX);
        const deltaY = Math.abs(e.clientY - this.dragStartY);
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        
        // Si la distance est suffisante, c'est un drag
        if (distance > 5) { // 5px de tolérance
          hasMoved = true;
          this.isPotentialDrag = false; // Ce n'est plus un potentiel clic
        }
      }

      if (hasMoved) {
        const trackRect = this.track.getBoundingClientRect();
        const x = e.clientX - trackRect.left - offsetX;
        const y = e.clientY - trackRect.top - offsetY;

        const timePosition = Math.max(0, this.pixelToTime(x));
        const preferredTrackIndex = this.getTrackIndexFromY(y + 60); // +60 pour compenser la règle

        // Trouver la meilleure piste disponible pour éviter les collisions
        const bestPosition = this.findBestTrackForDrag(timePosition, preferredTrackIndex, this.draggedElement);

        if (bestPosition !== null) {
          // Mise à jour position avec la piste optimale et position temporelle ajustée
          const duration = parseFloat(this.draggedElement.dataset.duration);
          this.positionElement(this.draggedElement, bestPosition.timePosition, duration, bestPosition.trackIndex);
          this.draggedElement.dataset.startTime = bestPosition.timePosition.toFixed(2);
          this.draggedElement.dataset.trackIndex = bestPosition.trackIndex.toString();

          // Mise à jour données
          const elementData = this.elements.find(e => e.element === this.draggedElement);
          if (elementData) {
            elementData.startTime = bestPosition.timePosition;
            elementData.trackIndex = bestPosition.trackIndex;
          }

          // Validation des conflits temporels pour le même module
          // Utiliser la position snappée pour la détection de conflit
          const moduleId = this.draggedElement.dataset.moduleId;
          const hasConflict = this.hasModuleTimeConflict(moduleId, bestPosition.timePosition, duration, elementData);

          // Supprimer les indicateurs précédents
          if (conflictIndicator) {
            conflictIndicator.remove();
            conflictIndicator = null;
          }

          // Supprimer les classes de feedback précédentes
          this.draggedElement.classList.remove('conflict', 'valid-placement', 'suggestion-highlight');

          if (hasConflict) {
            // Conflit détecté - feedback visuel rouge
            this.draggedElement.classList.add('conflict');

            // Ajouter un indicateur de conflit
            conflictIndicator = document.createElement('div');
            conflictIndicator.className = 'conflict-indicator';
            conflictIndicator.textContent = 'Conflit temporel';
            this.draggedElement.appendChild(conflictIndicator);

            // Afficher les zones de suggestion de placement
            this.showPlacementSuggestions(moduleId, duration, elementData);
          } else {
            // Pas de conflit - feedback visuel vert
            this.draggedElement.classList.add('valid-placement');

            // Masquer les suggestions puisqu'on est dans une position valide
            this.hidePlacementSuggestions();
          }

          // Afficher l'indicateur de temps pendant le drag
          this.showDragTimeIndicator(bestPosition.timePosition, e.clientX, e.clientY);
        }
        // Si aucune piste disponible, ne rien faire (garder la position actuelle)
      }
    };

    const handleMouseUp = () => {
      if (this.draggedElement) {
        this.draggedElement.classList.remove('dragging');
      }
      
      // Vérifier s'il y a un conflit à la position finale
      const elementData = this.elements.find(e => e.element === this.draggedElement);
      if (elementData && hasMoved) {
        const moduleId = this.draggedElement.dataset.moduleId;
        const currentTimePosition = parseFloat(this.draggedElement.dataset.startTime);
        const duration = parseFloat(this.draggedElement.dataset.duration);
        
        const hasConflict = this.hasModuleTimeConflict(moduleId, currentTimePosition, duration, elementData);
        
        if (hasConflict) {
          // Conflit détecté - remettre à la position d'origine
          this.positionElement(this.draggedElement, originalStartTime, originalDuration, originalTrackIndex);
          this.draggedElement.dataset.startTime = originalStartTime.toFixed(2);
          this.draggedElement.dataset.trackIndex = originalTrackIndex.toString();
          
          // Remettre à jour les données
          elementData.startTime = originalStartTime;
          elementData.trackIndex = originalTrackIndex;
          
          // Afficher un toast d'erreur
          window.showToast?.('Déplacement annulé : conflit temporel avec une action existante du même module', 'error', 3000);
        }
      }
      
      // Supprimer les indicateurs de feedback
      if (conflictIndicator) {
        conflictIndicator.remove();
      }

      // Supprimer les classes de feedback
      this.draggedElement.classList.remove('conflict', 'valid-placement', 'suggestion-highlight');

      // Masquer les zones de suggestion
      this.hidePlacementSuggestions();
      
      // Si on a bougé, marquer que c'était un drag
      if (hasMoved) {
        this.wasDragging = true;
      }
      
      this.draggedElement = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      // Masquer l'indicateur de temps
      this.hideDragTimeIndicator();

      // Déclencher l'auto-sauvegarde seulement si on a vraiment bougé et pas de conflit
      if (hasMoved && elementData) {
        const currentTimePosition = parseFloat(this.draggedElement?.dataset.startTime || '0');
        const hasFinalConflict = this.hasModuleTimeConflict(
          this.draggedElement?.dataset.moduleId || '', 
          currentTimePosition, 
          parseFloat(this.draggedElement?.dataset.duration || '0'), 
          elementData
        );
        
        if (!hasFinalConflict) {
          this.triggerAutoSave();
        }
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  /**
   * Initie le redimensionnement d'un élément par ses poignées
   * Gère le redimensionnement interactif des éléments sur la timeline
   * @param {HTMLElement} element - Élément à redimensionner
   * @param {HTMLElement} resizeHandle - Poignée de redimensionnement cliquée
   * @param {MouseEvent} e - Événement de souris déclencheur
   * @returns {void}
   * @public
   */
  startResize(element, resizeHandle, e) {
    // Vérifier si le redimensionnement est autorisé pour cet élément
    const elementData = this.elements.find(e => e.element === element);
    if (elementData) {
      const moduleConfig = this.getModuleConfig(elementData.moduleData.type);
      const actionConfig = moduleConfig.actions[elementData.actionType];
      const canResize = actionConfig && actionConfig.duration && actionConfig.duration.min !== actionConfig.duration.max;
      
      if (!canResize) {
        // Durée fixe - empêcher le redimensionnement
        window.showToast?.('La durée de cette action est fixe et ne peut pas être modifiée', 'warning', 2000);
        return;
      }
    }

    this.resizingElement = element;
    this.resizeHandle = resizeHandle;
    this.resizeType = resizeHandle.dataset.resize; // 'left' ou 'right'
    this.selectElement(element);

    // Ajouter une classe visuelle pendant le redimensionnement
    element.classList.add('resizing');

    const startX = e.clientX;
    const originalStartTime = parseFloat(element.dataset.startTime);
    const originalDuration = parseFloat(element.dataset.duration);
    const originalEndTime = originalStartTime + originalDuration;

    // Créer l'indicateur de temps pour le redimensionnement
    this.showResizeTimeIndicator();

    let conflictIndicator = null;

    const handleMouseMove = e => {
      if (!this.resizingElement) return;

      e.preventDefault();

      const deltaX = e.clientX - startX;
      const deltaTime = this.pixelToTime(deltaX) - this.pixelToTime(0);

      let newStartTime = originalStartTime;
      let newDuration = originalDuration;

      if (this.resizeType === 'left') {
        // Redimensionnement depuis la gauche - changer le temps de début
        newStartTime = Math.max(0, originalStartTime + deltaTime);
        newDuration = originalEndTime - newStartTime;
        // Appliquer le snapping au nouveau temps de début
        newStartTime = this.snapToNearestRoundTime(newStartTime);
        newDuration = originalEndTime - newStartTime;
      } else if (this.resizeType === 'right') {
        // Redimensionnement depuis la droite - changer la durée
        newDuration = Math.max(0.1, originalDuration + deltaTime);
        // Appliquer le snapping à la nouvelle durée
        newDuration = this.snapToNearestRoundTime(newDuration);
      }

      // Appliquer les contraintes de durée du module
      const elementData = this.elements.find(e => e.element === element);
      if (elementData) {
        const moduleConfig = this.getModuleConfig(elementData.moduleData.type);
        const actionConfig = moduleConfig.actions[elementData.actionType];
        if (actionConfig && actionConfig.duration) {
          newDuration = Math.max(actionConfig.duration.min, Math.min(actionConfig.duration.max, newDuration));
        }
      }

      // Vérifier les conflits temporels pour le même module
      const moduleId = element.dataset.moduleId;
      const hasConflict = this.hasModuleTimeConflict(moduleId, newStartTime, newDuration, elementData);

      // Supprimer l'indicateur de conflit précédent
      if (conflictIndicator) {
        conflictIndicator.remove();
        conflictIndicator = null;
      }

      // Supprimer les classes de feedback précédentes
      element.classList.remove('conflict', 'valid-placement');

      if (hasConflict) {
        // Conflit détecté - feedback visuel rouge
        element.classList.add('conflict');

        // Ajouter un indicateur de conflit
        conflictIndicator = document.createElement('div');
        conflictIndicator.className = 'conflict-indicator';
        conflictIndicator.textContent = 'Conflit temporel';
        element.appendChild(conflictIndicator);
      } else {
        // Pas de conflit - feedback visuel vert
        element.classList.add('valid-placement');
      }

      // Mettre à jour l'élément
      this.positionElement(element, newStartTime, newDuration, parseInt(element.dataset.trackIndex));

      // Mettre à jour l'indicateur de temps
      this.updateResizeTimeIndicator(newStartTime, newDuration);

      // Mettre à jour le texte de durée dans l'élément
      const durationElement = element.querySelector('.element-duration');
      if (durationElement) {
        durationElement.textContent = this.formatTime(newDuration);
      }

      // Mettre à jour les données
      element.dataset.startTime = newStartTime.toFixed(2);
      element.dataset.duration = newDuration.toString();

      const resizingElementData = this.elements.find(e => e.element === this.resizingElement);
      if (resizingElementData) {
        resizingElementData.startTime = newStartTime;
        resizingElementData.duration = newDuration;
      }
    };

    const handleMouseUp = () => {
      if (this.resizingElement) {
        this.resizingElement.classList.remove('resizing');
      }
      
      // Vérifier s'il y a un conflit à la taille finale
      const elementData = this.elements.find(e => e.element === this.resizingElement);
      if (elementData) {
        const moduleId = this.resizingElement.dataset.moduleId;
        const currentStartTime = parseFloat(this.resizingElement.dataset.startTime);
        const currentDuration = parseFloat(this.resizingElement.dataset.duration);
        
        const hasConflict = this.hasModuleTimeConflict(moduleId, currentStartTime, currentDuration, elementData);
        
        if (hasConflict) {
          // Conflit détecté - remettre à la taille d'origine
          this.positionElement(this.resizingElement, originalStartTime, originalDuration, parseInt(this.resizingElement.dataset.trackIndex));
          this.resizingElement.dataset.startTime = originalStartTime.toFixed(2);
          this.resizingElement.dataset.duration = originalDuration.toString();
          
          // Remettre à jour les données
          elementData.startTime = originalStartTime;
          elementData.duration = originalDuration;
          
          // Afficher un toast d'erreur
          window.showToast?.('Redimensionnement annulé : conflit temporel avec une action existante du même module', 'error', 3000);
        }
      }
      
      // Supprimer l'indicateur de conflit
      if (conflictIndicator) {
        conflictIndicator.remove();
      }

      // Supprimer les classes de feedback
      this.resizingElement.classList.remove('conflict', 'valid-placement');
      
      // Marquer que c'était un resize
      this.wasResizing = true;
      
      this.resizingElement = null;
      this.resizeHandle = null;
      this.resizeType = null;

      this.hideResizeTimeIndicator();

      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      // Déclencher l'auto-sauvegarde seulement si pas de conflit final
      if (elementData) {
        const currentStartTime = parseFloat(this.resizingElement?.dataset.startTime || '0');
        const currentDuration = parseFloat(this.resizingElement?.dataset.duration || '0');
        const hasFinalConflict = this.hasModuleTimeConflict(
          this.resizingElement?.dataset.moduleId || '', 
          currentStartTime, 
          currentDuration, 
          elementData
        );
        
        if (!hasFinalConflict) {
          this.triggerAutoSave();
        }
      }
    };    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  /**
   * Affiche l'indicateur de temps pendant le redimensionnement
   * @returns {void}
   * @private
   */
  showResizeTimeIndicator() {
    if (!this.resizeTimeIndicator) {
      this.resizeTimeIndicator = document.createElement('div');
      this.resizeTimeIndicator.className = 'resize-time-indicator';
      this.resizeTimeIndicator.style.position = 'fixed';
      this.resizeTimeIndicator.style.pointerEvents = 'none';
      this.resizeTimeIndicator.style.zIndex = '1000';
      this.resizeTimeIndicator.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
      this.resizeTimeIndicator.style.color = 'white';
      this.resizeTimeIndicator.style.padding = '4px 8px';
      this.resizeTimeIndicator.style.borderRadius = '4px';
      this.resizeTimeIndicator.style.fontSize = '12px';
      this.resizeTimeIndicator.style.fontWeight = 'bold';
      this.resizeTimeIndicator.style.whiteSpace = 'nowrap';
      document.body.appendChild(this.resizeTimeIndicator);
    }

    this.resizeTimeIndicator.style.display = 'block';
  }

  /**
   * Met à jour l'indicateur de temps pendant le redimensionnement
   * @param {number} startTime - Nouveau temps de début
   * @param {number} duration - Nouvelle durée
   * @returns {void}
   * @private
   */
  updateResizeTimeIndicator(startTime, duration) {
    if (!this.resizeTimeIndicator) return;

    const endTime = startTime + duration;
    this.resizeTimeIndicator.textContent = `Début: ${this.formatTime(startTime)} | Fin: ${this.formatTime(endTime)} | Durée: ${this.formatTime(duration)}`;

    // Positionner l'indicateur près de la souris
    const mouseEvent = window.event;
    if (mouseEvent) {
      this.resizeTimeIndicator.style.left = `${mouseEvent.clientX + 15}px`;
      this.resizeTimeIndicator.style.top = `${mouseEvent.clientY - 30}px`;
    }
  }

  /**
   * Masque l'indicateur de temps du redimensionnement
   * @returns {void}
   * @private
   */
  hideResizeTimeIndicator() {
    if (this.resizeTimeIndicator) {
      this.resizeTimeIndicator.style.display = 'none';
    }
  }

  /**
   * Masque l'indicateur de temps du drag & drop
   * @returns {void}
   * @private
   */
  hideDragTimeIndicator() {
    if (this.dragTimeIndicator) {
      this.dragTimeIndicator.style.display = 'none';
    }
  }

  /**
   * Gère les clics sur la piste de timeline
   * Désélectionne les éléments si clic sur zone vide
   * @param {MouseEvent} e - Événement de clic
   * @returns {void}
   * @public
   */
  handleTrackClick(e) {
    if (e.target === this.track) {
      this.clearSelection();
    }
  }

  /**
   * Gère les raccourcis clavier de la timeline
   * Supprime l'élément sélectionné avec la touche Delete
   * @param {KeyboardEvent} e - Événement clavier
   * @returns {void}
   * @public
   */
  handleKeyDown(e) {
    if (e.key === 'Delete' && this.selectedElement) {
      this.deleteElement(this.selectedElement);
    }
  }

  /**
   * Gère le relâchement des touches
   * @param {KeyboardEvent} e - Événement clavier
   * @returns {void}
   * @public
   */
  handleKeyUp(e) {
    // Pas de logique spécifique pour le relâchement des touches
  }

  /**
   * Supprime un élément de la timeline
   * Retire l'élément du DOM et met à jour les données internes
   * @param {HTMLElement} element - Élément à supprimer
   * @returns {void}
   * @public
   */
  deleteElement(element) {
    element.remove();
    this.elements = this.elements.filter(e => e.element !== element);
    this.selectedElement = null;

    if (this.elements.length === 0) {
      this.showInstructions();
    }

    // Déclencher l'auto-sauvegarde
    this.triggerAutoSave();
  }

  /**
   * Désélectionne tous les éléments de la timeline
   * Retire les classes de sélection et remet à zéro la sélection active
   * @returns {void}
   * @public
   */
  clearSelection() {
    document
      .querySelectorAll('.timeline-action.selected, .timeline-element.selected')
      .forEach(el => {
        el.classList.remove('selected');
      });
    this.selectedElement = null;
  }

  /**
   * Masque les instructions de démarrage de la timeline
   * @returns {void}
   * @public
   */
  hideInstructions() {
    if (this.instructions) this.instructions.style.display = 'none';
  }

  /**
   * Affiche les instructions de démarrage de la timeline
   * @returns {void}
   * @public
   */
  showInstructions() {
    if (this.instructions) this.instructions.style.display = 'block';
  }

  /**
   * Lance la lecture de la séquence depuis le début
   * Réinitialise le temps et lance la lecture
   * @returns {void}
   * @public
   */
  playFromStart() {
    if (!this.currentTimeline) {
      window.showToast?.('Aucune timeline sélectionnée', 'error', 3000);
      return;
    }

    if (!this.websocketManager.isConnected) {
      window.showToast?.('Connexion WebSocket perdue', 'error', 3000);
      return;
    }

    if (this.elements.length === 0) {
      window.showToast?.('Aucun élément dans la timeline', 'warning', 3000);
      return;
    }

    // Arrêter la lecture en cours si elle existe
    if (this.isPlaying) {
      this.stopSequence();
    }

    // Réinitialiser l'état
    this.isPlaying = true;
    this.isPaused = false;
    this.currentTime = 0;
    this.startTime = Date.now();

    // Mettre à jour les boutons
    this.updatePlayButtons();

    // Lancer la lecture
    this.startPlayback();
  }

  /**
   * Bascule entre lecture et pause
   * @returns {void}
   * @public
   */
  togglePlayPause() {
    if (!this.currentTimeline) {
      window.showToast?.('Aucune timeline sélectionnée', 'error', 3000);
      return;
    }

    if (!this.websocketManager.isConnected) {
      window.showToast?.('Connexion WebSocket perdue', 'error', 3000);
      return;
    }

    if (this.elements.length === 0) {
      window.showToast?.('Aucun élément dans la timeline', 'warning', 3000);
      return;
    }

    if (this.isPlaying && !this.isPaused) {
      // En cours de lecture -> mettre en pause
      this.pausePlayback();
    } else if (this.isPlaying && this.isPaused) {
      // En pause -> reprendre la lecture
      this.resumePlayback();
    } else {
      // Pas en cours -> démarrer depuis le début
      this.playFromStart();
    }
  }

  /**
   * Met à jour l'état des boutons de lecture
   * @returns {void}
   * @private
   */
  updatePlayButtons() {
    if (!this.playFromStartButton || !this.playPauseButton) return;

    const playPauseIcon = this.playPauseButton.querySelector('#playPauseIcon');

    if (this.isPlaying && !this.isPaused) {
      // En cours de lecture
      this.playPauseButton.classList.add('playing');
      if (playPauseIcon) {
        playPauseIcon.innerHTML = '<path d="M6 19H10V5H6V19ZM14 5V19H18V5H14Z" fill="currentColor"/>';
      }
    } else if (this.isPlaying && this.isPaused) {
      // En pause
      this.playPauseButton.classList.add('playing');
      if (playPauseIcon) {
        playPauseIcon.innerHTML = '<path d="M8 5V19L19 12L8 5Z" fill="currentColor"/>';
      }
    } else {
      // Arrêté
      this.playPauseButton.classList.remove('playing');
      if (playPauseIcon) {
        playPauseIcon.innerHTML = '<path d="M8 5V19L19 12L8 5Z" fill="currentColor"/>';
      }
    }
  }

  /**
   * Démarre la lecture de la séquence
   * @returns {void}
   * @private
   */
  startPlayback() {
    const sortedElements = this.elements
      .filter(el => el.moduleData && el.moduleData.id && el.actionType && el.startTime !== null)
      .sort((a, b) => a.startTime - b.startTime);

    this.scheduleActions(sortedElements);
    this.animationFrame = requestAnimationFrame(() => this.updatePlaybackPosition());
  }

  /**
   * Met en pause la lecture en cours
   * @returns {void}
   * @private
   */
  pausePlayback() {
    if (!this.isPlaying) return;

    this.isPaused = true;
    this.pausedTime = Date.now();

    // Annuler les timeouts restants
    if (this.timeouts) {
      this.timeouts.forEach(timeout => clearTimeout(timeout));
      this.timeouts = [];
    }

    // Annuler l'animation frame
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    // Envoyer les commandes de pause aux modules audio actifs
    this.sendTimelineControlCommand('timeline_pause');

    // Mettre à jour les boutons
    this.updatePlayButtons();

    window.showToast?.('Lecture mise en pause', 'info', 2000);
  }

  /**
   * Reprend la lecture après une pause
   * @returns {void}
   * @private
   */
  resumePlayback() {
    if (!this.isPlaying || !this.isPaused) return;

    this.isPaused = false;
    const pauseDuration = Date.now() - this.pausedTime;
    this.startTime += pauseDuration; // Ajuster le temps de départ

    // Reprogrammer les actions restantes
    const remainingElements = this.elements
      .filter(el => el.moduleData && el.moduleData.id && el.actionType && el.startTime > this.currentTime)
      .sort((a, b) => a.startTime - b.startTime);

    this.scheduleActions(remainingElements);

    // Redémarrer l'animation
    this.animationFrame = requestAnimationFrame(() => this.updatePlaybackPosition());

    // Envoyer la commande de reprise aux modules audio actifs
    this.sendTimelineControlCommand('timeline_resume');

    // Mettre à jour les boutons
    this.updatePlayButtons();

    window.showToast?.('Lecture reprise', 'success', 2000);
  }

  /**
   * Programme l'exécution des actions selon leur timing
   * Crée les timeouts pour déclencher les actions aux bons moments
   * @param {Array<Object>} elements - Liste des éléments à exécuter
   * @returns {void}
   * @private
   */
  scheduleActions(elements) {
    this.timeouts = [];
    elements.forEach(el => {
      const delay = el.startTime * 1000;
      const timeout = setTimeout(() => {
        this.executeAction(el);
      }, delay);
      this.timeouts.push(timeout);
    });

    if (elements.length > 0) {
      const totalDuration = Math.max(...elements.map(e => e.startTime + e.duration)) * 1000;
      this.stopTimeout = setTimeout(() => {
        this.stopSequence();
      }, totalDuration);
    }
  }

  /**
   * Exécute une action de module via WebSocket
   * Envoie la commande au serveur pour contrôler le module physique
   * Vérifie que le module est en ligne avant d'envoyer la commande
   * @param {Object} element - Élément contenant les données d'action
   * @returns {void}
   * @private
   */
  executeAction(element) {
    // Validation des données
    if (!element.moduleData || !element.moduleData.id) {
      console.error('Module ID manquant pour l\'élément:', element);
      window.showToast?.('Erreur: Module ID manquant', 'error', 3000);
      return;
    }

    if (!element.actionType) {
      console.error('Type d\'action manquant pour l\'élément:', element);
      window.showToast?.('Erreur: Action manquante', 'error', 3000);
      return;
    }

    // Vérifier si le module est en ligne
    const moduleElement = document.querySelector(`.module-item[data-module-id="${element.moduleData.id}"]`);
    const isOnline = moduleElement && moduleElement.classList.contains('online');

    if (!isOnline) {
      console.warn(`Module ${element.moduleData.id} hors ligne - commande ignorée`);
      window.showToast?.(`Module ${element.moduleData.name || element.moduleData.id} hors ligne - action ignorée`, 'warning', 3000);
      return;
    }

    // Déterminer la commande à envoyer
    // REFONTE: Toujours utiliser audio_play - le serveur détecte automatiquement le mode timeline
    const command = element.actionType;

    const message = {
      moduleId: element.moduleData.id,
      command: command,
      parameters: {
        ...element.actionParams,
        duration: element.duration,
      },
    };

    console.log('Executing action:', message);
    this.websocketManager.send(message);
  }

  /**
   * Met à jour la position de la ligne de lecture en temps réel
   * Anime l'indicateur visuel de progression durant la lecture
   * @returns {void}
   * @private
   */
  updatePlaybackPosition() {
    if (!this.isPlaying || this.isPaused) return;

    const elapsedTime = (Date.now() - this.startTime) / 1000;
    this.currentTime = elapsedTime;
    const trackWidth = this.track.offsetWidth;

    // Position relative au viewport (même logique que pour les modules)
    const relativeTime = elapsedTime - this.viewportStart;

    if (!this.playbackLine) {
      this.playbackLine = document.createElement('div');
      this.playbackLine.className = 'playback-indicator';
      this.track.appendChild(this.playbackLine);
    }

    // Afficher la ligne seulement si elle est dans le viewport
    if (relativeTime >= 0 && relativeTime <= this.viewportDuration) {
      // Calculer la position en pourcentage de la largeur totale (même logique que les modules)
      const leftPercent = Math.max(0, relativeTime / this.viewportDuration);
      const left = leftPercent * trackWidth;

      this.playbackLine.style.left = `${left}px`;
      this.playbackLine.style.display = 'block';
    } else {
      this.playbackLine.style.display = 'none';
    }

    this.animationFrame = requestAnimationFrame(() => this.updatePlaybackPosition());
  }

  /**
   * Arrête complètement la lecture de la séquence
   * Annule tous les timeouts et remet l'interface à l'état initial
   * @returns {void}
   * @public
   */
  stopSequence() {
    this.isPlaying = false;
    this.isPaused = false;
    this.currentTime = 0;

    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    this.timeouts.forEach(timeout => clearTimeout(timeout));
    this.timeouts = [];

    if (this.stopTimeout) {
      clearTimeout(this.stopTimeout);
    }

    if (this.playbackLine) {
      this.playbackLine.remove();
      this.playbackLine = null;
    }

    // Envoyer les commandes d'arrêt aux modules audio actifs
    this.sendTimelineControlCommand('timeline_stop');

    // Mettre à jour les boutons
    this.updatePlayButtons();
  }

  /**
   * Génère la séquence complète pour export ou sauvegarde
   * Compile tous les éléments en structure organisée avec optimisation du stockage
   * @returns {Object} Objet séquence avec éléments et durée totale
   * @public
   */
  generateSequence() {
    const elements = this.elements.map(element => ({
      moduleId: element.moduleData.id, // Stocker seulement l'ID pour optimisation
      moduleType: element.moduleData.type, // Type du module (important pour la restauration)
      startTime: Math.round(element.startTime * 100) / 100, // Arrondir à 2 décimales
      duration: element.duration,
      actionType: element.actionType,
      actionParams: element.actionParams || {},
      trackIndex: element.trackIndex || 0
    }));

    const totalDuration = Math.max(
      ...this.elements.map(e => e.startTime + e.duration),
      0
    );

    return {
      elements: elements,
      totalDuration: totalDuration
    };
  }

  /**
   * Exporte la séquence actuelle vers un fichier JSON
   * Télécharge automatiquement le fichier de séquence
   * @returns {void}
   * @public
   */
  exportSequence() {
    const sequence = this.generateSequence();
    const blob = new Blob([JSON.stringify(sequence, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'timeline-sequence.json';
    a.click();
    URL.createObjectURL(url);
  }

  /**
   * Importe une séquence depuis un fichier JSON
   * Lit et parse le fichier pour charger une séquence existante
   * @param {File} file - Fichier JSON à importer
   * @returns {void}
   * @public
   */
  importSequence(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const sequence = JSON.parse(e.target.result);
        this.loadSequence(sequence);
      } catch {
        window.showToast?.("Erreur lors de l'import du fichier", 'error', 3000);
      }
    };
    reader.readAsText(file);
  }

  /**
   * Bascule vers un onglet spécifique dans la sidebar
   * @param {string} tabName - Nom de l'onglet ('modules' ou 'saved')
   * @returns {void}
   * @public
   */
  switchToTab(tabName) {
    const modulesTab = document.getElementById('modulesTab');
    const savedTimelinesTab = document.getElementById('savedTimelinesTab');
    const modulesPanel = document.getElementById('modulesPanel');
    const savedTimelinesPanel = document.getElementById('savedTimelinesPanel');

    // Retirer la classe active de tous les onglets
    document.querySelectorAll('.sidebar-tab').forEach(tab => {
      tab.classList.remove('active');
    });

    // Masquer tous les panels
    document.querySelectorAll('.modules-panel, .saved-timelines-panel').forEach(panel => {
      panel.classList.remove('active');
    });

    // Activer l'onglet et le panel sélectionnés
    if (tabName === 'modules') {
      modulesTab.classList.add('active');
      modulesPanel.classList.add('active');
      this.checkModulesEmptyState(); // Vérifier l'état vide des modules
    } else if (tabName === 'saved') {
      savedTimelinesTab.classList.add('active');
      savedTimelinesPanel.classList.add('active');
      this.loadSavedTimelines(); // Charger les timelines sauvegardées
    }
  }

  /**
   * Charge et affiche les timelines sauvegardées
   * @returns {void}
   * @private
   */
  loadSavedTimelines() {
    const list = document.querySelector('.saved-timelines-list');
    if (!list) return;

    // Afficher un indicateur de chargement
    list.innerHTML = '<div class="loading">Chargement des timelines...</div>';

    // Charger les vraies données depuis l'API
    fetch('/timelines/api', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        this.displayTimelines(data.timelines);
      } else {
        console.error('Erreur lors du chargement des timelines:', data.error);
        this.showEmptyState();
      }
    })
    .catch(error => {
      console.error('Erreur réseau:', error);
      this.showEmptyState();
    });
  }

  /**
   * Affiche la liste des timelines avec validation des modules
   * @param {Array} timelines - Liste des timelines depuis l'API
   * @returns {void}
   * @private
   */
  displayTimelines(timelines) {
    const list = document.querySelector('.saved-timelines-list');
    if (!list) return;

    if (!timelines || timelines.length === 0) {
      this.showEmptyState();
      return;
    }

    // Récupérer la liste des modules disponibles pour validation
    const availableModules = this.getAvailableModules();

    list.innerHTML = timelines.map(timeline => {
      const validation = this.validateTimeline(timeline, availableModules);
      const hasMissingModules = validation.missingModules.length > 0;

      return `
        <div class="saved-timeline-item ${hasMissingModules ? 'has-missing-modules' : ''}"
             data-timeline-id="${timeline.id}">
          <div class="saved-timeline-header">
            <div class="saved-timeline-name">${timeline.name}</div>
          </div>
          <button class="timeline-delete-btn" data-timeline-id="${timeline.id}" title="Supprimer cette timeline">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <div class="saved-timeline-meta">
            <span class="timeline-duration">${this.formatTime(this.calculateTimelineDuration(timeline))}</span>
            ${hasMissingModules ? ` | ${validation.missingModules.length} module(s) manquant(s)` : ''}
          </div>
          ${hasMissingModules ? `
            <div class="missing-modules-list">
              Modules manquants: ${validation.missingModules.join(', ')}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    // Ajouter les événements de clic
    list.querySelectorAll('.saved-timeline-item').forEach(item => {
      item.addEventListener('click', () => {
        const timelineId = item.dataset.timelineId;
        this.loadTimeline(timelineId);
      });
    });

    // Ajouter les événements pour les boutons de suppression
    list.querySelectorAll('.timeline-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation(); // Empêcher le clic sur la timeline
        const timelineId = btn.dataset.timelineId;
        this.showDeleteConfirmationModal(timelineId);
      });
    });
  }

  /**
   * Valide une timeline et retourne les modules manquants
   * @param {Object} timeline - Timeline à valider
   * @param {Array} availableModules - Modules disponibles
   * @returns {Object} Résultat de validation
   * @private
   */
  validateTimeline(timeline, availableModules) {
    const missingModules = [];
    const availableModuleIds = new Set(availableModules.map(m => m.id));

    if (timeline.data && timeline.data.elements) {
      timeline.data.elements.forEach(element => {
        // Vérifier si moduleId existe (nouveau format) ou moduleData.id (ancien format)
        const moduleId = element.moduleId || (element.moduleData && element.moduleData.id);
        if (moduleId && !availableModuleIds.has(moduleId)) {
          missingModules.push(moduleId);
        }
      });
    }

    return {
      isValid: missingModules.length === 0,
      missingModules: [...new Set(missingModules)] // Éliminer les doublons
    };
  }

  /**
   * Récupère la liste des modules disponibles depuis l'interface
   * @returns {Array} Liste des modules disponibles
   * @private
   */
  getAvailableModules() {
    const modules = [];
    document.querySelectorAll('.module-item').forEach(item => {
      modules.push({
        id: item.dataset.moduleId,
        name: item.dataset.moduleName,
        type: item.dataset.moduleType
      });
    });
    return modules;
  }

  /**
   * Calcule la durée totale d'une timeline
   * @param {Object} timeline - Timeline dont calculer la durée
   * @returns {number} Durée en secondes
   * @private
   */
  calculateTimelineDuration(timeline) {
    if (!timeline.data || !timeline.data.elements) return 0;

    let maxEndTime = 0;
    timeline.data.elements.forEach(element => {
      const endTime = element.startTime + element.duration;
      if (endTime > maxEndTime) {
        maxEndTime = endTime;
      }
    });

    return Math.round(maxEndTime);
  }

  /**
   * Formate une date pour l'affichage
   * @param {string} dateString - Date au format ISO
   * @returns {string} Date formatée
   * @private
   */
  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  /**
   * Affiche l'état vide (aucune timeline)
   * @returns {void}
   * @private
   */
  showEmptyState() {
    const list = document.querySelector('.saved-timelines-list');
    if (!list) return;

    const translations = window.timelineTranslations || {
      noSavedTimelines: 'Aucune timeline sauvegardée',
      saveFirstTimeline: 'Sauvegardez votre première timeline pour la retrouver ici'
    };

    list.innerHTML = `
      <div class="empty-state">
        <div>
          <h3>${translations.noSavedTimelines}</h3>
          <p>${translations.saveFirstTimeline}</p>
        </div>
      </div>
    `;
  }

  /**
   * Vérifie et affiche l'état vide des modules si nécessaire
   * @returns {void}
   * @private
   */
  checkModulesEmptyState() {
    const modulesList = document.querySelector('.modules-list');
    if (!modulesList) return;

    const moduleItems = modulesList.querySelectorAll('.module-item');
    const existingEmptyState = modulesList.querySelector('.empty-state');

    // Si aucun module et pas d'état vide existant, afficher l'état vide
    if (moduleItems.length === 0 && !existingEmptyState) {
      const translations = window.timelineTranslations || {
        noModulesYet: 'Aucun module ajouté',
        addFirstModule: 'Ajoutez votre premier module pour commencer.'
      };

      modulesList.innerHTML = `
        <div class="empty-state">
          <div>
            <h3>${translations.noModulesYet}</h3>
            <p>${translations.addFirstModule}</p>
          </div>
        </div>
      `;
    }
    // Si des modules existent et qu'il y a un état vide, le supprimer
    else if (moduleItems.length > 0 && existingEmptyState) {
      existingEmptyState.remove();
    }
  }

  /**
   * Charge une timeline sauvegardée
   * @param {string} timelineId - ID de la timeline à charger
   * @returns {void}
   * @private
   */
  loadTimeline(timelineId) {

    fetch(`/timelines/api/${timelineId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Timeline non trouvée');
      }
      return response.json();
    })
    .then(data => {
      if (data.success && data.timeline) {
        this.setCurrentTimeline(data.timeline); // Définir comme timeline courante
        this.loadTimelineData(data.timeline);
        this.switchToTab('modules'); // Basculer automatiquement vers modules
        window.showToast?.('Timeline chargée avec succès', 'success', 2000);
      } else {
        throw new Error(data.error || 'Erreur lors du chargement');
      }
    })
    .catch(error => {
      console.error('Erreur lors du chargement de la timeline:', error);
      window.showToast?.('Erreur lors du chargement de la timeline', 'error', 3000);
    });
  }

  /**
   * Récupère les informations dynamiques d'un module par son ID
   * @param {string} moduleId - ID du module à rechercher
   * @returns {Object|null} Informations du module ou null si non trouvé
   * @private
   */
  getModuleInfo(moduleId) {
    // Chercher dans les éléments de module disponibles dans l'interface
    const moduleElement = document.querySelector(`.module-item[data-module-id="${moduleId}"]`);
    if (moduleElement) {
      return {
        id: moduleElement.dataset.moduleId,
        name: moduleElement.dataset.moduleName,
        type: moduleElement.dataset.moduleType,
        isOnline: moduleElement.dataset.isOnline === 'true'
      };
    }

    // Si non trouvé dans l'interface, chercher dans les modules chargés depuis l'API
    if (window.availableModules) {
      const module = window.availableModules.find(m => m.module_id === moduleId);
      if (module) {
        return {
          id: module.module_id,
          name: module.name || module.module_id,
          type: module.type || 'Unknown',
          isOnline: false // Par défaut offline si chargé depuis l'API
        };
      }
    }

    return null;
  }

  /**
   * Charge les données d'une timeline dans l'interface
   * @param {Object} timeline - Données de la timeline
   * @returns {void}
   * @private
   */
  loadTimelineData(timeline) {
    if (!timeline.data || !timeline.data.elements) {
      window.showToast?.('Timeline vide ou corrompue', 'warning', 3000);
      return;
    }

    // Vider la timeline actuelle
    this.clear();

    // Charger les éléments
    timeline.data.elements.forEach(elementData => {
      // Récupérer les informations dynamiques du module
      const moduleInfo = this.getModuleInfo(elementData.moduleId);

      if (moduleInfo) {
        // Module trouvé, utiliser les informations dynamiques
        const moduleData = moduleInfo;

        // Trouver la position X basée sur le temps
        const x = this.timeToPixel(elementData.startTime);

        // Ajouter l'élément à la timeline sans déclencher l'auto-sauvegarde
        this.addElementToTimeline(moduleData, x, elementData.trackIndex || 0, false);

        // Récupérer le dernier élément ajouté et mettre à jour ses propriétés
        const createdElement = this.elements[this.elements.length - 1];
        createdElement.actionType = elementData.actionType;
        createdElement.actionParams = elementData.actionParams || {};
        createdElement.element.dataset.actionType = elementData.actionType;
        createdElement.element.dataset.duration = elementData.duration.toString();

        // Mettre à jour l'affichage de l'action
        const moduleConfig = this.getModuleConfig(moduleData.type);
        const actionConfig = moduleConfig.actions[elementData.actionType];
        if (actionConfig) {
          // Construire le texte de l'action avec le nom du fichier audio si applicable
          let actionText = actionConfig.name;
          if (moduleData.type === 'Audio Player' && elementData.actionParams && elementData.actionParams.filename) {
            actionText = `${actionConfig.name} - ${elementData.actionParams.filename}`;
          }
          createdElement.element.querySelector('.element-action').textContent = actionText;
          createdElement.element.querySelector('.element-duration').textContent = this.formatTime(elementData.duration);
        }

        // Repositionner l'élément avec les bonnes données
        this.positionElement(
          createdElement.element,
          elementData.startTime,
          elementData.duration,
          elementData.trackIndex || 0
        );
      } else {
        // Module non trouvé - afficher un avertissement
        console.warn(`Module ${elementData.moduleId} non trouvé lors du chargement de la timeline`);
        window.showToast?.(`Module ${elementData.moduleId} non disponible`, 'warning', 3000);
      }
    });

    // Ajuster le viewport selon le contenu de la timeline
    if (timeline.data.elements && timeline.data.elements.length > 0) {
      // Timeline avec des éléments : calculer le temps maximum + 2s
      const maxTime = Math.max(...timeline.data.elements.map(el => el.startTime + el.duration));
      const targetDuration = maxTime + 2; // Temps max + 2 secondes
      
      // Ajuster le zoom pour que la durée cible corresponde à la durée par défaut
      this.zoomLevel = DEFAULT_VIEWPORT_DURATION / targetDuration;
      this.zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoomLevel)); // Limiter le zoom
      
      // Calculer la durée du viewport selon le zoom ajusté
      this.viewportDuration = DEFAULT_VIEWPORT_DURATION / this.zoomLevel;
      this.viewportStart = 0; // Toujours commencer à 0
    } else {
      // Timeline vide : utiliser la durée par défaut (15s)
      this.viewportDuration = DEFAULT_VIEWPORT_DURATION;
      this.zoomLevel = 1; // Zoom par défaut
      this.viewportStart = 0;
    }

    // Mettre à jour le viewport
    this.updateViewport();
  }

  /**
   * Convertit un temps en pixels (inverse de pixelToTime)
   * @param {number} time - Temps en secondes
   * @returns {number} Position en pixels
   * @private
   */
  timeToPixel(time) {
    const trackWidth = this.track.offsetWidth;
    const relativeTime = time - this.viewportStart;
    return (relativeTime / this.viewportDuration) * trackWidth;
  }

  /**
   * Crée une nouvelle timeline
   * @returns {void}
   * @public
   */
  createNewTimeline() {
    // Ouvrir la modale de création
    const modal = document.getElementById('createTimelineModal');
    if (!modal) {
      console.error('Modale de création de timeline non trouvée');
      window.showToast?.('Erreur: modale non trouvée', 'error', 3000);
      return;
    }

    // Réinitialiser le formulaire
    const form = modal.querySelector('#createTimelineForm');
    if (form) {
      form.reset();
    }

    // Afficher la modale
    modal.classList.add('open');

    // Focus sur le champ nom
    const nameInput = modal.querySelector('#timelineName');
    if (nameInput) {
      setTimeout(() => nameInput.focus(), 100);
    }
  }

  /**
   * Vide complètement la timeline
   * @returns {void}
   * @public
   */
  clear() {
    this.elements.forEach(element => {
      element.element.remove();
    });
    this.elements = [];
    this.selectedElement = null;

    // Ne remettre les instructions que si une timeline est sélectionnée
    if (this.currentTimeline) {
      this.showInstructions();
    }
  }

  /**
   * Sauvegarde la timeline actuelle
   * @returns {void}
   * @public
   */
  save() {
    if (!this.currentTimeline) {
      window.showToast?.('Aucune timeline sélectionnée', 'error', 3000);
      return;
    }

    if (this.elements.length === 0) {
      window.showToast?.('Aucun élément dans la timeline à sauvegarder', 'warning', 3000);
      return;
    }

    // Préparer les données
    const timelineData = {
      name: this.currentTimeline.name, // Utiliser le nom existant
      data: this.generateSequence()
    };

    // Envoyer à l'API pour mettre à jour la timeline
    fetch(`/timelines/api/${this.currentTimeline.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(timelineData)
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        // Mettre à jour la timeline courante avec les nouvelles données
        this.currentTimeline.data = timelineData.data;
        this.currentTimeline.updated_at = new Date().toISOString();

        window.showToast?.('Timeline sauvegardée avec succès', 'success', 3000);
        // Recharger la liste des timelines sauvegardées
        this.loadSavedTimelines();
      } else {
        throw new Error(data.error || 'Erreur lors de la sauvegarde');
      }
    })
    .catch(error => {
      console.error('Erreur lors de la sauvegarde:', error);
      window.showToast?.('Erreur lors de la sauvegarde', 'error', 3000);
    });
  }

  /**
   * Bascule la lecture de la timeline
   * @returns {void}
   * @public
   */
  togglePlayback() {
    if (this.isPlaying) {
      this.stopSequence();
    } else {
      this.playSequence();
    }
  }

  /**
   * Gère la soumission du formulaire de création de timeline
   * @param {Event} event - Événement de soumission du formulaire
   * @returns {void}
   * @private
   */
  handleCreateTimelineSubmit(event) {
    event.preventDefault();

    const form = event.target;
    const formData = new FormData(form);
    const timelineName = formData.get('timelineName')?.trim();

    if (!timelineName) {
      window.showToast?.('Veuillez saisir un nom pour la timeline', 'warning', 3000);
      return;
    }

    // Fermer la modale
    window.timeline.closeCreateTimelineModal();

    // Vider la timeline actuelle
    this.clear();

    // Créer et sauvegarder une timeline vide avec le nom fourni
    this.createAndSaveEmptyTimeline(timelineName);
  }

  /**
   * Crée et sauvegarde une timeline vide
   * @param {string} timelineName - Nom de la nouvelle timeline
   * @returns {void}
   * @private
   */
  createAndSaveEmptyTimeline(timelineName) {
    // Préparer les données pour une timeline vide
    const timelineData = {
      name: timelineName,
      data: {
        elements: [],
        totalDuration: 0
      }
    };

    // Envoyer à l'API pour créer la timeline
    fetch('/timelines/api', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(timelineData)
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        // Créer l'objet timeline pour la définir comme courante
        const newTimeline = {
          id: data.timelineId,
          name: timelineName,
          data: timelineData.data,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        this.setCurrentTimeline(newTimeline); // Définir comme timeline courante

        // Basculer vers l'onglet modules pour permettre l'édition
        this.switchToTab('modules');

        // Recharger la liste des timelines sauvegardées pour afficher la nouvelle
        this.loadSavedTimelines();

        // Afficher un message de succès
        window.showToast?.(`Timeline "${timelineName}" créée avec succès.`, 'success', 4000);
      } else {
        throw new Error(data.error || 'Erreur lors de la création');
      }
    })
    .catch(error => {
      console.error('Erreur lors de la création de la timeline:', error);
      window.showToast?.('Erreur lors de la création de la timeline', 'error', 3000);
    });
  }

  /**
   * Affiche la modale de confirmation de suppression de timeline
   * @param {string} timelineId - ID de la timeline à supprimer
   * @returns {void}
   * @private
   */
  showDeleteConfirmationModal(timelineId) {
    const modal = document.getElementById('deleteTimelineModal');
    if (!modal) {
      console.error('Modale de suppression non trouvée');
      return;
    }

    // Stocker l'ID de la timeline à supprimer
    modal.dataset.timelineId = timelineId;

    // Afficher la modale
    modal.classList.add('open');

    // Focus sur le bouton "Non" par défaut
    const cancelBtn = modal.querySelector('#cancelDeleteTimelineBtn');
    if (cancelBtn) {
      setTimeout(() => cancelBtn.focus(), 100);
    }
  }

  /**
   * Masque la modale de confirmation de suppression
   * @returns {void}
   * @private
   */
  hideDeleteConfirmationModal() {
    const modal = document.getElementById('deleteTimelineModal');
    if (modal) {
      modal.classList.remove('open');
      delete modal.dataset.timelineId;
    }
  }

  /**
   * Ferme la modale de création de timeline
   * @returns {void}
   * @private
   */
  closeCreateTimelineModal() {
    const modal = document.getElementById('createTimelineModal');
    if (modal) {
      modal.classList.remove('open');
    }
  }

  /**
   * Supprime une timeline via l'API
   * @param {string} timelineId - ID de la timeline à supprimer
   * @returns {void}
   * @private
   */
  deleteTimeline(timelineId) {
    // Masquer la modale
    this.hideDeleteConfirmationModal();

    // Envoyer la requête de suppression
    fetch(`/timelines/api/${timelineId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        // Si la timeline supprimée était celle actuellement sélectionnée, la désélectionner
        if (this.currentTimeline && this.currentTimeline.id == timelineId) {
          this.setCurrentTimeline(null);
          this.clear();
        }

        // Recharger la liste des timelines
        this.loadSavedTimelines();

        window.showToast?.('Timeline supprimée avec succès', 'success', 3000);
      } else {
        throw new Error(data.error || 'Erreur lors de la suppression');
      }
    })
    .catch(error => {
      console.error('Erreur lors de la suppression de la timeline:', error);
      window.showToast?.('Erreur lors de la suppression de la timeline', 'error', 3000);
    });
  }
}

// Initialiser la timeline quand le DOM est prêt
document.addEventListener('DOMContentLoaded', function () {
  window.timeline = new TimelineSequencer();

  // Gestionnaire pour le bouton de création de timeline
  const createTimelineBtn = document.getElementById('createTimelineBtn');
  if (createTimelineBtn) {
    createTimelineBtn.addEventListener('click', function() {
      window.timeline.createNewTimeline();
    });
  }

  // Ajouter les gestionnaires d'événements pour la modale de création
  const createTimelineModal = document.getElementById('createTimelineModal');
  const createTimelineForm = document.getElementById('createTimelineForm');

  if (createTimelineModal && createTimelineForm) {
    // Gestionnaire pour la soumission du formulaire
    createTimelineForm.addEventListener('submit', function(event) {
      window.timeline.handleCreateTimelineSubmit(event);
    });

    // Gestionnaire pour fermer la modale en cliquant sur le bouton X
    const closeBtn = createTimelineModal.querySelector('.close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', function() {
        window.timeline.closeCreateTimelineModal();
      });
    }

    // Gestionnaire pour fermer la modale en cliquant en dehors
    createTimelineModal.addEventListener('click', function(event) {
      if (event.target === createTimelineModal) {
        window.timeline.closeCreateTimelineModal();
      }
    });

    // Gestionnaire pour le bouton Annuler
    const cancelBtn = createTimelineModal.querySelector('#cancelCreateTimelineBtn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', function() {
        window.timeline.closeCreateTimelineModal();
      });
    }
  }

  // Ajouter les gestionnaires d'événements pour la modale de suppression
  const deleteTimelineModal = document.getElementById('deleteTimelineModal');
  const closeDeleteBtn = document.getElementById('closeDeleteTimelineBtn');
  const cancelDeleteBtn = document.getElementById('cancelDeleteTimelineBtn');
  const confirmDeleteBtn = document.getElementById('confirmDeleteTimelineBtn');

  if (deleteTimelineModal && closeDeleteBtn && cancelDeleteBtn && confirmDeleteBtn) {
    // Gestionnaire pour fermer la modale en cliquant sur le bouton X
    closeDeleteBtn.addEventListener('click', function() {
      window.timeline.hideDeleteConfirmationModal();
    });

    // Gestionnaire pour fermer la modale en cliquant en dehors
    deleteTimelineModal.addEventListener('click', function(event) {
      if (event.target === deleteTimelineModal) {
        window.timeline.hideDeleteConfirmationModal();
      }
    });

    // Gestionnaire pour le bouton Annuler
    cancelDeleteBtn.addEventListener('click', function() {
      window.timeline.hideDeleteConfirmationModal();
    });

    // Gestionnaire pour le bouton Confirmer
    confirmDeleteBtn.addEventListener('click', function() {
      const timelineId = deleteTimelineModal.dataset.timelineId;
      if (timelineId) {
        window.timeline.deleteTimeline(timelineId);
      }
    });
  }
});
