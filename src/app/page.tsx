"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { User } from "@supabase/supabase-js";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Sidebar } from "@/components/layout/Sidebar";
import {
    DollarSign,
    Users,
    Briefcase,
    Bell,
    Search,
    Menu,
    TrendingUp,
    ArrowUpRight
} from "lucide-react";

export default function DashboardPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<User | null>(null);

    useEffect(() => {
        const checkUser = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                router.push("/login");
            } else {
                setUser(session.user);
                setLoading(false);
            }
        };

        checkUser();
    }, [router]);

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-[#f8fafc]">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#254153] border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#f8fafc] flex">
            {/* Sidebar */}
            <Sidebar />

            {/* Main Content */}
            <main className="flex-1 md:ml-64 relative bg-[#f8fafc]">
                {/* Topbar */}
                <header className="h-20 bg-white/80 backdrop-blur-xl border-b border-gray-100 flex items-center justify-between px-6 sticky top-0 z-10">
                    <div className="font-semibold text-gray-800 text-lg">Resumen Financiero</div>
                    <div className="flex items-center gap-4">
                        <div className="relative hidden md:block">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar..."
                                className="h-10 pl-10 pr-4 rounded-full bg-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#254153]/20 w-64"
                            />
                        </div>
                        <button className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-gray-100 relative">
                            <Bell className="h-5 w-5 text-gray-600" />
                            <span className="absolute top-2 right-2 h-2.5 w-2.5 bg-red-500 rounded-full border-2 border-white"></span>
                        </button>
                        <button className="md:hidden">
                            <Menu className="h-6 w-6 text-gray-600" />
                        </button>
                    </div>
                </header>

                {/* Dashboard Content */}
                <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">

                    {/* Welcome Section */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4"
                    >
                        <div>
                            <h1 className="text-3xl font-bold text-[#254153]">Hola, Usuario</h1>
                            <p className="text-gray-500 mt-1">Aquí tienes el resumen de hoy, 24 Enero 2026</p>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" className="bg-white">Descargar Reporte</Button>
                            <Button>Nueva Transacción</Button>
                        </div>
                    </motion.div>

                    {/* Stats Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {[
                            { title: "Ingresos Totales", value: "$124,500.00", change: "+12.5%", isPositive: true, icon: DollarSign },
                            { title: "Gastos", value: "$42,300.00", change: "-2.4%", isPositive: true, icon: TrendingUp },
                            { title: "Usuarios Activos", value: "1,240", change: "+8.1%", isPositive: true, icon: Users },
                            { title: "Proyectos", value: "24", change: "+4", isPositive: true, icon: Briefcase },
                        ].map((stat, i) => (
                            <motion.div
                                key={stat.title}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.1 }}
                                className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <div className="bg-[#254153]/5 p-3 rounded-lg">
                                        <stat.icon className="h-6 w-6 text-[#254153]" />
                                    </div>
                                    <span className={`flex items-center text-sm font-medium ${stat.isPositive ? 'text-green-600' : 'text-red-500'} bg-gray-50 px-2 py-1 rounded-full`}>
                                        {stat.change}
                                        <ArrowUpRight className="h-3 w-3 ml-1" />
                                    </span>
                                </div>
                                <h3 className="text-gray-500 text-sm font-medium">{stat.title}</h3>
                                <p className="text-2xl font-bold text-[#254153] mt-1">{stat.value}</p>
                            </motion.div>
                        ))}
                    </div>

                    {/* Recent Activity Section */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-lg font-bold text-[#254153]">Transacciones Recientes</h3>
                                <Button variant="ghost" className="text-sm">Ver Todo</Button>
                            </div>
                            <div className="space-y-4">
                                {[1, 2, 3, 4].map((item) => (
                                    <div key={item} className="flex items-center justify-between p-4 bg-gray-50/50 rounded-xl hover:bg-gray-50 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className="h-10 w-10 rounded-full bg-[#254153]/10 flex items-center justify-center text-[#254153] font-bold">
                                                TX
                                            </div>
                                            <div>
                                                <p className="font-semibold text-gray-900">Pago de Servicios</p>
                                                <p className="text-sm text-gray-500">24 Ene, 2026</p>
                                            </div>
                                        </div>
                                        <span className="font-bold text-gray-900">-$1,250.00</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-[#254153] text-white p-6 rounded-2xl shadow-lg relative overflow-hidden">
                            <div className="relative z-10">
                                <h3 className="text-lg font-bold mb-4">Consejo Pro</h3>
                                <p className="text-gray-300 text-sm mb-6">
                                    Mantén tus reportes actualizados para mejorar la predicción de gastos trimestrales.
                                </p>
                                <Button className="w-full bg-white text-[#254153] hover:bg-gray-100">
                                    Actualizar Reporte
                                </Button>
                            </div>
                            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl -mr-10 -mt-10" />
                            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full blur-2xl -ml-5 -mb-5" />
                        </div>
                    </div>

                </div>
            </main>
        </div>
    );
}
