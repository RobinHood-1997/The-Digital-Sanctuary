// ---- Digital Sanctuary Audio Engine ----

export class AudioEngine {
    constructor() {
        this.initialized = false;
        this.keyboardClicksEnabled = true;
        this.keyboardProfile = 'thock'; // 'thock', 'blue', 'typewriter', 'bubble'
        this.musicSource = 'synth'; // 'synth' or 'radio'
        this.currentTheme = 'cabin';
        this.tapeIntensity = 0.0;
        this.currentMusicTargetVolume = -60;

        // Sound Nodes
        this.nodes = {};
        this.peerChannels = {};
        this.onCrackleTriggered = null;
        
        // Loops & Timers
        this.fireplaceInterval = null;
        this.generativeInterval = null;
        this.vinylInterval = null;
        
        // Lofi Drum Loop State
        this.drumInterval = null;
        this.drumStep = 0;

        // Radio Audio Element
        this.radioAudio = null;

        // Theme-specific background timeouts
        this.clinkTimeout = null;
        this.sonarTimeout = null;
        this.whaleTimeout = null;
    }

    async init() {
        if (this.initialized) return;

        // Start Tone.js Audio Context
        await Tone.start();
        console.log("Tone.js audio context started.");

        // Define Master Effects for Lofi warmth
        // Global Reverb (wet space)
        const globalReverb = new Tone.Reverb({
            decay: 3.0,
            wet: 0.45
        }).toDestination();
        await globalReverb.ready;

        // Delay for spacey echoes
        const globalDelay = new Tone.FeedbackDelay({
            delayTime: "4n.",
            feedback: 0.5,
            wet: 0.25
        }).connect(globalReverb);

        // 1. Rain Synthesizer (Lofi-esque: warm, high-cut, muffled)
        const rainNoise = new Tone.Noise("brown").start();
        const rainBandpass = new Tone.Filter({ type: "bandpass", frequency: 650, Q: 0.6 });
        const rainLowpass = new Tone.Filter({ type: "lowpass", frequency: 1200 }); // cut harsh highs
        const rainFlutter = new Tone.Tremolo({ frequency: 8, depth: 0.4 }).start(); // slower flutter
        const rainVolume = new Tone.Volume(-60).toDestination();
        rainNoise.chain(rainBandpass, rainLowpass, rainFlutter, rainVolume);
        this.nodes['rain'] = rainVolume;

        // 2. Thunder Synthesizer (Deep warm rumble, cut out high-frequency noise entirely)
        const thunderNoise = new Tone.Noise("brown").start();
        const thunderFilter = new Tone.Filter(80, "lowpass"); // lower cutoff for deep rumble
        const thunderVolume = new Tone.Volume(-60).toDestination();
        thunderNoise.chain(thunderFilter, thunderVolume);
        this.nodes['thunder'] = thunderVolume;

        // 3. Ocean Waves Synthesizer (Warmer, slower rolling sweep)
        const waveNoise = new Tone.Noise("pink").start();
        const waveAutoFilter = new Tone.AutoFilter({
            frequency: "0.08hz",
            baseFrequency: 75,
            octaves: 3,
            type: "sine"
        }).start();
        const waveLowpass = new Tone.Filter(900, "lowpass"); // warmer
        const waveVolume = new Tone.Volume(-60).toDestination();
        waveNoise.chain(waveAutoFilter, waveLowpass, waveVolume);
        this.nodes['waves'] = waveVolume;

        // --- Theme Ambience Master Volume Nodes ---
        // Continuous theme sounds (hiss, hums, sweeps)
        const fireHissVol = new Tone.Volume(-60).toDestination();
        this.nodes['crackle_hiss'] = fireHissVol;

        // Transient theme sounds (snaps, sonar pings, cup clinks)
        const fireSnapVol = new Tone.Volume(-60).connect(globalReverb);
        this.nodes['crackle_snaps'] = fireSnapVol;

        // Theme crossfade gains
        this.cabinHissGain = new Tone.Gain(1.0).connect(fireHissVol);
        this.cabinSnapGain = new Tone.Gain(1.0).connect(fireSnapVol);

        this.cyberpunkHissGain = new Tone.Gain(0.0).connect(fireHissVol);
        this.cyberpunkSnapGain = new Tone.Gain(0.0).connect(fireSnapVol);

        this.oceanHissGain = new Tone.Gain(0.0).connect(fireHissVol);
        this.oceanSnapGain = new Tone.Gain(0.0).connect(fireSnapVol);

        // A. Cozy Cabin Sources
        // Fireplace crackle hiss
        const fireHissNoise = new Tone.Noise("pink").start();
        const fireHissFilter = new Tone.Filter(350, "lowpass");
        fireHissNoise.chain(fireHissFilter, this.cabinHissGain);

        // Fireplace snaps
        const fireSnapSynth = new Tone.NoiseSynth({
            noise: { type: "white" },
            envelope: { attack: 0.001, decay: 0.012, sustain: 0 }
        });
        const fireSnapFilter = new Tone.Filter(2800, "bandpass"); // warmer crackles
        fireSnapSynth.chain(fireSnapFilter, this.cabinSnapGain);

        // B. Cyberpunk Cafe Sources
        // Neon hum (60Hz wave + harmonics lowpass filtered)
        this.neonHumOsc = new Tone.Oscillator(60, "sawtooth").start();
        const neonFilter = new Tone.Filter(110, "lowpass");
        const neonVolume = new Tone.Volume(-14);
        this.neonHumOsc.chain(neonFilter, neonVolume, this.cyberpunkHissGain);

        // Cafe chatter (pink noise with slow LFO volume modulation)
        const cafeChatterNoise = new Tone.Noise("pink").start();
        const chatterFilter = new Tone.Filter({ type: "bandpass", frequency: 450, Q: 0.5 });
        const chatterLFO = new Tone.LFO({ frequency: 0.04, min: -22, max: -8 }).start();
        const chatterVolume = new Tone.Volume(-15);
        chatterLFO.connect(chatterVolume.volume);
        cafeChatterNoise.chain(chatterFilter, chatterVolume, this.cyberpunkHissGain);

        // Cafe cup clinks
        this.clinkSynth = new Tone.Synth({
            oscillator: { type: "sine" },
            envelope: { attack: 0.001, decay: 0.05, sustain: 0 }
        }).connect(this.cyberpunkSnapGain);

        // C. Ocean Depths Sources
        // Deep water pressure rumble
        const oceanRumble = new Tone.Noise("brown").start();
        const rumbleFilter = new Tone.Filter(55, "lowpass");
        const rumbleVolume = new Tone.Volume(-4);
        oceanRumble.chain(rumbleFilter, rumbleVolume, this.oceanHissGain);

        // Sonar Ping (sine wave with long decay)
        this.sonarSynth = new Tone.Synth({
            oscillator: { type: "sine" },
            envelope: { attack: 0.005, decay: 2.0, sustain: 0 }
        }).connect(this.oceanSnapGain);

        // Whale Songs (sine wave with vibrato)
        this.whaleSynth = new Tone.Synth({
            oscillator: { type: "sine" },
            envelope: { attack: 1.5, decay: 2.0, sustain: 0.4, release: 2.0 }
        });
        const whaleVibrato = new Tone.Vibrato({ frequency: 5.2, depth: 0.35 }).connect(this.oceanHissGain);
        this.whaleSynth.connect(whaleVibrato);


        // 4. Wind Synthesizer (Pink Noise swept by slow LFO)
        const windNoise = new Tone.Noise("pink").start();
        const windFilter = new Tone.Filter({ type: "bandpass", frequency: 400, Q: 0.5 });
        const windLFO = new Tone.LFO({ frequency: 0.05, min: 250, max: 750, type: "sine" }).start();
        windLFO.connect(windFilter.frequency);
        const windVolume = new Tone.Volume(-60).connect(globalReverb);
        windNoise.chain(windFilter, windVolume);
        this.nodes['wind'] = windVolume;


        // 5. Vinyl Crackle Generator (Continuous Dust Hiss & pops)
        const vinylNoise = new Tone.Noise("pink").start();
        const vinylFilter = new Tone.Filter(900, "bandpass");
        const vinylVol = new Tone.Volume(-60).toDestination();
        vinylNoise.chain(vinylFilter, vinylVol);
        this.nodes['vinyl'] = vinylVol;

        // Vinyl dust pop synth
        const vinylPopSynth = new Tone.NoiseSynth({
            noise: { type: "white" },
            envelope: { attack: 0.001, decay: 0.005, sustain: 0 }
        });
        const vinylPopFilter = new Tone.Filter(4000, "bandpass");
        vinylPopSynth.chain(vinylPopFilter, vinylVol);


        // 6. Live Streaming Lofi Radio Node
        this.radioAudio = new Audio('https://boxradio-edge-00.streamafrica.net/lofi');
        this.radioAudio.volume = 0; // start muted


        // 7. Tape Saturation wow & flutter + master lowpass filter
        this.vibrato = new Tone.Vibrato({
            frequency: 4.5,
            depth: 0.0 // start with 0 wow/flutter
        }).connect(globalDelay);

        this.tapeFilter = new Tone.Filter({
            type: "lowpass",
            frequency: 20000 // start completely open
        }).connect(this.vibrato);

        // Tape Hiss noise
        const tapeHissNoise = new Tone.Noise("pink").start();
        const tapeHissFilter = new Tone.Filter(250, "lowpass");
        const tapeHissVolume = new Tone.Volume(-60).connect(globalReverb);
        tapeHissNoise.chain(tapeHissFilter, tapeHissVolume);
        this.nodes['tape'] = tapeHissVolume;

        // Route generative volume node through tape filter & vibrato
        const generativeVolume = new Tone.Volume(-60).connect(this.tapeFilter);
        this.nodes['music_synth'] = generativeVolume;

        const generativeSynth = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: "triangle" },
            envelope: {
                attack: 2.0,
                decay: 1.5,
                sustain: 0.8,
                release: 3.5
            }
        });
        const synthFilter = new Tone.Filter({
            type: "bandpass",
            frequency: 850,
            Q: 0.7
        }).connect(generativeVolume);

        generativeSynth.connect(synthFilter);


        // 8. Mechanical Keyboard Click Synths
        // Shares the same core nodes for resource efficiency
        const clickNoise = new Tone.NoiseSynth({
            noise: { type: "white" },
            envelope: { attack: 0.001, decay: 0.008, sustain: 0 }
        });
        this.clickNoiseFilter = new Tone.Filter({ type: "bandpass", frequency: 3200, Q: 10 });
        
        const clickThump = new Tone.Synth({
            oscillator: { type: "sine" },
            envelope: { attack: 0.002, decay: 0.035, sustain: 0 }
        });

        // Separate bell synth for typewriter Carriage Return bell (Enter key)
        this.bellSynth = new Tone.Synth({
            oscillator: { type: "sine" },
            envelope: { attack: 0.002, decay: 0.6, sustain: 0 }
        }).connect(globalReverb);

        // Separate bubble pop synth
        this.bubbleSynth = new Tone.Synth({
            oscillator: { type: "sine" },
            envelope: { attack: 0.001, decay: 0.04, sustain: 0 }
        });

        const clickVolume = new Tone.Volume(this.keyboardClicksEnabled ? 4 : -60).toDestination();
        clickNoise.chain(this.clickNoiseFilter, clickVolume);
        clickThump.connect(clickVolume);
        this.bubbleSynth.connect(clickVolume);
        
        this.nodes['keyboard'] = clickVolume;
        this.clickNoise = clickNoise;
        this.clickThump = clickThump;

        // Cat Purr sound nodes
        this.purrOsc = new Tone.Oscillator(55, "triangle");
        this.purrTremolo = new Tone.Tremolo(25, 0.75).toDestination().start();
        this.purrGain = new Tone.Gain(0.0).connect(this.purrTremolo);
        this.purrOsc.connect(this.purrGain);
        this.purrOsc.start();

        // Set initial crackle dust volume
        this.nodes['vinyl'].volume.value = -30;

        // Mark as initialized
        this.initialized = true;

        // Set initial theme gains
        this.setTheme(this.currentTheme);

        // Start scheduled loop functions
        this.startFireplaceScheduling(fireSnapSynth);
        this.startVinylScheduling(vinylPopSynth);
        this.startGenerativeMelody(generativeSynth);
        this.startLofiDrumBeats();
        
        // Start theme background schedulers
        this.startCyberpunkScheduling();
        this.startOceanScheduling();
    }

    setTheme(theme) {
        this.currentTheme = theme;
        if (!this.initialized) return;

        const rampTime = 0.5; // Smooth 0.5s transition crossfade
        if (theme === 'cabin') {
            if (this.cabinHissGain) this.cabinHissGain.gain.rampTo(1.0, rampTime);
            if (this.cabinSnapGain) this.cabinSnapGain.gain.rampTo(1.0, rampTime);
            if (this.cyberpunkHissGain) this.cyberpunkHissGain.gain.rampTo(0.0, rampTime);
            if (this.cyberpunkSnapGain) this.cyberpunkSnapGain.gain.rampTo(0.0, rampTime);
            if (this.oceanHissGain) this.oceanHissGain.gain.rampTo(0.0, rampTime);
            if (this.oceanSnapGain) this.oceanSnapGain.gain.rampTo(0.0, rampTime);
        } else if (theme === 'cyberpunk') {
            if (this.cabinHissGain) this.cabinHissGain.gain.rampTo(0.0, rampTime);
            if (this.cabinSnapGain) this.cabinSnapGain.gain.rampTo(0.0, rampTime);
            if (this.cyberpunkHissGain) this.cyberpunkHissGain.gain.rampTo(1.0, rampTime);
            if (this.cyberpunkSnapGain) this.cyberpunkSnapGain.gain.rampTo(1.0, rampTime);
            if (this.oceanHissGain) this.oceanHissGain.gain.rampTo(0.0, rampTime);
            if (this.oceanSnapGain) this.oceanSnapGain.gain.rampTo(0.0, rampTime);
        } else if (theme === 'ocean') {
            if (this.cabinHissGain) this.cabinHissGain.gain.rampTo(0.0, rampTime);
            if (this.cabinSnapGain) this.cabinSnapGain.gain.rampTo(0.0, rampTime);
            if (this.cyberpunkHissGain) this.cyberpunkHissGain.gain.rampTo(0.0, rampTime);
            if (this.cyberpunkSnapGain) this.cyberpunkSnapGain.gain.rampTo(0.0, rampTime);
            if (this.oceanHissGain) this.oceanHissGain.gain.rampTo(1.0, rampTime);
            if (this.oceanSnapGain) this.oceanSnapGain.gain.rampTo(1.0, rampTime);
        }
    }

    setKeyboardProfile(profile) {
        this.keyboardProfile = profile;
    }

    setVolume(id, val) {
        if (!this.initialized) return;

        if (id === 'crackle') {
            if (this.nodes['crackle_hiss']) this.nodes['crackle_hiss'].volume.rampTo(val, 0.1);
            if (this.nodes['crackle_snaps']) this.nodes['crackle_snaps'].volume.rampTo(val, 0.1);
        } else if (id === 'music') {
            if (this.musicSource === 'synth') {
                if (this.nodes['music_synth']) this.nodes['music_synth'].volume.rampTo(val, 0.1);
                if (this.radioAudio) this.radioAudio.volume = 0;
            } else {
                if (this.radioAudio) this.radioAudio.volume = Tone.dbToGain(val);
                if (this.nodes['music_synth']) this.nodes['music_synth'].volume.value = -60;
            }
            this.currentMusicTargetVolume = val; // cache target volume
        } else if (id === 'tape') {
            if (this.nodes['tape']) this.nodes['tape'].volume.rampTo(val, 0.1);
            
            const intensity = val <= -59 ? 0 : (val + 60) / 60;
            this.tapeIntensity = intensity;
            
            // Saturation warble (vibrato) depth
            if (this.vibrato) {
                this.vibrato.depth.value = intensity * 0.7; // depth goes up to 0.7
            }
            // Master lowpass filter cutoff frequency
            if (this.tapeFilter) {
                const targetFreq = intensity === 0 ? 20000 : 20000 * Math.pow(800 / 20000, intensity);
                this.tapeFilter.frequency.setValueAtTime(targetFreq, Tone.now());
            }
        } else if (this.nodes[id]) {
            this.nodes[id].volume.rampTo(val, 0.1);
        }
    }

    setMusicSource(sourceType) {
        this.musicSource = sourceType;
        if (!this.initialized) return;

        const currentVol = this.currentMusicTargetVolume !== undefined ? this.currentMusicTargetVolume : -60;

        if (sourceType === 'synth') {
            if (this.radioAudio) this.radioAudio.pause();
            if (this.nodes['music_synth']) this.nodes['music_synth'].volume.rampTo(currentVol, 0.1);
        } else {
            if (this.radioAudio) {
                this.radioAudio.volume = Tone.dbToGain(currentVol);
                this.radioAudio.play().catch(e => {
                    console.warn("Radio autoplay blocked. Needs user click.", e);
                });
            }
            if (this.nodes['music_synth']) this.nodes['music_synth'].volume.value = -60;
        }
    }

    toggleKeyboardClicks(enabled) {
        this.keyboardClicksEnabled = enabled;
        if (!this.initialized) return;
        
        if (this.nodes['keyboard']) {
            this.nodes['keyboard'].volume.rampTo(enabled ? 4 : -60, 0.1);
        }
    }

    triggerKeyboardClick(isEnterKey = false) {
        if (!this.initialized || !this.keyboardClicksEnabled) return;

        try {
            if (this.keyboardProfile === 'bubble') {
                // Bubble pop: rapid upward sine sweep
                const now = Tone.now();
                this.bubbleSynth.volume.value = -2 - Math.random() * 4;
                this.bubbleSynth.triggerAttackRelease(450, "32n", now);
                this.bubbleSynth.frequency.setValueAtTime(450, now);
                this.bubbleSynth.frequency.exponentialRampToValueAtTime(1250, now + 0.04);
            } else {
                let noiseDecay = 0.008;
                let noiseFreq = 3200;
                let noiseQ = 10;
                let thumpFreq = 95 + Math.random() * 30;
                let thumpDecay = 0.035;
                
                if (this.keyboardProfile === 'thock') {
                    // Deep, wooden, short click
                    noiseDecay = 0.012;
                    noiseFreq = 1000;
                    noiseQ = 7;
                    thumpFreq = 105 + Math.random() * 20;
                    thumpDecay = 0.045;
                } else if (this.keyboardProfile === 'blue') {
                    // Sharp, high clicky click
                    noiseDecay = 0.003;
                    noiseFreq = 6500;
                    noiseQ = 16;
                    thumpFreq = 1600 + Math.random() * 200;
                    thumpDecay = 0.008;
                } else if (this.keyboardProfile === 'typewriter') {
                    // Retro typewriter click
                    noiseDecay = 0.015;
                    noiseFreq = 2200;
                    noiseQ = 5;
                    thumpFreq = 220 + Math.random() * 40;
                    thumpDecay = 0.03;
                    
                    // Carriage return metal bell on Enter
                    if (isEnterKey) {
                        this.bellSynth.volume.value = -12;
                        this.bellSynth.triggerAttackRelease("E6", "4n", undefined, 0.45);
                    }
                }

                // Reconfigure dynamic click nodes
                this.clickNoise.noise.type = "white";
                this.clickNoise.envelope.decay = noiseDecay;
                this.clickNoiseFilter.frequency.value = noiseFreq;
                this.clickNoiseFilter.Q.value = noiseQ;
                
                this.clickThump.envelope.decay = thumpDecay;
                
                const snapVolume = -5 - Math.random() * 5;
                const thumpVolume = -6 - Math.random() * 4;

                this.clickNoise.triggerAttackRelease("32n", undefined, Tone.dbToGain(snapVolume));
                this.clickThump.triggerAttackRelease(thumpFreq, "32n", undefined, Tone.dbToGain(thumpVolume));
            }
        } catch (e) {
            console.error("Keyboard synth trigger error", e);
        }
    }

    triggerCatSound() {
        if (!this.initialized) return;
        try {
            const now = Tone.now();
            this.purrGain.gain.setValueAtTime(0.0, now);
            this.purrGain.gain.linearRampToValueAtTime(0.25, now + 0.15);
            this.purrGain.gain.setValueAtTime(0.25, now + 2.0);
            this.purrGain.gain.exponentialRampToValueAtTime(0.0, now + 2.5);

            // Meow pitch sweep synth voice (triangle + envelope)
            const meowSynth = new Tone.Synth({
                oscillator: { type: "triangle" },
                envelope: { attack: 0.1, decay: 0.15, sustain: 0.5, release: 0.2 }
            }).toDestination();
            meowSynth.volume.value = -16;

            meowSynth.triggerAttack("E4", now + 0.1);
            meowSynth.frequency.setValueAtTime(329.63, now + 0.1);
            meowSynth.frequency.exponentialRampToValueAtTime(440.0, now + 0.25);
            meowSynth.frequency.exponentialRampToValueAtTime(349.23, now + 0.5);
            meowSynth.triggerRelease(now + 0.55);
            
            // Clean up node after play
            setTimeout(() => meowSynth.dispose(), 1000);
        } catch (e) {
            console.error("Cat sound play error", e);
        }
    }

    triggerCoffeeSound() {
        if (!this.initialized) return;
        try {
            const now = Tone.now();
            // Mug clink: high frequency sine ping
            const clink = new Tone.Synth({
                oscillator: { type: "sine" },
                envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.12 }
            }).toDestination();
            clink.volume.value = -12;
            clink.triggerAttackRelease("G6", "16n", now);

            // Steam sip: white noise burst with slow attack/decay
            const steam = new Tone.NoiseSynth({
                noise: { type: "pink" },
                envelope: { attack: 0.15, decay: 0.35, sustain: 0 }
            }).toDestination();
            steam.volume.value = -18;
            steam.triggerAttackRelease("8n", now + 0.1);
            
            // Clean up nodes after play
            setTimeout(() => {
                clink.dispose();
                steam.dispose();
            }, 1000);
        } catch (e) {
            console.error("Coffee sound play error", e);
        }
    }

    triggerPlantSound() {
        if (!this.initialized) return;
        try {
            const now = Tone.now();
            const notes = ["C6", "D6", "E6", "G6", "A6", "C7"];
            const chimeSynth = new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: "sine" },
                envelope: { attack: 0.005, decay: 0.6, sustain: 0, release: 0.6 }
            }).toDestination();
            chimeSynth.volume.value = -20;

            for (let i = 0; i < 4; i++) {
                const note = notes[Math.floor(Math.random() * notes.length)];
                const delay = i * (0.08 + Math.random() * 0.12);
                chimeSynth.triggerAttackRelease(note, "4n", now + delay);
            }
            
            // Clean up node after play
            setTimeout(() => chimeSynth.dispose(), 3000);
        } catch (e) {
            console.error("Plant sound play error", e);
        }
    }

    startFireplaceScheduling(snapSynth) {
        const scheduleSnap = () => {
            if (!this.initialized) return;
            
            const nextSnapDelay = 150 + Math.random() * 1800;
            const clickGain = 0.15 + Math.random() * 0.85;

            if (this.nodes['crackle_snaps'] && this.nodes['crackle_snaps'].volume.value > -59 && this.currentTheme === 'cabin') {
                try {
                    snapSynth.triggerAttackRelease("32n", undefined, clickGain);
                    if (this.onCrackleTriggered) {
                        this.onCrackleTriggered('cabin', 'snap');
                    }
                } catch(e) {}
            }

            this.fireplaceInterval = setTimeout(scheduleSnap, nextSnapDelay);
        };
        scheduleSnap();
    }

    startVinylScheduling(popSynth) {
        const schedulePop = () => {
            if (!this.initialized) return;

            // Pops delay is scaled by tape slider intensity (degradation)
            // When tape is high, pop intervals are short (frequent)
            const minDelay = 120 + (1 - this.tapeIntensity) * 400;
            const maxDelay = 600 + (1 - this.tapeIntensity) * 4400;
            const nextPopDelay = minDelay + Math.random() * (maxDelay - minDelay);
            const popGain = 0.05 + Math.random() * 0.25;

            // Trigger pop if music or crackle is unmuted
            const isVinylActive = (this.nodes['music_synth'] && this.nodes['music_synth'].volume.value > -59) ||
                                 (this.radioAudio && this.radioAudio.volume > 0.01) ||
                                 (this.nodes['crackle_hiss'] && this.nodes['crackle_hiss'].volume.value > -59);
                                 
            if (isVinylActive) {
                try {
                    popSynth.triggerAttackRelease("32n", undefined, popGain);
                } catch(e) {}
            }

            this.vinylInterval = setTimeout(schedulePop, nextPopDelay);
        };
        schedulePop();
    }

    startCyberpunkScheduling() {
        const scheduleClink = () => {
            if (!this.initialized) return;
            
            // Random cafe glass clinks every 4 to 15 seconds
            const nextClink = 4000 + Math.random() * 11000;
            if (this.currentTheme === 'cyberpunk' && this.nodes['crackle_snaps'] && this.nodes['crackle_snaps'].volume.value > -59) {
                try {
                    const clinkFreq = 1600 + Math.random() * 2400;
                    const clinkVol = 0.01 + Math.random() * 0.08;
                    this.clinkSynth.triggerAttackRelease(clinkFreq, "32n", undefined, clinkVol);
                    if (this.onCrackleTriggered) {
                        this.onCrackleTriggered('cyberpunk', 'clink');
                    }
                } catch (e) {}
            }
            this.clinkTimeout = setTimeout(scheduleClink, nextClink);
        };
        scheduleClink();
    }

    startOceanScheduling() {
        const scheduleSonar = () => {
            if (!this.initialized) return;
            
            // Sonar ping every 10 to 22 seconds
            const nextSonar = 10000 + Math.random() * 12000;
            if (this.currentTheme === 'ocean' && this.nodes['crackle_snaps'] && this.nodes['crackle_snaps'].volume.value > -59) {
                try {
                    this.sonarSynth.triggerAttackRelease("C6", "8n", undefined, 0.12);
                    if (this.onCrackleTriggered) {
                        this.onCrackleTriggered('ocean', 'sonar');
                    }
                } catch (e) {}
            }
            this.sonarTimeout = setTimeout(scheduleSonar, nextSonar);
        };

        const scheduleWhale = () => {
            if (!this.initialized) return;

            // Whale song every 15 to 30 seconds
            const nextWhale = 15000 + Math.random() * 15000;
            if (this.currentTheme === 'ocean' && this.nodes['crackle_hiss'] && this.nodes['crackle_hiss'].volume.value > -59) {
                try {
                    const now = Tone.now();
                    const startFreq = 150 + Math.random() * 120;
                    const endFreq = startFreq + (Math.random() > 0.5 ? 60 : -45);
                    this.whaleSynth.volume.value = -12;
                    this.whaleSynth.triggerAttack(startFreq, now, 0.05);
                    this.whaleSynth.frequency.setValueAtTime(startFreq, now);
                    this.whaleSynth.frequency.exponentialRampToValueAtTime(endFreq, now + 1.8);
                    this.whaleSynth.triggerRelease(now + 2.5);
                } catch (e) {}
            }
            this.whaleTimeout = setTimeout(scheduleWhale, nextWhale);
        };

        scheduleSonar();
        scheduleWhale();
    }

    startGenerativeMelody(synth) {
        const progressions = [
            ['F3', 'Ab3', 'C4', 'Eb4', 'G4'], // Fm9
            ['Bb2', 'Ab3', 'C4', 'D4', 'G4'], // Bb13
            ['Eb3', 'G3', 'Bb3', 'D4', 'F4'], // Ebmaj7
            ['C3', 'Bb3', 'Db4', 'E4', 'Ab4'] // C7b9
        ];
        let progressionIndex = 0;

        const playProgression = () => {
            if (!this.initialized) return;

            if (this.nodes['music_synth'] && this.nodes['music_synth'].volume.value > -59 && this.musicSource === 'synth') {
                try {
                    const chord = progressions[progressionIndex];
                    synth.triggerAttackRelease(chord, "2n");
                    progressionIndex = (progressionIndex + 1) % progressions.length;
                } catch(e) {}
            }

            this.generativeInterval = setTimeout(playProgression, 6000);
        };
        
        this.generativeInterval = setTimeout(playProgression, 1000);
    }

    startLofiDrumBeats() {
        const musicNode = this.nodes['music_synth'] || Tone.Destination;

        const kick = new Tone.MembraneSynth({
            envelope: { attack: 0.001, decay: 0.16, sustain: 0 }
        }).connect(musicNode);
        kick.volume.value = -8;

        const snare = new Tone.NoiseSynth({
            noise: { type: "pink" },
            envelope: { attack: 0.001, decay: 0.08, sustain: 0 }
        });
        const snareFilter = new Tone.Filter(1000, "bandpass");
        snare.chain(snareFilter, musicNode);
        snare.volume.value = -12;

        const hat = new Tone.NoiseSynth({
            noise: { type: "white" },
            envelope: { attack: 0.001, decay: 0.02, sustain: 0 }
        });
        const hatFilter = new Tone.Filter(8000, "highpass");
        hat.chain(hatFilter, musicNode);
        hat.volume.value = -18;

        const drumPattern = [
            { kick: true, hat: false, snare: false }, // Step 0: Kick
            { kick: false, hat: true, snare: false },  // Step 1: Hat
            { kick: false, hat: false, snare: true },  // Step 2: Snare
            { kick: false, hat: true, snare: false },  // Step 3: Hat
            { kick: true, hat: false, snare: false }, // Step 4: Kick
            { kick: true, hat: true, snare: false },  // Step 5: Kick + Hat
            { kick: false, hat: false, snare: true },  // Step 6: Snare
            { kick: false, hat: true, snare: false }   // Step 7: Hat
        ];

        const tick = () => {
            if (!this.initialized) return;

            const isMusicPlaying = this.nodes['music_synth'] && this.nodes['music_synth'].volume.value > -59 && this.musicSource === 'synth';
            
            if (isMusicPlaying) {
                const stepData = drumPattern[this.drumStep];
                
                try {
                    if (stepData.kick) kick.triggerAttackRelease("C1", "8n");
                    if (stepData.snare) snare.triggerAttackRelease("8n");
                    if (stepData.hat) hat.triggerAttackRelease("8n");
                } catch(e) {}
            }

            this.drumStep = (this.drumStep + 1) % drumPattern.length;
            this.drumInterval = setTimeout(tick, 428); // 70 BPM 8th note
        };

        this.drumInterval = setTimeout(tick, 2000);
    }

    destroy() {
        if (this.fireplaceInterval) clearTimeout(this.fireplaceInterval);
        if (this.generativeInterval) clearTimeout(this.generativeInterval);
        if (this.vinylInterval) clearTimeout(this.vinylInterval);
        if (this.drumInterval) clearTimeout(this.drumInterval);
        if (this.clinkTimeout) clearTimeout(this.clinkTimeout);
        if (this.sonarTimeout) clearTimeout(this.sonarTimeout);
        if (this.whaleTimeout) clearTimeout(this.whaleTimeout);
        if (this.radioAudio) {
            this.radioAudio.pause();
            this.radioAudio = null;
        }
        if (this.purrOsc) {
            try { this.purrOsc.stop(); this.purrOsc.dispose(); } catch(e) {}
        }
        if (this.purrTremolo) {
            try { this.purrTremolo.dispose(); } catch(e) {}
        }
        if (this.purrGain) {
            try { this.purrGain.dispose(); } catch(e) {}
        }
        if (this.peerChannels) {
            for (const roomId in this.peerChannels) {
                this.destroyPeerChannel(roomId);
            }
        }
    }

    triggerAlarm() {
        if (!this.initialized) return;
        const now = Tone.now();
        const notes = ["C5", "E5", "G5", "C6"];
        const alarmSynth = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: "sine" },
            envelope: { attack: 0.05, decay: 0.4, sustain: 0.2, release: 0.8 }
        }).toDestination();
        alarmSynth.volume.value = -8;
        notes.forEach((note, i) => {
            alarmSynth.triggerAttackRelease(note, "4n", now + i * 0.15);
            alarmSynth.triggerAttackRelease(note, "4n", now + 1.0 + i * 0.15);
        });
        setTimeout(() => alarmSynth.dispose(), 4000);
    }

    createPeerChannel(roomId) {
        if (!this.initialized) return;
        if (!this.peerChannels) {
            this.peerChannels = {};
        }
        if (this.peerChannels[roomId]) return;

        // StereoPanner -> Filter -> Volume -> Destination
        const panner = new Tone.StereoPanner(0).toDestination();
        const filter = new Tone.Filter({
            type: "lowpass",
            frequency: 350,
            Q: 0.5
        }).connect(panner);
        const volume = new Tone.Volume(-60).connect(filter); // start fully quiet

        // Dedicated keyboard click synths
        const clickNoise = new Tone.NoiseSynth({
            noise: { type: "white" },
            envelope: { attack: 0.001, decay: 0.008, sustain: 0 }
        });
        const clickNoiseFilter = new Tone.Filter({ type: "bandpass", frequency: 3200, Q: 10 }).connect(volume);
        clickNoise.connect(clickNoiseFilter);

        const clickThump = new Tone.Synth({
            oscillator: { type: "sine" },
            envelope: { attack: 0.002, decay: 0.035, sustain: 0 }
        }).connect(volume);

        const bellSynth = new Tone.Synth({
            oscillator: { type: "sine" },
            envelope: { attack: 0.002, decay: 0.6, sustain: 0 }
        }).connect(volume);

        const bubbleSynth = new Tone.Synth({
            oscillator: { type: "sine" },
            envelope: { attack: 0.001, decay: 0.04, sustain: 0 }
        }).connect(volume);

        // Dedicated theme snaps synth for the channel
        const snapSynth = new Tone.NoiseSynth({
            noise: { type: "white" },
            envelope: { attack: 0.001, decay: 0.012, sustain: 0 }
        });
        const snapFilter = new Tone.Filter(2800, "bandpass").connect(volume);
        snapSynth.connect(snapFilter);

        // Dedicated clink synth for cyberpunk snaps
        const clinkSynth = new Tone.Synth({
            oscillator: { type: "sine" },
            envelope: { attack: 0.001, decay: 0.05, sustain: 0 }
        }).connect(volume);

        // Dedicated sonar synth for ocean snaps
        const sonarSynth = new Tone.Synth({
            oscillator: { type: "sine" },
            envelope: { attack: 0.005, decay: 2.0, sustain: 0 }
        }).connect(volume);

        this.peerChannels[roomId] = {
            panner,
            filter,
            volume,
            clickNoise,
            clickNoiseFilter,
            clickThump,
            bellSynth,
            bubbleSynth,
            snapSynth,
            snapFilter,
            clinkSynth,
            sonarSynth
        };
    }

    destroyPeerChannel(roomId) {
        if (!this.peerChannels || !this.peerChannels[roomId]) return;
        const channel = this.peerChannels[roomId];
        try {
            channel.clickNoise.dispose();
            channel.clickNoiseFilter.dispose();
            channel.clickThump.dispose();
            channel.bellSynth.dispose();
            channel.bubbleSynth.dispose();
            channel.snapSynth.dispose();
            channel.snapFilter.dispose();
            channel.clinkSynth.dispose();
            channel.sonarSynth.dispose();
            channel.volume.dispose();
            channel.filter.dispose();
            channel.panner.dispose();
        } catch (e) {
            console.error("Error disposing peer channel nodes:", e);
        }
        delete this.peerChannels[roomId];
    }

    updatePeerAudioCoordinates(roomId, xCenter, sectorWidth, canvasWidth) {
        if (!this.initialized || !this.peerChannels || !this.peerChannels[roomId]) return;
        const channel = this.peerChannels[roomId];

        // Pan: -1 (left edge) to 1 (right edge)
        const center = canvasWidth / 2;
        let pan = (xCenter - center) / center;
        pan = Math.max(-1, Math.min(1, pan));
        channel.panner.pan.setValueAtTime(pan, Tone.now());

        // Proximity gain: 0.0 (far) to 0.25 (close)
        const maxDistance = canvasWidth / 2;
        const dist = Math.abs(xCenter - center);
        let proximity = 1 - (dist / maxDistance);
        proximity = Math.max(0, Math.min(1, proximity));
        
        const targetGain = proximity * 0.25;
        // Map targetGain to decibels
        let db = -60;
        if (targetGain > 0.001) {
            db = Tone.gainToDb ? Tone.gainToDb(targetGain) : 20 * Math.log10(targetGain);
        }
        channel.volume.volume.setValueAtTime(db, Tone.now());
    }

    triggerRemoteClick(roomId, profile, isEnterKey = false) {
        if (!this.initialized || !this.peerChannels || !this.peerChannels[roomId]) return;
        const channel = this.peerChannels[roomId];

        // Sanitize incoming profile to prevent errors or unexpected synth values
        const allowedProfiles = ['thock', 'blue', 'typewriter', 'bubble'];
        const cleanProfile = allowedProfiles.includes(profile) ? profile : 'thock';
        const cleanIsEnterKey = !!isEnterKey;

        try {
            const now = Tone.now();
            if (cleanProfile === 'bubble') {
                channel.bubbleSynth.volume.value = -2 - Math.random() * 4;
                channel.bubbleSynth.triggerAttackRelease(450, "32n", now);
                channel.bubbleSynth.frequency.setValueAtTime(450, now);
                channel.bubbleSynth.frequency.exponentialRampToValueAtTime(1250, now + 0.04);
            } else {
                let noiseDecay = 0.008;
                let noiseFreq = 3200;
                let noiseQ = 10;
                let thumpFreq = 95 + Math.random() * 30;
                let thumpDecay = 0.035;
                
                if (cleanProfile === 'thock') {
                    noiseDecay = 0.012;
                    noiseFreq = 1000;
                    noiseQ = 7;
                    thumpFreq = 105 + Math.random() * 20;
                    thumpDecay = 0.045;
                } else if (cleanProfile === 'blue') {
                    noiseDecay = 0.003;
                    noiseFreq = 6500;
                    noiseQ = 16;
                    thumpFreq = 1600 + Math.random() * 200;
                    thumpDecay = 0.008;
                } else if (cleanProfile === 'typewriter') {
                    noiseDecay = 0.015;
                    noiseFreq = 2200;
                    noiseQ = 5;
                    thumpFreq = 220 + Math.random() * 40;
                    thumpDecay = 0.03;
                    
                    if (cleanIsEnterKey) {
                        channel.bellSynth.volume.value = -12;
                        channel.bellSynth.triggerAttackRelease("E6", "4n", undefined, 0.45);
                    }
                }

                channel.clickNoise.noise.type = "white";
                channel.clickNoise.envelope.decay = noiseDecay;
                channel.clickNoiseFilter.frequency.value = noiseFreq;
                channel.clickNoiseFilter.Q.value = noiseQ;
                
                channel.clickThump.envelope.decay = thumpDecay;
                
                const snapVolume = -5 - Math.random() * 5;
                const thumpVolume = -6 - Math.random() * 4;

                channel.clickNoise.triggerAttackRelease("32n", now, Tone.dbToGain(snapVolume));
                channel.clickThump.triggerAttackRelease(thumpFreq, "32n", now, Tone.dbToGain(thumpVolume));
            }
        } catch (e) {
            console.error("Remote keyboard click trigger error", e);
        }
    }

    triggerRemoteCrackle(roomId, theme, crackleType = 'snap') {
        if (!this.initialized || !this.peerChannels || !this.peerChannels[roomId]) return;
        const channel = this.peerChannels[roomId];

        // Sanitize incoming theme and crackleType to prevent unexpected behaviors
        const cleanTheme = String(theme || '').toLowerCase();
        const cleanCrackleType = String(crackleType || '').toLowerCase();

        try {
            if (cleanTheme === 'cabin') {
                const clickGain = 0.15 + Math.random() * 0.85;
                channel.snapSynth.triggerAttackRelease("32n", undefined, clickGain);
            } else if (cleanTheme === 'cyberpunk') {
                const clinkFreq = 1600 + Math.random() * 2400;
                const clinkVol = 0.01 + Math.random() * 0.08;
                channel.clinkSynth.triggerAttackRelease(clinkFreq, "32n", undefined, clinkVol);
            } else if (cleanTheme === 'ocean') {
                if (cleanCrackleType === 'sonar') {
                    channel.sonarSynth.triggerAttackRelease("C6", "8n", undefined, 0.12);
                }
            }
        } catch (e) {
            console.error("Remote crackle trigger error", e);
        }
    }
}
