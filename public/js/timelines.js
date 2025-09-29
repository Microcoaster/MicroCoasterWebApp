/**
 * ================================================================================
 * MICROCOASTER WEBAPP - TIMELINE SEQUENCER
 * ================================================================================
 *
 * Purpose: Interactive timeline editor for module sequences and automation
 * Author: MicroCoaster Development Team
 * Created: 2024
 *
 * Description:
 * Manages timeline creation, editing, and playback functionality for module
 * automation sequences. Provides drag-and-drop interface, real-time playback,
 * and sequence configuration management.
 *
 * Dependencies:
 * - global.js (utilities)
 *
 * ================================================================================
 */

// ================================================================================
// TIMELINE SEQUENCER CLASS
// ================================================================================

class TimelineSequencer {
  constructor() {
    this.track = document.getElementById('timelineTrack');
    this.ruler = document.getElementById('timeRuler');
    this.playbackIndicator = document.getElementById('playbackIndicator');
    this.instructions = document.getElementById('instructions');

    this.elements = [];
    this.isPlaying = false;
    this.currentTime = 0;
    this.totalDuration = 0;
    this.pixelsPerSecond = 100;

    this.selectedElement = null;
    this.draggedElement = null;

    this.init();
  }

  init() {
    this.setupEventListeners();
    this.setupDragAndDrop();
    this.generateTimeRuler();
  }

