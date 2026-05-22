// ---- Digital Sanctuary Canvas Manager ----

export class CanvasManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.theme = 'cabin';

        // Local User intensities (0.0 to 1.0)
        this.intensities = {
            rain: 0,
            thunder: 0,
            waves: 0,
            crackle: 0.25,
            music: 0,
            wind: 0
        };

        // Local particles / state for compatibility
        this.particles = {
            raindrops: [],
            embers: [],
            steam: [],
            bubbles: [],
            jellyfish: []
        };
        this.flyingCars = [];
        this.fish = [];
        this.ripples = [];
        this.mouse = { x: -1000, y: -1000 };

        this.cat = {
            state: 'sleeping',
            awakeTimer: 0.0
        };

        this.todOverride = 'auto'; // 'auto', 'sunrise', 'day', 'sunset', 'night'
        this.lightningFlash = 0;

        this.plant = {
            keystrokes: 0,
            growth: 0.1,
            lastGrown: Date.now()
        };

        // --- P2P Collaborative Rooms Setup ---
        this.localRoomId = 'local_peer';
        this.rooms = [];
        
        // Dragging & Interaction states
        this.draggedNote = null;
        this.draggedRoomIndex = -1;
        this.draggedRoom = null;
        this.dragOffset = { x: 0, y: 0 };
        this.hoveredNote = null;
        this.hoveredCloseBtn = false;

        // P2P Event Callbacks (assigned by app.js)
        this.onNoteCreated = null;
        this.onNoteDragged = null;
        this.onNoteDropped = null;
        this.onNoteDeleted = null;
        this.onNoteClicked = null;

        // Initialize local room
        const localRoom = this.createRoomObject(this.localRoomId, 'Me', this.theme);
        localRoom.currentWidth = window.innerWidth;
        localRoom.targetWidth = window.innerWidth;
        localRoom.intensities = this.intensities;
        this.rooms.push(localRoom);

        // Bind resize and mouse handlers
        window.addEventListener('resize', () => this.resize());
        this.resize();

        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        window.addEventListener('mouseup', (e) => this.handleMouseUp(e));

        // Touch event listeners for mobile devices
        this.canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length > 0) {
                const touch = e.touches[0];
                const simulatedEvent = {
                    clientX: touch.clientX,
                    clientY: touch.clientY,
                    preventDefault: () => e.preventDefault()
                };
                e.preventDefault();
                this.handleMouseDown(simulatedEvent);
            }
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            if (e.touches.length > 0) {
                const touch = e.touches[0];
                const simulatedEvent = {
                    clientX: touch.clientX,
                    clientY: touch.clientY,
                    preventDefault: () => e.preventDefault()
                };
                e.preventDefault();
                this.handleMouseMove(simulatedEvent);
            }
        }, { passive: false });

        this.canvas.addEventListener('touchend', (e) => {
            if (e.changedTouches.length > 0) {
                const touch = e.changedTouches[0];
                const simulatedEvent = {
                    clientX: touch.clientX,
                    clientY: touch.clientY,
                    preventDefault: () => e.preventDefault()
                };
                this.handleMouseUp(simulatedEvent);
            }
        });
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        // Re-apportion widths of rooms
        const activeRooms = this.rooms.filter(r => !r.isLeaving);
        if (activeRooms.length > 0) {
            const targetWidth = this.canvas.width / activeRooms.length;
            this.rooms.forEach(room => {
                if (!room.isLeaving) {
                    room.targetWidth = targetWidth;
                }
            });
        }
    }

    createRoomObject(roomId, ownerName, theme) {
        const room = {
            roomId: roomId,
            ownerName: ownerName,
            theme: theme,
            postItNotes: [],
            intensities: {
                rain: 0,
                thunder: 0,
                waves: 0,
                crackle: 0.25,
                music: 0,
                wind: 0,
                tape: 0
            },
            particles: {
                raindrops: [],
                embers: [],
                steam: [],
                bubbles: [],
                jellyfish: []
            },
            flyingCars: [],
            fish: [],
            ripples: [],
            cat: {
                state: 'sleeping',
                awakeTimer: 0.0
            },
            stars: [],
            plant: {
                keystrokes: 0,
                growth: 0.1,
                lastGrown: Date.now()
            },
            currentWidth: 0,
            targetWidth: 0,
            isLeaving: false
        };

        // Populate twinkling stars
        for (let i = 0; i < 25; i++) {
            room.stars.push({
                x: Math.random(),
                y: Math.random(),
                size: Math.random() * 1.6 + 0.4,
                blinkSpeed: 1.5 + Math.random() * 2.5
            });
        }
        return room;
    }

    addRoom(roomObj) {
        roomObj.currentWidth = 0;
        this.rooms.push(roomObj);
        this.resize();
    }

    removeRoom(roomId) {
        const room = this.rooms.find(r => r.roomId === roomId);
        if (room) {
            room.isLeaving = true;
            room.targetWidth = 0;
        }
    }

    setTheme(newTheme) {
        this.theme = newTheme;
        const localRoom = this.rooms.find(r => r.roomId === this.localRoomId || r.roomId === 'local_peer');
        if (localRoom) {
            localRoom.theme = newTheme;
            localRoom.particles.raindrops = [];
            localRoom.particles.embers = [];
            localRoom.particles.steam = [];
            localRoom.particles.bubbles = [];
            localRoom.particles.jellyfish = [];
            localRoom.flyingCars = [];
            localRoom.fish = [];
            localRoom.ripples = [];
        }
    }

    setIntensity(type, value) {
        if (this.intensities.hasOwnProperty(type)) {
            this.intensities[type] = value;
        }
        const localRoom = this.rooms.find(r => r.roomId === this.localRoomId || r.roomId === 'local_peer');
        if (localRoom) {
            localRoom.intensities[type] = value;
        }
    }

    getTimeOfDay() {
        let hour = new Date().getHours();
        if (this.todOverride !== 'auto') {
            if (this.todOverride === 'sunrise') hour = 8;
            else if (this.todOverride === 'day') hour = 13;
            else if (this.todOverride === 'sunset') hour = 18;
            else if (this.todOverride === 'night') hour = 22;
        }

        if (hour >= 6 && hour < 11) {
            return {
                name: 'Morning Sunrise',
                stops: [
                    { offset: 0, color: '#1a2e4d' },
                    { offset: 0.5, color: '#8b5a7a' },
                    { offset: 1.0, color: '#f5c093' }
                ],
                sunMoonColor: 'rgba(253, 224, 71, 0.15)',
                sunMoonRadius: 50,
                drawStars: false
            };
        } else if (hour >= 11 && hour < 17) {
            return {
                name: 'Cozy Day',
                stops: [
                    { offset: 0, color: '#5dade2' },
                    { offset: 0.5, color: '#85c1e9' },
                    { offset: 1.0, color: '#ebf5fb' }
                ],
                sunMoonColor: 'rgba(255, 255, 255, 0.22)',
                sunMoonRadius: 45,
                drawStars: false
            };
        } else if (hour >= 17 && hour < 20) {
            return {
                name: 'Sunset Golden Hour',
                stops: [
                    { offset: 0, color: '#1c0f30' },
                    { offset: 0.45, color: '#511f46' },
                    { offset: 0.8, color: '#af433f' },
                    { offset: 1.0, color: '#f7935c' }
                ],
                sunMoonColor: 'rgba(254, 150, 92, 0.25)',
                sunMoonRadius: 65,
                drawStars: false
            };
        } else {
            return {
                name: 'Cozy Night',
                stops: [
                    { offset: 0, color: '#04060f' },
                    { offset: 1.0, color: '#0e121d' }
                ],
                sunMoonColor: 'rgba(255, 255, 255, 0.03)',
                sunMoonRadius: 60,
                drawStars: true
            };
        }
    }

    getTimeOfDayName() {
        return this.getTimeOfDay().name;
    }

    incrementPlantGrowth() {
        this.plant.keystrokes++;
        if (this.plant.growth < 1.0) {
            this.plant.growth = Math.min(1.0, 0.1 + (this.plant.keystrokes * 0.006));
            this.plant.lastGrown = Date.now();
        }
        const localRoom = this.rooms.find(r => r.roomId === this.localRoomId || r.roomId === 'local_peer');
        if (localRoom) {
            localRoom.plant.keystrokes = this.plant.keystrokes;
            localRoom.plant.growth = this.plant.growth;
        }
    }

    wakeCat() {
        this.cat.state = 'awake';
        this.cat.awakeTimer = 3.0;
        const localRoom = this.rooms.find(r => r.roomId === this.localRoomId || r.roomId === 'local_peer');
        if (localRoom) {
            localRoom.cat.state = 'awake';
            localRoom.cat.awakeTimer = 3.0;
        }
    }

    triggerCoffee() {
        const localRoom = this.rooms.find(r => r.roomId === this.localRoomId || r.roomId === 'local_peer');
        if (!localRoom) return;

        const w = this.canvas.width;
        const totalRooms = this.rooms.length;
        const sumWidths = this.rooms.reduce((sum, r) => sum + r.currentWidth, 0);
        const drawWidth = sumWidths > 0 ? (localRoom.currentWidth / sumWidths) * w : w;
        
        const cupX = drawWidth * 0.35;
        const cupY = this.canvas.height - 240;
        for (let i = 0; i < 15; i++) {
            localRoom.particles.steam.push({
                x: cupX + (Math.random() * 16 - 8),
                y: cupY - 5,
                size: Math.random() * 4 + 2,
                speedY: Math.random() * 0.9 + 0.5,
                speedX: (Math.random() - 0.5) * 0.6,
                opacity: 0.6,
                life: 1.0,
                decay: Math.random() * 0.015 + 0.007
            });
        }
    }

    triggerCoffeeRemote(roomId) {
        const room = this.rooms.find(r => r.roomId === roomId);
        if (room) {
            const w = this.canvas.width;
            const sumWidths = this.rooms.reduce((sum, r) => sum + r.currentWidth, 0);
            const drawWidth = sumWidths > 0 ? (room.currentWidth / sumWidths) * w : w;

            const cupX = drawWidth * 0.35;
            const cupY = this.canvas.height - 240;
            for (let i = 0; i < 12; i++) {
                room.particles.steam.push({
                    x: cupX + (Math.random() * 14 - 7),
                    y: cupY - 5,
                    size: Math.random() * 3 + 2,
                    speedY: Math.random() * 0.8 + 0.4,
                    speedX: (Math.random() - 0.5) * 0.5,
                    opacity: 0.6,
                    life: 1.0,
                    decay: Math.random() * 0.018 + 0.008
                });
            }
        }
    }

    addRipple(x, y) {
        // Find which room was clicked and translate ripple coordinates
        const w = this.canvas.width;
        const totalRooms = this.rooms.length;
        const sumWidths = this.rooms.reduce((sum, r) => sum + r.currentWidth, 0);
        if (sumWidths <= 0) return;

        let currentX = 0;
        for (let i = 0; i < totalRooms; i++) {
            const room = this.rooms[i];
            const drawWidth = (room.currentWidth / sumWidths) * w;
            if (x >= currentX && x <= currentX + drawWidth) {
                room.ripples.push({
                    x: x - currentX,
                    y: y,
                    radius: 2,
                    maxRadius: 40 + Math.random() * 30,
                    speed: 1.5 + Math.random() * 1.0,
                    opacity: 1.0
                });
                break;
            }
            currentX += drawWidth;
        }
    }

    generateStaticEnvironment() {
        // Stub for compatibility
    }

    start() {
        const loop = () => {
            this.update();
            this.draw();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    // --- Note Collision and Drag Handlers ---
    getNoteAt(mouseX, mouseY) {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const totalRooms = this.rooms.length;
        const sumWidths = this.rooms.reduce((sum, r) => sum + r.currentWidth, 0);
        if (sumWidths <= 0) return null;
        
        const glassStartY = 40;
        const glassHeight = h - 280;

        let currentX = 0;
        for (let i = 0; i < totalRooms; i++) {
            const room = this.rooms[i];
            const drawWidth = (room.currentWidth / sumWidths) * w;
            
            if (mouseX >= currentX && mouseX <= currentX + drawWidth) {
                for (let j = room.postItNotes.length - 1; j >= 0; j--) {
                    const note = room.postItNotes[j];
                    const noteX = currentX + note.xPct * drawWidth;
                    const noteY = glassStartY + note.yPct * glassHeight;
                    
                    if (mouseX >= noteX - 50 && mouseX <= noteX + 50 &&
                        mouseY >= noteY - 50 && mouseY <= noteY + 50) {
                        return {
                            room,
                            roomIndex: i,
                            note,
                            noteX,
                            noteY,
                            drawWidth,
                            currentX
                        };
                    }
                }
            }
            currentX += drawWidth;
        }
        return null;
    }

    checkCloseBtnHover(mouseX, mouseY, noteX, noteY, rotation) {
        const theta = rotation || 0;
        // Close button coordinates are in translated space (42, -42)
        const rx = 42 * Math.cos(theta) - (-42) * Math.sin(theta);
        const ry = 42 * Math.sin(theta) + (-42) * Math.cos(theta);
        const cx = noteX + rx;
        const cy = noteY + ry;
        
        return Math.hypot(mouseX - cx, mouseY - cy) <= 10;
    }

    handleMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        this.dragStartPos = { x: mouseX, y: mouseY };
        
        const hit = this.getNoteAt(mouseX, mouseY);
        if (hit) {
            if (this.hoveredCloseBtn) {
                this.deleteNoteObj(hit.roomIndex, hit.note.noteId);
                if (this.onNoteDeleted) {
                    this.onNoteDeleted(hit.room.roomId, hit.note.noteId);
                }
                this.hoveredNote = null;
                this.hoveredCloseBtn = false;
                return;
            }
            
            this.draggedNote = hit.note;
            this.draggedRoomIndex = hit.roomIndex;
            this.draggedRoom = hit.room;
            this.dragOffsetStartRoomId = hit.room.roomId;
            this.dragOffset = {
                x: mouseX - hit.noteX,
                y: mouseY - hit.noteY
            };
        }
    }

    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        this.mouse.x = mouseX;
        this.mouse.y = mouseY;

        this.hoveredNote = null;
        this.hoveredCloseBtn = false;

        const hit = this.getNoteAt(mouseX, mouseY);
        if (hit) {
            this.hoveredNote = hit.note;
            this.hoveredCloseBtn = this.checkCloseBtnHover(mouseX, mouseY, hit.noteX, hit.noteY, hit.note.rotation);
        }

        if (this.draggedNote) {
            const h = this.canvas.height;
            const glassStartY = 40;
            const glassHeight = h - 280;
            
            const totalRooms = this.rooms.length;
            const sumWidths = this.rooms.reduce((sum, r) => sum + r.currentWidth, 0);
            const w = this.canvas.width;

            // 1. Detect if dragging note crosses into another room sector
            let hoveredRoomIdx = -1;
            let accX = 0;
            for (let i = 0; i < totalRooms; i++) {
                const rWidth = sumWidths > 0 ? (this.rooms[i].currentWidth / sumWidths) * w : w;
                if (mouseX >= accX && mouseX <= accX + rWidth) {
                    hoveredRoomIdx = i;
                    break;
                }
                accX += rWidth;
            }

            if (hoveredRoomIdx !== -1 && hoveredRoomIdx !== this.draggedRoomIndex) {
                // Calculate note's absolute X position in the old room
                let oldRoomLeft = 0;
                for (let i = 0; i < this.draggedRoomIndex; i++) {
                    oldRoomLeft += sumWidths > 0 ? (this.rooms[i].currentWidth / sumWidths) * w : 0;
                }
                const oldDrawWidth = sumWidths > 0 ? (this.draggedRoom.currentWidth / sumWidths) * w : w;
                const noteAbsX = oldRoomLeft + this.draggedNote.xPct * oldDrawWidth;

                // Move note from old room to new room locally
                this.draggedRoom.postItNotes = this.draggedRoom.postItNotes.filter(n => n.noteId !== this.draggedNote.noteId);
                const newRoom = this.rooms[hoveredRoomIdx];
                newRoom.postItNotes.push(this.draggedNote);

                // Update drag track state variables
                this.draggedRoomIndex = hoveredRoomIdx;
                this.draggedRoom = newRoom;

                // Recalculate relative xPct for the new room bounds
                let newRoomLeft = 0;
                for (let i = 0; i < hoveredRoomIdx; i++) {
                    newRoomLeft += sumWidths > 0 ? (this.rooms[i].currentWidth / sumWidths) * w : 0;
                }
                const newDrawWidth = sumWidths > 0 ? (newRoom.currentWidth / sumWidths) * w : w;
                this.draggedNote.xPct = Math.max(0.05, Math.min(0.95, (noteAbsX - newRoomLeft) / newDrawWidth));
            }
            
            // 2. Normal position updates based on target dragOffset
            let currentX = 0;
            for (let i = 0; i < this.draggedRoomIndex; i++) {
                currentX += sumWidths > 0 ? (this.rooms[i].currentWidth / sumWidths) * w : 0;
            }
            const drawWidth = sumWidths > 0 ? (this.draggedRoom.currentWidth / sumWidths) * w : w;
            
            const targetNoteX = mouseX - this.dragOffset.x;
            const targetNoteY = mouseY - this.dragOffset.y;
            
            const roomRelativeX = targetNoteX - currentX;
            const glassRelativeY = targetNoteY - glassStartY;

            this.draggedNote.xPct = Math.max(0.05, Math.min(0.95, roomRelativeX / drawWidth));
            this.draggedNote.yPct = Math.max(0.05, Math.min(0.95, glassRelativeY / glassHeight));

            if (this.onNoteDragged) {
                this.onNoteDragged(
                    this.dragOffsetStartRoomId || this.draggedRoom.roomId,
                    this.draggedRoom.roomId,
                    this.draggedNote.noteId,
                    this.draggedNote.xPct,
                    this.draggedNote.yPct
                );
            }
        }
    }

    handleMouseUp(e) {
        if (this.draggedNote) {
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const dragDistance = Math.hypot(mouseX - this.dragStartPos.x, mouseY - this.dragStartPos.y);

            if (dragDistance < 4) {
                if (this.onNoteClicked) {
                    this.onNoteClicked(this.draggedRoom, this.draggedNote);
                }
                this.draggedNote = null;
                this.draggedRoomIndex = -1;
                this.draggedRoom = null;
                this.dragOffsetStartRoomId = null;
                return;
            }

            if (this.onNoteDropped) {
                this.onNoteDropped(
                    this.dragOffsetStartRoomId || this.draggedRoom.roomId,
                    this.draggedRoom.roomId,
                    this.draggedNote.noteId,
                    this.draggedNote.text,
                    this.draggedNote.xPct,
                    this.draggedNote.yPct,
                    this.draggedNote.color,
                    this.draggedNote.rotation,
                    this.draggedNote.tag,
                    this.draggedNote.colorName
                );
            }
            this.draggedNote = null;
            this.draggedRoomIndex = -1;
            this.draggedRoom = null;
            this.dragOffsetStartRoomId = null;
        }
    }

    deleteNoteObj(roomIndex, noteId) {
        const room = this.rooms[roomIndex];
        if (room) {
            room.postItNotes = room.postItNotes.filter(n => n.noteId !== noteId);
        }
    }

    // --- Update Loop ---
    update() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const time = Date.now() * 0.001;

        const totalRooms = this.rooms.length;
        if (totalRooms <= 0) return;

        // Animate width expansions/collapses
        const activeRoomsCount = this.rooms.filter(r => !r.isLeaving).length;
        const targetActiveWidth = activeRoomsCount > 0 ? (w / activeRoomsCount) : 0;

        this.rooms.forEach(room => {
            const target = room.isLeaving ? 0 : targetActiveWidth;
            room.currentWidth += (target - room.currentWidth) * 0.08;
        });

        // Filter collapsed leaving rooms
        this.rooms = this.rooms.filter(room => !(room.isLeaving && room.currentWidth < 1));

        const sumWidths = this.rooms.reduce((sum, r) => sum + r.currentWidth, 0);

        this.rooms.forEach((room, idx) => {
            const drawWidth = sumWidths > 0 ? (room.currentWidth / sumWidths) * w : 0;
            if (drawWidth < 1) return;

            // 1. Rain Visuals
            if (room.theme === 'cabin' || room.theme === 'cyberpunk') {
                const rainLimit = room.theme === 'cyberpunk' ? 2 : 3;
                if (Math.random() < room.intensities.rain * rainLimit) {
                    const windSpeed = room.intensities.wind;
                    const speedX = (room.theme === 'cabin' ? -1 : 0.5) - (windSpeed * 8);
                    const xSpawn = Math.random() * (drawWidth + 200) - 100;
                    room.particles.raindrops.push({
                        x: xSpawn,
                        y: -20,
                        length: Math.random() * 25 + 15,
                        speedY: Math.random() * 12 + 18,
                        speedX: speedX,
                        opacity: Math.random() * 0.4 + 0.15
                    });
                }

                for (let i = 0; i < room.particles.raindrops.length; i++) {
                    let r = room.particles.raindrops[i];
                    r.y += r.speedY;
                    r.x += r.speedX;
                    if (r.y > h || r.x < -200 || r.x > drawWidth + 200) {
                        room.particles.raindrops.splice(i, 1);
                        i--;
                    }
                }
            }

            // 2. Embers Visuals
            if (room.theme === 'cabin' && room.intensities.crackle > 0) {
                if (Math.random() < room.intensities.crackle * 0.35) {
                    room.particles.embers.push({
                        x: (drawWidth * 0.5) + (Math.random() * 100 - 50),
                        y: h - 240,
                        size: Math.random() * 3 + 1,
                        speedY: Math.random() * 1.5 + 0.6,
                        speedX: (Math.random() - 0.5) * 1.5,
                        life: 255,
                        decay: Math.random() * 1.5 + 1.2
                    });
                }

                for (let i = 0; i < room.particles.embers.length; i++) {
                    let p = room.particles.embers[i];
                    p.y -= p.speedY;
                    p.x += p.speedX;
                    p.life -= p.decay;
                    if (p.life <= 0 || p.y < h - 400) {
                        room.particles.embers.splice(i, 1);
                        i--;
                    }
                }
            }

            // 3. Steam Visuals
            if (room.theme === 'cyberpunk') {
                const cupX = drawWidth * 0.35;
                const cupY = h - 240;
                if (Math.random() < 0.12 && room.intensities.crackle > 0.05) {
                    room.particles.steam.push({
                        x: cupX + (Math.random() * 16 - 8),
                        y: cupY,
                        size: Math.random() * 4 + 2,
                        speedY: Math.random() * 0.6 + 0.4,
                        speedX: (Math.random() - 0.5) * 0.4,
                        opacity: 0.5,
                        life: 1.0,
                        decay: Math.random() * 0.008 + 0.005
                    });
                }

                for (let i = 0; i < room.particles.steam.length; i++) {
                    let p = room.particles.steam[i];
                    p.y -= p.speedY;
                    p.x += p.speedX + Math.sin(time * 3 + p.y * 0.05) * 0.2;
                    p.life -= p.decay;
                    p.size += 0.05;
                    if (p.life <= 0) {
                        room.particles.steam.splice(i, 1);
                        i--;
                    }
                }
            }

            // 4. Bubbles & Jellyfish Visuals
            if (room.theme === 'ocean') {
                const bubbleFreq = 0.05 + room.intensities.waves * 0.25;
                if (Math.random() < bubbleFreq) {
                    room.particles.bubbles.push({
                        x: Math.random() * drawWidth,
                        y: h + 10,
                        radius: Math.random() * 4 + 1.5,
                        speedY: Math.random() * 1.2 + 0.8,
                        wiggleSpeed: Math.random() * 2 + 1,
                        wiggleAmp: Math.random() * 1.5 + 0.5,
                        opacity: Math.random() * 0.5 + 0.2
                    });
                }

                for (let i = 0; i < room.particles.bubbles.length; i++) {
                    let b = room.particles.bubbles[i];
                    b.y -= b.speedY;
                    b.x += Math.sin(time * b.wiggleSpeed) * b.wiggleAmp * 0.2;
                    if (b.y < -10) {
                        room.particles.bubbles.splice(i, 1);
                        i--;
                    }
                }

                if (Math.random() < 0.02) {
                    room.particles.jellyfish.push({
                        x: Math.random() * drawWidth,
                        y: h + 50,
                        size: Math.random() * 15 + 8,
                        speedY: Math.random() * 0.4 + 0.2,
                        wiggleSpeed: Math.random() * 1 + 0.5,
                        wiggleAmp: Math.random() * 3 + 2,
                        hue: 180 + Math.random() * 40
                    });
                }

                for (let i = 0; i < room.particles.jellyfish.length; i++) {
                    let j = room.particles.jellyfish[i];
                    j.y -= j.speedY;
                    j.x += Math.sin(time * j.wiggleSpeed) * 0.4;
                    if (j.y < -50) {
                        room.particles.jellyfish.splice(i, 1);
                        i--;
                    }
                }
            }

            // 5. Ripples Update
            for (let i = 0; i < room.ripples.length; i++) {
                let r = room.ripples[i];
                r.radius += r.speed;
                r.opacity = 1.0 - (r.radius / r.maxRadius);
                if (r.radius >= r.maxRadius) {
                    room.ripples.splice(i, 1);
                    i--;
                }
            }

            // 6. Flying Cars Update
            if (room.theme === 'cyberpunk') {
                if (Math.random() < 0.015 && room.flyingCars.length < 5) {
                    const isLeftToRight = Math.random() > 0.5;
                    const carY = Math.random() * (h * 0.4) + 45;
                    room.flyingCars.push({
                        x: isLeftToRight ? -60 : drawWidth + 60,
                        y: carY,
                        speed: (3 + Math.random() * 4) * (isLeftToRight ? 1 : -1),
                        color: Math.random() > 0.5 ? '#ff007f' : '#00f0ff',
                        length: 30 + Math.random() * 25,
                        thickness: 1.5 + Math.random() * 2
                    });
                }

                for (let i = 0; i < room.flyingCars.length; i++) {
                    let car = room.flyingCars[i];
                    car.x += car.speed;
                    if ((car.speed > 0 && car.x > drawWidth + 100) || (car.speed < 0 && car.x < -100)) {
                        room.flyingCars.splice(i, 1);
                        i--;
                    }
                }
            }

            // 7. Fish Update
            if (room.theme === 'ocean') {
                while (room.fish.length < 10) {
                    room.fish.push({
                        x: Math.random() * drawWidth,
                        y: Math.random() * (h - 330) + 50,
                        vx: (Math.random() - 0.5) * 1.2,
                        vy: (Math.random() - 0.5) * 0.5,
                        targetVx: 0,
                        targetVy: 0,
                        size: 6 + Math.random() * 7,
                        color: `hsla(${170 + Math.random() * 50}, 100%, 70%, 0.65)`,
                        fleeing: false,
                        fleeTimer: 0
                    });
                }

                for (let f of room.fish) {
                    const currentSectorX = idx * drawWidth;
                    const relMouseX = this.mouse.x - currentSectorX;
                    const dx = f.x - relMouseX;
                    const dy = f.y - this.mouse.y;
                    const dist = Math.hypot(dx, dy);
                    
                    if (dist < 100) {
                        f.fleeing = true;
                        f.fleeTimer = 75;
                        const angle = Math.atan2(dy, dx);
                        f.targetVx = Math.cos(angle) * (4.5 + Math.random() * 1.5);
                        f.targetVy = Math.sin(angle) * (2.0 + Math.random() * 1.0);
                    } else if (f.fleeing) {
                        f.fleeTimer--;
                        if (f.fleeTimer <= 0) {
                            f.fleeing = false;
                            f.targetVx = (Math.random() - 0.5) * 1.2;
                            f.targetVy = (Math.random() - 0.5) * 0.5;
                        }
                    } else {
                        if (Math.random() < 0.015) {
                            f.targetVx = (Math.random() - 0.5) * 1.2;
                            f.targetVy = (Math.random() - 0.5) * 0.5;
                        }
                    }

                    f.vx += (f.targetVx - f.vx) * 0.08;
                    f.vy += (f.targetVy - f.vy) * 0.08;
                    f.x += f.vx;
                    f.y += f.vy;

                    if (f.x < 15) { f.x = 15; f.targetVx *= -1; }
                    if (f.x > drawWidth - 15) { f.x = drawWidth - 15; f.targetVx *= -1; }
                    if (f.y < 45) { f.y = 45; f.targetVy *= -1; }
                    if (f.y > h - 280) { f.y = h - 280; f.targetVy *= -1; }
                }
            }

            // 8. Cat awake status
            if (room.theme === 'cabin' && room.cat.state === 'awake') {
                if (room.cat.awakeTimer > 0) {
                    room.cat.awakeTimer -= 0.016;
                    if (room.cat.awakeTimer <= 0) {
                        room.cat.state = 'sleeping';
                    }
                }
            }
        });

        // 9. Lightning global flash
        if (this.theme === 'cabin' && this.intensities.thunder > 0) {
            if (Math.random() < (this.intensities.thunder * 0.004)) {
                this.lightningFlash = 1.0;
            }
            if (this.lightningFlash > 0) {
                this.lightningFlash -= 0.04;
            }
        }
    }

    // --- Drawing Loop ---
    draw() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const time = Date.now() * 0.001;

        this.ctx.clearRect(0, 0, w, h);

        const totalRooms = this.rooms.length;
        const sumWidths = this.rooms.reduce((sum, r) => sum + r.currentWidth, 0);
        if (sumWidths <= 0) return;

        let currentX = 0;
        this.rooms.forEach((room, idx) => {
            const drawWidth = (room.currentWidth / sumWidths) * w;
            if (drawWidth < 1) return;

            if (this.audio && room.roomId !== this.localRoomId) {
                this.audio.updatePeerAudioCoordinates(room.roomId, currentX + drawWidth / 2, drawWidth, w);
            }

            this.ctx.save();
            this.ctx.translate(currentX, 0);

            // Clip drawing to room bounds
            this.ctx.beginPath();
            this.ctx.rect(0, 0, drawWidth, h);
            this.ctx.clip();

            // Background
            this.drawRoomBackground(room, drawWidth, h, time);

            // Particles
            this.drawRoomParticles(room, drawWidth, h, time);

            // Ripples
            this.drawRoomRipples(room);

            // Waves
            this.drawRoomWaves(room, drawWidth, h, time);

            // Post-it Notes on glass layer
            this.drawRoomNotes(room, drawWidth, h, time);

            // Window Frame foreground layout
            this.drawRoomWindowFrame(room, drawWidth, h);

            // Silhouette Assets
            this.drawRoomAssets(room, drawWidth, h, time);

            this.ctx.restore();
            currentX += drawWidth;
        });
    }

    drawRoomBackground(room, w, h, time) {
        if (room.theme === 'cabin') {
            const tod = this.getTimeOfDay();
            let bgGrad = this.ctx.createLinearGradient(0, 0, 0, h);
            for (let stop of tod.stops) {
                bgGrad.addColorStop(stop.offset, stop.color);
            }
            this.ctx.fillStyle = bgGrad;
            this.ctx.fillRect(0, 0, w, h);

            if (tod.drawStars) {
                this.ctx.save();
                for (let star of room.stars) {
                    const starX = star.x * w;
                    const starY = star.y * (h - 240);
                    const opacity = 0.2 + Math.abs(Math.sin(time * star.blinkSpeed)) * 0.8;
                    this.ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
                    this.ctx.beginPath();
                    this.ctx.arc(starX, starY, star.size, 0, Math.PI * 2);
                    this.ctx.fill();
                }
                this.ctx.restore();
            }

            this.ctx.fillStyle = tod.sunMoonColor;
            this.ctx.beginPath();
            this.ctx.arc(w * 0.8, h * 0.3, tod.sunMoonRadius, 0, Math.PI * 2);
            this.ctx.fill();

            let radialGlow = this.ctx.createRadialGradient(
                w * 0.8, h * 0.3, 0,
                w * 0.8, h * 0.3, tod.sunMoonRadius * 2
            );
            if (tod.name === 'Morning Sunrise') {
                radialGlow.addColorStop(0, 'rgba(253, 224, 71, 0.25)');
                radialGlow.addColorStop(1, 'rgba(253, 224, 71, 0)');
            } else if (tod.name === 'Cozy Day') {
                radialGlow.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
                radialGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
            } else if (tod.name === 'Sunset Golden Hour') {
                radialGlow.addColorStop(0, 'rgba(254, 150, 92, 0.35)');
                radialGlow.addColorStop(1, 'rgba(254, 150, 92, 0)');
            } else {
                radialGlow.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
                radialGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
            }
            this.ctx.fillStyle = radialGlow;
            this.ctx.beginPath();
            this.ctx.arc(w * 0.8, h * 0.3, tod.sunMoonRadius * 2, 0, Math.PI * 2);
            this.ctx.fill();

            if (this.lightningFlash > 0) {
                this.ctx.fillStyle = `rgba(220, 235, 255, ${this.lightningFlash * 0.35})`;
                this.ctx.fillRect(0, 0, w, h);
            }
        } else if (room.theme === 'cyberpunk') {
            this.ctx.fillStyle = '#08030e';
            this.ctx.fillRect(0, 0, w, h);

            this.ctx.fillStyle = '#050209';
            this.ctx.fillRect(w * 0.1, h * 0.2, w * 0.15, h * 0.8);
            this.ctx.fillRect(w * 0.35, h * 0.35, w * 0.12, h * 0.65);
            this.ctx.fillRect(w * 0.55, h * 0.15, w * 0.18, h * 0.85);
            this.ctx.fillRect(w * 0.8, h * 0.4, w * 0.14, h * 0.6);

            if (!room.neonLights) {
                room.neonLights = [];
                for (let i = 0; i < 8; i++) {
                    room.neonLights.push({
                        x: Math.random() * w,
                        y: Math.random() * (h * 0.6),
                        size: Math.random() * 40 + 20,
                        color: Math.random() > 0.5 ? 'rgba(255, 0, 127, 0.12)' : 'rgba(0, 240, 255, 0.12)',
                        blinkSpeed: Math.random() * 0.02 + 0.005,
                        blinkOffset: Math.random() * Math.PI
                    });
                }
            }
            for (let light of room.neonLights) {
                const alpha = light.color.replace('0.12', (0.08 + Math.sin(time * 5 + light.blinkOffset) * 0.04).toString());
                let grad = this.ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, light.size);
                grad.addColorStop(0, alpha);
                grad.addColorStop(1, 'rgba(0,0,0,0)');
                this.ctx.fillStyle = grad;
                this.ctx.fillRect(light.x - light.size, light.y - light.size, light.size * 2, light.size * 2);
            }
        } else if (room.theme === 'ocean') {
            let oceanGrad = this.ctx.createLinearGradient(0, 0, 0, h);
            oceanGrad.addColorStop(0, '#010a12');
            oceanGrad.addColorStop(0.5, '#02182c');
            oceanGrad.addColorStop(1, '#000810');
            this.ctx.fillStyle = oceanGrad;
            this.ctx.fillRect(0, 0, w, h);

            this.ctx.fillStyle = 'rgba(0, 240, 255, 0.015)';
            for (let i = 0; i < 2; i++) {
                const angle = 0.2 + Math.sin(time * 0.5 + i) * 0.05;
                const offset = Math.sin(time * 0.2 + i * 2) * (w * 0.2);
                this.ctx.beginPath();
                this.ctx.moveTo(w * 0.2 + offset, -50);
                this.ctx.lineTo(w * 0.2 + offset + 120, -50);
                this.ctx.lineTo(w * 0.2 + offset + 120 + h * Math.tan(angle), h + 50);
                this.ctx.lineTo(w * 0.2 + offset + h * Math.tan(angle), h + 50);
                this.ctx.closePath();
                this.ctx.fill();
            }
        }
    }

    drawRoomParticles(room, w, h, time) {
        if (room.theme === 'cabin' || room.theme === 'cyberpunk') {
            this.ctx.lineWidth = room.theme === 'cyberpunk' ? 2 : 1;
            for (let r of room.particles.raindrops) {
                if (room.theme === 'cyberpunk') {
                    this.ctx.strokeStyle = r.x % 2 === 0 
                        ? `rgba(255, 0, 127, ${r.opacity * room.intensities.rain})`
                        : `rgba(0, 240, 255, ${r.opacity * room.intensities.rain})`;
                } else {
                    this.ctx.strokeStyle = `rgba(160, 195, 230, ${r.opacity * room.intensities.rain})`;
                }
                this.ctx.beginPath();
                this.ctx.moveTo(r.x, r.y);
                this.ctx.lineTo(r.x + r.speedX * 0.5, r.y + r.length);
                this.ctx.stroke();
            }
        }

        if (room.theme === 'ocean') {
            this.ctx.fillStyle = 'rgba(0, 240, 255, 0.15)';
            for (let i = 0; i < 20; i++) {
                const particleX = (Math.sin(time * 0.1 + i) * 0.2 + (i / 20)) * w;
                const particleY = ((time * 15 + i * 23) % (h + 40)) - 20;
                this.ctx.beginPath();
                this.ctx.arc(particleX, particleY, 0.8, 0, Math.PI * 2);
                this.ctx.fill();
            }

            this.ctx.save();
            for (let f of room.fish) {
                this.ctx.fillStyle = f.color;
                this.ctx.shadowColor = f.color;
                this.ctx.shadowBlur = 8;
                
                const angle = Math.atan2(f.vy, f.vx);
                this.ctx.save();
                this.ctx.translate(f.x, f.y);
                this.ctx.rotate(angle);
                
                this.ctx.beginPath();
                this.ctx.ellipse(0, 0, f.size, f.size * 0.5, 0, 0, Math.PI * 2);
                this.ctx.fill();
                
                this.ctx.beginPath();
                this.ctx.moveTo(-f.size, 0);
                this.ctx.lineTo(-f.size - f.size * 0.6, -f.size * 0.4);
                this.ctx.lineTo(-f.size - f.size * 0.6, f.size * 0.4);
                this.ctx.closePath();
                this.ctx.fill();
                
                this.ctx.restore();
            }
            this.ctx.restore();

            this.ctx.strokeStyle = 'rgba(0, 240, 255, 0.25)';
            this.ctx.lineWidth = 1;
            for (let b of room.particles.bubbles) {
                this.ctx.fillStyle = `rgba(0, 240, 255, ${b.opacity * 0.15})`;
                this.ctx.beginPath();
                this.ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.stroke();
            }

            for (let j of room.particles.jellyfish) {
                this.ctx.fillStyle = `hsla(${j.hue}, 90%, 65%, 0.12)`;
                this.ctx.strokeStyle = `hsla(${j.hue}, 90%, 65%, 0.25)`;
                
                this.ctx.beginPath();
                this.ctx.arc(j.x, j.y, j.size, Math.PI, 0);
                this.ctx.quadraticCurveTo(j.x + j.size * 0.8, j.y + 4, j.x, j.y + 3);
                this.ctx.quadraticCurveTo(j.x - j.size * 0.8, j.y + 4, j.x - j.size, j.y);
                this.ctx.fill();
                this.ctx.stroke();

                this.ctx.beginPath();
                for (let t = -2; t <= 2; t++) {
                    const tx = j.x + (t * j.size * 0.3);
                    this.ctx.moveTo(tx, j.y + 2);
                    this.ctx.quadraticCurveTo(
                        tx + Math.sin(time * 3 + t) * 5, 
                        j.y + j.size * 0.8, 
                        tx + Math.sin(time * 3 + t) * 8, 
                        j.y + j.size * 1.8
                    );
                }
                this.ctx.stroke();
            }
        }

        if (room.theme === 'cyberpunk') {
            this.ctx.save();
            for (let car of room.flyingCars) {
                this.ctx.strokeStyle = car.color;
                this.ctx.lineWidth = car.thickness;
                this.ctx.shadowColor = car.color;
                this.ctx.shadowBlur = 8;
                this.ctx.beginPath();
                this.ctx.moveTo(car.x, car.y);
                this.ctx.lineTo(car.x - (car.speed * car.length / Math.abs(car.speed)), car.y);
                this.ctx.stroke();
            }
            this.ctx.restore();
        }

        if (room.theme === 'cabin' && room.intensities.crackle > 0) {
            for (let p of room.particles.embers) {
                this.ctx.fillStyle = `rgba(255, 140, 40, ${p.life / 255})`;
                this.ctx.shadowColor = 'rgba(255, 120, 0, 0.6)';
                this.ctx.shadowBlur = 10;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.shadowBlur = 0;
            }
        }
    }

    drawRoomRipples(room) {
        this.ctx.save();
        for (let r of room.ripples) {
            this.ctx.strokeStyle = `rgba(174, 219, 240, ${r.opacity * 0.45})`;
            this.ctx.lineWidth = 1.5;
            this.ctx.beginPath();
            this.ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
            this.ctx.stroke();
            
            if (r.radius > 10) {
                this.ctx.strokeStyle = `rgba(174, 219, 240, ${r.opacity * 0.22})`;
                this.ctx.beginPath();
                this.ctx.arc(r.x, r.y, r.radius - 8, 0, Math.PI * 2);
                this.ctx.stroke();
            }
        }
        this.ctx.restore();
    }

    drawRoomWaves(room, w, h, time) {
        if (room.theme === 'ocean' || room.intensities.waves <= 0) return;

        const baseY = h - 295;
        const windSpeed = room.intensities.wind;
        for (let j = 0; j < 3; j++) {
            if (room.theme === 'cyberpunk') {
                this.ctx.fillStyle = `rgba(26, 12, 48, ${room.intensities.waves * (0.6 - j * 0.15)})`;
            } else {
                this.ctx.fillStyle = `rgba(10, 24, 42, ${room.intensities.waves * (0.6 - j * 0.15)})`;
            }
            
            this.ctx.beginPath();
            this.ctx.moveTo(0, h);
            
            const speedMod = 1.0 - j * 0.2 + windSpeed * 2.0;
            const ampMod = 18 * room.intensities.waves * (1.0 + windSpeed * 1.2);
            
            for (let x = 0; x <= w + 50; x += 50) {
                let waveMath = Math.sin(x * 0.005 + time * speedMod + j) * ampMod;
                this.ctx.lineTo(x, baseY + waveMath - (j * 15));
            }
            
            this.ctx.lineTo(w, h);
            this.ctx.fill();
        }
    }

    drawRoomNotes(room, w, h, time) {
        const glassStartY = 40;
        const glassHeight = h - 280;

        room.postItNotes.forEach(note => {
            const noteX = note.xPct * w;
            const noteY = glassStartY + note.yPct * glassHeight;

            this.ctx.save();
            this.ctx.translate(noteX, noteY);
            this.ctx.rotate(note.rotation);

            // Rotated glassmorphic paper vector note
            this.ctx.fillStyle = note.color || 'rgba(254, 240, 138, 0.9)';
            
            this.ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
            this.ctx.shadowBlur = 8;
            this.ctx.shadowOffsetY = 4;
            
            this.ctx.fillRect(-50, -50, 100, 100);
            this.ctx.shadowBlur = 0;
            this.ctx.shadowOffsetY = 0;

            // Translucent pin strip at top
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
            this.ctx.fillRect(-22, -54, 44, 8);

            // Render Text Inside
            this.ctx.fillStyle = '#1e293b';
            this.ctx.font = '10px "Fira Code", monospace';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';

            const lines = this.wrapText(note.text, 85);
            lines.slice(0, 6).forEach((line, index) => {
                this.ctx.fillText(line, 0, -25 + index * 12 + (6 - Math.min(6, lines.length)) * 5);
            });

            // Render Tag Pill if present
            if (note.tag) {
                const tagText = String(note.tag).toUpperCase();
                this.ctx.font = 'bold 7px "Fira Code", monospace';
                
                const textWidth = this.ctx.measureText(tagText).width;
                const pillWidth = Math.max(34, textWidth + 8);
                const pillHeight = 12;
                const pillX = -pillWidth / 2;
                const pillY = 32;

                const TAG_COLORS = {
                    yellow: '#eab308',
                    blue: '#3b82f6',
                    red: '#ef4444',
                    orange: '#f97316',
                    purple: '#a855f7',
                    green: '#10b981',
                    pink: '#ec4899'
                };
                const solidColor = TAG_COLORS[note.colorName] || TAG_COLORS.yellow;

                this.ctx.fillStyle = solidColor;
                this.drawRoundedRect(this.ctx, pillX, pillY, pillWidth, pillHeight, 3);
                this.ctx.fill();

                this.ctx.fillStyle = '#ffffff';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText(tagText, 0, pillY + pillHeight / 2);
            }

            // Hover indicator
            if (this.hoveredNote === note) {
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                this.ctx.lineWidth = 1.5;
                this.ctx.strokeRect(-50, -50, 100, 100);

                // Small delete × button
                this.ctx.fillStyle = this.hoveredCloseBtn ? 'rgba(239, 68, 68, 0.95)' : 'rgba(15, 23, 42, 0.65)';
                this.ctx.beginPath();
                this.ctx.arc(42, -42, 8, 0, Math.PI * 2);
                this.ctx.fill();

                this.ctx.fillStyle = '#ffffff';
                this.ctx.font = 'bold 8px sans-serif';
                this.ctx.fillText('×', 42, -42);
            }

            this.ctx.restore();
        });
    }

    drawRoundedRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    wrapText(text, maxWidth) {
        const words = text.split(/\s+/);
        const lines = [];
        let currentLine = words[0] || '';

        for (let i = 1; i < words.length; i++) {
            const word = words[i];
            const width = this.ctx.measureText(currentLine + " " + word).width;
            if (width < maxWidth) {
                currentLine += " " + word;
            } else {
                lines.push(currentLine);
                currentLine = word;
            }
        }
        if (currentLine) {
            lines.push(currentLine);
        }
        return lines;
    }

    drawRoomWindowFrame(room, w, h) {
        this.ctx.fillStyle = room.theme === 'cyberpunk' ? '#030106' : (room.theme === 'ocean' ? '#00050c' : '#040508');
        
        // Frame borders
        this.ctx.fillRect(0, 0, w, 40); // Top
        this.ctx.fillRect(0, 0, 8, h); // Left border
        this.ctx.fillRect(w - 8, 0, 8, h); // Right border
        this.ctx.fillRect(0, h - 240, w, 240); // Bottom shelf / sill

        // Cross-mullions (pane dividers)
        const frameWidth = 10;
        this.ctx.fillRect((w / 2) - (frameWidth / 2), 0, frameWidth, h - 240);
        this.ctx.fillRect(0, (h / 2) - (frameWidth / 2), w, frameWidth);
        
        // Render name tag centered at the top
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        this.ctx.font = '10px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(room.ownerName.toUpperCase() + (room.roomId === this.localRoomId ? ' (YOU)' : ''), w / 2, 25);
    }

    drawRoomAssets(room, w, h, time) {
        // Draw plant pot & plant
        this.drawRoomPlant(room, w, h, time);

        // Cozy Cabin Cat
        if (room.theme === 'cabin') {
            const potX = w * 0.55;
            const catX = potX - 52;
            const catY = h - 240;
            
            const breath = 1.0 + Math.sin(time * 2.0) * 0.05;
            
            this.ctx.save();
            this.ctx.translate(catX, catY);
            
            this.ctx.fillStyle = '#df7334';
            this.ctx.strokeStyle = '#8d3d12';
            this.ctx.lineWidth = 1.5;
            
            let tailAngle = Math.sin(time * 2) * 0.1;
            if (room.cat.state === 'awake') {
                tailAngle = Math.sin(time * 10) * 0.35;
            }
            this.ctx.save();
            this.ctx.translate(-15, 6);
            this.ctx.rotate(tailAngle);
            this.ctx.beginPath();
            this.ctx.arc(-10, -5, 12, 0, Math.PI, false);
            this.ctx.stroke();
            this.ctx.restore();
            
            this.ctx.beginPath();
            this.ctx.ellipse(0, 0, 20, 14 * breath, 0, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();
            
            const headX = 14;
            const headY = -6;
            this.ctx.beginPath();
            this.ctx.arc(headX, headY, 9, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();
            
            const earTwitchL = (room.cat.state === 'awake') ? Math.sin(time * 35) * 2.5 : 0;
            const earTwitchR = (room.cat.state === 'awake') ? Math.cos(time * 35) * 2.5 : 0;
            
            this.ctx.beginPath();
            this.ctx.moveTo(headX - 6, headY - 6);
            this.ctx.lineTo(headX - 5 + earTwitchL, headY - 15);
            this.ctx.lineTo(headX - 1, headY - 8);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
            
            this.ctx.beginPath();
            this.ctx.moveTo(headX + 1, headY - 8);
            this.ctx.lineTo(headX + 3 + earTwitchR, headY - 16);
            this.ctx.lineTo(headX + 7, headY - 5);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
            
            this.ctx.strokeStyle = '#5a2304';
            if (room.cat.state === 'sleeping') {
                this.ctx.lineWidth = 1.2;
                this.ctx.beginPath();
                this.ctx.arc(headX + 3, headY, 2, 0, Math.PI, false);
                this.ctx.stroke();
            } else {
                this.ctx.fillStyle = '#ffeb3b';
                this.ctx.beginPath();
                this.ctx.arc(headX + 3, headY - 1, 2, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.stroke();
                
                this.ctx.fillStyle = '#000';
                this.ctx.fillRect(headX + 2.5, headY - 2, 1, 2);
            }
            this.ctx.restore();
        }

        // Cyberpunk Coffee
        if (room.theme === 'cyberpunk') {
            const cupX = w * 0.35;
            const cupY = h - 240;

            this.ctx.fillStyle = '#060309';
            this.ctx.fillRect(cupX - 10, cupY - 18, 20, 18);
            
            this.ctx.strokeStyle = '#060309';
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.arc(cupX + 10, cupY - 9, 7, -Math.PI/2, Math.PI/2);
            this.ctx.stroke();

            this.ctx.fillStyle = 'rgba(255, 0, 127, 0.25)';
            for (let p of room.particles.steam) {
                this.ctx.fillStyle = `rgba(240, 150, 255, ${p.life * 0.3})`;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }
    }

    drawRoomPlant(room, w, h, time) {
        const potX = w * 0.55;
        const potY = h - 240;
        const potWidth = 30;
        const potHeight = 24;

        this.ctx.save();
        
        this.ctx.fillStyle = room.theme === 'cyberpunk' ? '#0f0518' : (room.theme === 'ocean' ? '#021224' : '#14100c');
        this.ctx.strokeStyle = room.theme === 'cyberpunk' ? '#ff007f' : (room.theme === 'ocean' ? '#00f0ff' : '#f5c060');
        this.ctx.lineWidth = 1.5;

        this.ctx.beginPath();
        this.ctx.moveTo(potX - potWidth / 2, potY);
        this.ctx.lineTo(potX + potWidth / 2, potY);
        this.ctx.lineTo(potX + potWidth * 0.35, potY + potHeight);
        this.ctx.lineTo(potX - potWidth * 0.35, potY + potHeight);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();

        const growth = room.plant.growth; 
        const maxLen = 16 + 28 * growth;
        const windSpeed = room.intensities.wind;

        const baseAngle = -Math.PI / 2 - (windSpeed * 0.16) + Math.sin(time * (0.8 + windSpeed * 2.5)) * (0.03 + windSpeed * 0.08);

        const drawBranch = (x, y, len, angle, depth) => {
            if (depth <= 0) return;

            const targetX = x + Math.cos(angle) * len;
            const targetY = y + Math.sin(angle) * len;

            this.ctx.strokeStyle = room.theme === 'cyberpunk' ? '#2d0f3a' : (room.theme === 'ocean' ? '#08324a' : '#28201a');
            this.ctx.lineWidth = Math.max(1.2, depth * (0.4 + 1.2 * growth));
            this.ctx.beginPath();
            this.ctx.moveTo(x, y);
            this.ctx.lineTo(targetX, targetY);
            this.ctx.stroke();

            if (depth < 4) {
                this.ctx.save();
                this.ctx.translate(targetX, targetY);
                this.ctx.rotate(angle + Math.sin(time * 2 + depth) * 0.1);

                if (room.theme === 'cyberpunk') {
                    this.ctx.fillStyle = 'rgba(255, 0, 127, 0.75)';
                    this.ctx.shadowColor = '#ff007f';
                    this.ctx.shadowBlur = 6;
                } else if (room.theme === 'ocean') {
                    this.ctx.fillStyle = 'rgba(0, 240, 255, 0.75)';
                    this.ctx.shadowColor = '#00f0ff';
                    this.ctx.shadowBlur = 6;
                } else {
                    this.ctx.fillStyle = 'rgba(92, 140, 78, 0.8)';
                }

                this.ctx.beginPath();
                this.ctx.ellipse(2 + 3 * growth, 0, 4 + 6 * growth, 2 + 3 * growth, 0, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.restore();
            }

            const nextLen = len * 0.72;
            const leftAngle = angle - 0.35 - (windSpeed * 0.06) - Math.sin(time * (0.5 + windSpeed * 1.5)) * (0.02 + windSpeed * 0.03);
            const rightAngle = angle + 0.35 - (windSpeed * 0.06) + Math.sin(time * (0.5 + windSpeed * 1.5)) * (0.02 + windSpeed * 0.03);

            drawBranch(targetX, targetY, nextLen, leftAngle, depth - 1);
            drawBranch(targetX, targetY, nextLen, rightAngle, depth - 1);
        };

        const depthLevels = Math.min(5, Math.ceil(3 + growth * 2)); 
        drawBranch(potX, potY, maxLen, baseAngle, depthLevels);

        this.ctx.restore();
    }
}
