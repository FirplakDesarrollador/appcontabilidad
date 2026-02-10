"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { Button } from "@/components/ui/Button";
import { RefreshCw, ArrowLeft, TrendingUp, Landmark, Calendar, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";

interface TRMData {
    valor: string;
    unidad: string;
    vigenciadesde: string;
    vigenciahasta: string;
}

export default function CargueTrmPage() {
    const [trmData, setTrmData] = useState<TRMData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchTRM = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch("https://www.datos.gov.co/resource/32sa-8pi3.json?$limit=1&$order=vigenciadesde DESC");
            if (!response.ok) throw new Error("Error al obtener la TRM");
            const data = await response.json();
            if (data && data.length > 0) {
                setTrmData(data[0]);
            }
        } catch (err) {
            console.error("Fetch error:", err);
            setError("No se pudo cargar la TRM actual.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTRM();
    }, []);

    const formatCurrency = (value: string) => {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 2
        }).format(parseFloat(value));
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('es-CO', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });
    };

    return (
        <div className="flex h-screen bg-[#f8fafc]">
            <Sidebar />

            <main className="flex-1 md:ml-64 p-8 overflow-y-auto">
                <div className="max-w-4xl mx-auto space-y-8">
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
                                <h1 className="text-3xl font-bold text-[#254153]">Cargue de TRM en SAP</h1>
                                <p className="text-gray-500 mt-1">Sincronización manual de tasas de cambio con SAP Business One.</p>
                            </div>
                            <div className="bg-[#254153]/10 p-3 rounded-2xl">
                                <RefreshCw
                                    className={`h-8 w-8 text-[#254153] cursor-pointer transition-transform duration-500 ${loading ? 'animate-spin' : 'hover:rotate-180'}`}
                                    onClick={fetchTRM}
                                />
                            </div>
                        </div>
                    </div>

                    {/* TRM Cards Section */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* SFC TRM Card */}
                        <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 flex flex-col relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-5">
                                <Landmark className="h-24 w-24" />
                            </div>
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-blue-50 rounded-lg">
                                    <TrendingUp className="h-5 w-5 text-blue-600" />
                                </div>
                                <h2 className="text-lg font-semibold text-[#254153]">TRM Oficial (SFC)</h2>
                            </div>

                            {loading ? (
                                <div className="flex flex-col gap-2 animate-pulse">
                                    <div className="h-10 w-32 bg-gray-100 rounded-lg"></div>
                                    <div className="h-4 w-48 bg-gray-50 rounded"></div>
                                </div>
                            ) : error ? (
                                <div className="flex flex-col gap-2 text-red-500">
                                    <div className="flex items-center gap-2">
                                        <AlertCircle className="h-4 w-4" />
                                        <p className="text-sm">{error}</p>
                                    </div>
                                    <button onClick={fetchTRM} className="text-xs underline text-left">Reintentar</button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div>
                                        <p className="text-4xl font-bold text-[#254153]">
                                            {trmData ? formatCurrency(trmData.valor) : "$0,00"}
                                        </p>
                                        <div className="flex items-center gap-2 mt-2 text-gray-500 text-sm">
                                            <Calendar className="h-4 w-4" />
                                            <span>Vigencia: {trmData ? formatDate(trmData.vigenciadesde) : "---"}</span>
                                        </div>
                                    </div>
                                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium">
                                        Sincronizado con SFC
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* SAP TRM Card */}
                        <div className="bg-[#254153] rounded-3xl p-8 shadow-lg border border-[#254153]/50 flex flex-col relative overflow-hidden text-white">
                            <div className="absolute top-0 right-0 p-4 opacity-10">
                                <RefreshCw className="h-24 w-24" />
                            </div>
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-white/10 rounded-lg">
                                    <Landmark className="h-5 w-5 text-blue-300" />
                                </div>
                                <h2 className="text-lg font-semibold">TRM en SAP</h2>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <p className="text-4xl font-bold">$0,00</p>
                                    <p className="text-blue-200/60 text-sm mt-2">Valor actual configurado</p>
                                </div>
                                <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 text-blue-200 rounded-full text-xs font-medium italic">
                                    Recurso SAP en preparación
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Action Button */}
                    <div className="flex justify-center py-4">
                        <Button
                            className="bg-[#254153] hover:bg-[#1a2e3b] text-white px-8 py-6 rounded-2xl flex items-center gap-3 text-lg transition-all hover:scale-[1.02] active:scale-95 shadow-xl shadow-blue-900/10 disabled:opacity-50"
                            disabled={loading || !!error}
                        >
                            <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
                            Sincronizar ahora hacia SAP
                        </Button>
                    </div>

                    {/* Features List */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[
                            { title: "Sincronización diaria", desc: "Obtención automática de la TRM del Banco de la República." },
                            { title: "Cálculo de EUR", desc: "Cálculo automático de la tasa EUR basada en la TRM del día." },
                            { title: "Inserción en SAP", desc: "Conexión directa con SAP B1 para actualización de tablas." }
                        ].map((feature, i) => (
                            <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                                <h3 className="font-semibold text-[#254153] mb-2">{feature.title}</h3>
                                <p className="text-sm text-gray-500 leading-relaxed">{feature.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
}
