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
import { useSidebar } from "@/context/SidebarContext";

export default function DashboardPage() {
    const { toggleSidebar } = useSidebar();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<User | null>(null);
    const [sapInvoices, setSapInvoices] = useState<any[]>([]);
    const [sapLoading, setSapLoading] = useState(true);

    const fetchSapInvoices = async () => {
        try {
            setSapLoading(true);
            const response = await fetch('/api/sap/recent-invoices');
            const data = await response.json();
            if (data.success) {
                setSapInvoices(data.invoices);
            }
        } catch (error) {
            console.error('Error fetching SAP invoices:', error);
        } finally {
            setSapLoading(false);
        }
    };

    useEffect(() => {
        const checkUser = async () => {
            try {
                const { data: { session }, error } = await supabase.auth.getSession();
                
                if (error || !session) {
                    if (error) console.error("Error de autenticación:", error.message);
                    await supabase.auth.signOut();
                    router.push("/login");
                } else {
                    setUser(session.user);
                    setLoading(false);
                    fetchSapInvoices();
                }
            } catch (err) {
                console.error("Error inesperado en checkUser:", err);
                router.push("/login");
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
            <main 
                className="flex-1 relative bg-[#f8fafc] transition-all duration-300 ease-in-out"
                style={{ marginLeft: 'var(--sidebar-width, 256px)' }}
            >
                {/* Topbar */}
                <header className="h-20 bg-white/80 backdrop-blur-xl border-b border-gray-100 flex items-center justify-between px-6 sticky top-0 z-10">
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={toggleSidebar}
                            className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-[#254153]"
                        >
                            <Menu className="h-6 w-6" />
                        </button>
                        <div className="font-semibold text-gray-800 text-lg">Resumen Financiero</div>
                    </div>
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

                        {/* SAP Recent Invoices Tile */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col h-full">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-lg font-bold text-[#254153]">Últimas en SAP</h3>
                                <div className="h-8 w-8 bg-blue-50 rounded-lg flex items-center justify-center">
                                    <Briefcase className="h-4 w-4 text-blue-600" />
                                </div>
                            </div>
                            
                            <div className="space-y-3 flex-1 overflow-auto">
                                {sapLoading ? (
                                    [1, 2, 3, 4, 5].map(i => (
                                        <div key={i} className="h-16 w-full animate-pulse bg-gray-50 rounded-xl" />
                                    ))
                                ) : sapInvoices.length > 0 ? (
                                    sapInvoices.map((inv: any) => (
                                        <div key={inv.DocEntry} className="p-3 bg-gray-50/50 rounded-xl border border-transparent hover:border-gray-200 transition-all">
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="text-xs font-bold text-[#254153] bg-[#254153]/5 px-2 py-0.5 rounded">
                                                    #{inv.DocNum}
                                                </span>
                                                <span className="text-xs font-bold text-gray-900">
                                                    ${new Intl.NumberFormat('es-CO').format(inv.DocTotal)}
                                                </span>
                                            </div>
                                            <p className="text-sm font-medium text-gray-800 truncate" title={inv.CardName}>
                                                {inv.CardName}
                                            </p>
                                            <div className="flex justify-between items-center mt-1">
                                                <p className="text-[10px] text-gray-500">{inv.NumAtCard || 'Sin Ref'}</p>
                                                <p className="text-[10px] text-gray-400 font-medium">{inv.DocDate?.split('T')[0]}</p>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-10 text-center">
                                        <div className="bg-gray-50 p-3 rounded-full mb-3">
                                            <Search className="h-6 w-6 text-gray-300" />
                                        </div>
                                        <p className="text-sm text-gray-400">No hay facturas recientes</p>
                                    </div>
                                )}
                            </div>
                            
                            <Button variant="outline" className="w-full mt-4 h-10 text-xs" onClick={() => fetchSapInvoices()}>
                                Refrescar SAP
                            </Button>
                        </div>
                    </div>

                    {/* Pro Tip Section */}
                    <div className="bg-[#254153] text-white p-8 rounded-2xl shadow-lg relative overflow-hidden">
                        <div className="relative z-10 max-w-lg">
                            <h3 className="text-xl font-bold mb-4">Consejo Pro</h3>
                            <p className="text-gray-300 mb-6">
                                Mantén tus reportes actualizados para mejorar la predicción de gastos trimestrales y el flujo de caja.
                            </p>
                            <Button className="bg-white text-[#254153] hover:bg-gray-100">
                                Actualizar Reporte
                            </Button>
                        </div>
                        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -mr-20 -mt-20" />
                        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full blur-3xl -ml-10 -mb-10" />
                    </div>

                </div>
            </main>
        </div>
    );
}
