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

const getStatusStyles = (status: string) => {
    switch (status?.toLowerCase()) {
        case "aprobado": return "bg-emerald-50 text-emerald-600 border-emerald-200 shadow-sm";
        case "rechazado": return "bg-red-50 text-red-600 border-red-200 shadow-sm";
        case "por procesar": return "bg-blue-50 text-blue-600 border-blue-200 shadow-sm";
        case "procesado": return "bg-purple-50 text-purple-600 border-purple-200 shadow-sm";
        case "por aprobar":
        case "pendiente": return "bg-amber-50 text-amber-600 border-amber-200 shadow-sm";
        default: return "bg-gray-50 text-gray-600 border-gray-200 shadow-sm";
    }
};

const MOCK_DATA = [
    {
        id: "IMP-001",
        Nit: "901234567-8",
        Proveedor: "Global Logistics Ltd",
        Nro_Factura: "INV-2026-001",
        Monto: 45000000,
        Responsable_de_Autorizar: "Carlos Mario Restrepo",
        Aprobacion_Doliente: "Por Aprobar",
        Gestion_Contabilidad: "Pendiente",
        Consecutivo: "CON-7001",
        Created: "2026-07-10T08:00:00Z",
        centro_costos: "[]",
        Observaciones: "Servicios logísticos",
        Attachments: true
    },
    {
        id: "IMP-002",
        Nit: "890112233-4",
        Proveedor: "Tech Imports Co.",
        Nro_Factura: "INV-2026-089",
        Monto: 12500000,
        Responsable_de_Autorizar: "Andrea Gómez",
        Aprobacion_Doliente: "Aprobado",
        Gestion_Contabilidad: "Por Procesar",
        Consecutivo: "CON-7002",
        Created: "2026-07-12T10:30:00Z",
        FechaAprobacion: "2026-07-13T09:00:00Z",
        centro_costos: "[]",
        Observaciones: "Compra de equipos",
        Attachments: false
    }
];

export default function RadicadosImportacionPage() {
    const { toggleSidebar } = useSidebar();
    const [searchTerm, setSearchTerm] = useState("");

    const formatCurrency = (value: any) => {
        if (!value) return "$0";
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0
        }).format(Number(value));
    };

    const columnDefs: any = [
        {
            headerName: 'Acciones',
            field: 'id',
            width: 160,
            pinned: 'left',
            filter: false,
            sortable: false,
            cellRenderer: (params: any) => (
                <div className="flex items-center justify-start gap-2 h-full">
                    <button className="h-8 w-8 p-0 text-gray-400 border border-gray-100 hover:bg-gray-50 bg-white rounded-lg transition-all shadow-sm flex items-center justify-center">
                        <Search className="h-3.5 w-3.5" />
                    </button>
                </div>
            )
        },
        { headerName: 'NIT', field: 'Nit', width: 130, cellRenderer: (p: any) => <div className="text-xs font-bold text-gray-600 h-full flex items-center">{p.value || "N/A"}</div> },
        { headerName: 'Proveedor', field: 'Proveedor', width: 250, cellRenderer: (p: any) => <div className="text-sm font-bold text-gray-800 h-full flex items-center">{p.value || "N/A"}</div> },
        { headerName: 'Factura', field: 'Nro_Factura', width: 160, cellRenderer: (p: any) => <div className="flex flex-col justify-center h-full"><div className="font-bold text-[#254153] leading-none">{p.value || "S/N"}</div><div className="text-[10px] text-gray-400 mt-1 font-medium tracking-tight">REF: {p.data?.id}</div></div> },
        { headerName: 'Valor total', field: 'Monto', width: 140, cellRenderer: (p: any) => <div className="text-sm font-extrabold text-[#254153] h-full flex items-center">{formatCurrency(p.value)}</div> },
        { headerName: 'Responsable', field: 'Responsable_de_Autorizar', width: 200, cellRenderer: (p: any) => <div className="flex flex-col justify-center h-full"><div className="text-xs font-semibold text-gray-600">{p.value || "Sin asignar"}</div><div className="text-[10px] text-gray-400 font-medium">{p.data?.Created ? new Date(p.data.Created).toLocaleDateString() : ""}</div></div> },
        { headerName: 'Estado', field: 'Aprobacion_Doliente', width: 140, cellRenderer: (p: any) => <div className="h-full flex items-center"><span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold border ${getStatusStyles(p.value)}`}>{p.value || "Pendiente"}</span></div> },
        { headerName: 'G. Contabilidad', field: 'Gestion_Contabilidad', width: 160, cellRenderer: (p: any) => <div className="text-[10px] font-bold text-gray-600 uppercase tracking-tight h-full flex items-center">{p.value || "Pendiente"}</div> },
        { headerName: 'Consecutivo', field: 'Consecutivo', width: 130, cellRenderer: (p: any) => <div className="text-xs font-bold text-gray-600 h-full flex items-center">{p.value || "N/A"}</div> },
        { headerName: 'Fecha Creación', field: 'Created', width: 160, cellRenderer: (p: any) => <div className="text-[10px] font-bold text-gray-500 uppercase tracking-tight h-full flex items-center">{p.value ? new Date(p.value).toLocaleString() : "Sin fecha"}</div> },
        { headerName: 'C. Costos / Cuenta', field: 'centro_costos', width: 250, cellRenderer: (p: any) => <div className="text-[10px] font-bold text-gray-500 w-full h-full flex items-center">{p.value}</div> },
        { headerName: 'Fecha Aprobación', field: 'FechaAprobacion', width: 160, cellRenderer: (p: any) => <div className="text-[10px] font-bold text-gray-500 uppercase tracking-tight h-full flex items-center">{p.value ? new Date(p.value).toLocaleString() : "Sin fecha"}</div> },
        { headerName: 'Observaciones', field: 'Observaciones', width: 300, cellRenderer: (p: any) => <div className="w-full text-xs font-medium text-gray-500 h-full flex items-center truncate" title={p.value}>{p.value || "Sin observaciones"}</div> },
        { headerName: 'Datos adjuntos', field: 'adjuntos_url', width: 150, filter: false, sortable: false, cellRenderer: (p: any) => <div className="h-full flex items-center">{(p.data?.Attachments) ? <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all border border-blue-100/50 cursor-pointer"><Search className="h-3.5 w-3.5" /><span className="text-[10px] font-black uppercase tracking-tight">Ver Adjunto</span></span> : <span className="text-[10px] text-gray-300 font-medium italic">Sin adjuntos</span>}</div> }
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
