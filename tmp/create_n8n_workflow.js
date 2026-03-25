const fs = require('fs');

async function createWorkflow() {
    try {
        const fullJson = JSON.parse(fs.readFileSync('C:/Users/isaza/OneDrive/Documentos/Financial App FPK/tmp/flujo_aprobacion_v2.json', 'utf8'));

        const payload = {
            name: fullJson.name,
            nodes: fullJson.nodes,
            connections: fullJson.connections,
            settings: fullJson.settings
        };

        const response = await fetch('https://desarrolladorfirplak.app.n8n.cloud/api/v1/workflows', {
            method: 'POST',
            headers: {
                'X-N8N-API-KEY': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjMGZhMjJjOC0yNmU2LTQyMzMtOTQ5Yi01NTFlYjRjYzU2ZDciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMzllZGVhZGQtYzllMi00ZmM4LTg5NmQtZTZmZWQ2NDFlZWEyIiwiaWF0IjoxNzc0NDU0MDMxfQ.q9eFqgjJRQ5lFRoltmiUhZ4UohMJP6lao_-jCzhC7OU',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok) {
            console.log("SUCCESS_ID:" + data.id);
        } else {
            console.error("Error al crear workflow:", data.message);
        }
    } catch (e) {
        console.error("Excepción:", e);
    }
}

createWorkflow();
