const fs = require('fs');
const envStr = fs.readFileSync('.env', 'utf8');
const env = {};
envStr.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) env[match[1]] = match[2].trim();
});

const { Client } = require("@microsoft/microsoft-graph-client");
const msal = require("@azure/msal-node");

const msalConfig = {
    auth: {
        clientId: env.AZURE_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${env.AZURE_TENANT_ID}`,
        clientSecret: env.AZURE_CLIENT_SECRET,
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
    const email = 'mateo.benavides@firplak.com';
    
    console.log(`Checking email ${email}...`);
    try {
        const userRes = await client.api(`/sites/${siteIdFPK}/lists('User Information List')/items`)
            .header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly')
            .expand('fields($select=id,EMail,Title)')
            .filter(`fields/EMail eq '${email}'`)
            .get();
        console.log(JSON.stringify(userRes, null, 2));
    } catch (e) {
        console.error(e.message);
    }
}

test();
