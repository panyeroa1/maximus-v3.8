import React, { useRef, useEffect } from 'react';
import { DetectedObject, PlanStep, TranscriptEntry } from '../types';

const PowerIcon: React.FC = () => (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
      <line x1="12" y1="2" x2="12" y2="12"></line>
    </svg>
);
  
const MicIcon: React.FC = () => (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
      <line x1="8" y1="23" x2="16" y2="23"></line>
      <line x1="12" y1="17" x2="12" y2="23"></line>
    </svg>
);

// FIX: Defined HUDProps interface to resolve TypeScript error.
interface HUDProps {
    isActive: boolean;
    status: string;
    isExecutingPlan: boolean;
    error: string | null;
    toggleSystem: () => void;
    isConversing: boolean;
    startConversation: () => void;
    stopConversation: (maintainStatus?: boolean) => void;
    allDetectedObjects: DetectedObject[];
    selectedObject: DetectedObject | null;
    onClearSelection: () => void;
    executionLog: string[];
    transcripts: TranscriptEntry[];
    plan: PlanStep[] | null;
}

const HudWidget: React.FC<{title: string, children: React.ReactNode, className?: string}> = ({ title, children, className }) => (
    <div className={`bg-black/30 backdrop-blur-sm p-3 border border-cyan-400/30 rounded-md ${className}`}>
        <h3 className="text-sm uppercase tracking-widest text-cyan-300/80 border-b border-cyan-400/20 pb-1 mb-2">{title}</h3>
        {children}
    </div>
);

