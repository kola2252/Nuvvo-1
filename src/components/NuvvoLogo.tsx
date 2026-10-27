import React from 'react';
import { motion } from 'motion/react';

interface NuvvoLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  animate?: boolean;
  className?: string;
}

export default function NuvvoLogo({
  size = 'md',
  showText = true,
  animate = false,
  className = '',
}: NuvvoLogoProps) {
  const sizeMap = {
    sm: { box: 'w-8 h-8', text: 'text-base', sub: 'text-[9px]' },
    md: { box: 'w-14 h-14', text: 'text-2xl', sub: 'text-xs' },
    lg: { box: 'w-20 h-20', text: 'text-3xl', sub: 'text-sm' },
    xl: { box: 'w-28 h-28', text: 'text-4xl', sub: 'text-base' },
  };

  const currentSize = sizeMap[size] || sizeMap.md;

  const content = (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <div className={`relative ${currentSize.box} rounded-2xl overflow-hidden shadow-lg shadow-orange-500/20 flex items-center justify-center bg-gradient-to-tr from-orange-600 via-amber-500 to-yellow-400 p-0.5`}>
        <img
          src="/nuvvo-logo.png"
          alt="Nuvvo Logo"
          className="w-full h-full object-cover rounded-[14px]"
          onError={(e) => {
            // Fallback to stylized vector badge if PNG is loading
            (e.target as HTMLElement).style.display = 'none';
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center font-black text-white text-lg drop-shadow-md select-none pointer-events-none">
          N
        </div>
      </div>

      {showText && (
        <div className="text-center mt-2">
          <h1 className={`font-black tracking-tight text-zinc-900 dark:text-zinc-100 ${currentSize.text} leading-none`}>
            Nuvvo
          </h1>
          <p className={`font-bold tracking-widest uppercase text-orange-600 dark:text-orange-400 ${currentSize.sub} mt-0.5`}>
            Food & Fast Delivery
          </p>
        </div>
      )}
    </div>
  );

  if (animate) {
    return (
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        {content}
      </motion.div>
    );
  }

  return content;
}
