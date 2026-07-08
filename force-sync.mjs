import { readFileSync } from 'fs';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';
import { createClient } from '@supabase/supabase-js';

const envFile = readFileSync('.env', 'utf-8');
envFile.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
});
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const cca = new ConfidentialClientApplication({
    auth: {
        clientId: process.env.AZURE_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
    },
});

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function mapSpToSupabase(spItem, userMap) {
    const fields = spItem.fields || spItem;
    const spItemId = spItem.id || fields.id;
    
    const lookupId = fields.ResponsabledeAutorizarLookupId
        || fields.ResponsableAprobarLookupId
        || fields.Responsable_de_AutorizarLookupId;
    const responsable = lookupId && userMap ? (userMap.get(String(lookupId)) || null) : (fields.Responsable_de_Autorizar ?? null);

    return {
        ID: Number(spItemId),
        sharepoint_id: String(spItemId),
        Nit: fields.Nit ?? fields.Title ?? fields.LinkTitle ?? null,
        Proveedor: fields.Proveedor ?? null,
        Nro_Factura: fields.Nro_Factura ?? null,
        Aprobacion_Doliente: fields.Aprobacion_Doliente ?? null,
        Gestion_Contabilidad: fields.Gestion_Contabilidad ?? "",
        Observaciones: fields.Observaciones ?? null,
        Consecutivo: fields.Consecutivo ?? null,
        Responsable_de_Autorizar: responsable,
        FechaAprobacion: fields.FechaAprobacion ?? null,
        centro_costos: fields.centro_costos ?? null,
        Valor_total: fields.Valor_x0020_total ?? fields["Valor total"] ?? fields.Valor_total ?? null,
        tiene_anticipo: fields.tiene_anticipo ?? null,
        Creado: fields.Created ?? fields.Creado ?? null,
        Creado_por: fields.AuthorLookupId ? String(fields.AuthorLookupId) : (fields["Creado por"] ?? null),
        CUFE: fields.CUFE ?? null,
        InformeRecepcion: fields.InformeRecepcion ?? null,
        FechaProcesado: fields.FechaProcesado ?? null,
        DigitadoPor: fields.DigitadoPor ?? null,
        Datos_adjuntos: fields.Attachments === true ? 1 : (Number(fields.Datos_adjuntos) || 0),
        tablaCostos: fields.tablaCostos ?? null,
        Procesado: fields.Procesado != null ? String(fields.Procesado) : null,
        Modificado: fields.Modified ?? fields.Modificado ?? null,
        Modificado_por: fields.EditorLookupId ? String(fields.EditorLookupId) : (fields["Modificado por"] ?? null),
        fp: fields.fp ?? null,
        documentos: fields.fp ?? fields.documentos ?? null,
    };
}

async function run() {
    const response = await cca.acquireTokenByClientCredential({ scopes: ['https://graph.microsoft.com/.default'] });
    const client = Client.init({ authProvider: (done) => done(null, response.accessToken) });
    const site = await client.api(`/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad`).get();
    const lists = await client.api(`/sites/${site.id}/lists`).get();
    const list = lists.value.find(l => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');
    
    // User map
    let userMap = new Map();
    try {
        let userNextLink = `/sites/${site.id}/lists('User Information List')/items?$select=id,fields&$expand=fields($select=Title)&$top=500`;
        while (userNextLink) {
            const userResponse = await client.api(userNextLink).get();
            for (const u of userResponse.value) {
                if (u.fields?.Title) userMap.set(String(u.id), u.fields.Title);
            }
            const nextOdata = userResponse['@odata.nextLink'];
            if (nextOdata) {
                const skiptokenMatch = nextOdata.match(/skiptoken=([^&]+)/);
                if (skiptokenMatch) {
                    userNextLink = `/sites/${site.id}/lists('User Information List')/items?$select=id,fields&$expand=fields($select=Title)&$top=500&$skiptoken=${skiptokenMatch[1]}`;
                } else {
                    userNextLink = nextOdata.split('v1.0')[1];
                }
            } else {
                userNextLink = null;
            }
        }
    } catch(e) {}

    console.log('Fetching ALL SP Items with fields...');
    let spItems = [];
    let spNextLink = `/sites/${site.id}/lists/${list.id}/items?expand=fields&$top=500`;
    while (spNextLink) {
        const req = client.api(spNextLink).header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly');
        const res = await req.get();
        spItems = spItems.concat(res.value || []);
        
        let hasMissingFields = false;
        for (const item of res.value || []) {
            if (!item.fields) hasMissingFields = true;
        }
        if (hasMissingFields) {
            console.warn('WARNING: Some items in this batch were missing fields!');
        }
        
        const nextOdata = res['@odata.nextLink'];
        if (nextOdata) {
            const skiptokenMatch = nextOdata.match(/skiptoken=([^&]+)/);
            if (skiptokenMatch) {
                spNextLink = `/sites/${site.id}/lists/${list.id}/items?expand=fields&$top=500&$skiptoken=${skiptokenMatch[1]}`;
            } else {
                spNextLink = nextOdata.split('v1.0')[1];
            }
        } else {
            spNextLink = null;
        }
        console.log(`Fetched ${spItems.length} items so far...`);
    }
    
    console.log(`Total SP Items fetched with fields: ${spItems.length}`);
    
    // Check how many have Aprobado + Por Procesar directly from SP
    let spCount = 0;
    for(const item of spItems) {
        if(item.fields && item.fields.Aprobacion_Doliente === 'Aprobado' && item.fields.Gestion_Contabilidad === 'Por Procesar') {
            spCount++;
        }
    }
    console.log('Total in SP with Aprobado + Por Procesar:', spCount);

    // UPSERT all items!
    for(let i = 0; i < spItems.length; i += 200) {
        const batch = spItems.slice(i, i + 200);
        const mapped = batch.map(item => mapSpToSupabase(item, userMap));
        const { error } = await supabase.from('Registro_Facturas').upsert(mapped, { onConflict: 'ID' });
        if (error) console.error('Error upserting batch:', error.message);
        console.log(`Upserted ${i + batch.length} / ${spItems.length}`);
    }
    
    const { count, error } = await supabase.from('Registro_Facturas')
        .select('*', { count: 'exact', head: true })
        .eq('Aprobacion_Doliente', 'Aprobado')
        .eq('Gestion_Contabilidad', 'Por Procesar');
        
    console.log('FINAL Supabase items with Aprobado + Por Procesar:', count);
    console.log('DONE!');
}
run().catch(console.error);
