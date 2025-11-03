import React, { useRef, useEffect } from 'react';
import { DetectedObject } from '../types';

// Icons as React Components
const HealthIcon: React.FC<{className?: string}> = ({className}) => <svg viewBox="0 0 20 20" className={className} fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>;
const SignalIcon: React.FC<{className?: string}> = ({className}) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}><path d="M4.80005 12.0001C4.80005 12.0001 7.20005 8.4001 12 8.4001C16.8 8.4001 19.2 12.0001 19.2 12.0001" strokeLinecap="round" strokeLinejoin="round" /><path d="M7.20005 15.6001C7.20005 15.6001 8.88005 13.9201 12 13.9201C15.12 13.9201 16.8 15.6001 16.8 15.6001" strokeLinecap="round" strokeLinejoin="round" /><path d="M9.60005 19.2C9.60005 19.2 10.56 18.24 12 18.24C13.44 18.24 14.4 19.2 14.4 19.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
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
}

const StatusBar: React.FC<{ value: number; color: string; className?: string }> = ({ value, color, className }) => (
    <div className={`w-32 h-3 border border-yellow-400/50 p-0.5 ${className}`}>
        <div className={`${color} h-full`} style={{ width: `${value}%` }}></div>
    </div>
);

const AudioVisualizer: React.FC<{ data: Uint8Array | null, reversed?: boolean }> = ({ data, reversed = false }) => {
    const barCount = 16;
    const bars = Array.from({ length: barCount }, (_, i) => {
        const dataIndex = Math.floor((i / barCount) * (data?.length || 0));
        const height = data ? (data[dataIndex] / 255) * 100 : 0;
        return (
            <div key={i} className="w-1.5 bg-cyan-400/80 hud-element-glow-cyan" style={{ height: `${height}%`, transition: 'height 0.05s ease-out' }}></div>
        );
    });

    return (
        <div className={`flex w-32 h-10 items-end space-x-1 p-1 ${reversed ? 'flex-row-reverse' : ''}`}>
            {bars}
        </div>
    );
};