export const HUD: React.FC<HUDProps> = (props) => {
    const { isActive, status, isExecutingPlan, error, toggleSystem, isConversing, startConversation, stopConversation, allDetectedObjects, selectedObject, onClearSelection, executionLog, transcripts, plan } = props;
    const radarCanvasRef = useRef<HTMLCanvasElement>(null);
    const logContainerRef = useRef<HTMLDivElement>(null);
    const transcriptContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        logContainerRef.current?.scrollTo({ top: logContainerRef.current.scrollHeight, behavior: 'smooth' });
    }, [executionLog]);

     useEffect(() => {
        transcriptContainerRef.current?.scrollTo({ top: transcriptContainerRef.current.scrollHeight, behavior: 'smooth' });
    }, [transcripts]);

    useEffect(() => {
        const canvas = radarCanvasRef.current;
        if (!canvas || !isActive) {
            if (canvas) {
                const ctx = canvas.getContext('2d');
                ctx?.clearRect(0, 0, canvas.width, canvas.height);
            }
            return;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        let animationFrameId: number;
        
        const resizeCanvas = () => {
            const size = Math.min(canvas.parentElement!.clientWidth, canvas.parentElement!.clientHeight);
            canvas.width = size;
            canvas.height = size;
        };
        resizeCanvas();

        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const radius = canvas.width / 2 * 0.9;
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;

            // Draw radar grid
            ctx.strokeStyle = 'rgba(159, 234, 249, 0.2)';
            ctx.lineWidth = 1;
            [0.25, 0.5, 0.75, 1].forEach(r => {
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius * r, 0, 2 * Math.PI);
                ctx.stroke();
            });

            // Draw detected objects
            allDetectedObjects.forEach(obj => {
                const angle = (Math.atan2(obj.point[0] - 500, obj.point[1] - 500));
                const distance = Math.min(1, Math.sqrt(Math.pow(obj.point[1] - 500, 2) + Math.pow(obj.point[0] - 500, 2)) / 707);
                
                const radarX = centerX + Math.cos(angle) * (distance * radius);
                const radarY = centerY + Math.sin(angle) * (distance * radius);

                const isSelected = selectedObject?.id === obj.id;

                ctx.fillStyle = isSelected ? '#FFFF00' : 'rgba(255, 69, 0, 0.8)';
                ctx.beginPath();
                ctx.arc(radarX, radarY, isSelected ? 5 : 3, 0, 2 * Math.PI);
                ctx.fill();
            });

            animationFrameId = requestAnimationFrame(draw);
        };
        draw();
        
        return () => {
            cancelAnimationFrame(animationFrameId);
        }

    }, [isActive, allDetectedObjects, selectedObject]);

    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {/* Borders and Frame */}
            <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-black/70 to-transparent"></div>
            <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-black/70 to-transparent"></div>
            <div className="absolute inset-0 border-[1.5rem] border-black rounded-[3rem]"></div>
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/3 h-2 bg-red-500/80 rounded-b-full shadow-[0_0_15px_rgba(255,0,0,0.7)]"></div>
            
            {/* Central Reticle */}
            <div className="absolute inset-0 flex items-center justify-center">
                 <svg viewBox="0 0 500 500" className="w-[40vh] h-[40vh] text-orange-400 opacity-80" style={{filter: 'drop-shadow(0 0 10px currentColor)'}}>
                    <circle cx="250" cy="250" r="150" fill="none" stroke="currentColor" strokeWidth="2" />
                    <circle cx="250" cy="250" r="100" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="1 10"/>
                    <line x1="250" y1="50" x2="250" y2="450" stroke="currentColor" strokeWidth="1"/>
                    <line x1="50" y1="250" x2="450" y2="250" stroke="currentColor" strokeWidth="1"/>
                    <line x1="230" y1="250" x2="270" y2="250" stroke="currentColor" strokeWidth="3"/>
                    <line x1="250" y1="230" x2="250" y2="270" stroke="currentColor" strokeWidth="3"/>
                </svg>
            </div>

            {/* Left Panel */}
            <div className="absolute top-1/4 left-8 w-64 space-y-4">
                 <h1 className="text-3xl font-bold tracking-[0.2em] hud-text-glow">HE4L300</h1>
                 <div className="relative w-full h-4 bg-cyan-900/50 border border-cyan-400/50">
                     <div className="h-full bg-cyan-400" style={{width: '85%'}}></div>
                 </div>
                 <div className="relative w-64 h-64">
                    <canvas ref={radarCanvasRef} className="w-full h-full"></canvas>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-full h-1/2 bg-gradient-to-b from-cyan-400/20 to-transparent opacity-50 origin-center radar-sweep-line"></div>
                    </div>
                </div>
            </div>

            {/* Right Panel */}
            <div className="absolute top-1/4 right-8 w-72 space-y-4">
                <div className="flex justify-end space-x-2 pointer-events-auto">
                    {/* Placeholder Icons */}
                    <div className="w-8 h-8 flex items-center justify-center border-2 border-cyan-400/50 bg-black/30 text-cyan-400/80">?</div>
                    <button onClick={isConversing ? stopConversation : startConversation} disabled={!isActive} className={`w-8 h-8 flex items-center justify-center border-2 bg-black/30 transition-colors ${isConversing ? 'text-red-400 border-red-400/80 animate-pulse' : 'text-cyan-400 border-cyan-400/50'}`}><MicIcon/></button>
                    <div className="w-8 h-8 flex items-center justify-center border-2 border-cyan-400/50 bg-black/30 text-cyan-400/80">#</div>
                </div>

                {selectedObject ? (
                     <HudWidget title="TARGET DETAILS" className="pointer-events-auto">
                        <p className="text-lg text-yellow-300 font-bold hud-text-glow">{selectedObject.label.toUpperCase()}</p>
                        <p className="text-xs text-slate-400">COORDS: [{selectedObject.point[0]}, {selectedObject.point[1]}]</p>
                        <button onClick={onClearSelection} className="mt-2 w-full text-xs text-center py-1 bg-yellow-800/50 border border-yellow-400/50 hover:bg-yellow-700/70 text-yellow-300">
                            CLEAR LOCK
                        </button>
                    </HudWidget>
                ) : (
                    <HudWidget title="SYSTEM STATUS">
                        <p className="text-lg font-bold">{status}</p>
                         <div className="flex items-center space-x-2 mt-1">
                            <span className={`w-3 h-3 rounded-full animate-pulse ${isActive ? (isExecutingPlan ? 'bg-yellow-400 shadow-[0_0_8px_yellow]' : 'bg-green-400 shadow-[0_0_8px_green]') : 'bg-red-500 shadow-[0_0_8px_red]'}`}></span>
                            <span className="text-xs uppercase tracking-widest">{isExecutingPlan ? 'EXECUTING' : (isActive ? 'NOMINAL' : 'OFFLINE')}</span>
                        </div>
                    </HudWidget>
                )}

                <HudWidget title="EXECUTION LOG">
                    <div ref={logContainerRef} className="text-xs h-24 overflow-y-auto pr-2 space-y-1 font-mono">
                        {executionLog.length > 0 ? executionLog.map((log, i) => (
                            <p key={i}>{log}</p>
                        )) : <p className="text-slate-500">Awaiting commands...</p>}
                    </div>
                </HudWidget>

                <HudWidget title="AUDIO TRANSCRIPT">
                    <div ref={transcriptContainerRef} className="text-xs h-24 overflow-y-auto pr-2 space-y-2">
                         {transcripts.length > 0 ? transcripts.map((entry, index) => (
                            <p key={index}><span className={`font-bold ${entry.speaker === 'user' ? 'text-cyan-300' : 'text-slate-300'}`}>{entry.speaker === 'user' ? 'OPR' : 'EBU'}:</span> {entry.text}</p>
                        )) : <p className="text-slate-500">No active comms...</p>}
                    </div>
                </HudWidget>
            </div>

            {/* Bottom Gauges and Controls */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center">
                 <div className="relative w-80 h-4 bg-cyan-900/50 border border-cyan-400/50">
                     <div className="h-full bg-gradient-to-r from-cyan-600 to-cyan-200" style={{width: '60%'}}></div>
                 </div>
            </div>
            
            <button onClick={toggleSystem} className={`absolute bottom-8 right-8 w-14 h-14 flex items-center justify-center rounded-full border-2 transition-all duration-300 pointer-events-auto ${isActive ? 'text-red-400 border-red-500/80 bg-red-900/50 hover:bg-red-800/50 hud-text-glow-orange' : 'text-cyan-300 border-cyan-400/80 bg-cyan-900/50 hover:bg-cyan-800/50 hud-text-glow'}`}>
                <PowerIcon />
            </button>
        </div>
    );
};