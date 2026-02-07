"use client";

import { usePathname, useRouter } from "next/navigation";
import { PieChart, FileCheck, FileText, LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import { useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";

export function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);

    useEffect(() => {
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
        { name: "Aprobación de documento soporte", icon: FileText, path: "/aprobacion-documentos" },
        { name: "Cargue de TRM en SAP", icon: RefreshCw, path: "/cargue-trm" },
    ];

    return (
        <aside className="w-64 bg-[#254153] text-white hidden md:flex flex-col fixed h-full z-20 shadow-2xl">
            <div className="p-6 flex items-center gap-3 border-b border-white/10">
                <div className="bg-white/10 p-2 rounded-lg backdrop-blur-sm">
                    <PieChart className="h-6 w-6 text-white" />
                </div>
                <span className="text-xl font-bold tracking-tight">Financial<span className="font-light opacity-70">App</span></span>
            </div>

            <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                {menuItems.map((item) => {
                    const isActive = pathname === item.path;
                    return (
                        <Link
                            key={item.path}
                            href={item.path}
                            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200 ${isActive
                                ? "bg-white text-[#254153] shadow-lg font-semibold"
                                : "text-gray-300 hover:bg-white/10 hover:text-white"
                                }`}
                        >
                            <item.icon className={`h-5 w-5 ${isActive ? "text-[#254153]" : "text-gray-400"}`} />
                            {item.name}
                        </Link>
                    );
                })}
            </nav>

            <div className="p-4 border-t border-white/10">
                <div className="bg-[#1e3443] rounded-xl p-4 flex items-center gap-3 mb-4">
                    <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold">
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
                    <LogOut className="mr-2 h-5 w-5" />
                    Cerrar Sesión
                </Button>
            </div>
        </aside>
    );
}
