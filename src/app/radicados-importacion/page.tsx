"use client";

import React, { useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { motion } from "framer-motion";
import { Menu, Search, Ship, Download, Filter, Plus } from "lucide-react";
import { useSidebar } from "@/context/SidebarContext";
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule, themeQuartz } from 'ag-grid-community';

ModuleRegistry.registerModules([AllCommunityModule]);

const AG_GRID_LOCALE_ES = {
    noRowsToShow: 'No hay radicados para mostrar',
};

const MOCK_DATA = [
    {
        id: "IMP-001",
        proveedor: "Global Logistics Ltd",
        fecha: "2026-07-10",
        estado: "En Tránsito",
        valor: "$45,000 USD",
        bl: "HLCU1234567"
    },
    {
        id: "IMP-002",
        proveedor: "Tech Imports Co.",
        fecha: "2026-07-12",
        estado: "Aduana",
        valor: "$12,500 USD",
        bl: "MSC98765432"
    }
];

export default function RadicadosImportacionPage() {
    const { toggleSidebar } = useSidebar();
    const [searchTerm, setSearchTerm] = useState("");

    const columnDefs: any = [
        { headerName: 'ID Radicado', field: 'id', width: 130 },
        { headerName: 'Proveedor', field: 'proveedor', flex: 1 },
        { headerName: 'B/L (Bill of Lading)', field: 'bl', width: 180 },
        { headerName: 'Fecha', field: 'fecha', width: 130 },
        { headerName: 'Valor', field: 'valor', width: 130 },
        { 
            headerName: 'Estado', 
            field: 'estado', 
            width: 150,
            cellRenderer: (p: any) => (
                <div className="h-full flex items-center">
                    <span className="px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800">
                        {p.value}
                    </span>
                </div>
            )
        }
    ];

    return (
        <div className="flex h-screen bg-[#f8fafc] overflow-hidden font-sans">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
                {/* Header Navbar */}
                <header className="h-16 bg-white border-b border-gray-200 shrink-0 flex items-center justify-between px-4 sm:px-6 z-10 shadow-sm">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={toggleSidebar}
                            className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-500 hover:text-[#254153]"
                        >
                            <Menu className="h-5 w-5" />
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        <button className="h-10 px-4 bg-[#254153] hover:bg-[#1a2e3b] text-white rounded-xl font-medium transition-all flex items-center gap-2 text-sm shadow-sm">
                            <Plus className="h-4 w-4" />
                            <span className="hidden sm:inline">Nuevo Radicado</span>
                        </button>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
                    <div className="max-w-7xl mx-auto space-y-6">
                        
                        {/* Title & Stats */}
                        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="space-y-1"
                            >
                                <div className="flex items-center gap-3 text-blue-600 mb-2">
                                    <div className="p-2 bg-blue-100 rounded-lg">
                                        <Ship className="h-5 w-5" />
                                    </div>
                                    <span className="text-sm font-bold tracking-wider uppercase">Módulo de Importaciones</span>
                                </div>
                                <h2 className="text-3xl font-extrabold text-[#254153]">Radicados de Importación</h2>
                                <p className="text-gray-500 mt-1 font-medium flex items-center gap-2">
                                    <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                                    Modo Visual - En desarrollo
                                </p>
                            </motion.div>
                        </div>

                        {/* Search & Filters */}
                        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-4 items-center justify-between">
                            <div className="relative w-full sm:max-w-md">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar por radicado, proveedor o B/L..."
                                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:border-[#254153] focus:ring-1 focus:ring-[#254153] outline-none transition-all text-sm"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            
                            <div className="flex items-center gap-2 w-full sm:w-auto">
                                <button className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-colors">
                                    <Filter className="h-4 w-4" />
                                    Filtros
                                </button>
                                <button className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-colors">
                                    <Download className="h-4 w-4" />
                                    Exportar
                                </button>
                            </div>
                        </div>

                        {/* Data Grid */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-[500px]">
                            <div className="flex-1 w-full relative">
                                <AgGridReact
                                    rowData={MOCK_DATA}
                                    columnDefs={columnDefs}
                                    theme={themeQuartz}
                                    localeText={AG_GRID_LOCALE_ES}
                                    headerHeight={48}
                                    rowHeight={60}
                                    className="h-full w-full custom-ag-grid"
                                    defaultColDef={{
                                        sortable: true,
                                        filter: true,
                                        resizable: true,
                                        suppressMovable: true,
                                    }}
                                />
                            </div>
                        </div>

                    </div>
                </main>
            </div>
        </div>
    );
}
