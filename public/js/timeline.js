// Timeline Editor JavaScript
class TimelineEditor {
  constructor() {
    this.canvas = document.getElementById('timelineCanvas');
    this.modules = [];
    this.connections = [];
    this.selectedElement = null;
    this.draggedElement = null;
    this.isDragging = false;
    this.scale = 1;
    this.offset = { x: 0, y: 0 };
    this.gridSize = 50; // 50px = 10cm selon l'échelle
    
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.setupDragAndDrop();
    this.addTrackPiecesToLibrary();
    this.setupGridSnapping();
  }

  setupEventListeners() {
    // Canvas events
    this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
    this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    this.canvas.addEventListener('dragover', (e) => e.preventDefault());
    this.canvas.addEventListener('drop', (e) => this.handleDrop(e));

    // Keyboard events
    document.addEventListener('keydown', (e) => this.handleKeyDown(e));
  }

  setupDragAndDrop() {
    // Configurer le drag & drop pour les modules déjà présents dans le DOM
    document.querySelectorAll('.module-item').forEach(item => {
      item.addEventListener('dragstart', (e) => {
        const moduleData = {
          id: item.dataset.moduleId,
          name: item.dataset.moduleName,
          type: item.dataset.moduleType,
          category: item.dataset.category,
          isOnline: item.dataset.isOnline === 'true'
        };
        e.dataTransfer.setData('text/plain', JSON.stringify(moduleData));
      });
    });
  }

  addTrackPiecesToLibrary() {
    const libraryContainer = document.getElementById('moduleLibrary');
    
    // Ajouter un séparateur
    const separator = document.createElement('div');
    separator.style.cssText = `
      border-top: 1px solid rgba(255,255,255,.1);
      margin: 20px 0 16px 0;
      padding-top: 16px;
    `;
    separator.innerHTML = `
      <h4 style="color: var(--text); font-size: 14px; font-weight: 700; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 12l2 2 4-4"/>
          <path d="M21 12c-1 0-3-1-3-3s2-3 3-3 3 1 3 3-2 3-3 3"/>
          <path d="M3 12c1 0 3-1 3-3s-2-3-3-3-3 1-3 3 2 3 3 3"/>
          <path d="M11 12h2"/>
        </svg>
        Track Pieces
      </h4>
    `;
    libraryContainer.appendChild(separator);

    // Pièces de track 2D réalistes
    const trackPieces = [
      { id: 'straight-h', name: 'Straight Track', type: 'Track', icon: '━', description: 'Horizontal (10cm)' },
      { id: 'straight-v', name: 'Straight Track', type: 'Track', icon: '┃', description: 'Vertical (10cm)' },
      { id: 'curve-tl', name: 'Curve Left', type: 'Track', icon: '┌', description: 'Top-Left' },
      { id: 'curve-tr', name: 'Curve Right', type: 'Track', icon: '┐', description: 'Top-Right' },
      { id: 'curve-bl', name: 'Curve Left', type: 'Track', icon: '└', description: 'Bottom-Left' },
      { id: 'curve-br', name: 'Curve Right', type: 'Track', icon: '┘', description: 'Bottom-Right' }
    ];

    trackPieces.forEach(piece => {
      const trackElement = this.createTrackPieceElement(piece);
      libraryContainer.appendChild(trackElement);
    });
  }

