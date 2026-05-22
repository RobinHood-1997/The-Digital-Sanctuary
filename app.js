// ---- Digital Sanctuary App Controller ----

import { AudioEngine } from './audio.js';
import { CanvasManager } from './canvas.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Objects
    const audio = new AudioEngine();
    const canvasEl = document.getElementById('vibe-canvas');
    const canvas = new CanvasManager(canvasEl);
    canvas.audio = audio;

    // P2P Variables
    let peer = null;
    let connections = {};
    let localPeerId = null;
    const MAX_PEERS = 10;

    // Canvas Post-it callback hooks
    const isLocalRoom = (roomId) => {
        return roomId === localPeerId || roomId === 'local_peer' || roomId === 'Me';
    };

    canvas.onNoteCreated = (roomId, note) => {
        if (isLocalRoom(roomId)) {
            broadcastRoomState();
        } else {
            sendToPeer(roomId, {
                type: 'NOTE_CREATED',
                toRoomId: roomId,
                note: note
            });
        }
        updateStickyNotesList();
    };
    canvas.onNoteDragged = (fromRoomId, toRoomId, noteId, xPct, yPct) => {
        broadcastData({
            type: 'NOTE_DRAGGED',
            fromRoomId: fromRoomId,
            toRoomId: toRoomId,
            noteId: noteId,
            xPct: xPct,
            yPct: yPct
        });
    };
    canvas.onNoteDropped = (fromRoomId, toRoomId, noteId, text, xPct, yPct, color, rotation, tag, colorName) => {
        if (fromRoomId === toRoomId) {
            if (isLocalRoom(fromRoomId)) {
                broadcastRoomState();
            } else {
                sendToPeer(fromRoomId, {
                    type: 'NOTE_EDITED',
                    roomId: fromRoomId,
                    noteId: noteId,
                    xPct: xPct,
                    yPct: yPct
                });
            }
        } else {
            // Delete from source room
            if (isLocalRoom(fromRoomId)) {
                const room = canvas.rooms.find(r => r.roomId === fromRoomId);
                if (room) {
                    room.postItNotes = room.postItNotes.filter(n => n.noteId !== noteId);
                }
                broadcastRoomState();
            } else {
                sendToPeer(fromRoomId, {
                    type: 'NOTE_DELETED',
                    roomId: fromRoomId,
                    noteId: noteId
                });
            }

            // Add to destination room
            if (isLocalRoom(toRoomId)) {
                const room = canvas.rooms.find(r => r.roomId === toRoomId);
                if (room) {
                    let note = room.postItNotes.find(n => n.noteId === noteId);
                    if (!note) {
                        note = { noteId, text, color, xPct, yPct, rotation, tag, colorName };
                        room.postItNotes.push(note);
                    } else {
                        note.xPct = xPct;
                        note.yPct = yPct;
                    }
                }
                broadcastRoomState();
            } else {
                sendToPeer(toRoomId, {
                    type: 'NOTE_CREATED',
                    toRoomId: toRoomId,
                    note: {
                        noteId: noteId,
                        text: text,
                        color: color,
                        xPct: xPct,
                        yPct: yPct,
                        rotation: rotation,
                        tag: tag,
                        colorName: colorName
                    }
                });
            }
        }

        // Always broadcast a NOTE_DROPPED mesh signal so everyone syncs positions
        broadcastData({
            type: 'NOTE_DROPPED',
            fromRoomId: fromRoomId,
            toRoomId: toRoomId,
            noteId: noteId,
            xPct: xPct,
            yPct: yPct
        });

        updateStickyNotesList();
    };
    canvas.onNoteDeleted = (roomId, noteId) => {
        if (isLocalRoom(roomId)) {
            broadcastRoomState();
        } else {
            sendToPeer(roomId, {
                type: 'NOTE_DELETED',
                roomId: roomId,
                noteId: noteId
            });
        }
        updateStickyNotesList();
    };
    canvas.onNoteClicked = (room, note) => {
        openNoteModal(room, note);
    };

    // Ambient sound trigger bleed-through callback
    audio.onCrackleTriggered = (theme, type) => {
        broadcastData({
            type: 'AMB_CRACKLE',
            roomId: canvas.localRoomId,
            theme: theme,
            crackleType: type
        });
    };

    // Load Time of Day override
    const savedTod = localStorage.getItem('sanctuary_tod_override') || 'auto';
    canvas.todOverride = savedTod;

    // 2. UI Element References
    const startBtn = document.getElementById('start-btn');
    const overlay = document.querySelector('.sanctuary-overlay');
    const themeButtons = document.querySelectorAll('.theme-btn');
    const profileButtons = document.querySelectorAll('.profile-btn');
    const shareBtn = document.getElementById('share-btn');
    const clicksToggle = document.getElementById('keyboard-clicks-toggle');
    const scratchpad = document.getElementById('scratchpad');
    const toast = document.getElementById('toast');

    // Panel Toggle References
    const leftSidebar = document.querySelector('.left-sidebar');
    const rightSidebar = document.querySelector('.right-sidebar');
    const bottomControls = document.querySelector('.bottom-controls');
    const leftToggle = document.getElementById('left-sidebar-toggle');
    const rightToggle = document.getElementById('right-sidebar-toggle');
    const bottomToggle = document.getElementById('bottom-controls-toggle');

    // Stats Displays
    const statKeystrokes = document.getElementById('stat-keystrokes');
    const statFocusTime = document.getElementById('stat-focustime');
    const statActiveVolume = document.getElementById('stat-activevolume');
    const statTimeContainer = document.getElementById('stat-time-container');
    const statTimeVal = document.getElementById('stat-time');
    const todControlContainer = document.getElementById('tod-control-container');

    // Pomodoro Elements
    const pomoPlayBtn = document.getElementById('pomo-play');
    const pomoResetBtn = document.getElementById('pomo-reset');
    const timerDisplay = document.getElementById('timer-display');
    const progressCircle = document.querySelector('.pomodoro-progress');
    const pomoUpBtn = document.getElementById('pomo-up');
    const pomoDownBtn = document.getElementById('pomo-down');
    const pomoTimerContainer = document.getElementById('pomodoro-timer-container');

    // Music Source Elements
    const musicSynthBtn = document.getElementById('music-src-synth');
    const musicRadioBtn = document.getElementById('music-src-radio');
    const musicVisualizer = document.getElementById('music-visualizer');

    // Sliders
    const sliders = {
        rain: document.getElementById('vol-rain'),
        thunder: document.getElementById('vol-thunder'),
        waves: document.getElementById('vol-waves'),
        crackle: document.getElementById('vol-crackle'),
        wind: document.getElementById('vol-wind'),
        tape: document.getElementById('vol-tape'),
        music: document.getElementById('vol-music')
    };

    // State Variables
    let currentTheme = 'cabin';
    let currentMusicSource = 'synth';
    let currentProfile = 'thock';
    let stats = {
        keystrokes: parseInt(localStorage.getItem('sanctuary_keystrokes') || '0', 10),
        focusMinutes: parseFloat(localStorage.getItem('sanctuary_focusminutes') || '0.0'),
        startTime: null
    };

    // Pomodoro State
    let pomodoro = {
        timerId: null,
        workDuration: parseInt(localStorage.getItem('sanctuary_pomo_work') || '1500', 10), // 25 mins default
        breakDuration: parseInt(localStorage.getItem('sanctuary_pomo_break') || '300', 10), // 5 mins default
        duration: 1500,
        timeRemaining: 1500,
        isRunning: false,
        mode: 'work' // 'work' or 'break'
    };
    pomodoro.duration = pomodoro.workDuration;
    pomodoro.timeRemaining = pomodoro.workDuration;

    // SVG Circle setup (Radius = 60, Circumference ≈ 377)
    const CIRCUMFERENCE = 377;
    progressCircle.style.strokeDasharray = CIRCUMFERENCE;
    progressCircle.style.strokeDashoffset = CIRCUMFERENCE;

    // 3. Load Saved Scratchpad
    scratchpad.value = localStorage.getItem('sanctuary_scratchpad') || '';

    // Initialize stats display
    updateStatsUI();

    // 4. URL Preset Parser
    function loadUrlPresets() {
        const params = new URLSearchParams(window.location.search);
        
        // Theme
        const urlTheme = params.get('theme');
        if (urlTheme && ['cabin', 'cyberpunk', 'ocean'].includes(urlTheme)) {
            currentTheme = urlTheme;
            themeButtons.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.theme === urlTheme);
            });
            document.body.className = `${urlTheme}-theme`;
            canvas.setTheme(urlTheme);
        }

        // Keyboard Profile
        const urlProfile = params.get('profile');
        if (urlProfile && ['thock', 'blue', 'typewriter', 'bubble'].includes(urlProfile)) {
            currentProfile = urlProfile;
            profileButtons.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.profile === urlProfile);
            });
        }

        // Music Source
        const urlMusicSource = params.get('musicsource');
        if (urlMusicSource && ['synth', 'radio'].includes(urlMusicSource)) {
            currentMusicSource = urlMusicSource;
            musicSynthBtn.classList.toggle('active', urlMusicSource === 'synth');
            musicRadioBtn.classList.toggle('active', urlMusicSource === 'radio');
        }

        // Sliders
        Object.keys(sliders).forEach(key => {
            const val = params.get(key);
            if (val !== null) {
                const numVal = parseFloat(val);
                if (numVal >= -60 && numVal <= 0) {
                    sliders[key].value = numVal;
                }
            }
        });

        // Keyboard Clicks
        const clicks = params.get('clicks');
        if (clicks !== null) {
            clicksToggle.checked = clicks === 'true';
        }
    }

    // Run preset loader
    loadUrlPresets();

    // Set initial progress styling of sliders
    Object.keys(sliders).forEach(key => {
        const slider = sliders[key];
        const pct = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
        slider.style.setProperty('--pct', `${pct}%`);
    });

    // Check if music visualizer should be active on load
    updateVisualizerState(parseFloat(sliders.music.value));

    // 5. Start / Launch Event
    startBtn.addEventListener('click', async () => {
        try {
            // Start Audio context
            await audio.init();

            // Set current settings in audio engine
            audio.setTheme(currentTheme);
            audio.setKeyboardProfile(currentProfile);
            audio.setMusicSource(currentMusicSource);
            audio.toggleKeyboardClicks(clicksToggle.checked);
            
            // Start Visual Canvas loop
            canvas.plant.keystrokes = stats.keystrokes;
            canvas.plant.growth = Math.min(1.0, 0.1 + (stats.keystrokes * 0.006));
            canvas.start();

            // Set Initial Volumes and Canvas intensities based on sliders
            Object.keys(sliders).forEach(key => {
                const val = parseFloat(sliders[key].value);
                audio.setVolume(key, val);
                
                // Convert decibels (-60 to 0) to intensity (0 to 1)
                const intensity = val <= -59 ? 0 : (val + 60) / 60;
                canvas.setIntensity(key, intensity);
            });

            // Hide entry overlay
            overlay.classList.add('fade-out');
            setTimeout(() => {
                overlay.style.display = 'none';
            }, 1200);

            // Start Stats Time tracking
            stats.startTime = Date.now();
            setInterval(trackSessionTime, 10000); // track every 10 seconds

            // Initialize P2P connection mesh
            initP2P();

        } catch (err) {
            console.error("Initialization failed", err);
            alert("Please interact to allow sound setup.");
        }
    });

    // 6. Audio Slider Listeners
    Object.keys(sliders).forEach(key => {
        const slider = sliders[key];
        slider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            audio.setVolume(key, val);
            
            const pct = ((val - slider.min) / (slider.max - slider.min)) * 100;
            slider.style.setProperty('--pct', `${pct}%`);

            // Convert to 0.0 - 1.0 mapping for visual canvas
            const intensity = val <= -59 ? 0 : (val + 60) / 60;
            canvas.setIntensity(key, intensity);

            // Toggle visualizer animations if music volume changes
            if (key === 'music') {
                updateVisualizerState(val);
            }

            updateStatsUI();
            broadcastRoomState();
        });
    });

    function updateVisualizerState(volume) {
        if (volume > -59) {
            musicVisualizer.classList.add('active');
        } else {
            musicVisualizer.classList.remove('active');
        }
    }

    // 7. Toggle Music Source (Synth vs Radio)
    const setMusicSource = (source) => {
        if (currentMusicSource === source) return;
        currentMusicSource = source;
        
        musicSynthBtn.classList.toggle('active', source === 'synth');
        musicRadioBtn.classList.toggle('active', source === 'radio');

        audio.setMusicSource(source);
        
        // Soft key clicks feedback
        audio.triggerKeyboardClick();
    };

    musicSynthBtn.addEventListener('click', () => setMusicSource('synth'));
    musicRadioBtn.addEventListener('click', () => setMusicSource('radio'));

    // 8. Theme Selector Controls
    themeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const theme = btn.dataset.theme;
            if (theme === currentTheme) return;

            currentTheme = theme;
            themeButtons.forEach(b => b.classList.toggle('active', b === btn));
            
            // Set body classes for styling transitions
            document.body.className = `${theme}-theme`;
            
            // Set canvas theme
            canvas.setTheme(theme);

            // Set audio theme
            audio.setTheme(theme);
            
            // Soft click feedback
            audio.triggerKeyboardClick();

            updateStatsUI();
            broadcastRoomState();
        });
    });

    // 8a. Time of Day Mode Controls
    const todButtons = document.querySelectorAll('.tod-btn');
    todButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tod === savedTod);
    });

    todButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const selectedTod = btn.dataset.tod;
            canvas.todOverride = selectedTod;
            localStorage.setItem('sanctuary_tod_override', selectedTod);

            todButtons.forEach(b => b.classList.toggle('active', b === btn));

            // Soft click feedback
            audio.triggerKeyboardClick();

            updateStatsUI();
        });
    });

    // 8b. Panel toggle buttons listeners
    function collapseOthersOnMobile(activePanel) {
        if (window.innerWidth <= 1024) {
            if (activePanel !== leftSidebar && leftSidebar) leftSidebar.classList.add('collapsed');
            if (activePanel !== rightSidebar && rightSidebar) rightSidebar.classList.add('collapsed');
            if (activePanel !== bottomControls && bottomControls) bottomControls.classList.add('collapsed');
        }
    }

    if (leftToggle && leftSidebar) {
        leftToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isCollapsed = leftSidebar.classList.contains('collapsed');
            leftSidebar.classList.toggle('collapsed');
            if (isCollapsed) {
                collapseOthersOnMobile(leftSidebar);
            }
            audio.triggerKeyboardClick();
        });
    }
    if (rightToggle && rightSidebar) {
        rightToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isCollapsed = rightSidebar.classList.contains('collapsed');
            rightSidebar.classList.toggle('collapsed');
            if (isCollapsed) {
                collapseOthersOnMobile(rightSidebar);
            }
            audio.triggerKeyboardClick();
        });
    }
    if (bottomToggle && bottomControls) {
        bottomToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isCollapsed = bottomControls.classList.contains('collapsed');
            bottomControls.classList.toggle('collapsed');
            if (isCollapsed) {
                collapseOthersOnMobile(bottomControls);
            }
            audio.triggerKeyboardClick();
        });
    }

    // 9. Mechanical Clicks Switch Toggle
    clicksToggle.addEventListener('change', (e) => {
        audio.toggleKeyboardClicks(e.target.checked);
        if (e.target.checked) {
            audio.triggerKeyboardClick();
        }
    });

    // 9b. Keyboard Click Profile Selection
    profileButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const profile = btn.dataset.profile;
            if (profile === currentProfile) return;

            currentProfile = profile;
            profileButtons.forEach(b => b.classList.toggle('active', b === btn));
            
            audio.setKeyboardProfile(profile);
            
            // Play click preview
            audio.triggerKeyboardClick();
        });
    });

    // 10. Markdown Notepad Editor Typing Actions
    scratchpad.addEventListener('input', (e) => {
        localStorage.setItem('sanctuary_scratchpad', e.target.value);
        
        // Increment keystrokes & visual plant growth
        stats.keystrokes++;
        canvas.incrementPlantGrowth();
        localStorage.setItem('sanctuary_keystrokes', stats.keystrokes.toString());
        updateStatsUI();
    });

    // Make keystrokes trigger click sound and wake cat
    const ignoredKeys = ['Control', 'Alt', 'Shift', 'Meta', 'CapsLock', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    scratchpad.addEventListener('keydown', (e) => {
        if (ignoredKeys.includes(e.key)) return;
        
        // Play click sound (passing true if it is the Enter key for Typewriter carriage return bell)
        audio.triggerKeyboardClick(e.key === 'Enter');
        
        // Wake windowsill cat
        canvas.wakeCat();
        
        // Broadcast keyboard click to other peers
        broadcastData({
            type: 'KEYBOARD_CLICK',
            roomId: canvas.localRoomId,
            profile: currentProfile,
            isEnterKey: e.key === 'Enter'
        });
    });

    // 11. Canvas Interaction Listeners
    window.addEventListener('mousemove', (e) => {
        const rect = canvasEl.getBoundingClientRect();
        canvas.mouse.x = e.clientX - rect.left;
        canvas.mouse.y = e.clientY - rect.top;
    });

    canvasEl.addEventListener('click', (e) => {
        const rect = canvasEl.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const w = canvasEl.width;
        const h = canvasEl.height;

        // Check if user clicked on Cat (Theme Cozy Cabin only)
        if (currentTheme === 'cabin') {
            const potX = w * 0.42;
            const catX = potX - 60;
            const catY = h - 240;
            // Bounding box for Cat: catX is center, catY is sill level
            if (x >= catX - 30 && x <= catX + 30 && y >= catY - 20 && y <= catY + 15) {
                canvas.wakeCat();
                audio.triggerCatSound();
                return; // Bypass default window ripples
            }
        }

        // Check if user clicked on Coffee Cup (Theme Cyberpunk Cafe only)
        if (currentTheme === 'cyberpunk') {
            const cupX = w * 0.35;
            const cupY = h - 240;
            // Bounding box for Coffee cup: cupX is center, cupY is sill level
            if (x >= cupX - 15 && x <= cupX + 22 && y >= cupY - 25 && y <= cupY + 5) {
                canvas.triggerCoffee();
                audio.triggerCoffeeSound();
                return; // Bypass default window ripples
            }
        }

        // Check if user clicked on Plant (All themes)
        const potX = w * 0.42;
        const potY = h - 240;
        // Bounding box for plant base and branches: potX is center, potY is sill level
        if (x >= potX - 35 && x <= potX + 35 && y >= potY - 70 && y <= potY + 30) {
            audio.triggerPlantSound();
            canvas.addRipple(potX, potY);
            return; // Bypass default window ripples
        }

        canvas.addRipple(x, y);
    });

    canvasEl.addEventListener('dblclick', (e) => {
        if (!audio.initialized) return;

        const rect = canvasEl.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const glassStartY = 40;
        const glassHeight = canvasEl.height - 280;
        if (mouseY < glassStartY || mouseY > glassStartY + glassHeight) {
            return;
        }

        const hit = canvas.getNoteAt(mouseX, mouseY);
        if (hit) {
            openNoteModal(hit.room, hit.note);
        } else {
            const result = getRoomAndRelativeCoords(mouseX, mouseY);
            if (result) {
                const { room, xPct, yPct } = result;
                openNoteModal(room, null, xPct, yPct);
            }
        }
    });

    // 12. Pomodoro Clock Logic
    function updateTimerDisplay() {
        const mins = Math.floor(pomodoro.timeRemaining / 60).toString().padStart(2, '0');
        const secs = (pomodoro.timeRemaining % 60).toString().padStart(2, '0');
        timerDisplay.textContent = `${mins}:${secs}`;

        // Update progress circle ring
        const progressFraction = pomodoro.timeRemaining / pomodoro.duration;
        const offset = CIRCUMFERENCE * progressFraction;
        progressCircle.style.strokeDashoffset = offset;
    }

    function handleTimerComplete() {
        clearInterval(pomodoro.timerId);
        pomodoro.isRunning = false;
        pomoPlayBtn.textContent = 'START';
        if (pomoTimerContainer) pomoTimerContainer.classList.remove('running');

        if (audio.initialized) {
            audio.triggerAlarm();
            canvas.lightningFlash = 1.2;
            const originalThunderVol = parseFloat(sliders.thunder.value);
            audio.setVolume('thunder', 0);
            setTimeout(() => {
                audio.setVolume('thunder', originalThunderVol);
            }, 3000);
        }

        // Swap modes
        if (pomodoro.mode === 'work') {
            showToast("Work focus complete! Take a deep breath & relax.");
            pomodoro.mode = 'break';
            pomodoro.duration = pomodoro.breakDuration;
            pomodoro.timeRemaining = pomodoro.breakDuration;
        } else {
            showToast("Break over. Time to get back into focus!");
            pomodoro.mode = 'work';
            pomodoro.duration = pomodoro.workDuration;
            pomodoro.timeRemaining = pomodoro.workDuration;
        }

        updateTimerDisplay();
    }

    pomoPlayBtn.addEventListener('click', () => {
        if (!audio.initialized) {
            showToast("Click 'ENTER SANCTUARY' to initialize the audio environment first!");
            return;
        }

        if (pomodoro.isRunning) {
            clearInterval(pomodoro.timerId);
            pomodoro.isRunning = false;
            pomoPlayBtn.textContent = 'START';
            if (pomoTimerContainer) pomoTimerContainer.classList.remove('running');
        } else {
            pomodoro.isRunning = true;
            pomoPlayBtn.textContent = 'PAUSE';
            if (pomoTimerContainer) pomoTimerContainer.classList.add('running');
            
            pomodoro.timerId = setInterval(() => {
                if (pomodoro.timeRemaining > 0) {
                    pomodoro.timeRemaining--;
                    updateTimerDisplay();
                } else {
                    handleTimerComplete();
                }
            }, 1000);
        }
    });

    pomoResetBtn.addEventListener('click', () => {
        clearInterval(pomodoro.timerId);
        pomodoro.isRunning = false;
        pomoPlayBtn.textContent = 'START';
        if (pomoTimerContainer) pomoTimerContainer.classList.remove('running');
        
        pomodoro.mode = 'work';
        pomodoro.duration = pomodoro.workDuration;
        pomodoro.timeRemaining = pomodoro.workDuration;
        updateTimerDisplay();
    });

    // Pomodoro Up/Down Adjusters click listeners
    if (pomoUpBtn && pomoDownBtn) {
        pomoUpBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (pomodoro.isRunning) return;

            // Trigger click sound feedback
            audio.triggerKeyboardClick();

            if (pomodoro.mode === 'work') {
                pomodoro.workDuration = Math.min(60 * 60, pomodoro.workDuration + 60); // max 60 min
                pomodoro.duration = pomodoro.workDuration;
                localStorage.setItem('sanctuary_pomo_work', pomodoro.workDuration.toString());
            } else {
                pomodoro.breakDuration = Math.min(60 * 60, pomodoro.breakDuration + 60); // max 60 min
                pomodoro.duration = pomodoro.breakDuration;
                localStorage.setItem('sanctuary_pomo_break', pomodoro.breakDuration.toString());
            }
            pomodoro.timeRemaining = pomodoro.duration;
            updateTimerDisplay();
        });

        pomoDownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (pomodoro.isRunning) return;

            // Trigger click sound feedback
            audio.triggerKeyboardClick();

            if (pomodoro.mode === 'work') {
                pomodoro.workDuration = Math.max(60, pomodoro.workDuration - 60); // min 1 min
                pomodoro.duration = pomodoro.workDuration;
                localStorage.setItem('sanctuary_pomo_work', pomodoro.workDuration.toString());
            } else {
                pomodoro.breakDuration = Math.max(60, pomodoro.breakDuration - 60); // min 1 min
                pomodoro.duration = pomodoro.breakDuration;
                localStorage.setItem('sanctuary_pomo_break', pomodoro.breakDuration.toString());
            }
            pomodoro.timeRemaining = pomodoro.duration;
            updateTimerDisplay();
        });
    }

    updateTimerDisplay();

    // 13. Statistics Tracker
    function trackSessionTime() {
        if (!stats.startTime) return;
        
        const now = Date.now();
        const elapsedMinutes = (now - stats.startTime) / 60000;
        stats.startTime = now;

        stats.focusMinutes += elapsedMinutes;
        localStorage.setItem('sanctuary_focusminutes', stats.focusMinutes.toFixed(1));
        
        updateStatsUI();
    }

    function updateStatsUI() {
        statKeystrokes.textContent = stats.keystrokes;
        statFocusTime.textContent = stats.focusMinutes.toFixed(1) + 'm';
        
        let sumIntensity = 0;
        let sliderCount = 0;
        Object.keys(sliders).forEach(key => {
            const val = parseFloat(sliders[key].value);
            if (val > -59) {
                sumIntensity += (val + 60) / 60;
            }
            sliderCount++;
        });
        const ambientPercent = Math.round((sumIntensity / sliderCount) * 100);
        statActiveVolume.textContent = `${ambientPercent}%`;

        // Update Cabin Time display & show/hide Time of Day controls
        if (currentTheme === 'cabin') {
            statTimeContainer.style.display = 'flex';
            statTimeVal.textContent = canvas.getTimeOfDayName();
            if (todControlContainer) todControlContainer.style.display = 'block';
        } else {
            statTimeContainer.style.display = 'none';
            if (todControlContainer) todControlContainer.style.display = 'none';
        }
    }

    // 14. Share Vibe Preset generator
    shareBtn.addEventListener('click', () => {
        const params = new URLSearchParams();
        params.set('theme', currentTheme);
        params.set('clicks', clicksToggle.checked.toString());
        params.set('musicsource', currentMusicSource);
        params.set('profile', currentProfile);
        
        Object.keys(sliders).forEach(key => {
            params.set(key, sliders[key].value);
        });

        if (localPeerId) {
            params.set('join', localPeerId);
        }

        const shareUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
        
        navigator.clipboard.writeText(shareUrl)
            .then(() => {
                showToast("Vibe link copied to clipboard!");
            })
            .catch(err => {
                console.error("Clipboard copy failed", err);
                alert(`Here is your shareable link:\n${shareUrl}`);
            });
    });

    let toastTimeout = null;
    function showToast(message) {
        toast.textContent = message;
        toast.classList.add('show');
        
        if (toastTimeout) clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    function initP2P() {
        const params = new URLSearchParams(window.location.search);
        const joinId = params.get('join');

        peer = new Peer();

        peer.on('open', (id) => {
            localPeerId = id;
            console.log("My PeerJS ID is:", id);
            
            // Set canvas localRoomId to this peer ID
            canvas.localRoomId = id;
            
            // Update local room ID in rooms list
            const localRoom = canvas.rooms.find(r => r.roomId === 'local_peer' || r.roomId === 'Me');
            if (localRoom) {
                localRoom.roomId = id;
                localRoom.ownerName = 'Me';
            }
            
            // Broadcast initial state
            broadcastRoomState();

            // If we are joining an existing host
            if (joinId) {
                connectToPeer(joinId);
            }
        });

        peer.on('connection', (conn) => {
            console.log("Incoming connection from:", conn.peer);
            if (Object.keys(connections).length >= MAX_PEERS) {
                console.warn("Room is full. Rejecting incoming connection from:", conn.peer);
                conn.on('open', () => {
                    conn.send({ type: 'ROOM_FULL' });
                    setTimeout(() => conn.close(), 500);
                });
                return;
            }
            setupConnection(conn);
        });

        peer.on('error', (err) => {
            console.error("PeerJS error:", err);
            showToast("Connection error: " + err.type);
        });
    }

    function setupConnection(conn) {
        connections[conn.peer] = conn;

        conn.on('open', () => {
            console.log("Connection fully open with peer:", conn.peer);
            
            // Send our state
            sendRoomStateToPeer(conn.peer);

            // Share current peer list for mesh routing
            const peerIds = Object.keys(connections);
            if (localPeerId) {
                peerIds.push(localPeerId);
            }
            conn.send({
                type: 'PEER_LIST',
                peers: peerIds.filter(id => id !== conn.peer)
            });
        });

        conn.on('data', (data) => {
            handleIncomingData(conn.peer, data);
        });

        conn.on('close', () => {
            console.log("Connection closed with peer:", conn.peer);
            handlePeerDisconnect(conn.peer);
        });

        conn.on('error', (err) => {
            console.error("Connection error for peer:", conn.peer, err);
            handlePeerDisconnect(conn.peer);
        });
    }

    function connectToPeer(peerId) {
        if (peerId === localPeerId || connections[peerId]) return;
        if (Object.keys(connections).length >= MAX_PEERS) {
            console.warn("Max peers reached. Skipping outgoing connection to:", peerId);
            return;
        }
        console.log("Initiating connection to:", peerId);
        const conn = peer.connect(peerId);
        setupConnection(conn);
    }

    function handlePeerDisconnect(peerId) {
        if (connections[peerId]) {
            try { connections[peerId].close(); } catch(e) {}
            delete connections[peerId];
        }
        canvas.removeRoom(peerId);
        audio.destroyPeerChannel(peerId);
    }

    function handleIncomingData(senderId, data) {
        if (data.type === 'ROOM_FULL') {
            showToast("Cannot connect: the virtual room is full (max 10 people).");
        }
        else if (data.type === 'PEER_LIST') {
            console.log("Received peer list:", data.peers);
            if (Array.isArray(data.peers)) {
                // Slice to avoid connection loops/DoS attacks from oversized payloads
                const cleanPeers = data.peers.slice(0, MAX_PEERS * 2);
                cleanPeers.forEach(peerId => {
                    if (typeof peerId === 'string' && peerId.length <= 50) {
                        connectToPeer(peerId);
                    }
                });
            }
        }
        else if (data.type === 'ROOM_STATE') {
            console.log("Received room state from:", data.roomId, data);
            
            let room = canvas.rooms.find(r => r.roomId === data.roomId);
            if (!room) {
                room = canvas.createRoomObject(data.roomId, data.ownerName || 'Colleague', data.theme);
                canvas.addRoom(room);
                audio.createPeerChannel(data.roomId);
            }
            
            room.ownerName = String(data.ownerName || 'Colleague').substring(0, 30);
            
            if (['cabin', 'cyberpunk', 'ocean'].includes(data.theme)) {
                room.theme = data.theme;
            }
            
            if (Array.isArray(data.postItNotes)) {
                const cleanNotes = [];
                for (let n of data.postItNotes) {
                    if (cleanNotes.length >= 25) break;
                    const clean = sanitizeNote(n);
                    if (clean) cleanNotes.push(clean);
                }
                room.postItNotes = cleanNotes;
            } else {
                room.postItNotes = [];
            }
            
            if (data.intensities) {
                Object.keys(data.intensities).forEach(key => {
                    const val = parseFloat(data.intensities[key]);
                    if (!isNaN(val) && val >= 0 && val <= 1) {
                        room.intensities[key] = val;
                    }
                });
            }
            updateStickyNotesList();
        }
        else if (data.type === 'KEYBOARD_CLICK') {
            audio.triggerRemoteClick(data.roomId, data.profile || 'thock', data.isEnterKey);
            
            const room = canvas.rooms.find(r => r.roomId === data.roomId);
            if (room && room.cat) {
                room.cat.state = 'awake';
                room.cat.awakeTimer = 5.0;
            }
        }
        else if (data.type === 'NOTE_DRAGGED') {
            const fromRoom = canvas.rooms.find(r => r.roomId === data.fromRoomId);
            const toRoom = canvas.rooms.find(r => r.roomId === data.toRoomId);
            
            if (toRoom) {
                let note = toRoom.postItNotes.find(n => n.noteId === data.noteId);
                if (!note && fromRoom) {
                    const noteIdx = fromRoom.postItNotes.findIndex(n => n.noteId === data.noteId);
                    if (noteIdx !== -1) {
                        note = fromRoom.postItNotes.splice(noteIdx, 1)[0];
                        toRoom.postItNotes.push(note);
                    }
                }
                if (note) {
                    const px = parseFloat(data.xPct);
                    const py = parseFloat(data.yPct);
                    if (!isNaN(px)) note.xPct = Math.max(0.05, Math.min(0.95, px));
                    if (!isNaN(py)) note.yPct = Math.max(0.05, Math.min(0.95, py));
                }
            }
        }
        else if (data.type === 'NOTE_DROPPED') {
            const fromRoom = canvas.rooms.find(r => r.roomId === data.fromRoomId);
            const toRoom = canvas.rooms.find(r => r.roomId === data.toRoomId);
            
            if (toRoom) {
                let note = toRoom.postItNotes.find(n => n.noteId === data.noteId);
                if (!note && fromRoom) {
                    const noteIdx = fromRoom.postItNotes.findIndex(n => n.noteId === data.noteId);
                    if (noteIdx !== -1) {
                        note = fromRoom.postItNotes.splice(noteIdx, 1)[0];
                        toRoom.postItNotes.push(note);
                    }
                }
                if (note) {
                    const px = parseFloat(data.xPct);
                    const py = parseFloat(data.yPct);
                    if (!isNaN(px)) note.xPct = Math.max(0.05, Math.min(0.95, px));
                    if (!isNaN(py)) note.yPct = Math.max(0.05, Math.min(0.95, py));
                }
            }
            updateStickyNotesList();
        }
        else if (data.type === 'NOTE_CREATED') {
            const targetRoomId = data.toRoomId || data.roomId;
            if (targetRoomId === localPeerId) {
                const room = canvas.rooms.find(r => r.roomId === localPeerId);
                if (room) {
                    if (room.postItNotes.length >= 25) {
                        return;
                    }
                    const cleanNote = sanitizeNote(data.note);
                    if (cleanNote) {
                        const noteIndex = room.postItNotes.findIndex(n => n.noteId === cleanNote.noteId);
                        if (noteIndex === -1) {
                            room.postItNotes.push(cleanNote);
                        } else {
                            room.postItNotes[noteIndex] = cleanNote;
                        }
                        broadcastRoomState();
                        updateStickyNotesList();
                    }
                }
            }
        }
        else if (data.type === 'NOTE_EDITED') {
            if (data.roomId === localPeerId) {
                const room = canvas.rooms.find(r => r.roomId === localPeerId);
                if (room) {
                    const note = room.postItNotes.find(n => n.noteId === data.noteId);
                    if (note) {
                        if (data.text !== undefined) note.text = String(data.text).substring(0, 200);
                        if (data.tag !== undefined) note.tag = String(data.tag).substring(0, 15);
                        if (data.colorName !== undefined && TAG_COLORS[data.colorName]) {
                            note.colorName = data.colorName;
                            note.color = TAG_COLORS[data.colorName].bg;
                        }
                        if (data.xPct !== undefined) {
                            const px = parseFloat(data.xPct);
                            if (!isNaN(px)) note.xPct = Math.max(0.05, Math.min(0.95, px));
                        }
                        if (data.yPct !== undefined) {
                            const py = parseFloat(data.yPct);
                            if (!isNaN(py)) note.yPct = Math.max(0.05, Math.min(0.95, py));
                        }
                        broadcastRoomState();
                        updateStickyNotesList();
                    }
                }
            }
        }
        else if (data.type === 'NOTE_DELETED') {
            if (data.roomId === localPeerId) {
                const room = canvas.rooms.find(r => r.roomId === localPeerId);
                if (room) {
                    room.postItNotes = room.postItNotes.filter(n => n.noteId !== data.noteId);
                    broadcastRoomState();
                    updateStickyNotesList();
                }
            }
        }
        else if (data.type === 'AMB_CRACKLE') {
            audio.triggerRemoteCrackle(data.roomId, data.theme, data.crackleType);
        }
    }

    function broadcastData(data) {
        Object.keys(connections).forEach(peerId => {
            const conn = connections[peerId];
            if (conn.open) {
                conn.send(data);
            }
        });
    }

    function sendToPeer(peerId, data) {
        const conn = connections[peerId];
        if (conn && conn.open) {
            conn.send(data);
        }
    }

    function broadcastRoomState() {
        if (!localPeerId) return;
        
        const localRoom = canvas.rooms.find(r => r.roomId === localPeerId || r.roomId === 'local_peer');
        if (!localRoom) return;

        broadcastData({
            type: 'ROOM_STATE',
            roomId: localPeerId,
            ownerName: 'Colleague',
            theme: currentTheme,
            intensities: {
                rain: localRoom.intensities.rain,
                thunder: localRoom.intensities.thunder,
                waves: localRoom.intensities.waves,
                crackle: localRoom.intensities.crackle,
                music: localRoom.intensities.music,
                wind: localRoom.intensities.wind,
                tape: localRoom.intensities.tape
            },
            postItNotes: localRoom.postItNotes
        });
    }

    function sendRoomStateToPeer(peerId) {
        if (!localPeerId) return;
        const conn = connections[peerId];
        if (!conn || !conn.open) return;

        const localRoom = canvas.rooms.find(r => r.roomId === localPeerId || r.roomId === 'local_peer');
        if (!localRoom) return;

        conn.send({
            type: 'ROOM_STATE',
            roomId: localPeerId,
            ownerName: 'Colleague',
            theme: currentTheme,
            intensities: {
                rain: localRoom.intensities.rain,
                thunder: localRoom.intensities.thunder,
                waves: localRoom.intensities.waves,
                crackle: localRoom.intensities.crackle,
                music: localRoom.intensities.music,
                wind: localRoom.intensities.wind,
                tape: localRoom.intensities.tape
            },
            postItNotes: localRoom.postItNotes
        });
    }

    function getRandomPastelColor() {
        const colors = [
            'rgba(254, 240, 138, 0.95)', // light yellow
            'rgba(191, 219, 254, 0.95)', // light blue
            'rgba(187, 247, 208, 0.95)', // light green
            'rgba(251, 207, 232, 0.95)', // light pink
            'rgba(254, 215, 170, 0.95)'  // light orange
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }



    function getRoomAndRelativeCoords(x, y) {
        const w = canvasEl.width;
        const h = canvasEl.height;
        const totalRooms = canvas.rooms.length;
        const sumWidths = canvas.rooms.reduce((sum, r) => sum + r.currentWidth, 0);
        if (sumWidths <= 0) return null;

        let currentX = 0;
        const glassStartY = 40;
        const glassHeight = h - 280;

        for (let i = 0; i < totalRooms; i++) {
            const room = canvas.rooms[i];
            const drawWidth = (room.currentWidth / sumWidths) * w;
            if (x >= currentX && x <= currentX + drawWidth) {
                const roomRelativeX = x - currentX;
                const glassRelativeY = y - glassStartY;
                
                const xPct = Math.max(0.05, Math.min(0.95, roomRelativeX / drawWidth));
                const yPct = Math.max(0.05, Math.min(0.95, glassRelativeY / glassHeight));

                return { room, xPct, yPct };
            }
            currentX += drawWidth;
        }
        return null;
    }

    // --- Note Modal & Category Tag Features ---
    const TAG_COLORS = {
        yellow: { bg: 'rgba(254, 240, 138, 0.95)', solid: '#eab308' },
        blue: { bg: 'rgba(191, 219, 254, 0.95)', solid: '#3b82f6' },
        red: { bg: 'rgba(254, 202, 202, 0.95)', solid: '#ef4444' },
        orange: { bg: 'rgba(254, 215, 170, 0.95)', solid: '#f97316' },
        purple: { bg: 'rgba(233, 213, 255, 0.95)', solid: '#a855f7' },
        green: { bg: 'rgba(187, 247, 208, 0.95)', solid: '#10b981' },
        pink: { bg: 'rgba(251, 207, 232, 0.95)', solid: '#ec4899' }
    };

    let activeEditingRoom = null;
    let activeEditingNote = null;
    let activeNewNoteCoords = null;

    function openNoteModal(room, note, xPct = 0.5, yPct = 0.5) {
        activeEditingRoom = room;
        activeEditingNote = note;
        activeNewNoteCoords = { xPct, yPct };

        const modal = document.getElementById('note-modal');
        const textEl = document.getElementById('note-modal-text');
        const titleEl = document.getElementById('note-modal-title');
        const tagSelect = document.getElementById('note-modal-tag');
        const customTagInput = document.getElementById('note-modal-custom-tag');
        const colorsContainer = document.getElementById('note-options-container');
        const footerEl = document.getElementById('note-modal-footer');
        const deleteBtn = document.getElementById('note-modal-delete');
        const charCount = document.getElementById('note-char-count');

        textEl.value = note ? note.text : '';
        charCount.textContent = textEl.value.length;
        
        const isLocal = isLocalRoom(room.roomId);

        if (isLocal) {
            textEl.disabled = false;
            titleEl.textContent = note ? 'Edit Sticky Note' : 'Create Sticky Note';
            if (colorsContainer) colorsContainer.style.display = 'flex';
            if (footerEl) footerEl.style.display = 'flex';
            if (deleteBtn) {
                deleteBtn.style.display = note ? 'block' : 'none';
            }

            let currentTag = note ? (note.tag || 'General') : 'General';
            let currentColorName = note ? (note.colorName || 'yellow') : 'yellow';

            const standardTags = ['General', 'Work', 'Study', 'Personal', 'Ideas'];
            if (standardTags.includes(currentTag)) {
                tagSelect.value = currentTag;
                customTagInput.value = '';
            } else {
                tagSelect.value = 'General';
                customTagInput.value = currentTag;
            }

            const colorDots = document.querySelectorAll('#note-modal-colors .color-dot');
            colorDots.forEach(dot => {
                dot.classList.toggle('active', dot.dataset.color === currentColorName);
            });

            modal.dataset.selectedColorName = currentColorName;
        } else {
            textEl.disabled = true;
            titleEl.textContent = `Reading ${room.ownerName || 'Colleague'}'s Note`;
            if (colorsContainer) colorsContainer.style.display = 'none';
            if (footerEl) footerEl.style.display = 'none';
        }

        modal.style.display = 'flex';
    }

    function saveNoteFromModal() {
        const textEl = document.getElementById('note-modal-text');
        const tagSelect = document.getElementById('note-modal-tag');
        const customTagInput = document.getElementById('note-modal-custom-tag');
        const modal = document.getElementById('note-modal');
        
        const text = textEl.value.trim();
        if (!text) {
            showToast("Note content cannot be empty.");
            return;
        }

        if (text.length > 200) {
            showToast("Note cannot exceed 200 characters.");
            return;
        }

        const customTag = customTagInput.value.trim();
        const tag = customTag || tagSelect.value;

        const colorName = modal.dataset.selectedColorName || 'yellow';
        const colorConfig = TAG_COLORS[colorName] || TAG_COLORS.yellow;
        const color = colorConfig.bg;

        if (activeEditingNote) {
            activeEditingNote.text = text;
            activeEditingNote.tag = tag;
            activeEditingNote.colorName = colorName;
            activeEditingNote.color = color;
            
            if (isLocalRoom(activeEditingRoom.roomId)) {
                broadcastRoomState();
            } else {
                sendToPeer(activeEditingRoom.roomId, {
                    type: 'NOTE_EDITED',
                    roomId: activeEditingRoom.roomId,
                    noteId: activeEditingNote.noteId,
                    text: text,
                    tag: tag,
                    colorName: colorName,
                    color: color
                });
            }
        } else {
            if (activeEditingRoom.postItNotes.length >= 25) {
                showToast("Maximum of 25 notes reached for this room!");
                return;
            }

            const newNote = {
                noteId: 'note_' + Math.random().toString(36).substr(2, 9),
                text: text,
                tag: tag,
                colorName: colorName,
                color: color,
                xPct: activeNewNoteCoords ? activeNewNoteCoords.xPct : 0.5,
                yPct: activeNewNoteCoords ? activeNewNoteCoords.yPct : 0.5,
                rotation: Math.random() * 0.2 - 0.1
            };

            if (isLocalRoom(activeEditingRoom.roomId)) {
                activeEditingRoom.postItNotes.push(newNote);
                broadcastRoomState();
            } else {
                sendToPeer(activeEditingRoom.roomId, {
                    type: 'NOTE_CREATED',
                    toRoomId: activeEditingRoom.roomId,
                    note: newNote
                });
            }
        }

        modal.style.display = 'none';
        updateStickyNotesList();
    }

    function deleteNoteFromModal() {
        if (!activeEditingNote) return;

        if (isLocalRoom(activeEditingRoom.roomId)) {
            activeEditingRoom.postItNotes = activeEditingRoom.postItNotes.filter(n => n.noteId !== activeEditingNote.noteId);
            broadcastRoomState();
        } else {
            sendToPeer(activeEditingRoom.roomId, {
                type: 'NOTE_DELETED',
                roomId: activeEditingRoom.roomId,
                noteId: activeEditingNote.noteId
            });
        }

        document.getElementById('note-modal').style.display = 'none';
        updateStickyNotesList();
    }

    function updateStickyNotesList() {
        const listContainer = document.getElementById('sticky-notes-list');
        if (!listContainer) return;
        
        listContainer.innerHTML = '';

        canvas.rooms.forEach(room => {
            if (!room.postItNotes) return;
            room.postItNotes.forEach(note => {
                const card = document.createElement('div');
                card.className = 'sticky-note-card';
                card.dataset.noteId = note.noteId;
                card.dataset.roomId = room.roomId;

                const textDiv = document.createElement('div');
                textDiv.className = 'sticky-note-card-text';
                textDiv.textContent = note.text;
                card.appendChild(textDiv);

                const metaDiv = document.createElement('div');
                metaDiv.className = 'sticky-note-card-meta';

                const tagSpan = document.createElement('span');
                const cleanTag = note.tag || 'General';
                tagSpan.className = `tag-pill ${(note.colorName || 'yellow').toLowerCase()}`;
                tagSpan.textContent = cleanTag;
                metaDiv.appendChild(tagSpan);

                const ownerSpan = document.createElement('span');
                ownerSpan.className = 'sticky-note-card-owner';
                ownerSpan.textContent = isLocalRoom(room.roomId) ? 'Me' : (room.ownerName || 'Colleague');
                metaDiv.appendChild(ownerSpan);

                card.appendChild(metaDiv);

                if (isLocalRoom(room.roomId)) {
                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'sticky-note-card-delete';
                    deleteBtn.setAttribute('aria-label', 'Delete note');
                    deleteBtn.textContent = '×';
                    deleteBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        room.postItNotes = room.postItNotes.filter(n => n.noteId !== note.noteId);
                        broadcastRoomState();
                        updateStickyNotesList();
                    });
                    card.appendChild(deleteBtn);
                }

                card.addEventListener('click', () => {
                    openNoteModal(room, note);
                });

                listContainer.appendChild(card);
            });
        });
    }

    function sanitizeNote(note) {
        if (!note || typeof note !== 'object') return null;
        
        let noteId = String(note.noteId || '').trim();
        if (!noteId || noteId.length > 50) {
            noteId = 'note_' + Math.random().toString(36).substr(2, 9);
        }
        
        let text = String(note.text || '').trim();
        if (text.length > 200) {
            text = text.substring(0, 200);
        }
        
        let tag = String(note.tag || 'General').trim();
        if (tag.length > 15) {
            tag = tag.substring(0, 15);
        }
        
        let colorName = String(note.colorName || 'yellow').trim().toLowerCase();
        if (!TAG_COLORS[colorName]) {
            colorName = 'yellow';
        }
        
        const color = TAG_COLORS[colorName].bg;
        
        let xPct = parseFloat(note.xPct);
        if (isNaN(xPct) || xPct < 0.05 || xPct > 0.95) {
            xPct = 0.5;
        }
        
        let yPct = parseFloat(note.yPct);
        if (isNaN(yPct) || yPct < 0.05 || yPct > 0.95) {
            yPct = 0.5;
        }
        
        let rotation = parseFloat(note.rotation);
        if (isNaN(rotation) || rotation < -0.5 || rotation > 0.5) {
            rotation = Math.random() * 0.2 - 0.1;
        }
        
        return { noteId, text, tag, colorName, color, xPct, yPct, rotation };
    }

    // --- Modal Event Listeners & Buttons ---
    const noteModal = document.getElementById('note-modal');
    const noteClose = document.getElementById('note-modal-close');
    const noteSave = document.getElementById('note-modal-save');
    const noteDelete = document.getElementById('note-modal-delete');
    const noteTextarea = document.getElementById('note-modal-text');
    const noteCharCount = document.getElementById('note-char-count');
    const tagSelect = document.getElementById('note-modal-tag');
    const customTagInput = document.getElementById('note-modal-custom-tag');
    const colorDots = document.querySelectorAll('#note-modal-colors .color-dot');

    if (noteClose) {
        noteClose.addEventListener('click', () => {
            noteModal.style.display = 'none';
        });
    }
    if (noteSave) {
        noteSave.addEventListener('click', () => {
            saveNoteFromModal();
            audio.triggerKeyboardClick();
        });
    }
    if (noteDelete) {
        noteDelete.addEventListener('click', () => {
            deleteNoteFromModal();
            audio.triggerKeyboardClick();
        });
    }
    if (noteModal) {
        noteModal.addEventListener('click', (e) => {
            if (e.target === noteModal) {
                noteModal.style.display = 'none';
            }
        });
    }
    if (noteTextarea && noteCharCount) {
        noteTextarea.addEventListener('input', () => {
            noteCharCount.textContent = noteTextarea.value.length;
        });
    }

    if (tagSelect) {
        tagSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            let colorName = 'yellow';
            if (val === 'Work') colorName = 'blue';
            else if (val === 'Study') colorName = 'red';
            else if (val === 'Personal') colorName = 'orange';
            else if (val === 'Ideas') colorName = 'purple';
            else if (val === 'General') colorName = 'yellow';

            if (customTagInput) customTagInput.value = '';

            colorDots.forEach(dot => {
                dot.classList.toggle('active', dot.dataset.color === colorName);
            });
            noteModal.dataset.selectedColorName = colorName;
        });
    }

    colorDots.forEach(dot => {
        dot.addEventListener('click', () => {
            colorDots.forEach(d => d.classList.remove('active'));
            dot.classList.add('active');
            noteModal.dataset.selectedColorName = dot.dataset.color;
        });
    });

    // How To Modal elements
    const howToModal = document.getElementById('how-to-modal');
    const overlayHowToBtn = document.getElementById('overlay-how-to-btn');
    const sidebarHowToBtn = document.getElementById('sidebar-how-to-btn');
    const howToClose = document.getElementById('how-to-modal-close');
    const howToOk = document.getElementById('how-to-modal-ok');

    if (overlayHowToBtn) {
        overlayHowToBtn.addEventListener('click', () => {
            howToModal.style.display = 'flex';
        });
    }
    if (sidebarHowToBtn) {
        sidebarHowToBtn.addEventListener('click', () => {
            howToModal.style.display = 'flex';
            audio.triggerKeyboardClick();
        });
    }
    if (howToClose) {
        howToClose.addEventListener('click', () => {
            howToModal.style.display = 'none';
        });
    }
    if (howToOk) {
        howToOk.addEventListener('click', () => {
            howToModal.style.display = 'none';
        });
    }
    if (howToModal) {
        howToModal.addEventListener('click', (e) => {
            if (e.target === howToModal) {
                howToModal.style.display = 'none';
            }
        });
    }

    // Add Sticky Button in right sidebar
    const addStickyBtn = document.getElementById('add-sticky-btn');
    if (addStickyBtn) {
        addStickyBtn.addEventListener('click', () => {
            const localRoom = canvas.rooms.find(r => r.roomId === localPeerId || r.roomId === 'local_peer' || r.roomId === 'Me');
            if (localRoom) {
                const xPct = 0.3 + Math.random() * 0.4;
                const yPct = 0.3 + Math.random() * 0.4;
                openNoteModal(localRoom, null, xPct, yPct);
            }
        });
    }

    // Initialize list UI
    updateStickyNotesList();
});
