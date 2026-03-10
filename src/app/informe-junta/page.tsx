"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { 
    LayoutDashboard, 
    FileBarChart, 
    PieChart, 
    Calculator, 
    TrendingUp, 
    Building2, 
    ArrowRight,
    ArrowLeft
} from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";

export default function InformeJuntaPage() {
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!isMounted) return null;

    const reports = [
        { 
            title: "Estado de resultados mensual", 
            icon: FileBarChart, 
            description: "Análisis del rendimiento financiero del mes actual.",
            color: "text-blue-600",
            border: "border-blue-100",
            bg: "bg-blue-50"
        },
        { 
            title: "Estado de resultado acumulado", 
            icon: TrendingUp, 
            description: "Desempeño consolidado en lo que va del año.",
            color: "text-emerald-600",
            border: "border-emerald-100",
            bg: "bg-emerald-50"
        },
        { 
            title: "Situación financiera", 
            icon: PieChart, 
            description: "Balance general y estructura de activos/pasivos.",
            color: "text-purple-600",
            border: "border-purple-100",
            bg: "bg-purple-50"
        },
        { 
            title: "Estado del costo", 
            icon: Calculator, 
            description: "Detalle de costos de producción y operación.",
            color: "text-amber-600",
            border: "border-amber-100",
            bg: "bg-amber-50"
        },
        { 
            title: "Estado cambio patrimonio", 
            icon: Building2, 
            description: "Variaciones en el capital y reservas de la empresa.",
            color: "text-rose-600",
            border: "border-rose-100",
            bg: "bg-rose-50"
        }
    ];

    return (
        <div className="flex h-screen bg-[#f8fafc]">
            <Sidebar />

            <main className="flex-1 md:ml-64 p-8 overflow-y-auto">
                <div className="max-w-6xl mx-auto space-y-12">
                    {/* Header */}
                    <div className="flex flex-col gap-6">
                        <Link
                            href="/"
                            className="flex items-center gap-2 text-sm text-gray-400 hover:text-[#254153] transition-colors w-fit group"
                        >
                            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                            Volver al Dashboard
                        </Link>

                        <div className="space-y-2">
                            <motion.h1 
                                initial={{ opacity: 0, y: -20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="text-4xl font-extrabold text-[#254153]"
                            >
                                Informe Junta
                            </motion.h1>
                            <p className="text-gray-500 text-lg">Seleccione el reporte financiero que desea visualizar o descargar.</p>
                        </div>
                    </div>

                    {/* Report Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {reports.map((report, i) => (
                            <motion.button
                                key={i}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: i * 0.1 }}
                                whileHover={{ y: -5, shadow: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)" }}
                                className="group text-left bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm transition-all relative overflow-hidden flex flex-col h-full"
                            >
                                <div className={`h-14 w-14 rounded-2xl ${report.bg} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                                    <report.icon className={`h-7 w-7 ${report.color}`} />
                                </div>
                                
                                <h3 className="text-xl font-bold text-[#254153] mb-3 leading-tight">{report.title}</h3>
                                <p className="text-gray-500 text-sm leading-relaxed mb-8 flex-1">{report.description}</p>
                                
                                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#254153]/40 group-hover:text-[#254153] transition-colors">
                                    Abrir reporte
                                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
                                </div>

                                {/* Subtle accent line */}
                                <div className={`absolute bottom-0 left-0 h-1.5 w-0 bg-[#254153] transition-all duration-300 group-hover:w-full`} />
                            </motion.button>
                        ))}

                        {/* Placeholder Card for future expansion */}
                        <div className="border-4 border-dashed border-gray-100 rounded-[2.5rem] p-8 flex flex-col items-center justify-center text-center space-y-4 opacity-50 group hover:opacity-100 transition-opacity">
                            <div className="h-14 w-14 rounded-2xl bg-gray-50 flex items-center justify-center">
                                <LayoutDashboard className="h-7 w-7 text-gray-300" />
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-400">Más reportes</h3>
                                <p className="text-xs text-gray-300 mt-1">Próximamente nuevas integraciones financieras</p>
                            </div>
                        </div>
                    </div>

                    {/* Footer Info */}
                    <div className="bg-white border border-gray-100 p-8 rounded-[2rem] shadow-sm flex items-center justify-between text-[#254153]">
                        <div className="flex items-center gap-4">
                            <div className="bg-amber-100 p-3 rounded-xl">
                                <Building2 className="h-6 w-6 text-amber-600" />
                            </div>
                            <div>
                                <p className="text-xs font-black uppercase tracking-widest opacity-40">Información Corporativa</p>
                                <p className="text-sm font-bold">Base de datos: Firplak S.A. / DBViventta</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Última Actualización</p>
                            <p className="text-sm font-mono font-bold">10 MAR 2026 - 14:36</p>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
