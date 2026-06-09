require('dotenv').config({ path: '.env' });
const { Client } = require("@microsoft/microsoft-graph-client");
const msal = require("@azure/msal-node");

const msalConfig = {
    auth: {
        clientId: process.env.AZURE_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
    }
};

const cca = new msal.ConfidentialClientApplication(msalConfig);

async function test() {
    const tokenRequest = { scopes: ["https://graph.microsoft.com/.default"] };
    const response = await cca.acquireTokenByClientCredential(tokenRequest);
    
    const client = Client.init({
        authProvider: (done) => done(null, response.accessToken),
    });

    const siteIdFPK = 'firplaksa.sharepoint.com,fa1de04f-4780-4d83-a942-93c7ae8dee9d,478412bc-ff3c-4c14-b5a3-e099822c2775';

    console.log("Checking Documento_Soporte list items...");
    try {
        const docs = await client.api(`/sites/${siteIdFPK}/lists('Documento_Soporte')/items`)
            .expand('fields')
            .top(5)
            .get();
        
        for (const doc of docs.value) {
            console.log(`Doc ID: ${doc.id}, Title: ${doc.fields.Title}, tsic: ${doc.fields.tsic}`);
            console.log(`Lookup ID fields: ResponsableAprobarLookupId=${doc.fields.ResponsableAprobarLookupId}, Responsable_de_AutorizarLookupId=${doc.fields.Responsable_de_AutorizarLookupId}`);
            console.log("All fields keys:", Object.keys(doc.fields).filter(k => k.toLowerCase().includes('responsable')));
            console.log("-------------");
        }
    } catch (e) {
        console.error(e.message);
    }
}

test();
