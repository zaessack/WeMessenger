import React, { useState } from 'react';
import { Users } from 'lucide-react';

interface AvatarProps {
  src?: string;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  isOnline?: boolean;
  isGroup?: boolean;
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'w-7 h-7 text-[11px]',
  sm: 'w-9 h-9 text-xs',
  md: 'w-11 h-11 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-24 h-24 text-2xl',
};

const PALETTES = [
  'bg-sky-500/15 text-sky-700 dark:bg-sky-400/20 dark:text-sky-300',
  'bg-indigo-500/15 text-indigo-700 dark:bg-indigo-400/20 dark:text-indigo-300',
  'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/20 dark:text-emerald-300',
  'bg-amber-500/15 text-amber-700 dark:bg-amber-400/20 dark:text-amber-300',
  'bg-rose-500/15 text-rose-700 dark:bg-rose-400/20 dark:text-rose-300',
  'bg-teal-500/15 text-teal-700 dark:bg-teal-400/20 dark:text-teal-300',
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getPaletteIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) % PALETTES.length;
  }
  return Math.abs(hash);
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name,
  size = 'md',
  isOnline = false,
  isGroup = false,
  className = '',
}) => {
  const [imgError, setImgError] = useState(false);
  const sizeCls = SIZE_CLASSES[size];
  const paletteCls = PALETTES[getPaletteIndex(name || 'YouMessage')];

  return (
    <div className={`relative inline-flex shrink-0 ${className}`}>
      {src && !imgError ? (
        <img
          src={src}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className={`${sizeCls} rounded-full object-cover ring-1 ring-black/[0.06] dark:ring-white/[0.1]`}
        />
      ) : (
        <div
          className={`${sizeCls} ${paletteCls} rounded-full flex items-center justify-center font-semibold select-none ring-1 ring-black/[0.05] dark:ring-white/[0.08]`}
          aria-label={name}
        >
          {isGroup ? <Users className="w-1/2 h-1/2" /> : getInitials(name)}
        </div>
      )}
      {isOnline && (
        <span
          title="Online"
          className="absolute bottom-0 right-0 block w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-zinc-950"
        />
      )}
    </div>
  );
};
