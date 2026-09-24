const WebSocket = require('ws');

const PORT = process.env.PORT || 10000;
const wss = new WebSocket.Server({ port: PORT });

// Estrutura para armazenar as salas e seus ciclistas conectados
// Formato: { 'CODIGO_SALA': { wsClient: { id, n, la, lo, av, c } } }
const salas = {};

wss.on('connection', (ws) => {
    let minhaSalaAtual = null;
    let meuIdUnico = Math.random().toString(36.substring(2, 9));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const codigoSala = data.s ? data.s.toUpperCase() : null;

            if (!codigoSala || !data.n) return;

            // Se mudou de sala, remove da sala anterior
            if (minhaSalaAtual && minhaSalaAtual !== codigoSala) {
                removerClienteDaSala(ws, minhaSalaAtual);
            }

            minhaSalaAtual = codigoSala;

            // Inicializa a sala se ela não existir
            if (!salas[minhaSalaAtual]) {
                salas[minhaSalaAtual] = new Map();
            }

            // Armazena ou atualiza os dados do ciclista nesta sala
            salas[minhaSalaAtual].set(ws, {
                id: meuIdUnico,
                n: data.n,   // Nome
                la: data.la, // Latitude
                lo: data.lo, // Longitude
                av: data.av, // Avatar
                c: data.c    // Cargo (lider, vassoura, membro)
            });

            // Coleta todos os ciclistas conectados APENAS nesta sala
            const ciclistasNaSala = Array.from(salas[minhaSalaAtual].values());
            const payload = JSON.stringify({ ciclistas: ciclistasNaSala });

            // Envia a atualização para todos os clientes conectados nesta sala
            salas[minhaSalaAtual].forEach((_, clientWs) => {
                if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(payload);
                }
            });

        } catch (e) {
            console.error("Erro ao processar mensagem do WebSocket:", e);
        }
    });

    ws.on('close', () => {
        if (minhaSalaAtual) {
            removerClienteDaSala(ws, minhaSalaAtual);
        }
    });
});

function removerClienteDaSala(ws, sala) {
    if (salas[sala]) {
        salas[sala].delete(ws);

        // Se a sala ficou vazia, remove ela da memória para economizar recursos
        if (salas[sala].size === 0) {
            delete salas[sala];
        } else {
            // Notifica os demais integrantes que alguém saiu
            const ciclistasNaSala = Array.from(salas[sala].values());
            const payload = JSON.stringify({ ciclistas: ciclistasNaSala });
            salas[sala].forEach((_, clientWs) => {
                if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(payload);
                }
            });
        }
    }
}

console.log(`Servidor WebSocket do Pelotão Cloud rodando na porta ${PORT}`);
