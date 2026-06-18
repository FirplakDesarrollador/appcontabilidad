const fs = require('fs');
const filePath = 'src/app/externo/factura/[id]/page.tsx';
let c = fs.readFileSync(filePath, 'utf8');

c = c.replace(
    /Eye,\s*X\s*\} from "lucide-react";/,
    'Eye,\n    X,\n    Home\n} from "lucide-react";'
);

// Since my previous replace changed X to X, Home... let me make sure it doesn't duplicate.
if (!c.includes('Home\n} from "lucide-react";')) {
    c = c.replace(/X,\s*Home\s*\} from "lucide-react";/, 'Eye,\n    X,\n    Home\n} from "lucide-react";'); // cleanup just in case
}

const targetDiv = `<div className="flex flex-col md:flex-row md:items-center gap-4 mb-8 px-2">`;
if (c.includes(targetDiv)) {
    // Find the end of this div block where the Download button is
    const buttonBlockRegex = /<Button\s+onClick=\{handleDownload\}\s+disabled=\{downloadLoading\}\s+className="md:ml-auto flex items-center justify-center gap-2 px-6 py-3 bg-\[\#254153\]\/5 border-2 border-\[\#254153\]\/10 rounded-2xl text-\[\#254153\] text-sm font-bold hover:bg-\[\#254153\] hover:text-white transition-all shadow-sm group"\s*>[\s\S]*?<\/Button>/;
    
    if (buttonBlockRegex.test(c)) {
        const replaceWith = `<div className="md:ml-auto flex items-center gap-3">
                                <Button
                                    onClick={() => window.location.href = \`/externo/pendientes?responsable=\${encodeURIComponent(invoice?.responsableActual || "")}\`}
                                    className="flex items-center justify-center gap-2 px-6 py-3 bg-white border-2 border-[#254153]/10 rounded-2xl text-[#254153] text-sm font-bold hover:bg-gray-50 transition-all shadow-sm group"
                                >
                                    <Home className="h-4 w-4" />
                                    Inicio
                                </Button>
                                <Button
                                    onClick={handleDownload}
                                    disabled={downloadLoading}
                                    className="flex items-center justify-center gap-2 px-6 py-3 bg-[#254153]/5 border-2 border-[#254153]/10 rounded-2xl text-[#254153] text-sm font-bold hover:bg-[#254153] hover:text-white transition-all shadow-sm group"
                                >
                                    {downloadLoading ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Download className="h-4 w-4" />
                                    )}
                                    {downloadLoading ? "Buscando..." : \`Descargar Factura \${invoice?.nroFactura ? \`#\${invoice.nroFactura}\` : ""}\`}
                                </Button>
                            </div>`;
        
        c = c.replace(buttonBlockRegex, replaceWith);
    }
}

fs.writeFileSync(filePath, c);
console.log("Done");
