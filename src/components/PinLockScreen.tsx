import React, { useState } from 'react';
import { Lock, Delete } from 'lucide-react';

interface PinLockScreenProps {
  expectedPin: string;
  onUnlock: () => void;
}

export const PinLockScreen: React.FC<PinLockScreenProps> = ({ expectedPin, onUnlock }) => {
  const [entry, setEntry] = useState('');
  const [error, setError] = useState(false);

  const handleDigit = (digit: string) => {
    if (entry.length >= 4) return;
    const next = entry + digit;
    setError(false);
    setEntry(next);
    if (next.length === 4) {
      if (next === expectedPin) {
        onUnlock();
      } else {
        setError(true);
        setTimeout(() => {
          setEntry('');
          setError(false);
        }, 450);
      }
    }
  };

  const handleBackspace = () => {
    setError(false);
    setEntry((prev) => prev.slice(0, -1));
  };

  return (
    <div className="fixed inset-0 z-50 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-2xl flex flex-col items-center justify-center p-6">
      <div className="w-12 h-12 rounded-2xl bg-[#007AFF]/10 text-[#007AFF] flex items-center justify-center mb-4">
        <Lock className="w-6 h-6" />
      </div>
      <h2 className="font-display text-xl font-bold text-zinc-900 dark:text-white mb-1">
        YouMessage Locked
      </h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
        Enter your 4-digit security passcode
      </p>

      <div className={`flex items-center gap-4 mb-8 ${error ? 'animate-bounce' : ''}`}>
        {[0, 1, 2, 3].map((idx) => (
          <div
            key={idx}
            className={`w-3.5 h-3.5 rounded-full transition-all ${
              idx < entry.length
                ? error
                  ? 'bg-red-500 scale-110'
                  : 'bg-[#007AFF] scale-110'
                : 'border-2 border-zinc-300 dark:border-zinc-700'
            }`}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4 max-w-[260px] w-full">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => handleDigit(d)}
            className="h-16 rounded-full bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-xl font-semibold text-zinc-900 dark:text-white tabular-nums transition-colors cursor-pointer"
          >
            {d}
          </button>
        ))}
        <div />
        <button
          type="button"
          onClick={() => handleDigit('0')}
          className="h-16 rounded-full bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-xl font-semibold text-zinc-900 dark:text-white tabular-nums transition-colors cursor-pointer"
        >
          0
        </button>
        <button
          type="button"
          onClick={handleBackspace}
          aria-label="Backspace"
          className="h-16 rounded-full flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
        >
          <Delete className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
};