  setupEventListeners() {
    // Drag & drop
    this.track.addEventListener('dragover', e => this.handleDragOver(e));
    this.track.addEventListener('drop', e => this.handleDrop(e));
    this.track.addEventListener('dragleave', e => this.handleDragLeave(e));

    // Click sur track
    this.track.addEventListener('click', e => this.handleTrackClick(e));

    // Keyboard
    document.addEventListener('keydown', e => this.handleKeyDown(e));

    // Control buttons
    const clearBtn = document.getElementById('clearBtn');
    const saveBtn = document.getElementById('saveBtn');
    const playBtn = document.getElementById('playBtn');
    const closeConfigBtn = document.getElementById('closeConfigBtn');
    const cancelConfigBtn = document.getElementById('cancelConfigBtn');
    const saveConfigBtn = document.getElementById('saveConfigBtn');

    if (clearBtn) clearBtn.addEventListener('click', () => this.clear());
    if (saveBtn) saveBtn.addEventListener('click', () => this.save());
    if (playBtn) playBtn.addEventListener('click', () => this.togglePlayback());
    if (closeConfigBtn) closeConfigBtn.addEventListener('click', () => this.closeConfig());
    if (cancelConfigBtn) cancelConfigBtn.addEventListener('click', () => this.closeConfig());
    if (saveConfigBtn) saveConfigBtn.addEventListener('click', () => this.saveConfig());
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

  generateTimeRuler() {
    this.ruler.innerHTML = '';
    const maxTime = Math.max(30, this.totalDuration + 10); // Au moins 30 secondes

    for (let i = 0; i <= maxTime; i += 5) {
      const marker = document.createElement('div');
      marker.className = 'time-marker';
      marker.style.left = i * this.pixelsPerSecond + 'px';
      marker.textContent = i + 's';
      this.ruler.appendChild(marker);
    }
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

  addElementToTimeline(moduleData, x, y) {
    // Calculer le temps basé sur la position X
    const timePosition = Math.max(0, x / this.pixelsPerSecond);

    const element = document.createElement('div');
    element.className = 'timeline-element';
    element.dataset.moduleId = moduleData.id;
    element.dataset.startTime = timePosition.toFixed(1);
    element.dataset.duration = '2';
    element.dataset.delay = '1';

    element.style.left = timePosition * this.pixelsPerSecond + 'px';
    element.style.top = Math.max(80, y) + 'px';

    element.innerHTML = `
      <div class="element-header">
        <div class="element-name">${moduleData.name}</div>
        <div class="element-duration">2s</div>
      </div>
      <div class="element-config">Cliquez pour configurer</div>
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
      duration: 2,
      delay: 1,
    });

    this.updateTotalDuration();
    this.generateTimeRuler();
    this.hideInstructions();
  }

  selectElement(element) {
    // Désélectionner tous
    document.querySelectorAll('.timeline-element.selected').forEach(el => {
      el.classList.remove('selected');
    });

    // Sélectionner l'élément
    element.classList.add('selected');
    this.selectedElement = element;
  }

  openConfig(element) {
    const moduleData = this.elements.find(e => e.element === element);
    if (!moduleData) return;

    document.getElementById('modalTitle').textContent =
      `Configuration ${moduleData.moduleData.name}`;
    document.getElementById('moduleName').value = moduleData.moduleData.name;
    document.getElementById('moduleDuration').value = moduleData.duration;
    document.getElementById('moduleDelay').value = moduleData.delay;

    // Configuration spécifique selon le type
    this.generateSpecificConfig(moduleData.moduleData.type);

    document.getElementById('configModal').classList.add('show');
  }

  generateSpecificConfig(moduleType) {
    const container = document.getElementById('moduleSpecificConfig');
    container.innerHTML = '';

    switch (moduleType) {
      case 'Audio Player':
        container.innerHTML = `
          <div class="form-group">
            <label class="form-label">Fichier audio</label>
            <input type="text" class="form-input" id="audioFile" placeholder="chemin/vers/audio.mp3">
          </div>
          <div class="form-group">
            <label class="form-label">Volume (0-100)</label>
            <input type="number" class="form-input" id="volume" value="50" min="0" max="100">
          </div>
        `;
        break;
      case 'Light FX':
        container.innerHTML = `
          <div class="form-group">
            <label class="form-label">Couleur</label>
            <input type="color" class="form-input" id="lightColor" value="#ff0000">
          </div>
          <div class="form-group">
            <label class="form-label">Effet</label>
            <select class="form-input" id="lightEffect">
              <option value="static">Statique</option>
              <option value="fade">Fondu</option>
              <option value="blink">Clignotant</option>
            </select>
          </div>
        `;
        break;
      case 'Smoke Machine':
        container.innerHTML = `
          <div class="form-group">
            <label class="form-label">Intensité (0-100)</label>
            <input type="number" class="form-input" id="smokeIntensity" value="50" min="0" max="100">
          </div>
        `;
        break;
    }
  }

  saveConfig() {
    if (!this.selectedElement) return;

    const duration = parseFloat(document.getElementById('moduleDuration').value);
    const delay = parseFloat(document.getElementById('moduleDelay').value);

    this.selectedElement.dataset.duration = duration;
    this.selectedElement.dataset.delay = delay;

    // Mettre à jour l'affichage
    this.selectedElement.querySelector('.element-duration').textContent = duration + 's';

    // Mettre à jour dans le tableau
    const elementData = this.elements.find(e => e.element === this.selectedElement);
    if (elementData) {
      elementData.duration = duration;
      elementData.delay = delay;
    }

    this.updateTotalDuration();
    this.closeConfig();
  }

  closeConfig() {
    document.getElementById('configModal').classList.remove('show');
  }

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

      const timePosition = Math.max(0, x / this.pixelsPerSecond);

      this.draggedElement.style.left = timePosition * this.pixelsPerSecond + 'px';
      this.draggedElement.style.top = Math.max(80, y) + 'px';
      this.draggedElement.dataset.startTime = timePosition.toFixed(1);

      // Mettre à jour dans le tableau
      const elementData = this.elements.find(e => e.element === this.draggedElement);
      if (elementData) {
        elementData.startTime = timePosition;
      }
    };

    const handleMouseUp = () => {
      this.draggedElement = null;
      this.updateTotalDuration();
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

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
    this.updateTotalDuration();
    this.selectedElement = null;

    if (this.elements.length === 0) {
      this.showInstructions();
    }
  }

  clearSelection() {
    document.querySelectorAll('.timeline-element.selected').forEach(el => {
      el.classList.remove('selected');
    });
    this.selectedElement = null;
  }

  updateTotalDuration() {
    this.totalDuration = Math.max(...this.elements.map(e => e.startTime + e.duration + e.delay), 0);
    this.generateTimeRuler();
  }

  hideInstructions() {
    this.instructions.style.display = 'none';
  }

  showInstructions() {
    this.instructions.style.display = 'block';
  }

  togglePlayback() {
    if (this.isPlaying) {
      this.stopPlayback();
    } else {
      this.startPlayback();
    }
  }

  startPlayback() {
    if (this.elements.length === 0) {
      alert(t('timelines.no_modules_alert'));
      return;
    }

    this.isPlaying = true;
    this.currentTime = 0;

    document.getElementById('playBtn').classList.add('playing');
    document.getElementById('playIcon').className = 'bi bi-stop-fill';
    document.getElementById('playText').textContent = t('timelines.stop_timeline');

    this.playbackIndicator.classList.add('active');

    this.playbackInterval = setInterval(() => {
      this.currentTime += 0.1;
      this.playbackIndicator.style.left = this.currentTime * this.pixelsPerSecond + 'px';

      // Vérifier si on doit déclencher des modules
      this.checkModuleActivation();

      if (this.currentTime >= this.totalDuration) {
        this.stopPlayback();
      }
    }, 100);
  }

  stopPlayback() {
    this.isPlaying = false;

    if (this.playbackInterval) {
      clearInterval(this.playbackInterval);
    }

    document.getElementById('playBtn').classList.remove('playing');
    document.getElementById('playIcon').className = 'bi bi-play-fill';
    document.getElementById('playText').textContent = t('timelines.play_timeline');

    this.playbackIndicator.classList.remove('active');
    this.currentTime = 0;
    this.playbackIndicator.style.left = '0px';
  }

  checkModuleActivation() {
    this.elements.forEach(elementData => {
      const { element, moduleData, startTime, duration } = elementData;

      if (this.currentTime >= startTime && this.currentTime <= startTime + duration) {
        element.style.boxShadow = '0 0 20px rgba(32, 194, 106, 0.8)';

        // Ici on pourrait envoyer des commandes aux vrais modules
        console.log(`Activation ${moduleData.name} à ${this.currentTime.toFixed(1)}s`);
      } else {
        element.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.3)';
      }
    });
  }

  clear() {
    if (confirm(t('timelines.clear_timeline_confirm'))) {
      this.elements.forEach(e => e.element.remove());
      this.elements = [];
      this.stopPlayback();
      this.showInstructions();
      this.updateTotalDuration();
    }
  }

  save() {
    const timelineData = {
      elements: this.elements.map(e => ({
        moduleId: e.moduleData.id,
        startTime: e.startTime,
        duration: e.duration,
        delay: e.delay,
        position: {
          x: parseInt(e.element.style.left),
          y: parseInt(e.element.style.top),
        },
      })),
      totalDuration: this.totalDuration,
    };

    console.log('Timeline sauvegardée:', timelineData);
    alert(t('timelines.timeline_saved'));

    // Ici on pourrait sauvegarder en base
  }
}

// Initialiser la timeline quand le DOM est prêt
document.addEventListener('DOMContentLoaded', function () {
  window.timeline = new TimelineSequencer();
});
