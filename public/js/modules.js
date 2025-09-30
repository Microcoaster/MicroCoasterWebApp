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
 * Crée un contrôleur de station interactif
 * Génère l'interface de contrôle pour un module de type station avec boutons et indicateurs
 * @param {HTMLElement} panel - Élément DOM du panneau de la station
 * @returns {Object} Objet contrôleur avec méthodes de gestion
 */
function makeStationController(panel) {
  const IMG = {
    ON: urlImg('button_green_on.png'),
    OFF: urlImg('button_green_off.png'),
    SW_A: urlImg('switch_0.png'),
    SW_B: urlImg('switch_1.png'),
    LED_ON: urlImg('led_on.png'),
    LED_OFF: urlImg('led_off.png'),
    ESTOP: urlImg('emergency_button.png'),
    RESET: urlImg('reset_button.png'),
  };
  preload(Object.values(IMG));

  const estopImg = panel.querySelector('[data-role="st_estop"]');
  const nsfImg = panel.querySelector('[data-role="st_nsf"]');
  const dispatchImg = panel.querySelector('[data-role="st_dispatch"]');
  const gatesImg = panel.querySelector('[data-role="st_gates"]');
  const harnessImg = panel.querySelector('[data-role="st_harness"]');

  let gatesClosed = false,
    harnessLocked = false,
    nextSectionFree = true;
  let inDispatch = false,
    dispatchTmr = null;
  let blinkTmr = null,
    blinkOn = false;
  let gatesCooldown = false,
    harnessCooldown = false;
  let estop = false;

  /**
   * Met à jour l'image d'un commutateur selon son état
   * @param {HTMLElement} img - Élément image du commutateur
   * @param {boolean} isB - True pour position B, false pour position A
   * @returns {void}
   * @private
   */
  const setSwitch = (img, isB) => {
    if (img) img.src = isB ? IMG.SW_B : IMG.SW_A;
  };

  /**
   * Met à jour l'indicateur Next Section Free
   * @param {boolean} on - État de la section suivante (libre ou occupée)
   * @returns {void}
   * @private
   */
  const setNSF = on => {
    if (nsfImg) nsfImg.src = on ? IMG.LED_ON : IMG.LED_OFF;
  };

  /**
   * Met à jour l'état verrouillé/déverrouillé du panneau de station
   * @returns {void}
   * @private
   */
  function updateDisabled() {
    const lock = estop || inDispatch;
    panel.classList.toggle('locked', lock);
    const isOffline = panel.classList.contains('offline');
    if (estopImg) estopImg.style.pointerEvents = isOffline ? 'none' : 'auto';
  }

  /**
   * Applique l'état visuel de la lampe de dispatch (clignotante)
   * @returns {void}
   * @private
   */
  function applyDispatchLamp() {
    if (dispatchImg) dispatchImg.src = blinkOn ? IMG.ON : IMG.OFF;
  }

  /**
   * Démarre le clignotement de la lampe de dispatch
   * @returns {void}
   * @private
   */
  function startBlink() {
    if (blinkTmr || inDispatch || estop) return;
    blinkOn = false;
    applyDispatchLamp();
    blinkTmr = setInterval(() => {
      blinkOn = !blinkOn;
      applyDispatchLamp();
    }, 800);
  }
  /**
   * Arrête le clignotement de la lampe de dispatch
   * @param {boolean} [forceOff=true] - Force l'état éteint
   * @returns {void}
   * @private
   */
  function stopBlink(forceOff = true) {
    if (blinkTmr) {
      clearInterval(blinkTmr);
      blinkTmr = null;
    }
    blinkOn = !forceOff;
    applyDispatchLamp();
  }

  /**
   * Vérifie si le dispatch est autorisé selon les conditions de sécurité
   * @returns {boolean} True si le dispatch est possible
   * @private
   */
  const canDispatch = () =>
    !estop && nextSectionFree && gatesClosed && harnessLocked && !inDispatch;

  /**
   * Réévalue tous les états et met à jour l'interface de la station
   * @returns {void}
   * @private
   */
  function reevaluate() {
    setNSF(nextSectionFree && !estop);
    setSwitch(gatesImg, gatesClosed);
    setSwitch(harnessImg, harnessLocked);
    if (canDispatch()) startBlink();
    else stopBlink(true);
  }

  estopImg?.addEventListener('click', () => {
    estop = !estop;
    estopImg.src = estop ? IMG.RESET : IMG.ESTOP;
    if (estop) stopBlink(true);
    updateDisabled();
    reevaluate();
  });

  gatesImg?.addEventListener('click', () => {
    if (estop || inDispatch || gatesCooldown) return;
    gatesClosed = !gatesClosed;
    gatesCooldown = true;
    setTimeout(() => (gatesCooldown = false), 3000);
    reevaluate();
    window.ws_sendCommand(panel, gatesClosed ? 'gates_close' : 'gates_open', {}, gatesImg);
  });

  harnessImg?.addEventListener('click', () => {
    if (estop || inDispatch || harnessCooldown) return;
    harnessLocked = !harnessLocked;
    harnessCooldown = true;
    setTimeout(() => (harnessCooldown = false), 3000);
    reevaluate();
  });

  dispatchImg?.addEventListener('click', () => {
    if (!canDispatch()) return;
    inDispatch = true;
    updateDisabled();
    stopBlink(false);
    nextSectionFree = false;
    reevaluate();
    window.ws_sendCommand(panel, 'start', {}, dispatchImg);

    clearTimeout(dispatchTmr);
    dispatchTmr = setTimeout(() => {
      inDispatch = false;
      nextSectionFree = true;
      updateDisabled();
      reevaluate();
    }, 10000);
  });

  /**
   * Callback exécuté lorsque le module station passe en ligne
   * Met à jour l'état de l'interface et réévalue les conditions
   * @returns {void}
   * @private
   */
  function onPresenceOnline() {
    updateDisabled();
    reevaluate();
  }
  /**
   * Callback exécuté lorsque le module station passe hors ligne
   * Arrête le clignotement et remet l'interface en mode sécurisé
   * @returns {void}
   * @private
   */
  function onPresenceOffline() {
    stopBlink(true);
    setNSF(false);
    updateDisabled();
  }

  /**
   * Met à jour l'état de la station avec les données de télémétrie
   * Synchronise l'interface avec l'état réel du module physique
   * @param {Object} [t={}] - Données de télémétrie (gates, harness, nsf, estop)
   * @returns {void}
   * @private
   */
  function updateTelemetry(t = {}) {
    if ('gates' in t) gatesClosed = !!t.gates;
    if ('harness' in t) harnessLocked = !!t.harness;
    if ('nsf' in t) nextSectionFree = !!t.nsf;
    if ('estop' in t) estop = !!t.estop;
    updateDisabled();
    reevaluate();
  }

  updateDisabled();
  reevaluate();

  return {
    onPresenceOnline,
    onPresenceOffline,
    updateTelemetry,
    destroy() {
      clearInterval(blinkTmr);
      blinkTmr = null;
      clearTimeout(dispatchTmr);
    },
  };
}

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
    setLED(ledL, left);
    setLED(ledR, !left);
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
 * Crée un contrôleur d'éclairage interactif
 * Génère l'interface de contrôle pour un module d'éclairage avec réglage de luminosité
 * @param {HTMLElement} panel - Élément DOM du panneau d'éclairage
 * @returns {Object} Objet contrôleur avec méthodes de gestion d'éclairage
 */
