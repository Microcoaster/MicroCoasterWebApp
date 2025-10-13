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
  'estop-button': {
    name: 'Emergency Stop',
    icon: '🛑',
    color: '#ff4757',
    actions: {
      activate: {
        name: 'Activer E-Stop',
        duration: { min: 0.1, max: 5, default: 1 },
        params: { force_stop: { type: 'boolean', default: true, label: 'Arrêt immédiat' } },
      },
      deactivate: {
        name: 'Désactiver E-Stop',
        duration: { min: 0.1, max: 2, default: 0.5 },
        params: {},
      },
    },
  },
  'switch-track': {
    name: 'Aiguillage',
    icon: '↔️',
    color: '#3742fa',
    actions: {
      switch_left: {
        name: 'Basculer à gauche',
        duration: { min: 0.5, max: 3, default: 1.5 },
        params: { speed: { type: 'range', min: 1, max: 100, default: 50, label: 'Vitesse' } },
      },
      switch_right: {
        name: 'Basculer à droite',
        duration: { min: 0.5, max: 3, default: 1.5 },
        params: { speed: { type: 'range', min: 1, max: 100, default: 50, label: 'Vitesse' } },
      },
    },
  },
  'speed-control': {
    name: 'Contrôle Vitesse',
    icon: '⚡',
    color: '#ffa502',
    actions: {
      set_speed: {
        name: 'Définir vitesse',
        duration: { min: 0.1, max: 10, default: 2 },
        params: {
          target_speed: {
            type: 'range',
            min: 0,
            max: 100,
            default: 50,
            label: 'Vitesse cible (%)',
          },
        },
      },
      gradual_change: {
        name: 'Changement graduel',
        duration: { min: 1, max: 20, default: 5 },
        params: {
          from_speed: {
            type: 'range',
            min: 0,
            max: 100,
            default: 30,
            label: 'Vitesse initiale (%)',
          },
          to_speed: { type: 'range', min: 0, max: 100, default: 70, label: 'Vitesse finale (%)' },
        },
      },
    },
  },
  'led-control': {
    name: 'LED Control',
    icon: '💡',
    color: '#2ed573',
    actions: {
      turn_on: {
        name: 'Allumer',
        duration: { min: 0.1, max: 60, default: 5 },
        params: {
          brightness: { type: 'range', min: 10, max: 100, default: 100, label: 'Luminosité (%)' },
          color: { type: 'color', default: '#ffffff', label: 'Couleur LED' },
        },
      },
      turn_off: { name: 'Éteindre', duration: { min: 0.1, max: 2, default: 0.2 }, params: {} },
      blink: {
        name: 'Clignoter',
        duration: { min: 1, max: 30, default: 5 },
        params: {
          on_time: {
            type: 'range',
            min: 0.1,
            max: 2,
            default: 0.5,
            label: 'Durée allumée (s)',
            step: 0.1,
          },
          off_time: {
            type: 'range',
            min: 0.1,
            max: 2,
            default: 0.5,
            label: 'Durée éteinte (s)',
            step: 0.1,
          },
        },
      },
    },
  },
  'generic-module': {
    name: 'Module Générique',
    icon: '⚙️',
    color: '#747d8c',
    actions: {
      activate: {
        name: 'Activer',
        duration: { min: 0.1, max: 30, default: 2 },
        params: {
          power: { type: 'range', min: 0, max: 100, default: 100, label: 'Puissance (%)' },
        },
      },
      deactivate: { name: 'Désactiver', duration: { min: 0.1, max: 5, default: 1 }, params: {} },
    },
  },
};

/**
 * Configuration du système de zoom timeline
 * Paramètres de zoom et navigation avec molette
 */
const MIN_ZOOM = 0.2; // Zoom minimum (plus large)
const MAX_ZOOM = 5; // Zoom maximum (plus détaillé)
const ZOOM_STEP = 0.1; // Incrément du zoom

