import { readFileSync } from 'fs';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';

const envFile = readFileSync('.env', 'utf-8');
envFile.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
});
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function check() {
    const cca = new ConfidentialClientApplication({
        auth: { clientId: process.env.AZURE_CLIENT_ID, authority: 'https://login.microsoftonline.com/' + process.env.AZURE_TENANT_ID, clientSecret: process.env.AZURE_CLIENT_SECRET }
    });
    const resAuth = await cca.acquireTokenByClientCredential({ scopes: ['https://graph.microsoft.com/.default'] });
    const client = Client.init({ authProvider: (done) => done(null, resAuth.accessToken) });
    const site = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
    const lists = await client.api(`/sites/${site.id}/lists`).get();
    const list = lists.value.find(l => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');

    let spItems = [];
    let spNextLink = `/sites/${site.id}/lists/${list.id}/items?expand=fields&$top=500`;
    while (spNextLink) {
        const res = await client.api(spNextLink).header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly').get();
        spItems = spItems.concat(res.value || []);
        const nextOdata = res['@odata.nextLink'];
        if (nextOdata) {
            const skiptokenMatch = nextOdata.match(/skiptoken=([^&]+)/);
            if (skiptokenMatch) { spNextLink = `/sites/${site.id}/lists/${list.id}/items?expand=fields&$top=500&$skiptoken=${skiptokenMatch[1]}`; }
            else { spNextLink = nextOdata.split('v1.0')[1]; }
        } else { spNextLink = null; }
    }
    
    let spCount = 0;
    for(const item of spItems) {
        if(item.fields && item.fields.Gestion_Contabilidad === 'Por Procesar' && item.fields.Aprobacion_Doliente === 'Aprobado') {
            spCount++;
        }
    }
    console.log('Sharepoint count for Aprobado and Por Procesar:', spCount);
}
check();