function makeLightController(panel) {
  const IMG = {
    A: urlImg('switch_0.png'),
    B: urlImg('switch_1.png'),
    LED_ON: urlImg('led_on.png'),
    LED_OFF: urlImg('led_off.png'),
  };
  preload(Object.values(IMG));
  let lightOn = false,
    cooldown = false;
  const sw = panel.querySelector('[data-role="light_sw"]');
  const led = panel.querySelector('[data-role="light_led"]');

  /**
   * Met à jour l'état visuel de la LED d'éclairage
   * @param {boolean} on - État de la LED (allumée/éteinte)
   * @returns {void}
   * @private
   */
  const setLED = on => {
    if (led) led.src = on ? IMG.LED_ON : IMG.LED_OFF;
  };

  /**
   * Met à jour l'état visuel du commutateur d'éclairage
   * @param {boolean} on - État du commutateur (activé/désactivé)
   * @returns {void}
   * @private
   */
  const setSW = on => {
    if (sw) sw.src = on ? IMG.B : IMG.A;
  };

  /**
   * Applique l'état visuel complet du contrôleur d'éclairage
   * Synchronise le commutateur et la LED selon l'état actuel
   * @returns {void}
   * @private
   */
  const apply = () => {
    setSW(lightOn);
    setLED(lightOn);
  };

  sw?.addEventListener('click', () => {
    if (cooldown) return;
    lightOn = !lightOn;
    apply();
    window.ws_sendCommand(panel, 'led', { pin: 23, value: lightOn }, sw);
    cooldown = true;
    setTimeout(() => (cooldown = false), 3000);
  });

  /**
   * Callback exécuté lorsque le module d'éclairage passe en ligne
   * @returns {void}
   * @private
   */
  function onPresenceOnline() {
    apply();
  }

  /**
   * Callback exécuté lorsque le module d'éclairage passe hors ligne
   * @returns {void}
   * @private
   */
  function onPresenceOffline() {
    lightOn = false;
    apply();
  }

  /**
   * Met à jour l'état de l'éclairage avec les données de télémétrie
   * @param {Object} payload - Données reçues (led, light, on)
   * @returns {void}
   * @private
   */
  function updateTelemetry(payload) {
    const on = payload.led ?? payload.light ?? payload.on;
    if (on !== undefined) {
      lightOn = !!on;
      apply();
    }
  }

  apply();
  return { onPresenceOnline, onPresenceOffline, updateTelemetry, destroy() {} };
}

