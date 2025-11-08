// services/audioManager.ts

class AudioManager {
    private ttsContext: AudioContext | null = null;
    private liveOutputContext: AudioContext | null = null;
    private liveInputContext: AudioContext | null = null;
    private sfxContext: AudioContext | null = null;

    private createContext(sampleRate?: number): AudioContext | null {
        try {
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            return new AudioContext({ sampleRate });
        } catch (e) {
            console.error("Web Audio API is not supported in this browser.");
            return null;
        }
    }

    private async resumeContext(context: AudioContext | null): Promise<void> {
        if (context && context.state === 'suspended') {
            try {
                await context.resume();
            } catch(e) {
                console.error("Failed to resume audio context:", e);
            }
        }
    }

    getTTSContext(): AudioContext | null {
        if (!this.ttsContext || this.ttsContext.state === 'closed') {
            this.ttsContext = this.createContext(24000);
        }
        this.resumeContext(this.ttsContext);
        return this.ttsContext;
    }
    
    getLiveInputContext(): AudioContext | null {
        if (!this.liveInputContext || this.liveInputContext.state === 'closed') {
            this.liveInputContext = this.createContext(16000);
        }
        this.resumeContext(this.liveInputContext);
        return this.liveInputContext;
    }
    
    getLiveOutputContext(): AudioContext | null {
        if (!this.liveOutputContext || this.liveOutputContext.state === 'closed') {
            this.liveOutputContext = this.createContext(24000);
        }
        this.resumeContext(this.liveOutputContext);
        return this.liveOutputContext;
    }

    getSFXContext(): AudioContext | null {
        if (!this.sfxContext || this.sfxContext.state === 'closed') {
            this.sfxContext = this.createContext();
        }
        this.resumeContext(this.sfxContext);
        return this.sfxContext;
    }

    playDetectionSound = () => {
        const ctx = this.getSFXContext();
        if (!ctx) return;
    
        const now = ctx.currentTime;
        const duration = 0.3;

        // Main sound - a quick downward sweep
        const mainOsc = ctx.createOscillator();
        mainOsc.type = 'sine';
        mainOsc.frequency.setValueAtTime(880, now); // Start high (A5)
        mainOsc.frequency.exponentialRampToValueAtTime(440, now + duration * 0.7); // End at A4

        // Texture sound - a low buzz
        const textureOsc = ctx.createOscillator();
        textureOsc.type = 'sawtooth';
        textureOsc.frequency.setValueAtTime(120, now);

        const mainGain = ctx.createGain();
        mainGain.gain.setValueAtTime(0.2, now); // Start at a decent volume
        mainGain.gain.exponentialRampToValueAtTime(0.0001, now + duration); // Fade out quickly

        const textureGain = ctx.createGain();
        textureGain.gain.setValueAtTime(0.02, now); // Texture is subtle
        textureGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        // Routing
        mainOsc.connect(mainGain);
        textureOsc.connect(textureGain);
        mainGain.connect(ctx.destination);
        textureGain.connect(ctx.destination);

        mainOsc.start(now);
        textureOsc.start(now);
        mainOsc.stop(now + duration);
        textureOsc.stop(now + duration);
    };


    private closeContext(context: AudioContext | null): AudioContext | null {
        if (context && context.state !== 'closed') {
            context.close().catch(console.error);
        }
        return null;
    }

    cleanup() {
        this.ttsContext = this.closeContext(this.ttsContext);
        this.liveOutputContext = this.closeContext(this.liveOutputContext);
        this.liveInputContext = this.closeContext(this.liveInputContext);
        this.sfxContext = this.closeContext(this.sfxContext);
        console.log("All audio contexts cleaned up.");
    }
}

export const audioManager = new AudioManager();