"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
    ZoomIn,
    ZoomOut,
    RotateCcw,
    Maximize2,
    Minimize2,
    ExternalLink,
    FileText,
    Loader2,
    AlertCircle,
    Download
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface PdfViewerWithZoomProps {
    url: string | null;
    title?: string;
    fileName?: string;
    isLoading?: boolean;
    error?: string | null;
    onRetry?: () => void;
    className?: string;
    containerHeightClass?: string;
    downloadUrl?: string;
    onDownload?: () => void;
    isNativeSharePoint?: boolean;
}

export function PdfViewerWithZoom({
    url,
    title = "Vista del Documento",
    fileName,
    isLoading = false,
    error = null,
    onRetry,
    className = "",
    containerHeightClass = "min-h-[500px] lg:min-h-[750px] h-[500px] lg:h-[750px]",
    downloadUrl,
    onDownload,
    isNativeSharePoint = false,
}: PdfViewerWithZoomProps) {
    const [zoom, setZoom] = useState<number>(100);
    const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const minZoom = 50;
    const maxZoom = 250;
    const step = 25;

    const handleZoomIn = useCallback(() => {
        setZoom((prev) => Math.min(prev + step, maxZoom));
    }, [maxZoom, step]);

    const handleZoomOut = useCallback(() => {
        setZoom((prev) => Math.max(prev - step, minZoom));
    }, [minZoom, step]);

    const handleZoomReset = useCallback(() => {
        setZoom(100);
    }, []);

    // Keyboard shortcuts for zoom
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Only trigger if fullscreen is active or if user is interacting with container
            if (isFullscreen) {
                if (e.key === "Escape") {
                    setIsFullscreen(false);
                } else if (e.key === "+" || e.key === "=") {
                    e.preventDefault();
                    handleZoomIn();
                } else if (e.key === "-") {
                    e.preventDefault();
                    handleZoomOut();
                } else if (e.key === "0") {
                    e.preventDefault();
                    handleZoomReset();
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isFullscreen, handleZoomIn, handleZoomOut, handleZoomReset]);

    // Prevent body scroll when fullscreen is active
    useEffect(() => {
        if (isFullscreen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => {
            document.body.style.overflow = "";
        };
    }, [isFullscreen]);

    const renderToolbar = (isOverlay = false) => (
        <div className={`flex items-center gap-1 sm:gap-1.5 ${isOverlay ? "bg-slate-800/90 text-white p-1.5 rounded-2xl border border-white/10 shadow-xl backdrop-blur-md" : "bg-gray-100/90 text-gray-700 p-1 rounded-2xl border border-gray-200/80 shadow-sm"}`}>
            {/* Zoom Out Button */}
            <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoom <= minZoom || !url || isLoading}
                title="Disminuir zoom (-25%)"
                className={`p-1.5 rounded-xl transition-all flex items-center justify-center ${
                    zoom <= minZoom || !url || isLoading
                        ? "opacity-30 cursor-not-allowed"
                        : isOverlay
                        ? "hover:bg-white/15 active:scale-95 text-white"
                        : "hover:bg-white hover:text-gray-900 active:scale-95 text-gray-600 hover:shadow-sm"
                }`}
            >
                <ZoomOut className="h-4 w-4" />
            </button>

            {/* Current Zoom Badge / Reset on click */}
            <button
                type="button"
                onClick={handleZoomReset}
                title="Haga clic para restablecer zoom al 100%"
                disabled={!url || isLoading}
                className={`px-2 py-1 rounded-lg text-xs font-black tracking-tight transition-all select-none min-w-[50px] text-center ${
                    !url || isLoading
                        ? "opacity-30 cursor-not-allowed"
                        : zoom !== 100
                        ? isOverlay
                            ? "bg-blue-500/30 text-blue-300 border border-blue-400/30 hover:bg-blue-500/40"
                            : "bg-blue-50 text-blue-700 border border-blue-200/80 hover:bg-blue-100"
                        : isOverlay
                        ? "hover:bg-white/10 text-white/90"
                        : "hover:bg-white text-gray-700 hover:shadow-sm"
                }`}
            >
                {zoom}%
            </button>

            {/* Zoom In Button */}
            <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoom >= maxZoom || !url || isLoading}
                title="Aumentar zoom (+25%)"
                className={`p-1.5 rounded-xl transition-all flex items-center justify-center ${
                    zoom >= maxZoom || !url || isLoading
                        ? "opacity-30 cursor-not-allowed"
                        : isOverlay
                        ? "hover:bg-white/15 active:scale-95 text-white"
                        : "hover:bg-white hover:text-gray-900 active:scale-95 text-gray-600 hover:shadow-sm"
                }`}
            >
                <ZoomIn className="h-4 w-4" />
            </button>

            {/* Separator */}
            <div className={`h-4 w-[1px] my-auto mx-0.5 ${isOverlay ? "bg-white/20" : "bg-gray-300"}`} />

            {/* Reset Zoom Button */}
            <button
                type="button"
                onClick={handleZoomReset}
                disabled={zoom === 100 || !url || isLoading}
                title="Restablecer zoom al 100%"
                className={`p-1.5 rounded-xl transition-all flex items-center justify-center ${
                    zoom === 100 || !url || isLoading
                        ? "opacity-30 cursor-not-allowed"
                        : isOverlay
                        ? "hover:bg-white/15 active:scale-95 text-white"
                        : "hover:bg-white hover:text-gray-900 active:scale-95 text-gray-600 hover:shadow-sm"
                }`}
            >
                <RotateCcw className="h-3.5 w-3.5" />
            </button>

            {/* Fullscreen Toggle */}
            <button
                type="button"
                onClick={() => setIsFullscreen(!isFullscreen)}
                disabled={!url || isLoading}
                title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
                className={`p-1.5 rounded-xl transition-all flex items-center justify-center ${
                    !url || isLoading
                        ? "opacity-30 cursor-not-allowed"
                        : isOverlay
                        ? "hover:bg-white/15 active:scale-95 text-white"
                        : "hover:bg-white hover:text-gray-900 active:scale-95 text-gray-600 hover:shadow-sm"
                }`}
            >
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>

            {/* Open in New Window */}
            {url && (
                <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Abrir PDF en pestaña nueva"
                    className={`p-1.5 rounded-xl transition-all flex items-center justify-center ${
                        isOverlay
                            ? "hover:bg-white/15 active:scale-95 text-white"
                            : "hover:bg-white hover:text-gray-900 active:scale-95 text-gray-600 hover:shadow-sm"
                    }`}
                >
                    <ExternalLink className="h-4 w-4" />
                </a>
            )}
        </div>
    );

    const renderDocumentContent = (customHeight?: string) => {
        if (isLoading) {
            return (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm z-10 transition-all">
                    <Loader2 className="h-10 w-10 text-[#254153] animate-spin mb-4" />
                    <p className="text-xs font-black text-[#254153] uppercase tracking-[2px]">Optimizando visualización...</p>
                </div>
            );
        }

        if (error) {
            return (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-red-50/50">
                    <div className="bg-white p-4 rounded-full shadow-sm mb-4">
                        <AlertCircle className="h-8 w-8 text-red-500" />
                    </div>
                    <p className="text-sm font-black text-red-900 mb-4 px-4">{error}</p>
                    {onRetry && (
                        <button
                            type="button"
                            onClick={onRetry}
                            className="px-8 py-3 bg-red-500 hover:bg-red-600 active:scale-95 text-white font-bold rounded-2xl shadow-lg transition-all"
                        >
                            Reintentar Carga
                        </button>
                    )}
                </div>
            );
        }

        if (!url) {
            return (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl m-4">
                    <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 mb-4">
                        <FileText className="h-8 w-8 text-[#254153]/20" />
                    </div>
                    <p className="text-xs font-bold text-gray-400">Esperando archivo...</p>
                </div>
            );
        }

        const separator = url.includes("?") ? "&" : "?";
        const pdfSrc = `${url}${separator}z=${zoom}#zoom=${zoom}&navpanes=0&toolbar=0`;

        return (
            <div className="w-full h-full min-h-full">
                <iframe
                    key={`${url}-${zoom}`}
                    src={pdfSrc}
                    className={`w-full h-full ${customHeight || "min-h-[500px] lg:min-h-[750px]"} border-none shadow-inner bg-white`}
                    title="Invoice Preview"
                />
            </div>
        );
    };

    return (
        <div className={`space-y-3 ${className}`}>
            {/* Header with Title on Left and Zoom Controls on Right */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-2">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="bg-blue-50 p-2 rounded-xl shrink-0">
                        <FileText className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="min-w-0">
                        <h4 className="text-sm font-black text-gray-800 uppercase tracking-wider truncate">
                            {title}
                        </h4>
                        <p className="text-[10px] text-gray-400 font-bold truncate">
                            {fileName || "Visualización Directa"}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 ml-auto">
                    {isNativeSharePoint && (
                        <span className="hidden sm:inline-block px-3 py-1 rounded-full bg-amber-50 text-[10px] font-black text-amber-600 border border-amber-100 uppercase">
                            Requiere VPN/SharePoint
                        </span>
                    )}
                    {/* Zoom Toolbar */}
                    {renderToolbar(false)}
                </div>
            </div>

            {/* Main Embedded Viewer Box */}
            <div
                ref={containerRef}
                className={`relative w-full ${containerHeightClass} bg-slate-100/70 rounded-2xl border border-gray-100 overflow-hidden group`}
            >
                {renderDocumentContent()}
            </div>

            {/* Fullscreen Lightbox Modal */}
            <AnimatePresence>
                {isFullscreen && (
                    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/85 backdrop-blur-md p-3 sm:p-6 animate-in fade-in duration-200">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between gap-4 mb-3 text-white">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="bg-blue-500/20 p-2 rounded-xl shrink-0 border border-blue-400/20">
                                    <FileText className="h-5 w-5 text-blue-400" />
                                </div>
                                <div className="min-w-0">
                                    <h4 className="text-sm font-black tracking-wide truncate">
                                        {title}
                                    </h4>
                                    <p className="text-xs text-slate-400 truncate">
                                        {fileName || "Visualización en pantalla completa"}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                                {renderToolbar(true)}

                                {onDownload && (
                                    <button
                                        type="button"
                                        onClick={onDownload}
                                        title="Descargar documento"
                                        className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold transition-all flex items-center gap-1.5 text-xs"
                                    >
                                        <Download className="h-4 w-4" />
                                        <span className="hidden sm:inline">Descargar</span>
                                    </button>
                                )}

                                <button
                                    type="button"
                                    onClick={() => setIsFullscreen(false)}
                                    title="Cerrar (Esc)"
                                    className="p-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 font-bold transition-all ml-1"
                                >
                                    <Minimize2 className="h-4 w-4" />
                                </button>
                            </div>
                        </div>

                        {/* Modal Scrollable Document Viewer */}
                        <div className="relative flex-1 w-full bg-slate-900 rounded-2xl border border-white/10 overflow-hidden">
                            {renderDocumentContent("min-h-full h-full")}
                        </div>

                        {/* Hint footer */}
                        <div className="flex items-center justify-between pt-2 px-2 text-[11px] text-slate-400 font-medium">
                            <span>Use <b>+</b> y <b>-</b> para zoom rápido, <b>0</b> para restablecer al 100%.</span>
                            <span>Presione <b>Esc</b> para salir</span>
                        </div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
