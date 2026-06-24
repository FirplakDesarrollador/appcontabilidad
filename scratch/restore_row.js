const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://zohdtksgxhbheaftgmsi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaGR0a3NneGhiaGVhZnRnbXNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjI5NjExNTEsImV4cCI6MjAzODUzNzE1MX0.Euu6FTh11mbh4lUmhKFMTFYZ9hWgZ-RzECcUYKGRYQE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function restore() {
    const rowToRemove = {
        "Tipo_de_documento": "Factura electrónica",
        "CUFE/CUDE": "f79e88d05ed017a4c49806509f6e3c834a742886f4a86780998399e5256e6d1c7a812d0d4a5916397ee49dbfa57e8932",
        "Folio": "FCPT2994286",
        "Prefijo": null,
        "Fecha_Emision": "05-04-2026",
        "Fecha_Recepcion": "05-04-2026 01:37:59",
        "NIT_Emisor": "830114921",
        "Nombre_Emisor": null,
        "IVA": "5930.08",
        "INC": "588.91",
        "Total": "37730",
        "ID": 1776463742339059
    };
    
    console.log('Intentando restaurar fila original...');
    const { error } = await supabase.from('Facturas pendientes').insert(rowToRemove);
    console.log('Resultado restauración:', error);
}

restore();
