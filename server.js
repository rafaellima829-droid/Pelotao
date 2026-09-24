const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();
const clientMeta = new Map();

function calcularDistanciaMetros(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
              Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

wss.on('connection', (ws) => {
    let idUnico = Math.random().toString(36).substring(7);

    ws.on('message', (message) => {
        try {
            const dados = JSON.parse(message);
            const sala = (dados.s || 'GERAL').trim().toUpperCase();
            const meta = clientMeta.get(ws);

            if (meta && meta.sala !== sala) {
                removeFromRoom(meta.sala, meta.idUnico);
            }

            clientMeta.set(ws, { idUnico, sala });

            if (!rooms.has(sala)) {
                rooms.set(sala, new Map());
            }

            const roomMap = rooms.get(sala);
            let cargoFinal = dados.c || 'membro';

            // REGRA: Apenas 1 líder por sala
            if (cargoFinal === 'lider') {
                let jaTemLider = false;
                for (let [otherId, occupant] of roomMap.entries()) {
                    if (otherId !== idUnico && occupant.cargo === 'lider') {
                        jaTemLider = true;
                        break;
                    }
                }
                if (jaTemLider) {
                    cargoFinal = 'membro'; // Força para membro se já houver líder
                }
            }

            roomMap.set(idUnico, {
                id: idUnico,
                nome: dados.n,
                cargo: cargoFinal,
                lat: dados.la,
                lng: dados.lo,
                timestamp: Date.now()
            });

            broadcastRoom(sala);
        } catch (e) {
            console.error('Erro ao processar mensagem:', e);
        }
    });

    ws.on('close', () => {
        const meta = clientMeta.get(ws);
        if (meta) {
            removeFromRoom(meta.sala, meta.idUnico);
            clientMeta.delete(ws);
            broadcastRoom(meta.sala);
        }
    });
});

function removeFromRoom(sala, idUnico) {
    if (rooms.has(sala)) {
        rooms.get(sala).delete(idUnico);
        if (rooms.get(sala).size === 0) {
            rooms.delete(sala);
        }
    }
}

function broadcastRoom(sala) {
    if (!rooms.has(sala)) return;
    const ciclistasArray = Array.from(rooms.get(sala).values());

    let distanciaElastico = 0;
    let liderObj = ciclistasArray.find(c => c.cargo === 'lider');
    let vassouraObj = ciclistasArray.find(c => c.cargo === 'vassoura');

    if (liderObj && vassouraObj) {
        distanciaElastico = calcularDistanciaMetros(liderObj.lat, liderObj.lng, vassouraObj.lat, vassouraObj.lng);
    } else if (ciclistasArray.length > 1) {
        for (let i = 0; i < ciclistasArray.length; i++) {
            for (let j = i + 1; j < ciclistasArray.length; j++) {
                const dist = calcularDistanciaMetros(
                    ciclistasArray[i].lat, ciclistasArray[i].lng,
                    ciclistasArray[j].lat, ciclistasArray[j].lng
                );
                if (dist > distanciaElastico) distanciaElastico = dist;
            }
        }
    }

    const LIMITE_ELASTICO_METROS = 400; 
    const alertaElastico = distanciaElastico > LIMITE_ELASTICO_METROS && ciclistasArray.length > 1;

    const payload = JSON.stringify({
        ciclistas: ciclistasArray,
        alerta: alertaElastico,
        distanciaMax: Math.round(distanciaElastico)
    });
    
    clientMeta.forEach((meta, ws) => {
        if (meta.sala === sala && ws.readyState === WebSocket.OPEN) {
            ws.send(payload);
        }
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});