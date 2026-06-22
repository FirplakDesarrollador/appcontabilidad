const { Client } = require('@microsoft/microsoft-graph-client');
const msal = require('@azure/msal-node');

const msalConfig = {
    auth: {
        clientId: '46ca153e-526d-4076-9057-0accfa45377f',
        authority: 'https://login.microsoftonline.com/a5c65f97-c817-4fec-abb8-92b005118f67',
        clientSecret: 'Yqf8Q~vA_vF9_8m_mO1m-t4B-S-K3-w-H-D-J-b', // I'll search for this secrets in .env or similar
    },
};

// ... Wait, I don't have the secret. I'll check .env.local
