import React, { useState, useRef, useEffect } from 'react';
import { FiChevronDown, FiCheck } from 'react-icons/fi';

export interface ThemeSelectOption {
  value: string;
  label: string;
  badge?: string;
}

interface ThemeSelectProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: ThemeSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  dropUp?: boolean;
}

export const ThemeSelect: React.FC<ThemeSelectProps> = ({
  label,
  value,
  onChange,
  options,
  placeholder = 'Select option...',
  disabled = false,
  className = '',
  dropUp = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  const selectedOpt = options.find((o) => o.value === value);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
          {label}
        </label>
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between gap-2 p-2.5 rounded-xl border ${
          isOpen
            ? 'border-epso-red dark:border-amber-500 ring-2 ring-epso-red/20 dark:ring-amber-500/20'
            : 'border-stone-200 dark:border-[#2E2828] hover:border-stone-400 dark:hover:border-stone-600'
        } bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white text-xs font-semibold transition-all cursor-pointer text-left press-apple`}
      >
        <span className="truncate">
          {selectedOpt ? selectedOpt.label : placeholder}
        </span>
        <div className="flex items-center gap-1.5 shrink-0 text-stone-400">
          {selectedOpt?.badge && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-300 font-bold">
              {selectedOpt.badge}
            </span>
          )}
          <FiChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {isOpen && (
        <div
          className={`absolute left-0 right-0 ${
            dropUp ? 'bottom-full mb-1.5 origin-bottom' : 'top-full mt-1.5 origin-top'
          } z-50 bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 p-1`}
        >
          <div className="max-h-56 overflow-y-auto no-scrollbar space-y-0.5">
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <div
                  key={opt.value}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  className={`px-3 py-2 rounded-xl text-xs flex items-center justify-between cursor-pointer transition-colors font-malayalam ${
                    isSelected
                      ? 'bg-red-50 dark:bg-amber-950/40 text-epso-red dark:text-amber-400 font-bold'
                      : 'text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#282323]'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {opt.badge && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400">
                        {opt.badge}
                      </span>
                    )}
                    {isSelected && (
                      <FiCheck className="w-3.5 h-3.5 text-epso-red dark:text-amber-400 shrink-0 ml-1" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
