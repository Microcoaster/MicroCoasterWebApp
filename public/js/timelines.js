/**
 * ================================================================================
 * MICROCOASTER WEBAPP - TIMELINE SEQUENCER
 * ================================================================================
 * Éditeur de timeline interactif pour séquences de modules et automation
 * Tout-en-un: zoom, configuration, placement, lecture
 * ================================================================================
 */

// ================================================================================
// CONFIGURATION DES MODULES
// ================================================================================

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

// ================================================================================
// ZOOM SIMPLE AVEC CTRL+MOLETTE
// ================================================================================

const MIN_ZOOM = 0.2; // Zoom minimum (plus large)
const MAX_ZOOM = 5; // Zoom maximum (plus détaillé)
const ZOOM_STEP = 0.1; // Incrément du zoom

// Configuration du viewport timeline
const DEFAULT_VIEWPORT_DURATION = 30; // Durée par défaut de la fenêtre (30s)
const SCROLL_STEP = 2; // Pas de déplacement en secondes avec Shift+molette

// ================================================================================
// TIMELINE SEQUENCER CLASS
// ================================================================================

class TimelineSequencer {
  constructor() {
    // DOM Elements
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

    // Zoom state simple
    this.zoomLevel = 1; // Facteur de zoom (1 = normal)
    this.pixelsPerSecond = 10; // Base: 10px par seconde

    // Viewport timeline infinie
    this.viewportStart = 0; // Début de la fenêtre (en secondes)
    this.viewportDuration = DEFAULT_VIEWPORT_DURATION; // Durée de la fenêtre visible
    this.viewportStart = 0; // Début de la fenêtre (en secondes)
    this.viewportDuration = DEFAULT_VIEWPORT_DURATION; // Durée de la fenêtre visible

    this.init();
  }

  init() {
    this.setupEventListeners();
    this.setupDragAndDrop();
    this.setupZoom();
    this.updateViewport(); // Initialiser le viewport
  }

  // ================================================================================
  // SYSTÈME DE ZOOM SIMPLE
  // ================================================================================

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
        // Navigation dans la timeline avec Shift+molette
        e.preventDefault();

        const direction = e.deltaY < 0 ? -1 : 1; // Molette vers le haut = reculer
        const newStart = this.viewportStart + direction * SCROLL_STEP;

        // Empêcher de descendre en dessous de 0
        this.viewportStart = Math.max(0, newStart);