// Configuration du viewport timeline
const DEFAULT_VIEWPORT_DURATION = 30; // Durée par défaut de la fenêtre (30s)
const SCROLL_STEP = 2; // Pas de déplacement en secondes avec Shift+molette

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

    // Indicateur de temps pendant le drag & drop
    this.dragTimeIndicator = null;
    this.isDraggingModule = false; // Flag pour savoir si on drag un module

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

    this.init();
  }

  init() {
    this.setupEventListeners();
    this.setupDragAndDrop();
    this.setupZoom();
    this.updateViewport(); // Initialiser le viewport
    this.switchToTab('modules'); // Initialiser avec l'onglet modules
    this.initializeWebSocket();
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
    console.log('Timeline WebSocket manager initialized');

    // Écouter les réponses de commandes
    window.socket.on('command_sent', (data) => {
      console.log('Command sent successfully:', data);
      // Afficher un feedback visuel positif si c'est une commande timeline
      if (data.moduleId) {
        window.showToast?.(`Commande envoyée à ${data.moduleId}`, 'success', 2000);
      }
    });

    window.socket.on('command_error', (data) => {
      console.error('Command failed:', data);
      const moduleName = data.moduleId || 'Module inconnu';
      const errorMsg = data.error || 'Erreur inconnue';
      window.showToast?.(`Erreur ${moduleName}: ${errorMsg}`, 'error', 3000);
    });

    // Écouter les erreurs générales
    window.socket.on('error', (data) => {
      console.error('WebSocket error:', data);
      window.showToast?.('Erreur de communication', 'error', 3000);
    });
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
   * @param {number} pixelPosition - Position en pixels à convertir
   * @returns {number} Temps correspondant en secondes
   * @public
   */
  pixelToTime(pixelPosition) {
    // Convertir la position en pixels en temps absolu dans la timeline
    const trackWidth = this.track.offsetWidth;
    const relativePosition = pixelPosition / trackWidth; // Position en pourcentage
    return this.viewportStart + relativePosition * this.viewportDuration;
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
   * Formate une durée en secondes en chaîne lisible
   * @param {number} seconds - Durée en secondes à formater
   * @returns {string} Durée formatée (ex: '5s', '2min30s')
   * @private
   */
  formatTime(seconds) {
    if (seconds < 60) {
      return seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds)}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return remainingSeconds === 0 ? `${minutes}min` : `${minutes}min${remainingSeconds}s`;
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
    const playBtn = document.getElementById('playBtn');
    const modulesTab = document.getElementById('modulesTab');
    const savedTimelinesTab = document.getElementById('savedTimelinesTab');
    const createTimelineBtn = document.getElementById('createTimelineBtn');

    // Initialiser les propriétés des boutons
    this.playButton = playBtn;

    if (clearBtn) clearBtn.addEventListener('click', () => this.clear());
    if (saveBtn) saveBtn.addEventListener('click', () => this.save());
    if (playBtn) playBtn.addEventListener('click', () => this.togglePlayback());
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
      this.track.classList.add('drag-over-module');
      // Masquer les instructions dès qu'on commence à drag un module
      this.hideInstructions();
      // Afficher l'indicateur de temps pendant le drag
      const rect = this.track.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const timePosition = Math.max(0, this.pixelToTime(x));
      this.showDragTimeIndicator(timePosition, e.clientX, e.clientY);
    } else {
      // Ce n'est pas un module valide, ne rien faire
      this.track.classList.remove('drag-over-module');
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
    this.hideDragTimeIndicator();
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
    this.hideDragTimeIndicator();
    this.isDraggingModule = false; // Réinitialiser le flag

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
        // Piste disponible trouvée, placer le module
        this.addElementToTimeline(moduleData, x, trackIndex);
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
   * Vérifie si une piste est disponible sur toute la durée d'un module à une position temporelle donnée
   * @param {number} timePosition - Position temporelle de début en secondes
   * @param {number} duration - Durée du module à placer
   * @param {number} trackIndex - Index de la piste à vérifier (0-7)
   * @returns {boolean} True si la piste est disponible sur toute la durée
   * @private
   */
  isTrackAvailableForDuration(timePosition, duration, trackIndex) {
    // Vérifier si un élément existe déjà sur cette piste pendant toute la durée
    return !this.elements.some(element => {
      if (element.trackIndex !== trackIndex) return false;
      // Chevauchement d'intervalles
      const startA = timePosition;
      const endA = timePosition + duration;
      const startB = element.startTime;
      const endB = element.startTime + element.duration;
      return startA < endB && endA > startB;
    });
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
   * @returns {void}
   * @public
   */
  addElementToTimeline(moduleData, x, trackIndex) {
    const timePosition = Math.max(0, this.pixelToTime(x));
    const moduleConfig = this.getModuleConfig(moduleData.type);
    const defaultAction = Object.keys(moduleConfig.actions)[0];
    const defaultDuration = moduleConfig.actions[defaultAction].duration.default;

    const element = document.createElement('div');
    element.className = `timeline-action ${moduleData.type}`;
    element.dataset.moduleId = moduleData.id;
    element.dataset.moduleType = moduleData.type;
    element.dataset.actionType = defaultAction;
    element.dataset.startTime = timePosition.toFixed(2);
    element.dataset.duration = defaultDuration.toString();
    element.dataset.trackIndex = trackIndex.toString();

    this.positionElement(element, timePosition, defaultDuration, trackIndex);

    element.innerHTML = `
      <div class="element-header">
        <div class="element-icon">${moduleConfig.icon}</div>
        <div class="element-name">${moduleData.name}</div>
        <div class="element-duration">${defaultDuration}s</div>
      </div>
      <div class="element-action">${moduleConfig.actions[defaultAction].name}</div>
    `;

    // Events
    element.addEventListener('click', e => {
      e.stopPropagation();
      this.selectElement(element);
      this.openConfig(element);
    });

    element.addEventListener('mousedown', e => {
      if (e.target === element || e.target.parentElement === element) {
        this.startDrag(element, e);
      }
    });

    this.track.appendChild(element);
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
  }

  /**
   * Positionne un élément dans la timeline selon ses paramètres temporels
   * Met à jour les données et la position visuelle de l'élément
   * @param {HTMLElement} element - Élément DOM à positionner
   * @param {number} startTime - Temps de début en secondes
   * @param {number} duration - Durée en secondes
   * @param {number} trackIndex - Index de la piste (0-7)
   * @returns {void}
   * @public
   */
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
    return MODULE_CONFIGS[moduleType] || MODULE_CONFIGS['generic-module'];
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
            duration: parseFloat(timelineElement.element.dataset.duration),
            ...timelineElement.actionParams,
          })}
        </div>

        <div class="config-section">
          <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button class="control-btn" id="cancelConfig">Annuler</button>
            <button class="play-btn" id="saveConfig">Sauvegarder</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Events
    modal.querySelector('#cancelConfig').addEventListener('click', () => modal.remove());
    modal
      .querySelector('#saveConfig')
      .addEventListener('click', () => this.saveConfig(timelineElement, modal));
    modal.querySelector('#actionTypeSelect').addEventListener('change', e => {
      const container = modal.querySelector('#actionConfigContainer');
      container.innerHTML = this.generateActionConfigUI(moduleType, e.target.value, {
        duration: parseFloat(timelineElement.element.dataset.duration),
      });
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
  }

  /**
   * Génère l'interface de configuration pour une action de module
   * Crée dynamiquement les contrôles de configuration selon le type d'action
   * @param {string} moduleType - Type du module
   * @param {string} actionType - Type d'action à configurer
   * @param {Object} [currentValues={}] - Valeurs actuelles des paramètres
   * @returns {string} HTML de l'interface de configuration
   * @private
   */
  generateActionConfigUI(moduleType, actionType, currentValues = {}) {
    const config = this.getModuleConfig(moduleType);
    if (!config || !config.actions[actionType]) return '';

    const action = config.actions[actionType];
    let html = `<div class="action-config-section">
      <div class="config-row">
        <label class="config-label">Durée (secondes)</label>
        <input type="number" class="config-input duration-input" name="duration"
               min="${action.duration.min}" max="${action.duration.max}" step="0.1"
               value="${currentValues.duration || action.duration.default}">
      </div>`;

    // Paramètres spécifiques
    Object.entries(action.params).forEach(([paramName, paramConfig]) => {
      html += this.generateParameterInput(paramName, paramConfig, currentValues[paramName]);
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
   * @returns {string} HTML du champ de saisie
   * @private
   */
  generateParameterInput(paramName, config, currentValue = null) {
    const value = currentValue !== null ? currentValue : config.default;
    let html = `<div class="config-row">
                  <label class="config-label">${config.label || paramName}</label>`;

    switch (config.type) {
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
        html += `<input type="text" class="config-input" name="${paramName}" value="${value}">`;
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
    const duration = parseFloat(modal.querySelector('.duration-input').value);

    const actionParams = {};
    modal
      .querySelectorAll(
        '.config-input, .config-range, .config-select, .config-checkbox, .config-color'
      )
      .forEach(input => {
        if (input.name && input.name !== 'duration') {
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
    timelineElement.element.dataset.duration = duration.toString();
    timelineElement.actionType = actionType;
    timelineElement.duration = duration;
    timelineElement.actionParams = actionParams;

    const moduleConfig = this.getModuleConfig(timelineElement.element.dataset.moduleType);
    const actionConfig = moduleConfig.actions[actionType];

    timelineElement.element.querySelector('.element-duration').textContent = `${duration}s`;
    timelineElement.element.querySelector('.element-action').textContent = actionConfig.name;

    const startTime = parseFloat(timelineElement.element.dataset.startTime);
    const trackIndex = parseInt(timelineElement.element.dataset.trackIndex) || 0;
    this.positionElement(timelineElement.element, startTime, duration, trackIndex);

    modal.remove();
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

    const rect = element.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    const handleMouseMove = e => {
      if (!this.draggedElement) return;

      const trackRect = this.track.getBoundingClientRect();
      const x = e.clientX - trackRect.left - offsetX;
      const y = e.clientY - trackRect.top - offsetY;

      const timePosition = Math.max(0, this.pixelToTime(x));
      const trackIndex = this.getTrackIndexFromY(y + 60); // +60 pour compenser la règle

      // Mise à jour position
      const duration = parseFloat(this.draggedElement.dataset.duration);
      this.positionElement(this.draggedElement, timePosition, duration, trackIndex);
      this.draggedElement.dataset.startTime = timePosition.toFixed(2);
      this.draggedElement.dataset.trackIndex = trackIndex.toString();

      // Mise à jour données
      const elementData = this.elements.find(e => e.element === this.draggedElement);
      if (elementData) {
        elementData.startTime = timePosition;
        elementData.trackIndex = trackIndex;
      }
    };

    const handleMouseUp = () => {
      this.draggedElement = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
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
   * Lance la lecture de la séquence de timeline
   * Exécute les actions des modules selon leur programmation temporelle
   * @returns {void}
   * @public
   */
  playSequence() {
    if (!this.websocketManager.isConnected) {
      window.showToast?.('Connexion WebSocket perdue', 'error', 3000);
      return;
    }

    if (this.elements.length === 0) {
      window.showToast?.('Aucun élément dans la timeline', 'warning', 3000);
      return;
    }

    this.isPlaying = true;
    this.playButton.disabled = true;
    this.playButton.textContent = window.timelineTranslations.playing;

    this.startTime = Date.now();
    this.animationFrame = requestAnimationFrame(() => this.updatePlaybackPosition());

    const sortedElements = this.elements
      .filter(el => el.moduleData && el.moduleData.id && el.actionType && el.startTime !== null)
      .sort((a, b) => a.startTime - b.startTime);

    this.scheduleActions(sortedElements);
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

    const message = {
      moduleId: element.moduleData.id,
      command: element.actionType,
      parameters: element.actionParams || {},
      duration: element.duration,
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
    if (!this.isPlaying) return;

    const elapsedTime = (Date.now() - this.startTime) / 1000;
    const trackWidth = this.track.offsetWidth;

    // Position relative dans le viewport
    const relativeTime = elapsedTime - this.viewportStart;
    const position = (relativeTime / this.viewportDuration) * trackWidth;

    if (!this.playbackLine) {
      this.playbackLine = document.createElement('div');
      this.playbackLine.className = 'playback-line';
      this.track.appendChild(this.playbackLine);
    }

    // Afficher la ligne seulement si elle est dans le viewport
    if (relativeTime >= 0 && relativeTime <= this.viewportDuration) {
      this.playbackLine.style.left = `${position}px`;
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
    this.playButton.disabled = false;
    this.playButton.textContent = window.timelineTranslations.playTimeline;

    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
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
  }

  /**
   * Génère la séquence complète pour export ou sauvegarde
   * Compile tous les éléments en structure organisée
   * @returns {Object} Objet séquence avec éléments et durée totale
   * @public
   */
  generateSequence() {
    const elements = this.elements.map(element => ({
      moduleData: element.moduleData,
      startTime: element.startTime,
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
            ${hasMissingModules ? '<div class="missing-modules-indicator" title="Certains modules ne sont plus disponibles">⚠️</div>' : ''}
          </div>
          <div class="saved-timeline-meta">
            Créé: ${this.formatDate(timeline.created_at)} |
            Modifié: ${this.formatDate(timeline.updated_at)} |
            Durée: ${this.calculateTimelineDuration(timeline)}s
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
        if (element.moduleData && element.moduleData.id && !availableModuleIds.has(element.moduleData.id)) {
          missingModules.push(element.moduleData.id);
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
        this.loadTimelineData(data.timeline);
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
      if (elementData.moduleData) {
        // Trouver la position X basée sur le temps
        const x = this.timeToPixel(elementData.startTime);

        // Ajouter l'élément à la timeline
        this.addElementToTimeline(elementData.moduleData, x, elementData.trackIndex || 0);

        // Récupérer le dernier élément ajouté et mettre à jour ses propriétés
        const createdElement = this.elements[this.elements.length - 1];
        createdElement.actionType = elementData.actionType;
        createdElement.actionParams = elementData.actionParams || {};
        createdElement.element.dataset.actionType = elementData.actionType;
        createdElement.element.dataset.duration = elementData.duration.toString();

        // Mettre à jour l'affichage de l'action
        const moduleConfig = this.getModuleConfig(elementData.moduleData.type);
        const actionConfig = moduleConfig.actions[elementData.actionType];
        if (actionConfig) {
          createdElement.element.querySelector('.element-action').textContent = actionConfig.name;
        }

        // Repositionner l'élément avec les bonnes données
        this.positionElement(
          createdElement.element,
          elementData.startTime,
          elementData.duration,
          elementData.trackIndex || 0
        );
      }
    });

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
    modal.classList.add('show');

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
    this.showInstructions();
  }

  /**
   * Sauvegarde la timeline actuelle
   * @returns {void}
   * @public
   */
  save() {
    if (this.elements.length === 0) {
      window.showToast?.('Aucun élément dans la timeline à sauvegarder', 'warning', 3000);
      return;
    }

    // Demander le nom de la timeline
    const timelineName = prompt('Nom de la timeline:', `Timeline ${new Date().toLocaleDateString()}`);

    if (!timelineName || timelineName.trim() === '') {
      window.showToast?.('Sauvegarde annulée', 'info', 2000);
      return;
    }

    // Préparer les données
    const timelineData = {
      name: timelineName.trim(),
      data: this.generateSequence()
    };

    // Envoyer à l'API
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
    this.closeCreateTimelineModal();

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
   * Ferme la modale de création de timeline
   * @returns {void}
   * @private
   */
  closeCreateTimelineModal() {
    const modal = document.getElementById('createTimelineModal');
    if (modal) {
      modal.classList.remove('show');
    }
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
});