  createTrackPieceElement(piece) {
    const div = document.createElement('div');
    div.className = 'module-item';
    div.draggable = true;
    div.dataset.moduleId = piece.id;
    div.dataset.moduleName = piece.name;
    div.dataset.moduleType = piece.type;
    div.dataset.category = 'track-piece';

    div.innerHTML = `
      <div class="module-icon" style="background: ${this.getModuleTypeColor(piece.type)}">${piece.icon}</div>
      <div class="module-info">
        <div class="module-name">${piece.name}</div>
        <div class="module-type">${piece.description}</div>
      </div>
    `;

    div.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', JSON.stringify({
        id: piece.id,
        name: piece.name,
        type: piece.type,
        category: 'track-piece',
        isOnline: false
      }));
    });

    return div;
  }

  getModuleTypeIcon(type) {
    const icons = {
      'Station': '🚉',
      'Launch Track': '🚀',
      'Brake': '🛑',
      'Lift': '⬆️',
      'Block': '🔄',
      'Sensor': '📡',
      'Audio Player': '🔊',
      'Light FX': '💡',
      'Smoke Machine': '💨',
      'Track': '🛤️'
    };
    return icons[type] || '⚙️';
  }

  handleDrop(e) {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    try {
      const moduleData = JSON.parse(e.dataTransfer.getData('text/plain'));
      this.addModuleToCanvas(moduleData, x, y);
    } catch (error) {
      console.error('Error parsing dropped data:', error);
    }
  }

  addModuleToCanvas(moduleData, x, y) {
    // Snap to grid (50px = 10cm)
    const snappedX = Math.round(x / this.gridSize) * this.gridSize;
    const snappedY = Math.round(y / this.gridSize) * this.gridSize;

    const moduleElement = document.createElement('div');
    moduleElement.className = 'track-element';
    moduleElement.style.left = snappedX + 'px';
    moduleElement.style.top = snappedY + 'px';
    moduleElement.dataset.moduleId = moduleData.id;
    moduleElement.dataset.moduleName = moduleData.name;
    moduleElement.dataset.moduleType = moduleData.type;
    moduleElement.dataset.category = moduleData.category || 'module';
    moduleElement.dataset.isOnline = moduleData.isOnline || false;

    // Affichage différent selon la catégorie
    if (moduleData.category === 'track-piece') {
      // Pour les pièces de track 2D, ajouter la classe CSS appropriée
      moduleElement.classList.add('track-piece', moduleData.id);
      moduleElement.innerHTML = ''; // Pas de texte, le CSS fait le rendu
      
      // Ajuster la position pour centrer la pièce sur le curseur
      const pieceWidth = this.getTrackPieceWidth(moduleData.id);
      const pieceHeight = this.getTrackPieceHeight(moduleData.id);
      moduleElement.style.left = (snappedX - pieceWidth/2) + 'px';
      moduleElement.style.top = (snappedY - pieceHeight/2) + 'px';
    } else {
      // Pour les modules, utiliser les initiales + pastille de statut
      const statusClass = moduleData.isOnline ? 'online' : 'offline';
      moduleElement.innerHTML = `
        <div class="module-content">
          <span class="module-text">${moduleData.name.split(' ').map(w => w[0]).join('')}</span>
          <div class="canvas-status-indicator ${statusClass}"></div>
        </div>
      `;
    }

    // Set color based on type (seulement pour les modules)
    if (moduleData.category !== 'track-piece') {
      moduleElement.style.background = this.getModuleTypeColor(moduleData.type);
      
      // Ajouter une classe si offline
      if (moduleData.category === 'user-module' && !moduleData.isOnline) {
        moduleElement.classList.add('offline-module');
      }
    }

    moduleElement.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.selectElement(moduleElement);
      this.startDragging(moduleElement, e);
    });

    moduleElement.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.configureModule(moduleElement);
    });

    this.canvas.appendChild(moduleElement);
    this.modules.push({
      element: moduleElement,
      id: moduleData.id,
      name: moduleData.name,
      type: moduleData.type,
      category: moduleData.category || 'module',
      isOnline: moduleData.isOnline || false,
      x: snappedX,
      y: snappedY,
      delay: 0
    });

    this.selectElement(moduleElement);
  }

  getTrackPieceWidth(pieceId) {
    const sizes = {
      'straight-h': 100,
      'straight-v': 20,
      'curve-tl': 60,
      'curve-tr': 60,
      'curve-bl': 60,
      'curve-br': 60
    };
    return sizes[pieceId] || 80;
  }

  getTrackPieceHeight(pieceId) {
    const sizes = {
      'straight-h': 20,
      'straight-v': 100,
      'curve-tl': 60,
      'curve-tr': 60,
      'curve-bl': 60,
      'curve-br': 60
    };
    return sizes[pieceId] || 40;
  }

  getModuleTypeColor(type) {
    const colors = {
      'Station': 'linear-gradient(135deg, #4a90e2, #357abd)',
      'Launch Track': 'linear-gradient(135deg, #ff6b6b, #ee5a5a)',
      'Brake': 'linear-gradient(135deg, #ffa726, #ff8f00)',
      'Lift': 'linear-gradient(135deg, #66bb6a, #4caf50)',
      'Block': 'linear-gradient(135deg, #ab47bc, #9c27b0)',
      'Sensor': 'linear-gradient(135deg, #26c6da, #00acc1)',
      'Audio Player': 'linear-gradient(135deg, #ec407a, #e91e63)',
      'Light FX': 'linear-gradient(135deg, #ffee58, #fdd835)',
      'Smoke Machine': 'linear-gradient(135deg, #78909c, #607d8b)',
      'Track': 'linear-gradient(135deg, #90a4ae, #78909c)'
    };
    return colors[type] || 'linear-gradient(135deg, #4a90e2, #357abd)';
  }

  selectElement(element) {
    // Remove previous selection
    document.querySelectorAll('.track-element.selected').forEach(el => {
      el.classList.remove('selected');
    });

    // Select new element
    element.classList.add('selected');
    this.selectedElement = element;
  }

  startDragging(element, e) {
    this.draggedElement = element;
    this.isDragging = true;
    
    // Calculer l'offset précis entre le curseur et l'élément
    const rect = element.getBoundingClientRect();
    this.dragOffset = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    
    element.style.zIndex = '1000';
    element.classList.add('dragging');
  }

  handleMouseMove(e) {
    if (this.isDragging && this.draggedElement) {
      const rect = this.canvas.getBoundingClientRect();
      
      // Position relative au canvas en tenant compte de l'offset
      const x = e.clientX - rect.left - this.dragOffset.x;
      const y = e.clientY - rect.top - this.dragOffset.y;

      // Snap to grid (50px = 10cm)
      const snappedX = Math.max(0, Math.round(x / this.gridSize) * this.gridSize);
      const snappedY = Math.max(0, Math.round(y / this.gridSize) * this.gridSize);

      this.draggedElement.style.left = snappedX + 'px';
      this.draggedElement.style.top = snappedY + 'px';

      // Update module data
      const moduleIndex = this.modules.findIndex(m => m.element === this.draggedElement);
      if (moduleIndex !== -1) {
        this.modules[moduleIndex].x = snappedX;
        this.modules[moduleIndex].y = snappedY;
      }
    }
  }

  handleMouseUp(e) {
    if (this.isDragging && this.draggedElement) {
      this.draggedElement.style.zIndex = '';
      this.draggedElement.classList.remove('dragging');
    }
    this.isDragging = false;
    this.draggedElement = null;
  }

  handleCanvasClick(e) {
    if (e.target === this.canvas || e.target.classList.contains('canvas-grid')) {
      this.clearSelection();
    }
  }

  clearSelection() {
    document.querySelectorAll('.track-element.selected').forEach(el => {
      el.classList.remove('selected');
    });
    this.selectedElement = null;
  }

  handleKeyDown(e) {
    if (e.key === 'Delete' && this.selectedElement) {
      this.deleteElement(this.selectedElement);
    }
    if (e.key === 'Escape') {
      this.clearSelection();
    }
  }

  deleteElement(element) {
    // Remove from modules array
    this.modules = this.modules.filter(m => m.element !== element);
    
    // Remove from DOM
    element.remove();
    
    this.selectedElement = null;
  }

  setupGridSnapping() {
    // Grid is already set up in CSS
  }

  configureModule(element) {
    const moduleData = this.modules.find(m => m.element === element);
    if (!moduleData) return;

    const delay = prompt(`Enter delay for ${moduleData.name} (in seconds):`, moduleData.delay || '0');
    if (delay !== null) {
      moduleData.delay = parseFloat(delay) || 0;
      this.updateDelayDisplay();
    }
  }

  calculateDelays() {
    // Sort modules by Y position (top to bottom)
    const sortedModules = [...this.modules].sort((a, b) => a.y - b.y);
    
    // Calculate automatic delays based on position and type
    sortedModules.forEach((module, index) => {
      if (index === 0) {
        module.delay = 0; // First module starts immediately
      } else {
        const prevModule = sortedModules[index - 1];
        const distance = Math.abs(module.y - prevModule.y);
        
        // Base delay calculation (distance-based + type-based)
        let baseDelay = Math.floor(distance / 40); // 40px = 1 second
        
        // Add type-specific delays
        const typeDelays = {
          'Station': 0,
          'Launch Track': 2,
          'Brake': 1,
          'Lift': 5,
          'Block': 3,
          'Sensor': 0,
          'Audio Player': 1,
          'Light FX': 0.5,
          'Smoke Machine': 2
        };
        
        baseDelay += typeDelays[module.type] || 1;
        module.delay = baseDelay;
      }
    });

    this.updateDelayDisplay();
  }

  updateDelayDisplay() {
    const delayList = document.getElementById('delayList');
    
    if (this.modules.length === 0) {
      delayList.innerHTML = `
        <p style="color: #a8aeb5; font-size: 12px; text-align: center; margin: 20px 0;">
          Place modules on the track and click "Calculate" to see delays
        </p>
      `;
      return;
    }

    const sortedModules = [...this.modules].sort((a, b) => a.y - b.y);
    
    delayList.innerHTML = sortedModules.map((module, index) => {
      const nextModule = sortedModules[index + 1];
      if (!nextModule) return '';
      
      return `
        <div class="delay-item">
          <div class="delay-route">${module.name} → ${nextModule.name}</div>
          <div class="delay-time">${nextModule.delay}s</div>
        </div>
      `;
    }).join('');
  }

  saveTimeline() {
    const timelineData = {
      modules: this.modules.map(m => ({
        id: m.id,
        name: m.name,
        type: m.type,
        x: m.x,
        y: m.y,
        delay: m.delay
      })),
      connections: this.connections,
      created: new Date().toISOString()
    };

    const dataStr = JSON.stringify(timelineData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `timeline_${new Date().getTime()}.json`;
    link.click();
  }

  loadTimeline() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const timelineData = JSON.parse(e.target.result);
          this.clearCanvas();
          
          timelineData.modules.forEach(moduleData => {
            this.addModuleToCanvas(moduleData, moduleData.x, moduleData.y);
            const moduleIndex = this.modules.findIndex(m => m.id === moduleData.id);
            if (moduleIndex !== -1) {
              this.modules[moduleIndex].delay = moduleData.delay;
            }
          });
          
          this.updateDelayDisplay();
        } catch (error) {
          alert('Error loading timeline file: ' + error.message);
        }
      };
      reader.readAsText(file);
    };
    
    input.click();
  }

  clearCanvas() {
    this.modules.forEach(m => m.element.remove());
    this.modules = [];
    this.connections = [];
    this.selectedElement = null;
    this.updateDelayDisplay();
  }

  async playTimeline() {
    if (this.modules.length === 0) {
      alert('No modules on the timeline to play!');
      return;
    }

    // Calculer les délais avant de jouer
    this.calculateDelays();

    // Trier les modules par délai (ordre d'exécution)
    const sortedModules = [...this.modules]
      .filter(m => m.category === 'user-module') // Seulement les vrais modules
      .sort((a, b) => a.delay - b.delay);

    if (sortedModules.length === 0) {
      alert('No user modules to execute! Add some modules to the timeline.');
      return;
    }

    console.log('🎬 Starting timeline playback...');
    
    // Réinitialiser l'état visuel
    this.modules.forEach(m => {
      m.element.classList.remove('playing', 'played');
    });

    // Fonction pour marquer un module comme en cours de lecture
    const highlightModule = (module, state) => {
      module.element.classList.remove('playing', 'played');
      if (state === 'playing') {
        module.element.classList.add('playing');
      } else if (state === 'played') {
        module.element.classList.add('played');
      }
    };

    // Exécuter chaque module avec son délai
    for (let i = 0; i < sortedModules.length; i++) {
      const module = sortedModules[i];
      const delay = module.delay * 1000; // Convertir en millisecondes

      console.log(`⏱️ Waiting ${module.delay}s before executing ${module.name}...`);
      
      await new Promise(resolve => {
        setTimeout(() => {
          console.log(`▶️ Executing module: ${module.name} (${module.type})`);
          highlightModule(module, 'playing');
          
          // Simuler l'exécution du module
          setTimeout(() => {
            highlightModule(module, 'played');
            
            // Envoyer commande au module si online
            if (module.isOnline) {
              this.sendModuleCommand(module);
            } else {
              console.log(`⚠️ Module ${module.name} is offline - command simulated`);
            }
            
            resolve();
          }, 500); // 500ms pour visualiser l'état "playing"
          
        }, delay);
      });
    }

    console.log('✅ Timeline playback completed!');
    
    // Notification de fin
    setTimeout(() => {
      this.modules.forEach(m => {
        m.element.classList.remove('playing', 'played');
      });
    }, 2000);
  }

  sendModuleCommand(module) {
    // Simuler l'envoi de commande via WebSocket
    console.log(`📡 Sending command to ${module.name}:`, {
      moduleId: module.id,
      type: module.type,
      action: 'trigger'
    });
    
    // Ici on pourrait envoyer la vraie commande WebSocket
    // socket.emit('module-command', { moduleId: module.id, action: 'trigger' });
  }
}

// Global functions called by buttons
function saveTimeline() {
  timelineEditor.saveTimeline();
}

function loadTimeline() {
  timelineEditor.loadTimeline();
}

function clearCanvas() {
  if (confirm('Are you sure you want to clear the entire timeline?')) {
    timelineEditor.clearCanvas();
  }
}

function calculateDelays() {
  timelineEditor.calculateDelays();
}

function playTimeline() {
  timelineEditor.playTimeline();
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.timelineEditor = new TimelineEditor();
});