"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { motion } from "framer-motion";
import { Search, Bell, Landmark, Database, Loader2, ArrowLeft, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import Link from "next/link";

export default function SharePointTestPage() {
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);

    const fetchSPData = async (targetPage: number = 1) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/sharepoint/list?page=${targetPage}&pageSize=50`);
            const data = await res.json();
            if (data.success) {
                setItems(data.items);
                setHasMore(data.hasMore);
                setPage(data.page);
            } else {
                throw new Error(data.error || 'Error al obtener datos de SharePoint');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSPData(1);
    }, []);

    const handleNextPage = () => {
        if (hasMore) fetchSPData(page + 1);
    };

    const handlePrevPage = () => {
        if (page > 1) fetchSPData(page - 1);
    };

    return (
        <div className="min-h-screen bg-[#f8fafc] flex">
            <Sidebar />

            <main className="flex-1 md:ml-64 relative bg-[#f8fafc]">
                <header className="h-20 bg-white/80 backdrop-blur-xl border-b border-gray-100 flex items-center justify-between px-6 sticky top-0 z-10">
                    <div className="flex items-center gap-4">
                        <Link href="/aprobacion-facturas">
                            <Button variant="ghost" className="h-10 w-10 p-0 rounded-full">
                                <ArrowLeft className="h-5 w-5 text-gray-600" />
                            </Button>
                        </Link>
                        <div className="font-semibold text-gray-800 text-lg">Prueba de Integración SharePoint</div>
                    </div>
                    <div className="flex items-center gap-4">
                        <Button
                            variant="outline"
                            className="bg-white border-[#254153]/10 text-[#254153] hover:bg-gray-50"
                            onClick={() => fetchSPData(page)}
                            disabled={loading}
                        >
                            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                            Refrescar
                        </Button>
                    </div>
                </header>

                <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
                    <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-gray-100 flex flex-col md:flex-row gap-8 items-center">
                        <div className="h-20 w-20 rounded-2xl bg-[#254153]/5 flex items-center justify-center text-[#254153]">
                            <Database className="h-10 w-10" />
                        </div>
                        <div className="flex-1 text-center md:text-left">
                            <h2 className="text-2xl font-bold text-[#254153]">Visualización de SharePoint Online</h2>
                            <p className="text-gray-500 mt-1 max-w-2xl">
                                Esta página consulta en tiempo real la lista <code className="bg-gray-100 px-2 py-0.5 rounded text-[#254153] font-mono font-bold">Registro_de_Facturas</code>
                                en el sitio <code className="bg-gray-100 px-2 py-0.5 rounded text-[#254153] font-mono font-bold">FPKContabilidad</code>.
                                <span className="block mt-2 font-bold text-[#254153]">Mostrando registros 50 por página (Sincronización de Servidor).</span>
                            </p>
                        </div>
                        <div className="flex flex-col gap-2 w-full md:w-auto">
                            <div className="bg-green-50 text-green-700 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border border-green-100">
                                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                                Conexión Microsoft Graph Activa
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto min-h-[400px]">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center h-[400px] text-gray-400 gap-4">
                                    <Loader2 className="h-10 w-10 animate-spin text-[#254153]" />
                                    <p className="font-medium italic">Buscando página {page}...</p>
                                </div>
                            ) : error ? (
                                <div className="flex flex-col items-center justify-center h-[400px] text-center p-6">
                                    <div className="h-16 w-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4">
                                        <Landmark className="h-8 w-8" />
                                    </div>
                                    <h3 className="text-lg font-bold text-[#254153] mb-2 font-mono uppercase tracking-tighter italic whitespace-pre-wrap">¡Error de Sincronización!</h3>
                                    <p className="text-gray-500 max-w-sm font-mono uppercase tracking-tighter italic whitespace-pre-wrap leading-tight">{error}</p>
                                    <Button onClick={() => fetchSPData(page)} className="mt-6 bg-[#254153]">Reintentar Conexión</Button>
                                </div>
                            ) : (
                                <>
                                    <table className="w-full text-left">
                                        <thead className="bg-[#f8fafc] border-b border-gray-100">
                                            <tr>
                                                <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">ID SharePoint</th>
                                                <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Nit</th>
                                                <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Proveedor</th>
                                                <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Nro Factura</th>
                                                <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Estado Doliente</th>
                                                <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Estado Contabilidad</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {items.map((item) => (
                                                <motion.tr
                                                    initial={{ opacity: 0 }}
                                                    animate={{ opacity: 1 }}
                                                    key={`${item.id}-${item.Nro_Factura}`}
                                                    className="hover:bg-gray-50/50 transition-all group"
                                                >
                                                    <td className="px-8 py-5">
                                                        <span className="bg-gray-100/50 text-gray-500 px-2 py-1 rounded text-[10px] font-mono font-bold">
                                                            #{item.id}
                                                        </span>
                                                    </td>
                                                    <td className="px-8 py-5 text-sm font-medium text-gray-600 line-clamp-1">{item.Nit}</td>
                                                    <td className="px-8 py-5 text-sm font-bold text-[#254153]">{item.Proveedor}</td>
                                                    <td className="px-8 py-5 text-sm font-black text-[#254153] font-mono tracking-tighter">{item.Nro_Factura}</td>
                                                    <td className="px-8 py-5">
                                                        <StatusBadge status={item.Aprobacion_Doliente} />
                                                    </td>
                                                    <td className="px-8 py-5">
                                                        <StatusBadge status={item.Gestion_Contabilidad} />
                                                    </td>
                                                </motion.tr>
                                            ))}
                                        </tbody>
                                    </table>

                                    <div className="p-6 border-t border-gray-100 flex items-center justify-between bg-[#f8fafc]/50">
                                        <div className="text-sm font-medium text-gray-500 tracking-tighter uppercase font-mono italic">
                                            Página <span className="text-[#254153] font-black">{page}</span>
                                        </div>
                                        <div className="flex gap-4">
                                            <Button
                                                variant="outline"
                                                disabled={page === 1 || loading}
                                                onClick={handlePrevPage}
                                                className="bg-white"
                                            >
                                                <ArrowLeft className="mr-2 h-4 w-4" /> Anterior
                                            </Button>
                                            <Button
                                                variant="outline"
                                                disabled={!hasMore || loading}
                                                onClick={handleNextPage}
                                                className="bg-white"
                                            >
                                                Siguiente <ExternalLink className="ml-2 h-4 w-4 rotate-90" />
                                            </Button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

function StatusBadge({ status }: { status: string | null | undefined }) {
    const s = status?.toLowerCase() || '';
    let colorClass = "bg-gray-100 text-gray-500 border-gray-200";

    if (s.includes('aprobado') || s.includes('procesado')) colorClass = "bg-green-50 text-green-700 border-green-100";
    if (s.includes('rechazado')) colorClass = "bg-red-50 text-red-700 border-red-100";
    if (s.includes('aprobar')) colorClass = "bg-yellow-50 text-yellow-700 border-yellow-100 font-mono italic tracking-tighter uppercase";

    return (
        <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold border ${colorClass} uppercase tracking-wider`}>
            {status || 'S/E'}
        </span>
    );
}