export const HUD: React.FC<HUDProps> = (props) => {
    const { isActive, status, error, toggleSystem, isConversing, startConversation, stopConversation, allDetectedObjects, selectedObject, audioVisualizerData } = props;
    const radarCanvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = radarCanvasRef.current;
        if (!canvas || !isActive) {
            if(canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;

        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const centerX = canvas.width / 2;
            const centerY = canvas.height * 0.9;
            const radiusX = canvas.width * 0.45;
            const radiusY = canvas.height * 0.8;
            
            // Draw radar grid
            ctx.strokeStyle = 'rgba(250, 204, 21, 0.3)';
            ctx.lineWidth = 1;
            
            // Arcs
            for(let i=1; i<=4; i++) {
                ctx.beginPath();
                ctx.ellipse(centerX, centerY, radiusX * (i/4), radiusY * (i/4), 0, Math.PI, 2 * Math.PI);
                ctx.stroke();
            }
            // Lines
            for(let i=0; i<=4; i++) {
                const angle = (i/4) * Math.PI;
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.lineTo(centerX + Math.cos(angle - Math.PI/2) * radiusX, centerY - Math.sin(angle - Math.PI/2) * radiusY);
                ctx.stroke();
            }

            // Draw center dot
            ctx.fillStyle = '#67E8F9';
            ctx.beginPath();
            ctx.arc(centerX, centerY, 4, 0, 2 * Math.PI);
            ctx.fill();
            ctx.strokeStyle = '#0891B2';
            ctx.stroke();

            // Draw objects
            allDetectedObjects.forEach(obj => {
                const isSelected = selectedObject?.id === obj.id;
                const angle = Math.atan2(500 - obj.point[0], obj.point[1] - 500) - Math.PI / 2;
                const distance = Math.min(1, Math.sqrt(Math.pow(obj.point[1] - 500, 2) + Math.pow(obj.point[0] - 500, 2)) / 707);

                const radarX = centerX + Math.sin(angle) * (distance * radiusX);
                const radarY = centerY - Math.cos(angle) * (distance * radiusY);

                ctx.fillStyle = isSelected ? '#FACC15' : '#EF4444'; // Yellow for selected, red for others
                ctx.beginPath();
                ctx.arc(radarX, radarY, isSelected ? 4 : 3, 0, 2 * Math.PI);
                ctx.fill();
            });


            animationFrameId = requestAnimationFrame(draw);
        };
        draw();
        
        return () => cancelAnimationFrame(animationFrameId);

    }, [isActive, allDetectedObjects, selectedObject]);


    return (
        <div className="absolute inset-2 pointer-events-none text-yellow-400 font-bold hud-text-glow uppercase">
             {/* Header */}
            <div className="absolute top-4 left-8 text-xs tracking-widest">eburon</div>
            <div className="absolute top-4 right-8 text-xs tracking-widest">Maximus</div>

            {/* Top-Left Widgets */}
            <div className="absolute top-12 left-8 space-y-2">
                <div className="flex items-center space-x-2">
                    <HealthIcon className="text-red-500 hud-element-glow-red w-6 h-6"/>
                    <StatusBar value={isActive ? 90: 0} color="bg-red-500"/>
                </div>
                 <div className="flex items-center space-x-2 pl-8">
                     <StatusBar value={isActive ? 40 : 0} color="bg-cyan-400"/>
                 </div>
                 <p className="text-xs -mt-1 pl-8">REFLD</p>
            </div>

             {/* Top-Right Widgets */}
            <div className="absolute top-12 right-8 space-y-2 flex flex-col items-end">
                 <div className="flex items-center space-x-2">
                    <StatusBar value={isActive ? (isConversing ? 100 : 75) : 0} color="bg-yellow-400"/>
                    <SignalIcon className="w-6 h-6 hud-element-glow"/>
                </div>
                 <p className="text-xs">PARTY TEN SOMONIE</p>
                 <p className={`text-xs h-4 font-medium ${error ? 'text-red-500' : 'text-yellow-400/80'}`}>{isActive ? status : 'SYSTEM OFFLINE'}</p>
            </div>
            
             {/* Center Reticle */}
            <div className="absolute inset-0 flex items-center justify-center hud-element-glow">
                <svg viewBox="0 0 200 200" className="w-80 h-80">
                    <text x="92" y="18" fill="currentColor" fontSize="8">SUR</text>
                    <path d="M 100 20 L 100 25" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M 180 100 L 175 100" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M 100 180 L 100 175" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M 20 100 L 25 100" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M 100 15 L 105 20 L 95 20 Z" fill="currentColor" />
                    <path d="M 185 100 L 180 95 L 180 105 Z" fill="currentColor" />

                    <circle cx="100" cy="100" r="70" fill="none" stroke="currentColor" strokeWidth="2" className="animate-rotate-cw" />
                    <circle cx="100" cy="100" r="40" fill="none" stroke="currentColor" strokeWidth="1" className="animate-rotate-ccw"/>
                    <circle cx="100" cy="100" r="5" fill="currentColor" />
                    
                    <path d="M 100 32 L 100 98 M 100 102 L 100 168" stroke="currentColor" strokeWidth="0.5" />
                    <path d="M 32 100 L 98 100 M 102 100 L 168 100" stroke="currentColor" strokeWidth="0.5" />
                    
                    <path d="M 95 100 L 105 100" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M 100 95 L 100 105" stroke="currentColor" strokeWidth="1.5" />
                </svg>
            </div>
            
            {/* Bottom-Left Visualizer */}
            <div className="absolute bottom-12 left-8">
                <AudioVisualizer data={audioVisualizerData} />
            </div>
            
            {/* Bottom-Right Controls & Visualizer */}
            <div className="absolute bottom-12 right-8 flex flex-col items-end">
                <AudioVisualizer data={audioVisualizerData} reversed={true} />
                <div className="space-y-3 mt-2 pointer-events-auto">
                    <button onClick={isConversing ? () => stopConversation() : startConversation} disabled={!isActive} className={`flex items-center space-x-2 p-1 transition-opacity ${!isActive && 'opacity-50'}`}>
                        <MicIcon className={`w-5 h-5 ${isConversing ? 'text-red-400 animate-pulse' : ''}`}/>
                        <div className="w-32 h-3" />
                    </button>
                    <button onClick={toggleSystem} className={`flex items-center space-x-2 p-1 transition-colors ${isActive ? 'text-red-500' : 'text-cyan-400'}`}>
                        <PowerIcon className="w-6 h-6"/>
                        <div className="w-32 h-3" />
                    </button>
                </div>
            </div>

             {/* Bottom Radar */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-80 h-40 hud-element-glow">
                <canvas ref={radarCanvasRef} width="320" height="160"></canvas>
            </div>

        </div>
    );
};