"use client";

import { motion } from "framer-motion";

interface SwitchProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
}

export function Switch({ checked, onChange, disabled = false }: SwitchProps) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => !disabled && onChange(!checked)}
            className={`
                relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full 
                transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 
                focus:ring-[#254153]/20 focus:ring-offset-2 
                ${checked ? 'bg-[#254153]' : 'bg-gray-200'}
                ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
        >
            <motion.span
                animate={{ x: checked ? 20 : 4 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                className="inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform"
            />
        </button>
    );
}
