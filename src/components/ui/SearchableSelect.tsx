"use client";

import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { Search, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Option {
    id?: string | number;
    value: string;
    label: string;
}

interface SearchableSelectProps {
    options: Option[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
}

export function SearchableSelect({
    options,
    value,
    onChange,
    placeholder = "Seleccionar...",
    disabled = false,
    className
}: SearchableSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const containerRef = useRef<HTMLDivElement>(null);

    const selectedOption = options.find(opt => opt.value === value);

    const filteredOptions = options.filter(opt =>
        opt.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        opt.value.toLowerCase().includes(searchQuery.toLowerCase())
    ).slice(0, 100); // Limit to 100 for performance

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSelect = (val: string) => {
        onChange(val);
        setIsOpen(false);
        setSearchQuery("");
    };

    return (
        <div className={cn("relative w-full", className)} ref={containerRef}>
            <div
                onClick={() => !disabled && setIsOpen(!isOpen)}
                className={cn(
                    "flex h-11 w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm transition-all cursor-pointer",
                    disabled ? "bg-gray-50 text-gray-400 cursor-not-allowed" : "hover:border-[#254153]/50 focus:border-[#254153] focus:ring-2 focus:ring-[#254153]/10",
                    isOpen && "border-[#254153] ring-2 ring-[#254153]/10"
                )}
            >
                <div className="truncate font-medium text-gray-900">
                    {selectedOption ? selectedOption.label : <span className="text-gray-400">{placeholder}</span>}
                </div>
                <ChevronDown className={cn("h-4 w-4 text-gray-400 transition-transform duration-200", isOpen && "rotate-180")} />
            </div>

            {isOpen && (
                <div className="absolute z-50 mt-2 w-full rounded-2xl border border-gray-100 bg-white p-2 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                    <div className="relative mb-2">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                            autoFocus
                            type="text"
                            className="w-full rounded-xl border border-gray-100 bg-gray-50 py-2.5 pl-10 pr-4 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-[#254153]/10 transition-all font-medium"
                            placeholder="Buscar..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery("")}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>

                    <div className="max-h-[250px] overflow-y-auto space-y-0.5 custom-scrollbar">
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((opt) => (
                                <div
                                    key={opt.value}
                                    onClick={() => handleSelect(opt.value)}
                                    className={cn(
                                        "flex cursor-pointer items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                                        opt.value === value
                                            ? "bg-[#254153] text-white"
                                            : "text-gray-700 hover:bg-gray-100"
                                    )}
                                >
                                    {opt.label}
                                </div>
                            ))
                        ) : (
                            <div className="px-3 py-10 text-center text-sm text-gray-400 font-medium">
                                No se encontraron resultados
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