        this.updateViewport();
      }
    });
  }

  updateZoom() {
    // Mettre à jour la durée du viewport selon le zoom
    this.viewportDuration = DEFAULT_VIEWPORT_DURATION / this.zoomLevel;

    this.updateViewport();
  }

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

  updateViewportIndicator() {
    const indicator = document.getElementById('viewportIndicator');
    if (indicator) {
      const start = this.formatTime(this.viewportStart);
      const end = this.formatTime(this.viewportStart + this.viewportDuration);
      indicator.textContent = `${start} - ${end}`;
    }
  }

  updateElementInViewport(elementData) {
    const element = elementData.element;
    const startTime = elementData.startTime;
    const duration = elementData.duration;
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
      const width = widthPercent * trackWidth;

      element.style.left = left + 'px';
      element.style.width = Math.max(width, 50) + 'px'; // Minimum 50px
      element.style.display = 'block';
      element.style.opacity = '1';
    } else {
      // Masquer l'élément s'il est hors du viewport
      element.style.display = 'none';
    }
  }

  getCurrentDuration() {
    return this.viewportDuration; // Durée du viewport actuel
  }

  pixelToTime(pixelPosition) {
    // Convertir la position en pixels en temps absolu dans la timeline
    const trackWidth = this.track.offsetWidth;
    const relativePosition = pixelPosition / trackWidth; // Position en pourcentage
    return this.viewportStart + relativePosition * this.viewportDuration;
  }

  updateTimeMarkers() {
    if (!this.timeMarkers) return;

    this.timeMarkers.innerHTML = '';
    const trackWidth = this.track.offsetWidth;

    // Recalculer pixelsPerSecond pour utiliser toute la largeur
    this.pixelsPerSecond = trackWidth / this.viewportDuration;

    // Intervalle des marqueurs selon le zoom
    let interval = 5; // Par défaut 5s
    if (this.zoomLevel >= 3)
      interval = 1; // Zoom élevé: 1s
    else if (this.zoomLevel >= 1.5)
      interval = 2; // Zoom moyen: 2s
    else if (this.zoomLevel <= 0.5) interval = 10; // Zoom faible: 10s

    // Calculer le temps de début et fin visibles
    const startTime = Math.floor(this.viewportStart / interval) * interval;
    const endTime = this.viewportStart + this.viewportDuration;

    for (let time = startTime; time <= endTime + interval; time += interval) {
      const relativeTime = time - this.viewportStart;
      const position = (relativeTime / this.viewportDuration) * trackWidth;

      // Seulement afficher les marqueurs visibles
      if (position >= 0 && position <= trackWidth) {
        const marker = document.createElement('div');
        marker.className = 'time-marker';
        marker.style.left = position + 'px';
        marker.innerHTML = `
          <div class="marker-line"></div>
          <div class="marker-label">${this.formatTime(time)}</div>
        `;
        this.timeMarkers.appendChild(marker);
      }
    }
  }

  formatTime(seconds) {
    if (seconds < 60) {
      return seconds < 10 ? seconds.toFixed(1) + 's' : Math.round(seconds) + 's';
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return remainingSeconds === 0 ? minutes + 'min' : minutes + 'min' + remainingSeconds + 's';
  }

  // ================================================================================
  // ÉVÉNEMENTS ET INTERACTIONS
  // ================================================================================

  setupEventListeners() {
    // Drag & drop
    this.track.addEventListener('dragover', e => this.handleDragOver(e));
    this.track.addEventListener('drop', e => this.handleDrop(e));
    this.track.addEventListener('dragleave', e => this.handleDragLeave(e));

    // Interactions timeline
    this.track.addEventListener('click', e => this.handleTrackClick(e));
    document.addEventListener('keydown', e => this.handleKeyDown(e));

    // Boutons de contrôle
    const clearBtn = document.getElementById('clearBtn');
    const saveBtn = document.getElementById('saveBtn');
    const playBtn = document.getElementById('playBtn');

    if (clearBtn) clearBtn.addEventListener('click', () => this.clear());
    if (saveBtn) saveBtn.addEventListener('click', () => this.save());
    if (playBtn) playBtn.addEventListener('click', () => this.togglePlayback());
  }

  setupDragAndDrop() {
    document.querySelectorAll('.module-item').forEach(item => {
      item.addEventListener('dragstart', e => {
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

  handleDragOver(e) {
    e.preventDefault();
    this.track.classList.add('drag-over');
  }

  handleDragLeave() {
    this.track.classList.remove('drag-over');
  }

  handleDrop(e) {
    e.preventDefault();
    this.track.classList.remove('drag-over');

    try {
      const moduleData = JSON.parse(e.dataTransfer.getData('text/plain'));
      const rect = this.track.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top - 60; // Compensation pour la règle

      this.addElementToTimeline(moduleData, x, y);
    } catch (error) {
      console.error('Erreur lors du drop:', error);
    }
  }

  // ================================================================================
  // GESTION DES ÉLÉMENTS DE TIMELINE
  // ================================================================================

  addElementToTimeline(moduleData, x, y) {
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

    this.positionElement(element, timePosition, defaultDuration);

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
    });

    this.hideInstructions();
  }

  positionElement(element, startTime, duration) {
    // Stocker les données temporelles sur l'élément
    element.dataset.startTime = startTime;
    element.dataset.duration = duration;

    // Trouver l'élément dans notre liste pour le mettre à jour
    const elementData = this.elements.find(e => e.element === element);
    if (elementData) {
      elementData.startTime = startTime;
      elementData.duration = duration;
      this.updateElementInViewport(elementData);
    }

    // Position verticale basée sur l'index
    const elementIndex = this.elements.findIndex(e => e.element === element);
    element.style.top = Math.max(80, 100 + elementIndex * 80) + 'px';
  }

  updateElementPositions() {
    // Cette méthode n'est plus nécessaire car updateZoom() gère déjà les positions
  }

  getModuleConfig(moduleType) {
    return MODULE_CONFIGS[moduleType] || MODULE_CONFIGS['generic-module'];
  }

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

    timelineElement.element.querySelector('.element-duration').textContent = duration + 's';
    timelineElement.element.querySelector('.element-action').textContent = actionConfig.name;

    const startTime = parseFloat(timelineElement.element.dataset.startTime);
    this.positionElement(timelineElement.element, startTime, duration);

    modal.remove();
    console.log('Configuration sauvegardée:', {
      module: timelineElement.moduleData.name,
      action: actionType,
      duration,
      params: actionParams,
    });
  }

  // ================================================================================
  // DRAG & DROP
  // ================================================================================

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

      // Mise à jour position
      const duration = parseFloat(this.draggedElement.dataset.duration);
      this.positionElement(this.draggedElement, timePosition, duration);
      this.draggedElement.dataset.startTime = timePosition.toFixed(2);

      // Mise à jour données
      const elementData = this.elements.find(e => e.element === this.draggedElement);
      if (elementData) {
        elementData.startTime = timePosition;
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

  // ================================================================================
  // INTERACTIONS GÉNÉRALES
  // ================================================================================

  handleTrackClick(e) {
    if (e.target === this.track) {
      this.clearSelection();
    }
  }

  handleKeyDown(e) {
    if (e.key === 'Delete' && this.selectedElement) {
      this.deleteElement(this.selectedElement);
    }
  }

  deleteElement(element) {
    element.remove();
    this.elements = this.elements.filter(e => e.element !== element);
    this.selectedElement = null;

    if (this.elements.length === 0) {
      this.showInstructions();
    }
  }

  clearSelection() {
    document
      .querySelectorAll('.timeline-action.selected, .timeline-element.selected')
      .forEach(el => {
        el.classList.remove('selected');
      });
    this.selectedElement = null;
  }

  hideInstructions() {
    if (this.instructions) this.instructions.style.display = 'none';
  }

  showInstructions() {
    if (this.instructions) this.instructions.style.display = 'block';
  }

  // ================================================================================
  // LECTURE DE TIMELINE
  // ================================================================================

  playSequence() {
    if (!this.websocketManager.isConnected) {
      this.websocketManager.showAlert('danger', locales.errorNotConnected);
      return;
    }

    if (this.elements.length === 0) {
      this.websocketManager.showAlert('warning', locales.timeline.noElements);
      return;
    }

    this.isPlaying = true;
    this.playButton.disabled = true;
    this.stopButton.disabled = false;
    this.playButton.textContent = locales.timeline.playing;

    this.startTime = Date.now();
    this.animationFrame = requestAnimationFrame(() => this.updatePlaybackPosition());

    const sortedElements = this.elements
      .filter(el => el.moduleId && el.action && el.startTime !== null)
      .sort((a, b) => a.startTime + a.delay - (b.startTime + b.delay));

    this.scheduleActions(sortedElements);
  }

  scheduleActions(elements) {
    this.timeouts = [];
    elements.forEach(el => {
      const delay = (el.startTime + el.delay) * 1000;
      const timeout = setTimeout(() => {
        this.executeAction(el);
      }, delay);
      this.timeouts.push(timeout);
    });

    if (elements.length > 0) {
      const totalDuration =
        Math.max(...elements.map(e => e.startTime + e.delay + e.duration)) * 1000;
      this.stopTimeout = setTimeout(() => {
        this.stopSequence();
      }, totalDuration);
    }
  }

  executeAction(element) {
    const message = {
      type: 'moduleAction',
      moduleId: element.moduleId,
      action: element.action,
      parameters: element.parameters || {},
      duration: element.duration,
    };

    this.websocketManager.send(message);
  }

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

  stopSequence() {
    this.isPlaying = false;
    this.playButton.disabled = false;
    this.stopButton.disabled = true;
    this.playButton.textContent = locales.timeline.play;

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

  // ================================================================================
  // GÉNÉRATION DE SÉQUENCE ET EXPORT
  // ================================================================================

  generateSequence() {
    const sequence = {
      modules: {},
      totalDuration: 0,
    };

    this.elements.forEach(element => {
      const moduleId = element.moduleId;
      if (!moduleId) return;

      if (!sequence.modules[moduleId]) {
        sequence.modules[moduleId] = [];
      }

      sequence.modules[moduleId].push({
        startTime: element.startTime + element.delay,
        action: element.action,
        parameters: element.parameters || {},
        duration: element.duration,
      });
    });

    sequence.totalDuration = Math.max(
      ...this.elements.map(e => e.startTime + e.delay + e.duration),
      0
    );

    return sequence;
  }

  exportSequence() {
    const sequence = this.generateSequence();
    const blob = new Blob([JSON.stringify(sequence, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'timeline-sequence.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  importSequence(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const sequence = JSON.parse(e.target.result);
        this.loadSequence(sequence);
      } catch (error) {
        console.error("Erreur lors de l'import:", error);
        this.websocketManager.showAlert('danger', "Erreur lors de l'import du fichier");
      }
    };
    reader.readAsText(file);
  }

  loadSequence(sequence) {
    // Vider la timeline actuelle
    this.elements.forEach(el => el.element.remove());
    this.elements = [];

    // Charger les nouveaux éléments
    Object.keys(sequence.modules).forEach(moduleId => {
      const moduleActions = sequence.modules[moduleId];

      moduleActions.forEach(actionData => {
        // Retrouver le module et l'action correspondante
        const moduleConfig = MODULE_CONFIGS.find(config =>
          config.actions.some(action => action.id === actionData.action)
        );

        if (moduleConfig) {
          const actionConfig = moduleConfig.actions.find(action => action.id === actionData.action);

          if (actionConfig) {
            this.createElement({
              moduleId: moduleId,
              action: actionData.action,
              actionName: actionConfig.name,
              parameters: actionData.parameters,
              startTime: actionData.startTime,
              duration: actionData.duration,
              delay: 0,
            });
          }
        }
      });
    });

    this.hideInstructions();
  }
}

// Initialiser la timeline quand le DOM est prêt
document.addEventListener('DOMContentLoaded', function () {
  window.timeline = new TimelineSequencer();
});
