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

io.on('connection', (socket) => {
    socket.emit('serverInfo', { controllerUrl });

    socket.on('input', (data) => {
        socket.broadcast.emit('gameInput', data);
    });
});

server.listen(port, () => {
    console.log(`Game:       http://localhost:${port}`);
    console.log(`Controller: ${controllerUrl}`);
});
