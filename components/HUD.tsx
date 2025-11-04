import React from 'react';
import { DetectedObject } from '../types';

// New, more detailed SVG components based on the reference image
const ScannerWidget: React.FC<{className?: string}> = ({className}) => (
    <svg viewBox="0 0 100 60" className={className} fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="30" cy="30" r="25" strokeOpacity="0.5"/>
        <circle cx="30" cy="30" r="18" strokeOpacity="0.5"/>
        <circle cx="30" cy="30" r="11" strokeOpacity="0.5"/>
        <path d="M 30 5 L 30 55 M 5 30 L 55 30" strokeOpacity="0.5" />
        <path d="M 11.7 11.7 L 48.3 48.3 M 11.7 48.3 L 48.3 11.7" strokeOpacity="0.5" />
    </svg>
);

const VerticalAlignmentWidget: React.FC<{className?: string}> = ({className}) => (
     <svg viewBox="0 0 30 100" className={className} fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M5 20 C 15 25, 15 35, 5 40" strokeOpacity="0.8" />
        <path d="M25 80 C 15 75, 15 65, 25 60" strokeOpacity="0.8" />
        <path d="M15 10 L 15 90 M 5 50 L 25 50" strokeOpacity="0.4" />
        <rect x="12" y="47" width="6" height="6" fill="currentColor" />
     </svg>
);

const PowerIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
      <line x1="12" y1="2" x2="12" y2="12"></line>
    </svg>
);
  
const MicIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
    </svg>
);


interface HUDProps {
    isActive: boolean;
    status: string;
    error: string | null;
    toggleSystem: () => void;
    isConversing: boolean;
    startConversation: () => void;
    stopConversation: (maintainStatus?: boolean) => void;
    allDetectedObjects: DetectedObject[];
    selectedObject: DetectedObject | null;
    audioVisualizerData: Uint8Array | null;
    isLoadingHistory: boolean;
}

const HorizontalBar: React.FC<{ value: number; className?: string }> = ({ value, className }) => (
    <div className={`w-full h-1.5 bg-white/20`}>
        <div className={`bg-white h-full`} style={{ width: `${value}%` }}></div>
    </div>
);

const PowerLevelsWidget: React.FC<{className?: string}> = ({className}) => {
    const redLevels = [100, 100, 100, 100, 100, 100, 100, 100, 80, 50, 0, 0];
    const cyanLevels = [100, 100, 100, 100, 90, 40];
    return (
        <div className={`w-48 space-y-2 ${className}`}>
             <div className="flex space-x-1">
                {redLevels.map((level, i) => (
                    <div key={i} className="flex-1 h-3 bg-red-500/20"><div className="bg-red-500 h-full" style={{width: `${level}%`}}></div></div>
                ))}
             </div>
             <div className="flex space-x-1">
                {cyanLevels.map((level, i) => (
                    <div key={i} className="flex-1 h-2 bg-cyan-400/20"><div className="bg-cyan-400 h-full" style={{width: `${level}%`}}></div></div>
                ))}
             </div>
             <div className="w-full h-1 bg-red-500"></div>
        </div>
    )
};


const AudioVisualizer: React.FC<{ data: Uint8Array | null }> = ({ data }) => {
    const barCount = 10;
    const bars = Array.from({ length: barCount }, (_, i) => {
        const dataIndex = Math.floor((i / barCount) * (data?.length || 0));
        const height = data ? (data[dataIndex] / 255) * 100 : 0;
        return (
            <div key={i} className="w-2 bg-yellow-400/80 hud-element-glow" style={{ height: `${height}%`, transition: 'height 0.05s ease-out' }}></div>
        );
    });

    return (
        <div className="flex w-40 h-16 items-end space-x-1 p-1 border border-yellow-400/30">
            {bars}
        </div>
    );
};


