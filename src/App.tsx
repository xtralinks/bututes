/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from "react";
import type { PointerEvent } from "react";
import { motion, useSpring, useMotionValue, useTransform } from "motion/react";
import type { MotionValue } from "motion/react";
import { ChevronLeft, MoreHorizontal, Camera, Mic, Image, Heart } from "lucide-react";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const ALPHABET_SECONDARY: Record<string, string> = {
  A: "1", B: "2", C: "3", D: "4", E: "5", F: "6", G: "7", H: "8", I: "9", J: "0",
  K: "!", L: "@", M: "#", N: "$", O: "%", P: "^", Q: "&", R: "*", S: "(", T: ")",
  U: "-", V: "=", W: "+", X: "_", Y: "?", Z: "/"
};
const SYMBOLS = "1234567890!@#$%&*()?+-=".split("");
const EMOJIS = "😂❤️🔥✨🙌💀👍😭😍👀🥺🎉💪🫠💯🌈🚀💅👽🌞🌙⭐".split("");

type KeyboardMode = "MENU" | "ALPHA" | "SYMBOLS" | "EMOJIS";

export default function App() {
  const [output, setOutput] = useState("");
  const [mode, setMode] = useState<KeyboardMode>("MENU");
  const containerRef = useRef<HTMLDivElement>(null);

  // Determine the current items based on mode
  const getDisplayItems = () => {
    if (mode === "MENU") {
      return [
        { type: "SWITCH", value: "✨ Emojis", target: "EMOJIS" as KeyboardMode },
        { type: "SWITCH", value: "ABC Alpha", target: "ALPHA" as KeyboardMode },
        { type: "SWITCH", value: "123 Symbols", target: "SYMBOLS" as KeyboardMode }
      ];
    }

    const currentItems = 
      mode === "ALPHA" ? LETTERS : 
      mode === "SYMBOLS" ? SYMBOLS : 
      EMOJIS;

    return [
      { type: "SWITCH", value: mode === "EMOJIS" ? "ABC" : "✨", target: (mode === "EMOJIS" ? "ALPHA" : "EMOJIS") as KeyboardMode },
      ...currentItems.map(v => ({ 
        type: "CHAR", 
        value: v,
        secondary: mode === "ALPHA" ? ALPHABET_SECONDARY[v] : undefined
      })),
      { type: "SWITCH", value: mode === "SYMBOLS" ? "ABC" : "123", target: (mode === "SYMBOLS" ? "ALPHA" : "SYMBOLS") as KeyboardMode }
    ];
  };

  const displayItems: { type: string; value: string; secondary?: string; target?: KeyboardMode }[] = getDisplayItems();
  
  const scrollTarget = useMotionValue(displayItems.length / 2);
  const scrollPosition = useSpring(scrollTarget, {
    stiffness: 25,
    damping: 35,
    mass: 2
  });

  const [pressedIndex, setPressedIndex] = useState<number | null>(null);
  const [isCancelled, setIsCancelled] = useState(false);
  const [isLongPressing, setIsLongPressing] = useState(false);
  const [lastTypedKey, setLastTypedKey] = useState<string | null>(null);
  const [gyroActive, setGyroActive] = useState(false);
  const pressStartTime = useRef<number | null>(null);
  const cancelTimer = useRef<NodeJS.Timeout | null>(null);
  const glowTimer = useRef<NodeJS.Timeout | null>(null);
  const dwellTimer = useRef<NodeJS.Timeout | null>(null);
  const hasTypedCurrent = useRef(false);

  // Device Orientation handling
  useEffect(() => {
    if (!gyroActive) return;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma === null) return;
      
      // Tilt sensitivity
      const tilt = e.gamma; // Range approx -90 to 90
      const speed = tilt * 0.05; // Adjust speed
      
      const current = scrollTarget.get();
      const next = Math.max(0, Math.min(displayItems.length - 1, current - speed));
      scrollTarget.set(next);
    };

    window.addEventListener("deviceorientation", handleOrientation);
    return () => window.removeEventListener("deviceorientation", handleOrientation);
  }, [gyroActive, displayItems.length]);

  const requestGyro = async () => {
    // Check for iOS 13+ permission
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const permission = await (DeviceOrientationEvent as any).requestPermission();
        if (permission === 'granted') {
          setGyroActive(true);
        }
      } catch (e) {
        console.error("Permission request failed", e);
      }
    } else {
      // Android or other browsers
      setGyroActive(true);
    }
  };

  const performInput = (index: number, isSecondary: boolean) => {
    const item = displayItems[index];
    if (!item || hasTypedCurrent.current) return;

    if (item.type === "SWITCH" && item.target) {
      setMode(item.target);
      const nextItemsCount = item.target === "EMOJIS" ? EMOJIS.length : item.target === "ALPHA" ? LETTERS.length : SYMBOLS.length;
      scrollTarget.set((nextItemsCount + 2) / 2);
      hasTypedCurrent.current = true;
    } else if (item.type === "CHAR") {
      const char = (isSecondary && item.secondary) ? item.secondary : item.value;
      setOutput(prev => prev + char);
      setLastTypedKey(char); // Trigger visual pop
      setTimeout(() => setLastTypedKey(null), 150);
      hasTypedCurrent.current = true;
    }
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    const normalized = 1 - (x / width);
    const targetIndex = normalized * (displayItems.length - 1);
    
    scrollTarget.set(targetIndex);

    const currentIndex = Math.round(targetIndex);
    if (pressedIndex !== null) {
      if (pressedIndex !== currentIndex) {
        setPressedIndex(currentIndex);
        hasTypedCurrent.current = false;
        
        if (cancelTimer.current) clearTimeout(cancelTimer.current);
        if (glowTimer.current) clearTimeout(glowTimer.current);
        if (dwellTimer.current) clearTimeout(dwellTimer.current);
        
        setIsCancelled(false);
        setIsLongPressing(false);
        
        pressStartTime.current = Date.now();
        cancelTimer.current = setTimeout(() => setIsCancelled(true), 4000);
        glowTimer.current = setTimeout(() => setIsLongPressing(true), 400);
        
        // Auto-input if the cursor stops moving (settles) while holding
        const checkSettleWhileDown = () => {
          if (pressedIndex !== currentIndex) return; 
          const velocity = scrollPosition.getVelocity();
          // If slow enough and hasn't typed yet, type primary
          if (Math.abs(velocity) < 0.1 && !hasTypedCurrent.current) {
             performInput(currentIndex, false);
          } else if (!hasTypedCurrent.current) {
             requestAnimationFrame(checkSettleWhileDown);
          }
        };
        requestAnimationFrame(checkSettleWhileDown);

        // Dwelling on this new key for secondary input
        dwellTimer.current = setTimeout(() => {
          if (pressStartTime.current && !hasTypedCurrent.current) {
            performInput(currentIndex, true);
          }
        }, 800);
      }
    }
  };

  const handlePointerDown = (e: PointerEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    const normalized = 1 - (x / width);
    const currentIndex = Math.round(normalized * (displayItems.length - 1));

    setPressedIndex(currentIndex);
    hasTypedCurrent.current = false;
    setIsCancelled(false);
    setIsLongPressing(false);
    pressStartTime.current = Date.now();
    
    if (cancelTimer.current) clearTimeout(cancelTimer.current);
    cancelTimer.current = setTimeout(() => setIsCancelled(true), 4000);

    if (glowTimer.current) clearTimeout(glowTimer.current);
    glowTimer.current = setTimeout(() => setIsLongPressing(true), 400);

    // Auto-input if the cursor stops moving (settles) while holding
    const checkSettleWhileDown = () => {
      const velocity = scrollPosition.getVelocity();
      if (Math.abs(velocity) < 0.1 && !hasTypedCurrent.current) {
          performInput(currentIndex, false);
      } else if (!hasTypedCurrent.current) {
          requestAnimationFrame(checkSettleWhileDown);
      }
    };
    requestAnimationFrame(checkSettleWhileDown);

    if (dwellTimer.current) clearTimeout(dwellTimer.current);
    dwellTimer.current = setTimeout(() => {
      if (pressStartTime.current && !hasTypedCurrent.current) {
        performInput(currentIndex, true);
      }
    }, 800);
  };

  const handlePointerUp = () => {
    if (cancelTimer.current) clearTimeout(cancelTimer.current);
    if (glowTimer.current) clearTimeout(glowTimer.current);
    if (dwellTimer.current) clearTimeout(dwellTimer.current);
    
    const wasCancelled = isCancelled;
    const startTime = pressStartTime.current;
    pressStartTime.current = null;
    
    setPressedIndex(null);
    setIsCancelled(false);
    setIsLongPressing(false);

    if (startTime === null || wasCancelled) return;

    // Wait for the spring to settle and then input the landed character
    const checkSettle = () => {
      const velocity = scrollPosition.getVelocity();
      const currentPos = scrollPosition.get();
      const targetPos = scrollTarget.get();
      
      // If it's settled or close enough to target
      if (Math.abs(velocity) < 0.1 || Math.abs(currentPos - targetPos) < 0.05) {
        const finalIndex = Math.round(scrollPosition.get());
        if (!hasTypedCurrent.current) {
          performInput(finalIndex, false);
        }
      } else {
        requestAnimationFrame(checkSettle);
      }
    };
    checkSettle();
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center font-sans bg-[#fafafa]">
      {/* Background Decor */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_0%,#ffffff_0%,#f2f2f7_100%)] overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-blue-400/5 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-purple-400/5 rounded-full blur-[100px] animate-pulse [animation-delay:2s]" />
      </div>

      {/* iPhone Frame */}
      <div className="relative w-[390px] h-[844px] bg-white rounded-[55px] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.15)] ring-[16px] ring-[#1c1c1e] overflow-hidden flex flex-col">
        
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-8 bg-[#1c1c1e] rounded-b-3xl z-50 flex items-center justify-center">
            <div className="w-12 h-1.5 bg-white/5 rounded-full" />
        </div>

        {/* Status Bar */}
        <div className="pt-12 px-10 flex justify-between items-center text-[15px] font-semibold text-black">
            <span>9:41</span>
            <div className="flex gap-1.5 items-center">
                <div className="w-5 h-5 rounded-full border-[1.5px] border-black flex items-center justify-center text-[8px] font-black">5G</div>
                <div className="w-6 h-3 bg-black rounded-[3px]" />
            </div>
        </div>

        {/* Instagram Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-black/5 bg-white/80 backdrop-blur-md z-40">
          <div className="flex items-center gap-3">
            <ChevronLeft size={28} />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600 p-[1.5px]">
                <div className="w-full h-full rounded-full bg-white p-[1px]">
                  <div className="w-full h-full rounded-full bg-slate-200 overflow-hidden">
                    <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="avatar" referrerPolicy="no-referrer" />
                  </div>
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-[13px] font-bold leading-none">bulge_studio</span>
                <span className="text-[11px] text-black/40">Active now</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-black/80">
            <MoreHorizontal size={22} />
          </div>
        </div>

        {/* Chat Content */}
        <div className="flex-1 flex flex-col p-6 overflow-y-auto bg-white">
            <div className="mb-4 self-center">
              {!gyroActive && (
                <button 
                  onClick={requestGyro}
                  className="px-4 py-2 bg-slate-900 text-white rounded-full text-xs font-bold uppercase tracking-widest shadow-lg active:scale-95 transition-transform"
                >
                  Enable Gyro Control
                </button>
              )}
            </div>
            
            <div className="mt-auto mb-4 self-end bg-[#0095f6] text-white px-4 py-2.5 rounded-2xl rounded-tr-sm text-[15px] max-w-[80%] shadow-sm">
              Keyboard mode: <span className="font-bold">{mode}</span> ⚡️
            </div>
            
            <motion.div 
                layout
                className={`self-end min-h-[44px] min-w-[60px] bg-[#0095f6] text-white px-4 py-2.5 rounded-2xl rounded-tr-sm text-[15px] max-w-[80%] shadow-sm break-all font-medium flex items-center justify-center ${!output && 'opacity-0'}`}
            >
                {output}
            </motion.div>
        </div>

        {/* Compact Instagram Input Field */}
        <div className="px-4 pb-8 border-t border-black/5 bg-white">
          <div className="flex items-center gap-3 bg-[#f2f2f2] rounded-full px-4 py-2 mt-4 shadow-inner ring-1 ring-black/[0.03]">
            <div className="w-8 h-8 rounded-full bg-[#0095f6] flex items-center justify-center text-white shadow-sm active:scale-90 transition-transform">
              <Camera size={18} fill="currentColor" />
            </div>
            <div className="flex-1 text-[15px] text-black/50 overflow-hidden whitespace-nowrap">
              {output ? <span className="text-black font-medium">{output}</span> : "Message..."}
            </div>
            <div className="flex items-center gap-3 text-black/80">
              <Mic size={20} className="hover:scale-110 transition-transform" />
              <Image size={20} className="hover:scale-110 transition-transform" />
              <Heart size={20} className="hover:scale-110 transition-transform" />
            </div>
          </div>
        </div>

        {/* Keyboard Area */}
        <div className="h-64 w-full relative z-30 bg-white select-none touch-none">
          
          <div className="absolute top-4 left-1/2 -translate-x-1/2 w-8 h-1 bg-black/10 rounded-full" />

          {/* Scrolling Row of Keys - Clip sides but allow bulge to pop up */}
          <div className="relative w-full h-full overflow-hidden">
            <div 
              ref={containerRef}
              onPointerMove={handlePointerMove}
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className="relative w-full h-full flex items-center px-[50%] pt-6"
            >
              <motion.div 
                style={{
                  x: useTransform(scrollPosition, (latest) => -(latest * 56))
                }}
                className="flex items-center"
              >
                {displayItems.map((item, i) => (
                  <BulgeKey 
                    key={`${mode}-${i}-${item.value}`}
                    letter={item.value} 
                    secondary={item.secondary}
                    index={i} 
                    scrollPosition={scrollPosition}
                    isSwitch={item.type === "SWITCH"}
                    isCancelled={isCancelled && pressedIndex === i}
                    isLongPressing={isLongPressing && pressedIndex === i}
                    isLastTyped={lastTypedKey === item.value || lastTypedKey === item.secondary}
                  />
                ))}
              </motion.div>
            </div>
          </div>

          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[9px] font-black text-black/20 tracking-[0.2em] uppercase whitespace-nowrap">
            Scroll to edges to switch modes
          </div>
        </div>

        {/* Home Indicator */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1.5 bg-black/10 rounded-full" />
      </div>

      {/* Footer Info */}
      <div className="fixed bottom-8 text-slate-400 text-[10px] font-black tracking-[0.3em] uppercase opacity-40">
        Instagram Edition • Mode: {mode}
      </div>
    </div>
  );
}

function BulgeKey({ 
  letter, 
  secondary,
  index, 
  scrollPosition,
  isSwitch = false,
  isCancelled = false,
  isLongPressing = false,
  isLastTyped = false
}: { 
  letter: string; 
  secondary?: string;
  index: number; 
  scrollPosition: MotionValue<number>;
  isSwitch?: boolean;
  isCancelled?: boolean;
  isLongPressing?: boolean;
  isLastTyped?: boolean;
  key?: string | number;
}) {
  const distRaw = useTransform(scrollPosition, (latest: number) => Math.abs(index - latest));

  const y = useTransform(distRaw, (dist: number) => {
    return Math.exp(-(dist * dist) / (2 * 1.0 * 1.0)) * -110;
  });

  const scale = useTransform(distRaw, (dist: number) => {
    return 1 + Math.exp(-(dist * dist) / (1.2 * 1.2)) * 1.8;
  });

  const opacity = useTransform(distRaw, (dist: number) => {
    return Math.max(0.15, 1 - dist * 0.4);
  });

  const rotate = useTransform(scrollPosition, (latest: number) => {
    const diff = index - latest;
    return diff * 4;
  });

  const zIndex = useTransform(distRaw, (dist: number) => {
    return Math.round(100 - dist * 10);
  });

  return (
    <div className="w-[56px] h-12 flex flex-col items-center justify-center flex-shrink-0">
      <motion.div
        animate={isLastTyped ? {
          scale: 3.5,
          backgroundColor: "#e0f2fe",
          transition: { duration: 0.1 }
        } : isCancelled ? { 
          backgroundColor: ["#ffffff", "#ef4444", "#ffffff"],
          scale: [1, 1.1, 1],
          transition: { duration: 0.5, ease: "easeInOut" }
        } : isLongPressing ? {
          boxShadow: "0 0 20px rgba(0, 149, 246, 0.4)",
          borderColor: "#0095f6",
        } : {}}
        style={{
          y,
          scale,
          opacity,
          rotate,
          zIndex
        }}
        className={`rounded-xl flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.06)] border px-3 transition-colors relative ${
          isSwitch 
            ? "bg-slate-900 border-slate-800 text-white min-w-[70px]" 
            : "bg-white border-black/[0.08] text-black w-10"
        } h-10`}
      >
        {isCancelled && (
           <motion.div 
             initial={{ opacity: 0 }}
             animate={{ opacity: [1, 0] }}
             transition={{ duration: 1 }}
             className="absolute inset-0 rounded-xl border-2 border-red-500 pointer-events-none" 
           />
        )}
        {secondary && (
          <motion.span 
            animate={isLongPressing ? {
              scale: [1, 1.4, 1.2],
              opacity: [0.3, 1, 0.8],
              filter: ["blur(0px)", "blur(1px)", "blur(0px)"],
              color: ["#000000", "#0095f6", "#0095f6"],
              transition: { repeat: Infinity, duration: 0.6 }
            } : {}}
            className="absolute top-1 right-1 text-[7px] font-black opacity-30 leading-none">
            {secondary}
          </motion.span>
        )}
        <span className={`leading-none font-bold tracking-tighter ${isSwitch ? 'text-[10px] uppercase' : 'text-lg'}`}>
          {letter}
        </span>
      </motion.div>
    </div>
  );
}

