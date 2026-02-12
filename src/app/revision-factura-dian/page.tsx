"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { ArrowLeft, RefreshCw, AlertCircle, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { RegistroFactura } from "@/types";

export default function RevisionFacturaDianPage() {
    const [facturas, setFacturas] = useState<RegistroFactura[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filters, setFilters] = useState({
        CreadoStart: "",
        CreadoEnd: "",
        Proveedor: "",
        Nit: "",
        Nro_Factura: "",
        "Valor total": "",
        FechaStart: "",
        FechaEnd: "",
        Gestion_Contabilidad: ""
    });

    const fetchFacturas = async () => {
        setLoading(true);
        setError(null);
        try {
            const { data, error } = await supabase
                .from("Registro_Facturas")
                .select("*")
                .order("ID", { ascending: false }) // Or we can organize by "Creado" if it's a timestamp
                .limit(200); // Increased limit for range filtering

            if (error) throw error;

            setFacturas(data || []);
        } catch (err: any) {
            console.error("Error fetching facturas:", err);
            setError(err.message || "Error al cargar las facturas.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFacturas();
    }, []);

    const filteredFacturas = useMemo(() => {
        let sorted = [...facturas].sort((a, b) => {
            const dateA = a.Creado ? new Date(a.Creado).getTime() : 0;
            const dateB = b.Creado ? new Date(b.Creado).getTime() : 0;
            return dateB - dateA;
        });

        return sorted.filter((f) => {
            const createdDate = f.Creado ? new Date(f.Creado).getTime() : null;
            const approvedDate = f.FechaAprobacion ? new Date(f.FechaAprobacion).getTime() : null;

            const startCreado = filters.CreadoStart ? new Date(filters.CreadoStart).getTime() : null;
            const endCreado = filters.CreadoEnd ? new Date(filters.CreadoEnd).getTime() : null;

            const startFecha = filters.FechaStart ? new Date(filters.FechaStart).getTime() : null;
            const endFecha = filters.FechaEnd ? new Date(filters.FechaEnd).getTime() : null;

            const matchesCreadoRange = (!startCreado || (createdDate && createdDate >= startCreado)) &&
                (!endCreado || (createdDate && createdDate <= endCreado + 86400000)); // Add one day to include the end date

            const matchesFechaRange = (!startFecha || (approvedDate && approvedDate >= startFecha)) &&
                (!endFecha || (approvedDate && approvedDate <= endFecha + 86400000));

            return (
                matchesCreadoRange &&
                matchesFechaRange &&
                (f.Proveedor?.toLowerCase().includes(filters.Proveedor.toLowerCase()) ?? true) &&
                (f.Nit?.toLowerCase().includes(filters.Nit.toLowerCase()) ?? true) &&
                (f.Nro_Factura?.toLowerCase().includes(filters.Nro_Factura.toLowerCase()) ?? true) &&
                (f["Valor total"]?.toLowerCase().includes(filters["Valor total"].toLowerCase()) ?? true) &&
                (f.Gestion_Contabilidad?.toLowerCase().includes(filters.Gestion_Contabilidad.toLowerCase()) ?? true)
            );
        });
    }, [facturas, filters]);

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    return (
        <div className="flex h-screen bg-[#f8fafc]">
            <Sidebar />

            <main className="flex-1 md:ml-64 p-8 overflow-y-auto">
                <div className="max-w-7xl mx-auto space-y-8">
                    {/* Header */}
                    <div className="flex flex-col gap-4">
                        <Link
                            href="/"
                            className="flex items-center gap-2 text-sm text-gray-500 hover:text-[#254153] transition-colors w-fit"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            Volver al Dashboard
                        </Link>
                        <div className="flex items-center justify-between">
                            <div>
                                <h1 className="text-3xl font-bold text-[#254153]">Revisión de factura DIAN</h1>
                                <p className="text-gray-500 mt-1">Gestión y revisión de facturas electrónicas enviados a la DIAN.</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-sm text-gray-400">{filteredFacturas.length} registros encontrados</span>
                                <button
                                    onClick={fetchFacturas}
                                    disabled={loading}
                                    className="p-2 bg-white rounded-lg shadow-sm hover:shadow-md transition-all text-[#254153] disabled:opacity-50"
                                >
                                    <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Content Section */}
                    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                        {loading && facturas.length === 0 ? (
                            <div className="p-12 flex justify-center">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#254153]"></div>
                            </div>
                        ) : error ? (
                            <div className="p-12 flex flex-col items-center gap-4 text-red-500">
                                <AlertCircle className="h-12 w-12" />
                                <p>{error}</p>
                                <button onClick={fetchFacturas} className="text-sm underline">Reintentar</button>
                            </div>
                        ) : facturas.length === 0 ? (
                            <div className="p-12 text-center text-gray-500">
                                No se encontraron facturas.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                                        <tr>
                                            <th className="px-6 py-4">
                                                <div className="flex flex-col gap-2 min-w-[150px]">
                                                    <span>Creado</span>
                                                    <div className="flex flex-col gap-1">
                                                        <input
                                                            type="date"
                                                            name="CreadoStart"
                                                            value={filters.CreadoStart}
                                                            onChange={handleFilterChange}
                                                            className="w-full px-2 py-1 text-[10px] border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#254153] font-normal"
                                                        />
                                                        <input
                                                            type="date"
                                                            name="CreadoEnd"
                                                            value={filters.CreadoEnd}
                                                            onChange={handleFilterChange}
                                                            className="w-full px-2 py-1 text-[10px] border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#254153] font-normal"
                                                        />
                                                    </div>
                                                </div>
                                            </th>
                                            <th className="px-6 py-4">
                                                <div className="flex flex-col gap-2">
                                                    <span>Proveedor</span>
                                                    <div className="relative">
                                                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                                                        <input
                                                            type="text"
                                                            name="Proveedor"
                                                            value={filters.Proveedor}
                                                            onChange={handleFilterChange}
                                                            placeholder="Filtrar..."
                                                            className="w-full pl-7 pr-2 py-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#254153] font-normal"
                                                        />
                                                    </div>
                                                </div>
                                            </th>
                                            <th className="px-6 py-4">
                                                <div className="flex flex-col gap-2">
                                                    <span>NIT</span>
                                                    <div className="relative">
                                                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                                                        <input
                                                            type="text"
                                                            name="Nit"
                                                            value={filters.Nit}
                                                            onChange={handleFilterChange}
                                                            placeholder="Filtrar..."
                                                            className="w-full pl-7 pr-2 py-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#254153] font-normal"
                                                        />
                                                    </div>
                                                </div>
                                            </th>
                                            <th className="px-6 py-4">
                                                <div className="flex flex-col gap-2">
                                                    <span>Nro. Factura</span>
                                                    <div className="relative">
                                                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                                                        <input
                                                            type="text"
                                                            name="Nro_Factura"
                                                            value={filters.Nro_Factura}
                                                            onChange={handleFilterChange}
                                                            placeholder="Filtrar..."
                                                            className="w-full pl-7 pr-2 py-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#254153] font-normal"
                                                        />
                                                    </div>
                                                </div>
                                            </th>
                                            <th className="px-6 py-4">
                                                <div className="flex flex-col gap-2">
                                                    <span>Valor Total</span>
                                                    <div className="relative">
                                                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                                                        <input
                                                            type="text"
                                                            name="Valor total"
                                                            value={filters["Valor total"]}
                                                            onChange={handleFilterChange}
                                                            placeholder="Filtrar..."
                                                            className="w-full pl-7 pr-2 py-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#254153] font-normal"
                                                        />
                                                    </div>
                                                </div>
                                            </th>
                                            <th className="px-6 py-4">
                                                <div className="flex flex-col gap-2 min-w-[150px]">
                                                    <span>Fecha Aprobación</span>
                                                    <div className="flex flex-col gap-1">
                                                        <input
                                                            type="date"
                                                            name="FechaStart"
                                                            value={filters.FechaStart}
                                                            onChange={handleFilterChange}
                                                            className="w-full px-2 py-1 text-[10px] border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#254153] font-normal"
                                                        />
                                                        <input
                                                            type="date"
                                                            name="FechaEnd"
                                                            value={filters.FechaEnd}
                                                            onChange={handleFilterChange}
                                                            className="w-full px-2 py-1 text-[10px] border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#254153] font-normal"
                                                        />
                                                    </div>
                                                </div>
                                            </th>
                                            <th className="px-6 py-4">
                                                <div className="flex flex-col gap-2">
                                                    <span>Estado Contabilidad</span>
                                                    <select
                                                        name="Gestion_Contabilidad"
                                                        value={filters.Gestion_Contabilidad}
                                                        onChange={handleFilterChange}
                                                        className="w-full px-2 py-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#254153] font-normal"
                                                    >
                                                        <option value="">Todos</option>
                                                        <option value="Aprobado">Aprobado</option>
                                                        <option value="Rechazado">Rechazado</option>
                                                        <option value="Pendiente">Pendiente</option>
                                                    </select>
                                                </div>
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {filteredFacturas.map((factura) => (
                                            <tr key={factura.ID} className="hover:bg-gray-50/50 transition-colors">
                                                <td className="px-6 py-4 text-gray-500">{factura.Creado}</td>
                                                <td className="px-6 py-4 font-medium text-[#254153]">{factura.Proveedor}</td>
                                                <td className="px-6 py-4 text-gray-500">{factura.Nit}</td>
                                                <td className="px-6 py-4">{factura.Nro_Factura}</td>
                                                <td className="px-6 py-4 font-medium">{factura["Valor total"]}</td>
                                                <td className="px-6 py-4 text-gray-500">{factura.FechaAprobacion}</td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${factura.Gestion_Contabilidad === 'Aprobado'
                                                        ? 'bg-green-100 text-green-800'
                                                        : factura.Gestion_Contabilidad === 'Rechazado'
                                                            ? 'bg-red-100 text-red-800'
                                                            : 'bg-yellow-100 text-yellow-800'
                                                        }`}>
                                                        {factura.Gestion_Contabilidad || 'Pendiente'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {filteredFacturas.length === 0 && (
                                    <div className="p-12 text-center text-gray-500">
                                        No hay registros que coincidan con los filtros.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
