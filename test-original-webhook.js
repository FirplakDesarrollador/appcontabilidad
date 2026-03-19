const fs = require('fs');
const https = require('https');

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const [key, ...value] = line.split('=');
    if (key && value) {
        env[key.trim()] = value.join('=').trim();
    }
});

const webhookUrl = env.TEAMS_WEBHOOK_URL;
if (!webhookUrl) {
    console.error('TEAMS_WEBHOOK_URL not found');
    process.exit(1);
}

const payload = {
    type: 'message',
    attachments: [{
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
            type: 'AdaptiveCard',
            body: [{
                type: 'TextBlock',
                size: 'Large',
                weight: 'Bolder',
                text: '🧪 Prueba de Notificación (WEBHOOK ORIGINAL)'
            }, {
                type: 'TextBlock',
                text: 'Esta es una prueba para confirmar que el Webhook de Teams original sigue funcionando correctamente tras la reversión.',
                wrap: true
            }],
            $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
            version: '1.4'
        }
    }]
};

const url = new URL(webhookUrl);
const options = {
    hostname: url.hostname,
    port: 443,
    path: url.pathname + url.search,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
};

console.log('Enviando prueba al Webhook original...');
const req = https.request(options, (res) => {
    console.log('Status:', res.statusCode);
    res.on('data', (d) => process.stdout.write(d));
});

req.on('error', (e) => console.error('Error:', e));
req.write(JSON.stringify(payload));
req.end();
