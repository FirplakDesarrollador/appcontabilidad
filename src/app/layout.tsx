import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { SidebarProvider } from "@/context/SidebarContext";

const outfit = Outfit({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "Contabilidad App",
    description: "Gestión contable premium",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="es">
            <body className={outfit.className}>
                <SidebarProvider>
                    {children}
                </SidebarProvider>
            </body>
        </html>
    );
}
