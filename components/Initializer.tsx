import React from 'react';

export const Initializer: React.FC = () => {
    const text = "INITIALIZING...";
    return (
        <div className="absolute inset-0 bg-black z-50 flex flex-col items-center justify-center text-yellow-400 uppercase font-bold overflow-hidden">
            <div className="scanline"></div>
            <div className="text-center">
                <h1 className="text-4xl tracking-widest hud-text-glow">MAXIMUS OS</h1>
                <p className="text-sm text-cyan-400 hud-text-glow">EBURON SYSTEMS</p>
            </div>

            <div className="w-1/3 mt-12">
                <div className="relative h-2 bg-yellow-400/20 border border-yellow-400/50">
                    <div className="absolute top-0 left-0 h-full bg-cyan-400 animate-loading-bar hud-element-glow-cyan"></div>
                </div>
                <div 
                    className="relative text-center text-lg mt-4 glitch-text hud-text-glow"
                    data-text={text}
                >
                    {text}
                </div>
            </div>

             <div className="absolute bottom-4 text-xs text-yellow-400/50">
                <p>A.I. CORE: SYNCED</p>
                <p>VISUAL CORTEX: ONLINE</p>
                <p>COMMAND INTERFACE: STANDBY</p>
            </div>
        </div>
    );
};