export const HUD: React.FC<HUDProps> = (props) => {
    const { isActive, status, error, toggleSystem, isConversing, startConversation, stopConversation, audioVisualizerData, isLoadingHistory } = props;
    const statusText = isActive ? status : 'SYSTEM OFFLINE';

    return (
        <div className="absolute inset-2 pointer-events-none text-white/90 font-bold uppercase">
             {/* Header */}
            <div className="absolute top-4 left-8 text-[10px] tracking-widest text-shadow-strong">eburon</div>
            <div className="absolute top-4 right-8 flex items-center space-x-2">
                <span className="text-[10px] tracking-widest text-shadow-strong">Maximus</span>
                 <button 
                    onClick={isConversing ? () => stopConversation() : startConversation} 
                    disabled={!isActive || isLoadingHistory} 
                    className={`pointer-events-auto transition-opacity disabled:opacity-50 disabled:cursor-not-allowed ${isConversing ? 'text-red-400 animate-pulse' : 'text-white/80 hover:text-white'}`}
                >
                    <MicIcon className="w-4 h-4"/>
                </button>
            </div>

            {/* Top-Left Widgets */}
            <div className="absolute top-12 left-8 space-y-2 hud-element-glow">
                <div className="w-40 space-y-1">
                    <HorizontalBar value={isActive ? 95 : 0} />
                    <HorizontalBar value={isActive ? 80 : 0} />
                    <HorizontalBar value={isActive ? 60 : 0} />
                </div>
                <ScannerWidget className="w-24 h-24 text-white/80" />
            </div>

             {/* Top-Right Widgets */}
            <div className="absolute top-12 right-8 space-y-2 flex flex-col items-end hud-element-glow">
                <VerticalAlignmentWidget className="h-32 w-auto text-white/80" />
                <p 
                    className={`relative text-xs h-4 font-medium text-shadow-strong ${error ? 'text-red-500' : 'text-yellow-400/80'} ${isActive && !error ? 'glitch-text' : ''}`}
                    data-text={statusText}
                >
                    {statusText}
                </p>
                {isActive && (
                    <button 
                        onClick={toggleSystem} 
                        className="pointer-events-auto mt-2 px-2 py-1 border border-red-500/50 bg-red-500/20 text-red-400 text-[10px] tracking-widest hover:bg-red-500/40 hover:text-white transition-all hud-element-glow-red"
                    >
                        TURN OFF
                    </button>
                )}
            </div>
            
             {/* Center Reticle */}
            <div className="absolute inset-0 flex items-center justify-center text-white/90">
                 {!isActive ? (
                    <button onClick={toggleSystem} className="pointer-events-auto text-cyan-400 hud-element-glow-cyan transition-all hover:scale-110 focus:scale-110 outline-none">
                        <PowerIcon className="w-24 h-24" />
                    </button>
                ) : (
                    <div className="hud-element-glow">
                        <svg viewBox="0 0 200 200" className="w-96 h-96">
                            {/* Tick marks */}
                            {Array.from({length: 36}).map((_, i) => (
                                <path key={i} d="M 100 29 L 100 32" stroke="currentColor" strokeWidth="1" strokeOpacity="0.7" transform={`rotate(${i * 10}, 100, 100)`} />
                            ))}
                            <path d="M 100 10 L 100 20 M 190 100 L 180 100 M 100 190 L 100 180 M 10 100 L 20 100" stroke="currentColor" strokeWidth="1" strokeOpacity="0.7" />
                            <rect x="98.5" y="22" width="3" height="3" fill="currentColor" />
                            <rect x="175" y="98.5" width="3" height="3" fill="currentColor" />

                            {/* Main Rings */}
                            <circle cx="100" cy="100" r="85" fill="none" stroke="currentColor" strokeWidth="0.5" strokeOpacity="0.5" />
                            <g className="animate-rotate-cw">
                            <circle cx="100" cy="100" r="70" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="10 5" />
                            <path d="M 30 100 L 40 100 M 170 100 L 160 100" stroke="currentColor" strokeWidth="3" />
                            </g>
                            <circle cx="100" cy="100" r="55" fill="none" stroke="currentColor" strokeWidth="0.5" strokeOpacity="0.5" className="animate-rotate-ccw"/>
                            <circle cx="100" cy="100" r="30" fill="none" stroke="currentColor" strokeWidth="1" />
                            
                            {/* Crosshairs */}
                            <path d="M 100 32 L 100 95 M 100 105 L 100 168" stroke="currentColor" strokeWidth="0.5" />
                            <path d="M 32 100 L 95 100 M 105 100 L 168 100" stroke="currentColor" strokeWidth="0.5" />
                            <path d="M 90 100 L 110 100 M 100 90 L 100 110" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                    </div>
                )}
            </div>
            
             {/* Bottom Section */}
             <div className="absolute bottom-6 left-8 right-8 flex justify-between items-end">
                {/* Left Power Levels */}
                <div className="hud-element-glow-red">
                    <PowerLevelsWidget />
                </div>

                {/* Right Controls & Visualizer */}
                <div className="flex items-end space-x-4">
                    <div className="flex flex-col items-center text-yellow-400">
                        <AudioVisualizer data={audioVisualizerData} />
                        <div className="flex w-full justify-between items-center mt-1 text-xs text-shadow-strong">
                           <span>+</span>
                           <svg viewBox="0 0 20 20" className="w-3 h-3" fill="currentColor"><path d="M2 3a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H3a1 1 0 01-1-1V3z"></path></svg>
                        </div>
                    </div>
                </div>
             </div>
        </div>
    );
};