/**
 * Crée un contrôleur de lanceur interactif
 * Génère l'interface de contrôle pour un module de type lanceur avec contrôles de vitesse et direction
 * @param {HTMLElement} panel - Élément DOM du panneau de lanceur
 * @returns {Object} Objet contrôleur avec méthodes de gestion de lanceur
 */
function makeLaunchController(panel) {
  const IMG = {
    BTN_ON: urlImg('button_green_on.png'),
    BTN_OFF: urlImg('button_green_off.png'),
    LED_ON: urlImg('led_on.png'),
    LED_OFF: urlImg('led_off.png'),
    SW_A: urlImg('switch_0.png'),
    SW_B: urlImg('switch_1.png'),
  };
  preload(Object.values(IMG));

  let direction = 'forward',
    speed = 60;
  let inLaunch = false,
    blinkOn = false,
    blinkTmr = null,
    dirCooldown = false;

  const MIN_LDUR = 2,
    MAX_LDUR = 10;
  let lDuration = 5;
  let LN_STEP = 36,
    LN_BASE = 0;

  const ledImg = panel.querySelector('[data-role="ln_ready"]');
  const btnImg = panel.querySelector('[data-role="ln_btn"]');
  const dirImg = panel.querySelector('[data-role="ln_dir"]');
  const dirLbl = panel.querySelector('[data-role="ln_dir_lbl"]');
  const gauge = panel.querySelector('[data-role="ln_gauge"]');
  const spVal = panel.querySelector('[data-role="ln_speed_val"]');
  const plusBtn = panel.querySelector('[data-role="ln_plus"]');
  const minusBtn = panel.querySelector('[data-role="ln_minus"]');

  const lnRoll = panel.querySelector('[data-role="ln_roll"]');
  const lnTrack = panel.querySelector('[data-role="ln_track"]');
  const lnPlus = panel.querySelector('[data-role="ln_dur_plus"]');
  const lnMinus = panel.querySelector('[data-role="ln_dur_minus"]');

  /**
   * Met à jour l'état verrouillé du panneau de lanceur
   * @param {boolean} on - True pour verrouiller, false pour déverrouiller
   * @returns {void}
   * @private
   */
  const setLocked = on => panel.classList.toggle('locked', on);

  /**
   * Met à jour l'état de la LED de prêt du lanceur
   * @param {boolean} on - État de la LED (allumée/éteinte)
   * @returns {void}
   * @private
   */
  const setLED = on => {
    if (ledImg) ledImg.src = on ? IMG.LED_ON : IMG.LED_OFF;
  };

  /**
   * Met à jour l'interface de direction du lanceur
   * Synchronise l'image et le label de direction avec traduction
   * @returns {void}
   * @private
   */
  function setDirUI() {
    if (!dirImg || !dirLbl) return;
    dirImg.src = direction === 'forward' ? IMG.SW_A : IMG.SW_B;

    if (typeof window.t === 'function' && window.MC && window.MC.translations) {
      dirLbl.textContent = direction === 'forward' ? t('modules.forward') : t('modules.backward');
    } else {
      dirLbl.textContent = direction === 'forward' ? 'Forward' : 'Backward';
      if (!window.pendingTranslationUpdates) window.pendingTranslationUpdates = [];
      window.pendingTranslationUpdates.push(() => {
        if (dirLbl && typeof window.t === 'function') {
          dirLbl.textContent =
            direction === 'forward' ? t('modules.forward') : t('modules.backward');
        }
      });
    }
  }
  /**
   * Met à jour l'affichage de la vitesse du lanceur
   * Synchronise la valeur affichée et la jauge visuelle
   * @returns {void}
   * @private
   */
  function setSpeedUI() {
    if (spVal) spVal.textContent = speed;
    if (gauge) gauge.style.setProperty('--p', speed);
  }

  /**
   * Applique l'état visuel de la lampe de lancement
   * @returns {void}
   * @private
   */
  function applyLamp() {
    if (btnImg) btnImg.src = blinkOn ? IMG.BTN_ON : IMG.BTN_OFF;
  }

  /**
   * Démarre le clignotement de la lampe de lancement
   * @returns {void}
   * @private
   */
  function startBlink() {
    if (blinkTmr || inLaunch) return;
    blinkOn = false;
    applyLamp();
    blinkTmr = setInterval(() => {
      blinkOn = !blinkOn;
      applyLamp();
    }, 800);
  }

  /**
   * Arrête le clignotement de la lampe de lancement
   * @param {boolean} [forceOff=true] - Force l'état éteint
   * @returns {void}
   * @private
   */
  function stopBlink(forceOff = true) {
    if (blinkTmr) {
      clearInterval(blinkTmr);
      blinkTmr = null;
    }
    blinkOn = !forceOff;
    applyLamp();
  }

  /**
   * Calcule si le lanceur est prêt à être utilisé
   * @returns {boolean} True si prêt (vitesse > 0 et pas en cours de lancement)
   * @private
   */
  const computeReady = () => speed > 0 && !inLaunch;

  /**
   * Réévalue tous les états du lanceur et met à jour l'interface
   * @returns {void}
   * @private
   */
  function reevaluate() {
    const ok = computeReady();
    setLED(ok);
    ok ? startBlink() : stopBlink(true);
  }

  dirImg?.addEventListener('click', () => {
    if (inLaunch || dirCooldown) return;
    direction = direction === 'forward' ? 'backward' : 'forward';
    setDirUI();
    window.ws_sendCommand(panel, direction, { speed }, dirImg);
    dirCooldown = true;
    setTimeout(() => (dirCooldown = false), 3000);
  });

  /**
   * Modifie la vitesse du lanceur par incrément
   * @param {number} d - Incrément de vitesse (positif ou négatif)
   * @returns {void}
   * @private
   */
  function stepSpeed(d) {
    speed = Math.max(0, Math.min(100, speed + d));
    setSpeedUI();
    reevaluate();
    window.ws_sendCommand(panel, 'speed', { value: speed });
  }

  /**
   * Configure un contrôle avec support tap/hold pour un élément
   * @param {HTMLElement} el - Élément à configurer
   * @param {Function} onTap - Callback pour un tap simple
   * @param {Function} onHoldStep - Callback répété pendant le hold
   * @returns {void}
   * @private
   */
  function pressControl(el, onTap, onHoldStep) {
    if (!el) return;
    let pressed = false,
      holdT = null,
      repT = null,
      holding = false;
    const start = e => {
      if (e.pointerType && e.pointerType !== 'mouse') e.preventDefault();
      if (pressed) return;
      pressed = true;
      holding = false;
      holdT = setTimeout(() => {
        if (!pressed) return;
        holding = true;
        repT = setInterval(onHoldStep, 90);
      }, 300);
    };
    const end = () => {
      if (!pressed) return;
      clearTimeout(holdT);
      clearInterval(repT);
      if (!holding) onTap();
      pressed = false;
      holding = false;
      holdT = repT = null;
    };
    el.addEventListener('pointerdown', start);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }
  pressControl(
    plusBtn,
    () => stepSpeed(+10),
    () => stepSpeed(+1)
  );
  pressControl(
    minusBtn,
    () => stepSpeed(-10),
    () => stepSpeed(-1)
  );
  gauge?.addEventListener('click', () => stepSpeed(+10));

  /**
   * Contraint une valeur dans les limites de durée de lancement
   * @param {number} v - Valeur à contraindre
   * @returns {number} Valeur limitée entre MIN_LDUR et MAX_LDUR
   * @private
   */
  const lnClamp = v => Math.max(MIN_LDUR, Math.min(MAX_LDUR, v));

  /**
   * Crée les éléments numériques pour le sélecteur de durée
   * @returns {void}
   * @private
   */
  function ensureNumbers() {
    if (!lnTrack || lnTrack.children.length) return;
    const frag = document.createDocumentFragment();
    for (let i = MIN_LDUR; i <= MAX_LDUR; i++) {
      const d = document.createElement('div');
      d.className = 'num';
      d.style.cssText = 'height:36px;line-height:36px;font-weight:900;font-size:26px;';
      d.textContent = i;
      frag.appendChild(d);
    }
    lnTrack.appendChild(frag);
  }

  /**
   * Calibre le sélecteur de durée rotatif
   * Calcule les dimensions et positions pour l'animation
   * @returns {void}
   * @private
   */
  function lnCalibrate() {
    if (!lnRoll || !lnTrack || !lnTrack.firstElementChild) return;
    lnTrack.style.transform = 'translateY(0px)';
    LN_STEP = lnTrack.firstElementChild.offsetHeight || 36;
    const center = lnRoll.clientHeight / 2;
    const rFirst = lnTrack.firstElementChild.getBoundingClientRect();
    const rTrack = lnTrack.getBoundingClientRect();
    const firstCenter = rFirst.top - rTrack.top + LN_STEP / 2;
    LN_BASE = Math.round(center - firstCenter);
  }

  /**
   * Met à jour l'interface du sélecteur de durée
   * Position le sélecteur et met à jour les états des boutons
   * @returns {void}
   * @private
   */
  function lnSetUI() {
    if (!lnRoll || !lnTrack) return;
    lDuration = lnClamp(lDuration);
    const idx = lDuration - MIN_LDUR;
    const offset = Math.round(LN_BASE - idx * LN_STEP);
    lnTrack.style.transform = `translateY(${offset}px)`;
    [...lnTrack.children].forEach((el, i) => el.classList.toggle('active', i === idx));
    lnRoll.setAttribute('aria-label', `${lDuration} seconds`);
    if (lnPlus) lnPlus.disabled = lDuration >= MAX_LDUR;
    if (lnMinus) lnMinus.disabled = lDuration <= MIN_LDUR;
  }

  /**
   * Modifie la durée de lancement par incrément
   * @param {number} d - Incrément de durée (positif ou négatif)
   * @returns {boolean} True si la modification a été appliquée
   * @private
   */
  function lnNudge(d) {
    const next = lnClamp(lDuration + d);
    if (next === lDuration) return false;
    lDuration = next;
    lnSetUI();
    reevaluate();
  }

  pressControl(
    lnPlus,
    () => {
      lnNudge(+1);
    },
    () => {
      lnNudge(+1);
    }
  );
  pressControl(
    lnMinus,
    () => {
      lnNudge(-1);
    },
    () => {
      lnNudge(-1);
    }
  );
  if (lnRoll) {
    lnRoll.addEventListener(
      'wheel',
      e => {
        if (inLaunch) return;
        e.preventDefault();
        lnNudge(e.deltaY > 0 ? -1 : +1);
      },
      { passive: false }
    );
    lnRoll.addEventListener('click', e => {
      if (inLaunch) return;
      const r = lnRoll.getBoundingClientRect();
      const mid = r.top + r.height / 2;
      lnNudge(e.clientY < mid ? -1 : +1);
    });
  }

  btnImg?.addEventListener('click', () => {
    if (!computeReady()) return;
    inLaunch = true;
    setLocked(true);
    setLED(false);
    stopBlink(true);
    window.ws_sendCommand(panel, direction, { speed, duration: lnClamp(lDuration) }, btnImg);
    const runSec = lnRoll && lnTrack ? lnClamp(lDuration) : 10;
    setTimeout(() => {
      inLaunch = false;
      setLocked(false);
      reevaluate();
    }, runSec * 1000);
  });

  function onPresenceOnline() {
    setLocked(false);
    reevaluate();
  }
  function onPresenceOffline() {
    stopBlink(true);
    setLED(false);
    setLocked(true);
  }
  function updateTelemetry(payload) {
    if ('speed' in payload) {
      const val = Math.max(0, Math.min(100, Number(payload.speed) || 0));
      speed = val;
      setSpeedUI();
    }
    if ('direction' in payload) {
      const d = String(payload.direction).toLowerCase();
      direction = d === 'backward' ? 'backward' : 'forward';
      setDirUI();
    }
    if ('ready' in payload) {
      setLED(!!payload.ready);
    }
    reevaluate();
  }

  setDirUI();
  setSpeedUI();
  if (lnRoll && lnTrack) {
    ensureNumbers();
    /**
     * Actualise l'affichage du sélecteur rotatif de durée
     * Recalibre et met à jour l'interface lors des changements de taille
     * @returns {void}
     * @private
     */
    const refreshRoller = () => {
      lnCalibrate();
      lnSetUI();
    };
    /**
     * Tente d'actualiser le sélecteur lorsqu'il devient visible
     * Utilise requestAnimationFrame pour attendre que l'élément soit rendu
     * @returns {void}
     * @private
     */
    const tryWhenVisible = () => {
      const vis = lnRoll.offsetParent !== null && lnRoll.getBoundingClientRect().height > 0;
      if (vis) refreshRoller();
      else requestAnimationFrame(tryWhenVisible);
    };
    tryWhenVisible();
    window.addEventListener('resize', refreshRoller);
    panel.addEventListener('mc:visible', refreshRoller);
    panel.addEventListener('mc:online', refreshRoller);

    if (window.ResizeObserver) {
      const ro = new ResizeObserver(refreshRoller);
      ro.observe(lnRoll);
    }
  }
  reevaluate();

  return {
    onPresenceOnline,
    onPresenceOffline,
    updateTelemetry,
    destroy() {
      clearInterval(blinkTmr);
    },
  };
}

