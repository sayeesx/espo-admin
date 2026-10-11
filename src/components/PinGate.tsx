import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { FiSun, FiMoon, FiAlertCircle } from 'react-icons/fi';

export const PinGate: React.FC = () => {
  const { loginWithPin, isLoading } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [digits, setDigits] = useState<string[]>(['', '', '', '', '']);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [shake, setShake] = useState<boolean>(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleDigitChange = async (index: number, val: string) => {
    const char = val.replace(/\D/g, '').slice(-1);
    const newDigits = [...digits];
    newDigits[index] = char;
    setDigits(newDigits);
    setErrorMsg('');

    if (char && index < 4) {
      inputRefs.current[index + 1]?.focus();
    }

    if (char && index === 4 && newDigits.every((d) => d !== '')) {
      const fullPin = newDigits.join('');
      await submitPin(fullPin);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 5);
    if (!pasted) return;

    const newDigits = ['', '', '', '', ''];
    for (let i = 0; i < pasted.length; i++) {
      newDigits[i] = pasted[i];
    }
    setDigits(newDigits);

    if (pasted.length === 5) {
      await submitPin(pasted);
    } else {
      inputRefs.current[pasted.length]?.focus();
    }
  };

  const submitPin = async (pin: string) => {
    const res = await loginWithPin(pin);
    if (!res.success) {
      setErrorMsg(res.error || 'തെറ്റായ പിൻ (Incorrect PIN)');
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setDigits(['', '', '', '', '']);
      inputRefs.current[0]?.focus();
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between items-center bg-[#F8F9FA] dark:bg-[#141212] p-4 text-[#141212] dark:text-white transition-colors duration-200">
      {/* Top Bar with Theme Toggle */}
      <div className="w-full max-w-sm flex justify-between items-center py-2">
        <div className="flex items-center gap-2">
          <img
            src="/favicon.png"
            alt="Epso"
            className="w-7 h-7 object-contain drop-shadow"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <span className="text-xs font-bold tracking-wider uppercase text-epso-red dark:text-amber-400">
            Epso Admin
          </span>
        </div>
        <button
          onClick={toggleTheme}
          type="button"
          aria-label="Toggle theme"
          className="p-2 rounded-xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] text-stone-600 dark:text-stone-300 press-apple"
        >
          {theme === 'dark' ? <FiSun className="w-4 h-4 text-amber-400" /> : <FiMoon className="w-4 h-4 text-stone-700" />}
        </button>
      </div>

      {/* Main PIN Prompt Box */}
      <div className={`w-full max-w-sm flex flex-col items-center my-auto transition-transform ${shake ? 'animate-bounce' : ''}`}>
        <p className="text-sm font-semibold text-stone-600 dark:text-stone-400 mb-6 font-malayalam text-center">
          അഡ്മിൻ 5 അക്ക പിൻ നൽകുക
          <span className="block text-xs font-normal text-stone-400 dark:text-stone-500 font-sans mt-0.5">
            Enter your 5 digit PIN
          </span>
        </p>

        {/* 5 Individual OTP Boxes */}
        <div className="flex justify-center gap-3 w-full my-2">
          {digits.map((digit, idx) => (
            <input
              key={idx}
              ref={(el) => { inputRefs.current[idx] = el; }}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              value={digit}
              autoComplete="one-time-code"
              onChange={(e) => handleDigitChange(idx, e.target.value)}
              onKeyDown={(e) => handleKeyDown(idx, e)}
              onPaste={handlePaste}
              className={`w-12 h-14 sm:w-14 sm:h-16 text-center text-2xl font-bold rounded-2xl border transition-all duration-150 outline-none
                ${digit
                  ? 'border-epso-red dark:border-amber-500 bg-red-50/40 dark:bg-amber-950/20 text-stone-900 dark:text-white ring-2 ring-epso-red/30 dark:ring-amber-500/30'
                  : 'border-stone-300 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-stone-900 dark:text-white hover:border-stone-400 focus:border-epso-red dark:focus:border-amber-500 focus:ring-2 focus:ring-epso-red/30'
                }`}
            />
          ))}
        </div>

        {/* Loading Spinner */}
        {isLoading && (
          <div className="flex items-center gap-2 mt-4 text-xs font-medium text-stone-500 dark:text-stone-400">
            <div className="w-4 h-4 border-2 border-epso-red border-t-transparent rounded-full animate-spin" />
            <span>പരിശോധിക്കുന്നു... (Verifying)</span>
          </div>
        )}

        {/* Error message */}
        {errorMsg && (
          <div className="flex items-center gap-1.5 mt-4 text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-3 py-2 rounded-xl border border-red-200 dark:border-red-900/50">
            <FiAlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="w-full max-w-sm text-center py-4">
        <p className="text-[11px] text-stone-400 dark:text-stone-500">
          Epso Production & Inventory Management • Admin Portal
        </p>
      </div>
    </div>
  );
};
