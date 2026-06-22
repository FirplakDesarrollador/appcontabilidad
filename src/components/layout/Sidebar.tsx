"use client";

import { usePathname, useRouter } from "next/navigation";
import { useSidebar } from "@/context/SidebarContext";
import { PieChart, FileCheck, FileText, LogOut, RefreshCw, BarChart3, ChevronLeft, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import { useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";

export function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const { isCollapsed, toggleSidebar } = useSidebar();
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user || null);
        });
    }, []);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push("/login");
    };

    const menuItems = [
        { name: "Dashboard", icon: PieChart, path: "/" },
        { name: "Aprobación de facturas", icon: FileCheck, path: "/aprobacion-facturas" },
        { name: "Facturas Viventta", icon: FileCheck, path: "/facturas-viventta" },
        { name: "Aprobación de documento soporte", icon: FileText, path: "/aprobacion-documentos" },
        { name: "Cargue de TRM en SAP", icon: RefreshCw, path: "/cargue-trm" },
        { name: "Revisión de factura DIAN", icon: FileCheck, path: "/revision-factura-dian" },
        { name: "Informe junta", icon: BarChart3, path: "/informe-junta" },
    ];

    if (!isMounted) return null;

    return (
        <>
            {/* Overlay for mobile when sidebar is open */}
            {!isCollapsed && (
                <div 
                    className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 md:hidden"
                    onClick={toggleSidebar}
                />
            )}

            <aside 
                className={`bg-[#254153] text-white flex flex-col fixed h-full z-50 shadow-2xl transition-all duration-300 ease-in-out w-64 ${
                    isCollapsed ? "-translate-x-full" : "translate-x-0"
                }`}
            >
                <div className="p-6 flex items-center justify-between border-b border-white/10 relative">
                    <div className="flex items-center gap-3">
                        <div className="bg-white/10 p-2 rounded-lg backdrop-blur-sm shrink-0">
                            <PieChart className="h-6 w-6 text-white" />
                        </div>
                        <span className="text-xl font-bold tracking-tight truncate">Financial App</span>
                    </div>
                    
                    <button 
                        onClick={toggleSidebar}
                        className="h-8 w-8 flex items-center justify-center rounded-xl hover:bg-white/10 transition-colors text-white/60 hover:text-white"
                        title="Ocultar menú"
                    >
                        <ChevronLeft className="h-5 w-5" />
                    </button>
                </div>

                <nav className="flex-1 p-4 space-y-2 overflow-y-auto scrollbar-hide">
                    {menuItems.map((item) => {
                        const isActive = pathname === item.path;
                        return (
                            <Link
                                key={item.path}
                                href={item.path}
                                className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200 group ${isActive
                                    ? "bg-white text-[#254153] shadow-lg font-semibold"
                                    : "text-gray-300 hover:bg-white/10 hover:text-white"
                                    }`}
                            >
                                <item.icon className={`h-5 w-5 shrink-0 ${isActive ? "text-[#254153]" : "text-gray-400 group-hover:text-white"}`} />
                                <span className="truncate">{item.name}</span>
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-white/10">
                    <div className="bg-[#1e3443] rounded-xl p-4 flex items-center gap-3 mb-4 w-full">
                        <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold shrink-0">
                            {user?.email?.[0]?.toUpperCase() || "U"}
                        </div>
                        <div className="overflow-hidden">
                            <p className="text-sm font-semibold truncate">{user?.email || "Usuario"}</p>
                            <p className="text-xs text-gray-400">Administrador</p>
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        onClick={handleLogout}
                        className="w-full justify-start text-red-200 hover:text-white hover:bg-red-500/20"
                    >
                        <LogOut className="h-5 w-5 mr-2" />
                        <span>Cerrar Sesión</span>
                    </Button>
                </div>
            </aside>
        </>
    );
}