/**
 * Crée un contrôleur de machine à fumée interactive
 * Gère l'interface de contrôle pour modules de type Smoke Machine avec durée ajustable
 * @param {HTMLElement} panel - Élément DOM du panneau du contrôleur de fumée
 * @returns {Object} Objet contrôleur avec méthodes de gestion d'état et télémétrie
 */
function makeSmokeController(panel) {
  const IMG = {
    BTN_ON: urlImg('button_green_on.png'),
    BTN_OFF: urlImg('button_green_off.png'),
    LED_ON: urlImg('led_on.png'),
    LED_OFF: urlImg('led_off.png'),
  };
  preload(Object.values(IMG));

  const MIN = 5,
    MAX = 20;
  let duration = 8,
    inRun = false,
    ready = true,
    blinkOn = false,
    blinkTmr = null;
  let STEP = 36,
    BASE = 0;

  const led = panel.querySelector('[data-role="sm_ready"]');
  const btn = panel.querySelector('[data-role="sm_btn"]');
  const roll = panel.querySelector('[data-role="sm_roll"]');
  const track = panel.querySelector('[data-role="sm_track"]');
  const plus = panel.querySelector('[data-role="sm_plus"]');
  const minus = panel.querySelector('[data-role="sm_minus"]');

  /**
   * Contraint une valeur dans les limites de durée de fumée
   * @param {number} v - Valeur à contraindre
   * @returns {number} Valeur limitée entre MIN et MAX
   * @private
   */
  const clamp = v => Math.max(MIN, Math.min(MAX, v));

  /**
   * Met à jour l'état verrouillé du panneau de fumée
   * @param {boolean} on - True pour verrouiller, false pour déverrouiller
   * @returns {void}
   * @private
   */
  const setLocked = on => panel.classList.toggle('locked', on);

  /**
   * Met à jour l'état de la LED de prêt de la machine à fumée
   * @param {boolean} on - État de la LED (allumée/éteinte)
   * @returns {void}
   * @private
   */
  const setLED = on => {
    if (led) led.src = on ? IMG.LED_ON : IMG.LED_OFF;
  };

  /**
   * Applique l'état visuel du bouton de fumée
   * @returns {void}
   * @private
   */
  function applyBtn() {
    if (btn) btn.src = blinkOn ? IMG.BTN_ON : IMG.BTN_OFF;
  }

  /**
   * Démarre le clignotement du bouton de fumée
   * @returns {void}
   * @private
   */
  function startBlink() {
    if (blinkTmr || inRun) return;
    blinkOn = false;
    applyBtn();
    blinkTmr = setInterval(() => {
      blinkOn = !blinkOn;
      applyBtn();
    }, 800);
  }

  /**
   * Arrête le clignotement du bouton de fumée
   * @param {boolean} [forceOff=true] - Force l'état éteint
   * @returns {void}
   * @private
   */
  function stopBlink(forceOff = true) {
    if (blinkTmr) {
      clearInterval(blinkTmr);
      blinkTmr = null;
    }
    blinkOn = !forceOff;
    applyBtn();
  }

  /**
   * Calcule si la machine à fumée est prête à être utilisée
   * @returns {boolean} True si prête (pas en cours, ready et durée > 0)
   * @private
   */
  const computeReady = () => !inRun && ready && duration > 0;

  /**
   * Réévalue tous les états de la machine à fumée et met à jour l'interface
   * @returns {void}
   * @private
   */
  function reevaluate() {
    const ok = computeReady();
    setLED(ok);
    ok ? startBlink() : stopBlink(true);
  }

  if (track) {
    for (let i = MIN; i <= MAX; i++) {
      const d = document.createElement('div');
      d.className = 'num';
      d.textContent = i;
      track.appendChild(d);
    }
  }

  /**
   * Calibre le sélecteur de durée rotatif de la machine à fumée
   * @returns {void}
   * @private
   */
  function calibrate() {
    if (!roll || !track || !track.firstElementChild) return;
    track.style.transform = 'translateY(0px)';
    STEP = track.firstElementChild.offsetHeight || 36;
    const center = roll.clientHeight / 2;
    const rFirst = track.firstElementChild.getBoundingClientRect();
    const rTrack = track.getBoundingClientRect();
    const firstCenter = rFirst.top - rTrack.top + STEP / 2;
    BASE = Math.round(center - firstCenter);
  }

  /**
   * Met à jour l'interface du sélecteur de durée de fumée
   * @returns {void}
   * @private
   */
  function setRollUI() {
    if (!roll || !track) return;
    duration = clamp(duration);
    const idx = duration - MIN;
    const offset = Math.round(BASE - idx * STEP);
    track.style.transform = `translateY(${offset}px)`;
    [...track.children].forEach((el, i) => el.classList.toggle('active', i === idx));
    roll.setAttribute('aria-label', `${duration} seconds`);
    if (plus) plus.disabled = duration >= MAX;
    if (minus) minus.disabled = duration <= MIN;
  }

  /**
   * Modifie la durée de fumée par incrément
   * @param {number} d - Incrément de durée (positif ou négatif)
   * @returns {boolean} True si la modification a été appliquée
   * @private
   */
  function nudge(d) {
    const next = clamp(duration + d);
    if (next === duration) return false;
    duration = next;
    setRollUI();
    reevaluate();
    return true;
  }

  /**
   * Configure un contrôle avec support tap/hold pour la fumée
   * @param {HTMLElement} el - Élément à configurer
   * @param {number} delta - Incrément pour les actions
   * @returns {void}
   * @private
   */
  function bindHold(el, delta) {
    if (!el) return;
    let pressed = false,
      holdT = null,
      repT = null,
      holding = false;
    /** Callback pour tap simple - incrémente la durée */
    const tap = () => {
      nudge(delta);
    };
    /** Callback pour répétition - incrémente continuellement */
    const rep = () => {
      if (!nudge(delta)) clearInterval(repT);
    };
    /** Callback de début d'interaction - gère tap et hold */
    const start = e => {
      if (e.pointerType && e.pointerType !== 'mouse') e.preventDefault();
      if (pressed || inRun) return;
      pressed = true;
      holding = false;
      holdT = setTimeout(() => {
        if (!pressed) return;
        holding = true;
        repT = setInterval(rep, 90);
      }, 300);
    };
    /** Callback de fin d'interaction - nettoie les timers */
    const end = () => {
      if (!pressed) return;
      clearTimeout(holdT);
      clearInterval(repT);
      if (!holding) tap();
      pressed = false;
      holding = false;
    };
    el.addEventListener('pointerdown', start);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }
  bindHold(plus, +1);
  bindHold(minus, -1);

  roll?.addEventListener(
    'wheel',
    e => {
      if (inRun) return;
      e.preventDefault();
      nudge(e.deltaY > 0 ? -1 : +1);
    },
    { passive: false }
  );
  roll?.addEventListener('click', e => {
    if (inRun) return;
    const r = roll.getBoundingClientRect();
    const mid = r.top + r.height / 2;
    nudge(e.clientY < mid ? -1 : +1);
  });

  btn?.addEventListener('click', () => {
    if (!computeReady()) return;
    inRun = true;
    setLocked(true);
    setLED(false);
    stopBlink(true);
    window.ws_sendCommand(panel, 'smoke_start', { duration }, btn);
    setTimeout(() => {
      inRun = false;
      setLocked(false);
      reevaluate();
    }, duration * 1000);
  });

  function onPresenceOnline() {
    setLocked(false);
    reevaluate();
  }
  function onPresenceOffline() {
    stopBlink(true);
    setLED(false);
    setLocked(true);
  }
  function updateTelemetry(payload) {
    if ('ready' in payload) {
      ready = !!payload.ready;
      reevaluate();
    }
  }

  /**
   * Actualise l'affichage du sélecteur de durée de fumée
   * Recalibre et met à jour l'interface lors des changements de taille
   * @returns {void}
   * @private
   */
  const refreshSmoke = () => {
    calibrate();
    setRollUI();
  };

  calibrate();
  setRollUI();
  reevaluate();
  window.addEventListener('resize', refreshSmoke);
  panel.addEventListener('mc:visible', refreshSmoke);
  panel.addEventListener('mc:online', refreshSmoke);
  if (window.ResizeObserver && roll) {
    const ro = new ResizeObserver(refreshSmoke);
    ro.observe(roll);
  }

  return {
    onPresenceOnline,
    onPresenceOffline,
    updateTelemetry,
    destroy() {
      clearInterval(blinkTmr);
    },
  };
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
      startBlink();
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
      if (tag.paused) startBlink();
    }, 30000);
  }

  btn?.addEventListener('click', () => {
    if (cooldown) return;
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
    if (!cooldown) startBlink();
  });
  tag.addEventListener('ended', () => {
    if (!cooldown) startBlink();
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
      if (playing) stopBlink(false);
      else startBlink();
    }
  }

  render();
  load(false);
  startBlink();

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
      case 'Station':
        controller = makeStationController(panel);
        break;
      case 'Switch Track':
        controller = makeSwitchController(panel);
        break;
      case 'Light FX':
        controller = makeLightController(panel);
        break;
      case 'Launch Track':
        controller = makeLaunchController(panel);
        break;
      case 'Smoke Machine':
        controller = makeSmokeController(panel);
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
    const serverDown = !!window.__serverDown;

    let visibleCount = 0;
    let totalModules = 0;

    document.querySelectorAll('.panel[data-mid], .mod[data-id]').forEach(panel => {
      totalModules++;
      let show = true;

      if (only) {
        show = serverDown ? false : panel.classList.contains('online');
      }

      if (show && q) {
        const title = panel.querySelector('.h1')?.textContent || '';
        const alias = panel.querySelector('.alias--type')?.textContent || '';
        const type = panel.dataset.type || '';
        const mid = panel.dataset.mid || '';
        const hay = (title + ' ' + alias + ' ' + type + ' ' + mid).toLowerCase();
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
        empty.hidden = true;
      } else {
        empty.hidden = serverDown || !(only && visibleCount === 0);
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

  /**
   * Affiche ou masque la bannière d'état du serveur
   * @param {boolean} show - True pour afficher, false pour masquer
   * @returns {void}
   * @private
   */
  function setServerBanner(show) {
    const el = document.getElementById('serverState');
    if (el) el.hidden = !show;
    window.__serverDown = !!show;
    window.applyOnlineFilter?.();
  }

  let showDownTimer = null;

  /**
   * Programme l'affichage de la bannière de serveur déconnecté
   * @returns {void}
   * @private
   */
  function scheduleDownBanner() {
    if (showDownTimer) return;
    showDownTimer = setTimeout(() => {
      showDownTimer = null;
      setServerBanner(true);
    }, 8000);
  }

  /**
   * Masque immédiatement la bannière de serveur déconnecté
   * @returns {void}
   * @private
   */
  function hideDownBanner() {
    if (showDownTimer) {
      clearTimeout(showDownTimer);
      showDownTimer = null;
    }
    setServerBanner(false);
  }

  /**
   * Marque tous les modules comme hors ligne
   * Met à jour l'interface et notifie les contrôleurs
   * @returns {void}
   * @private
   */
  function markAllOffline() {
    document.querySelectorAll('.panel[data-mid]').forEach(p => {
      p.classList.remove('online');
      p.classList.add('offline', 'disabled');
      const badge = p.querySelector('.state');
      if (badge) {
        badge.textContent = 'offline';
        badge.classList.remove('online');
        badge.classList.add('offline');
      }
      p.dispatchEvent(new CustomEvent('mc:offline'));
      // notifie le controller
      const mid = (p.dataset.mid || '').trim();
      const ctl = controllersByMid.get(mid);
      ctl?.onPresenceOffline?.();
    });
    window.applyOnlineFilter?.();
  }

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

  // Plus besoin de reconnectionManager - global.js s'en charge

  /**
   * Établit la connexion WebSocket pour les modules
   * Utilise la connexion globale et configure les événements spécifiques
   * @returns {void}
   * @private
   */
  function connectSocket() {
    // AUCUNE gestion WebSocket - utiliser seulement la connexion globale
    if (!window.socket) {
      console.warn('[MODULES] Attente socket global...');
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
      // La télémétrie implique que le module est en ligne (synchronisation initiale)
      setPresence(data.moduleId, true);
      updateTelemetry(data.moduleId, data);
    });

    // Confirmation de commande
    socket.on('command_sent', () => {
      // Commande envoyée avec succès
    });

    // Erreur de commande
    socket.on('command_error', error => {
      console.error('❌ Command error:', error);
      window.showToast?.(error.message || 'Command failed', 'error', 3000);
    });

    socket.on('error', error => {
      console.error('🔌 Socket.io error:', error);
    });

    // === ÉVÉNEMENTS TEMPS RÉEL ===

    // Module ajouté en temps réel
    socket.on('user:module:added', data => {
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
      console.warn('🔌 Socket.io not connected');
      window.showToast?.('Server not connected', 'error', 2000);
      return;
    }

    const moduleId = panel.dataset.mid;
    if (!moduleId) {
      console.error('❌ No module ID found');
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

  /**
   * Fonction globale de reconnexion WebSocket pour débogage
   * Force la reconnexion du socket et masque la bannière de déconnexion
   * @returns {void}
   * @global
   */
  window.mc_socketReconnect = () => {
    hideDownBanner();
    if (socket) {
      socket.disconnect();
      socket.connect();
    } else {
      connectSocket();
    }
  };
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
        value = 'MC' + value;
      }
    }

    // Formater MC-XXXX-XXX
    let formatted = '';
    if (value.length > 0) {
      formatted = value.substring(0, 2); // MC
      if (value.length > 2) {
        formatted += '-' + value.substring(2, 6); // -XXXX
        if (value.length > 6) {
          formatted += '-' + value.substring(6, 9); // -XXX
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
        formatted += '-' + value.substring(4, 8); // -XXXX
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
      window.showToast?.('Module deleted successfully', 'success', 2200);

      // Rafraîchir les filtres
      window.applyOnlineFilter?.();
    } else {
      window.showToast?.(result.error || 'Failed to delete module', 'error', 3000);
    }
  } catch (error) {
    console.error('Delete error:', error);
    window.showToast?.('Network error', 'error', 3000);
  }
});
