const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 10000;

// Servidor HTTP para arquivos estáticos (pasta public)
const server = http.createServer((req, res) => {
    let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
    let extname = String(path.extname(filePath)).toLowerCase();
    
    const mimeTypes = {
        '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
        '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpg', '.svg': 'image/svg+xml'
    };

    let contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            fs.readFile(path.join(__dirname, 'public', 'index.html'), (err, htmlContent) => {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(htmlContent, 'utf-8');
            });
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

const wss = new WebSocket.Server({ server });
const salas = {}; // { 'CODIGO_SALA': Map(ws => dadosCiclista) }

wss.on('connection', (ws) => {
    let minhaSalaAtual = null;
    let meuIdUnico = 'user-' + Math.random().toString(36).substring(2, 8);
    console.log(`[WS] Novo cliente conectado (${meuIdUnico})`);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const codigoSala = data.s ? data.s.trim().toUpperCase() : null;
            const nomeUsuario = data.n ? data.n.trim() : null;

            if (!codigoSala || !nomeUsuario) {
                console.log("[WS] Mensagem ignorada: falta sala ou nome.", data);
                return;
            }

            // Se mudou de sala, limpa da anterior
            if (minhaSalaAtual && minhaSalaAtual !== codigoSala) {
                removerClienteDaSala(ws, minhaSalaAtual);
            }

            minhaSalaAtual = codigoSala;

            if (!salas[minhaSalaAtual]) {
                salas[minhaSalaAtual] = new Map();
            }

            // Salva os dados exatos do ciclista
            salas[minhaSalaAtual].set(ws, {
                id: meuIdUnico,
                n: nomeUsuario,
                la: data.la,
                lo: data.lo,
                av: data.av || '',
                c: data.c || 'membro'
            });

            const ciclistasNaSala = Array.from(salas[minhaSalaAtual].values());
            console.log(`[WS] Sala [${minhaSalaAtual}] tem ${ciclistasNaSala.length} ciclista(s) ativo(s).`);

            const payload = JSON.stringify({ ciclistas: ciclistasNaSala });

            // Envia para todos na sala
            salas[minhaSalaAtual].forEach((_, clientWs) => {
                if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(payload);
                }
            });

        } catch (e) {
            console.error("[WS] Erro ao processar mensagem JSON:", e);
        }
    });

    ws.on('close', () => {
        console.log(`[WS] Cliente desconectado (${meuIdUnico})`);
        if (minhaSalaAtual) {
            removerClienteDaSala(ws, minhaSalaAtual);
        }
    });
});

function removerClienteDaSala(ws, sala) {
    if (salas[sala]) {
        salas[sala].delete(ws);
        if (salas[sala].size === 0) {
            delete salas[sala];
        } else {
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

server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
