import React, { useEffect, useState } from 'react';
import { DetectedObject, RobotState } from '../types';

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
  
const MicIcon: React.FC<{ className?: string, isConversing: boolean }> = ({ className, isConversing }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" className={isConversing ? 'text-red-400 animate-pulse' : ''}></path>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
    </svg>
);


interface HUDProps {
    isActive: boolean;
    status: string;
    error: string | null;
    isConversing: boolean;
    allDetectedObjects: DetectedObject[];
    selectedObject: DetectedObject | null;
    audioVisualizerData: Uint8Array | null;
    robotState: RobotState;
    isExecutingAction: boolean;
    interactionFeedback: { message: string; timestamp: number } | null;
}

const HorizontalBar: React.FC<{ value: number; className?: string }> = ({ value, className }) => (
    <div className={`w-full h-1.5 bg-white/20`}>
        <div className={`bg-white h-full`} style={{ width: `${value}%` }}></div>
    </div>
);

const AudioVisualizer: React.FC<{ data: Uint8Array | null, barCount: number }> = ({ data, barCount }) => {
    const bars = Array.from({ length: barCount }, (_, i) => {
        const dataIndex = Math.floor((i / barCount) * (data?.length || 0));
        const height = data ? (data[dataIndex] / 255) * 100 : 0;
        return (
            <div key={i} className="w-1 bg-yellow-400/80" style={{ height: `${height}%`, transition: 'height 0.05s ease-out' }}></div>
        );
    });

    return (
        <div className="flex h-4 items-end space-x-0.5">
            {bars}
        </div>
    );
};

const TargetInfoWidget: React.FC<{ selectedObject: DetectedObject | null; interactionFeedback: { message: string; timestamp: number } | null }> = ({ selectedObject, interactionFeedback }) => {
    const [feedback, setFeedback] = useState<{ message: string } | null>(null);

    useEffect(() => {
        if (interactionFeedback) {
            setFeedback({ message: interactionFeedback.message });
            const timer = setTimeout(() => setFeedback(null), 3000); // Display for 3 seconds
            return () => clearTimeout(timer);
        }
    }, [interactionFeedback]);

    if (!selectedObject) return null;

    return (
        <div className="w-64 p-2 border border-cyan-400/50 bg-cyan-900/20 text-cyan-300 hud-element-glow-cyan text-xs uppercase tracking-widest">
            <h3 className="text-sm font-bold border-b border-cyan-400/50 pb-1 mb-1">Target Locked</h3>
            <p className="truncate"><span className="font-bold text-white/80 w-20 inline-block">Label:</span> {selectedObject.label}</p>
            <p><span className="font-bold text-white/80 w-20 inline-block">Coord Y:</span> {selectedObject.point[0].toFixed(2)}</p>
            <p><span className="font-bold text-white/80 w-20 inline-block">Coord X:</span> {selectedObject.point[1].toFixed(2)}</p>
            {feedback && (
                 <div className="mt-2 pt-2 border-t border-cyan-400/30 text-yellow-400 animate-pulse">
                    <p>{feedback.message}</p>
                </div>
            )}
        </div>
    )
};

const RobotStateWidget: React.FC<{ state: RobotState; isExecutingAction: boolean; }> = ({ state, isExecutingAction }) => (
    <div className="w-64 p-2 border border-yellow-400/50 bg-yellow-900/20 text-yellow-300 hud-element-glow text-xs uppercase tracking-widest">
        <h3 className="text-sm font-bold border-b border-yellow-400/50 pb-1 mb-1">Robot Status</h3>
        <p><span className="font-bold text-white/80 w-28 inline-block">Gait:</span> {state.gaitType}</p>
        <p><span className="font-bold text-white/80 w-28 inline-block">Body Height:</span> {state.bodyHeight.toFixed(2)}</p>
        <div className="mt-2 pt-2 border-t border-yellow-400/30">
            {isExecutingAction && (
                <p className="text-cyan-400 animate-pulse mb-1"><span className="font-bold text-white/80 w-28 inline-block">Action:</span> EXECUTING...</p>
            )}
            <p><span className="font-bold text-white/80 w-28 inline-block">Fwd Speed:</span> {state.forwardSpeed.toFixed(2)}</p>
            <p><span className="font-bold text-white/80 w-28 inline-block">Side Speed:</span> {state.sideSpeed.toFixed(2)}</p>
            <p><span className="font-bold text-white/80 w-28 inline-block">Rotate Speed:</span> {state.rotateSpeed.toFixed(2)}</p>
        </div>
    </div>
);


const TelemetryWidget: React.FC<{isActive: boolean}> = ({ isActive }) => (
    <div className="w-56 text-right text-xs uppercase tracking-widest text-shadow-strong">
        <p><span className="font-bold text-red-400">Core Temp:</span> {isActive ? '72.5 C' : '--'}</p>
        <p><span className="font-bold text-yellow-400">Power:</span> {isActive ? '98.2 %' : '--'}</p>
        <p><span className="font-bold text-cyan-400">Link:</span> {isActive ? '99.9 %' : 'DISCONNECTED'}</p>
    </div>
);

export const HUD: React.FC<HUDProps> = (props) => {
    const { isActive, status, error, isConversing, selectedObject, audioVisualizerData, robotState, isExecutingAction, interactionFeedback } = props;
    const statusText = isActive ? status : 'SYSTEM OFFLINE';

    return (
        <div className="absolute inset-2 pointer-events-none text-white/90 font-bold uppercase">
             {/* Header */}
            <div className="absolute top-4 left-8 text-[10px] tracking-widest text-shadow-strong">eburon</div>
            <div className="absolute top-4 right-8 flex items-center space-x-4">
                 <div className="flex items-center space-x-2">
                    <AudioVisualizer data={audioVisualizerData} barCount={16} />
                    <div className="p-1.5 bg-black/50 rounded-full">
                        <MicIcon className="w-4 h-4 text-white/80" isConversing={isConversing}/>
                    </div>
                 </div>
                <span className="text-[10px] tracking-widest text-shadow-strong">Maximus</span>
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
            </div>
            
             {/* Center Reticle */}
            <div className="absolute inset-0 flex items-center justify-center text-white/90">
                 {!isActive ? (
                     <div className="text-cyan-400 hud-element-glow-cyan">
                        <PowerIcon className="w-24 h-24" />
                     </div>
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
                <div className="flex items-end space-x-4">
                   <TargetInfoWidget selectedObject={selectedObject} interactionFeedback={interactionFeedback} />
                   {isActive && <RobotStateWidget state={robotState} isExecutingAction={isExecutingAction} />}
                </div>
                <TelemetryWidget isActive={isActive}/>
             </div>
        </div>
    );
};