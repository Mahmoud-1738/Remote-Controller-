const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = 3000;

app.use(express.static(path.join(__dirname, '../game')));

function getLanIp() {
    const nets = os.networkInterfaces();
    for (const ifaces of Object.values(nets)) {
        for (const iface of ifaces) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

const lanIp = getLanIp();
const controllerUrl = `http://${lanIp}:${port}/controller.html`;

// Track which socket ID holds each player slot (index 0 = P1, index 1 = P2)
const players = [null, null];

io.on('connection', (socket) => {
    socket.emit('serverInfo', { controllerUrl });

    // Controllers call 'register' to claim a player slot.
    // Optional: { preferred: 0 or 1 } to request a specific slot.
    socket.on('register', (data) => {
        const preferred = data && (data.preferred === 0 || data.preferred === 1)
            ? data.preferred : null;

        let playerID = -1;
        if (preferred !== null) {
            // Try requested slot first, fall back to the other
            if      (players[preferred]     === null) { players[preferred]     = socket.id; playerID = preferred; }
            else if (players[1 - preferred] === null) { players[1 - preferred] = socket.id; playerID = 1 - preferred; }
        } else {
            if      (players[0] === null) { players[0] = socket.id; playerID = 0; }
            else if (players[1] === null) { players[1] = socket.id; playerID = 1; }
        }

        socket.emit('playerAssigned', { playerID });

        if (playerID !== -1) {
            console.log(`Player ${playerID + 1} connected (${socket.id})`);
        } else {
            console.log(`Controller rejected — both slots full (${socket.id})`);
        }
    });

    // Relay input to game page, stamped with the sender's playerID
    socket.on('input', (data) => {
        const idx = players.indexOf(socket.id);
        if (idx !== -1) {
            socket.broadcast.emit('gameInput', { ...data, playerID: idx });
        }
    });

    socket.on('disconnect', () => {
        const idx = players.indexOf(socket.id);
        if (idx !== -1) {
            console.log(`Player ${idx + 1} disconnected`);
            players[idx] = null;
        }
    });
});

server.listen(port, () => {
    console.log(`Game:       http://localhost:${port}`);
    console.log(`Controller: ${controllerUrl}`);
});
