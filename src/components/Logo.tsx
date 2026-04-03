import React from 'react';
import { motion } from 'motion/react';

export const ThothLogo = ({ className = "w-12 h-12" }: { className?: string }) => {
  return (
    <motion.div 
      whileHover={{ scale: 1.1, rotate: 5 }}
      className={`${className} relative flex items-center justify-center`}
    >
      <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_0_15px_rgba(255,78,0,0.4)]">
        {/* Stylized Moon/Crescent */}
        <path 
          d="M75,50 A25,25 0 1,1 25,50 A25,25 0 1,1 75,50" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2" 
          strokeDasharray="4 2"
          className="text-dream-accent/30"
        />
        
        {/* Thoth's Stylized Ibis/Scribe Symbol */}
        <motion.path
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 2, ease: "easeInOut" }}
          d="M35,40 C35,40 45,30 55,30 C65,30 70,40 65,55 C60,70 45,75 35,75 L30,75 L30,70 C30,70 40,65 45,55 C50,45 45,40 35,40"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          className="text-white"
        />
        
        {/* The "Atomic" Dot */}
        <motion.circle
          initial={{ scale: 0 }}
          animate={{ scale: [0, 1.5, 1] }}
          transition={{ delay: 1.5, duration: 0.5 }}
          cx="65" cy="55" r="4"
          className="fill-dream-accent"
        />
        
        {/* Stylized Quill/Reed */}
        <motion.line
          initial={{ x1: 30, y1: 75, x2: 30, y2: 75 }}
          animate={{ x1: 30, y1: 75, x2: 20, y2: 85 }}
          transition={{ delay: 1, duration: 0.8 }}
          stroke="currentColor"
          strokeWidth="2"
          className="text-dream-accent"
        />
      </svg>
    </motion.div>
  );
};
