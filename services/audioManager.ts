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
    
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(1200, ctx.currentTime);
        gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.25);
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
