const { Client } = require("@microsoft/microsoft-graph-client");
require("isomorphic-fetch");

async function getAccessToken() {
    const tenantId = "858f1212-0f73-455b-80a5-833446b5a324";
    const clientId = "54302621-e0e6-42d4-a038-769062a4a754";
    const clientSecret = "t~L8Q~F-VvVp-E6Wc7.yH1m_k_~X9vH_S"; // This should be in env but using what's in lib/sharepoint.ts

    const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
        client_id: clientId,
        scope: "https://graph.microsoft.com/.default",
        client_secret: clientSecret,
        grant_type: "client_credentials",
    });

    const response = await fetch(url, {
        method: "POST",
        body: body,
    });

    const data = await response.json();
    return data.access_token;
}

async function main() {
    const accessToken = await getAccessToken();
    const client = Client.init({
        authProvider: (done) => {
            done(null, accessToken);
        },
    });

    const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
    const siteId = siteResponse.id;

    const listName = 'Registro_de_Facturas';
    const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
    const list = listsResponse.value.find(l => l.name === listName || l.displayName === listName);

    if (!list) {
        console.log("List not found");
        return;
    }

    const columns = await client.api(`/sites/${siteId}/lists/${list.id}/columns`).get();
    console.log("COLUMNS:");
    columns.value.forEach(c => {
        console.log(`${c.displayName} -> ${c.name}`);
    });
}

main().catch(console.error);
