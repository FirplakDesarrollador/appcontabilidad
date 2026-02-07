"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { Button } from "@/components/ui/Button";
import { RefreshCw, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function CargueTrmPage() {
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
                                <RefreshCw className="h-8 w-8 text-[#254153]" />
                            </div>
                        </div>
                    </div>

                    {/* Content Placeholder */}
                    <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 flex flex-col items-center justify-center min-h-[400px] text-center space-y-6">
                        <div className="bg-blue-50 p-6 rounded-full">
                            <RefreshCw className="h-12 w-12 text-blue-500 animate-spin-slow" />
                        </div>
                        <div className="max-w-md">
                            <h2 className="text-xl font-semibold text-[#254153]">Módulo en preparación</h2>
                            <p className="text-gray-500 mt-2">
                                Este espacio está reservado para la funcionalidad de carga automática y manual de la TRM hacia SAP.
                            </p>
                        </div>
                        <Button className="flex items-center gap-2">
                            <RefreshCw className="h-4 w-4" />
                            Sincronizar ahora (Demo)
                        </Button>
                    </div>

                    {/* Features List */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[
                            { title: "Sincronización diaria", desc: "Obtención automática de la TRM del Banco de la República." },
                            { title: "Cálculo de EUR", desc: "Cálculo automático de la tasa EUR basada en la TRM del día." },
                            { title: "Inserción en SAP", desc: "Conexión directa con SAP B1 para actualización de tablas." }
                        ].map((feature, i) => (
                            <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                                <h3 className="font-semibold text-[#254153] mb-2">{feature.title}</h3>
                                <p className="text-sm text-gray-500">{feature.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
}
