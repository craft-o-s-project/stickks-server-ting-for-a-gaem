const WebSocket = require('ws');
const port = 8080;

const wss = new WebSocket.Server({ port });
const players = new Map();

console.log(`🎮 Game server running on ws://localhost:${port}`);

wss.on('connection', (ws) => {
  let playerId = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'join':
          playerId = generateId();
          players.set(playerId, {
            id: playerId,
            username: data.username,
            position: data.position || { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            health: 100,
            ws: ws
          });

          ws.send(JSON.stringify({
            type: 'welcome',
            playerId: playerId
          }));

          const allPlayers = {};
          players.forEach((p, id) => {
            if (id !== playerId) {
              allPlayers[id] = {
                username: p.username,
                position: p.position,
                rotation: p.rotation,
                health: p.health
              };
            }
          });
          ws.send(JSON.stringify({
            type: 'players',
            players: allPlayers
          }));

          broadcast({
            type: 'playerJoined',
            playerId: playerId,
            player: {
              username: data.username,
              position: data.position,
              rotation: { x: 0, y: 0, z: 0 },
              health: 100
            }
          }, playerId);

          console.log(`✅ Player ${data.username} joined (ID: ${playerId})`);
          console.log(`👥 Players online: ${players.size}`);
          break;

        case 'move':
          if (playerId && players.has(playerId)) {
            const player = players.get(playerId);
            player.position = data.position;
            player.rotation = data.rotation;

            broadcast({
              type: 'playerMove',
              playerId: playerId,
              position: data.position,
              rotation: data.rotation
            }, playerId);
          }
          break;

        case 'gather':
          if (playerId && players.has(playerId)) {
            ws.send(JSON.stringify({
              type: 'resourceGathered',
              playerId: playerId,
              resource: data.resource,
              amount: data.amount
            }));

            console.log(`⛏️  Player ${playerId} gathered ${data.amount} ${data.resource}`);
          }
          break;

        case 'attack':
          if (playerId && players.has(playerId) && data.targetId) {
            const target = players.get(data.targetId);
            if (target) {
              target.health = Math.max(0, target.health - 10);

              target.ws.send(JSON.stringify({
                type: 'playerHit',
                playerId: data.targetId,
                health: target.health,
                attackerId: playerId
              }));

              broadcast({
                type: 'healthUpdate',
                playerId: data.targetId,
                health: target.health
              });

              console.log(`⚔️  Player ${playerId} attacked ${data.targetId} (HP: ${target.health})`);

              if (target.health <= 0) {
                console.log(`💀 Player ${data.targetId} was eliminated`);
              }
            }
          }
          break;
      }
    } catch (err) {
      console.error('Error processing message:', err);
    }
  });

  ws.on('close', () => {
    if (playerId) {
      const player = players.get(playerId);
      players.delete(playerId);
      
      broadcast({
        type: 'playerLeft',
        playerId: playerId
      });

      console.log(`❌ Player ${player?.username || playerId} left`);
      console.log(`👥 Players online: ${players.size}`);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

function broadcast(data, excludeId = null) {
  const message = JSON.stringify(data);
  players.forEach((player, id) => {
    if (id !== excludeId && player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(message);
    }
  });
}

function generateId() {
  return `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  wss.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
