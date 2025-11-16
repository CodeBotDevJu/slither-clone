const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Configuration CORS pour accepter GitHub Pages
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Configuration du jeu
const CONFIG = {
  MAP_SIZE: 5000,
  ORB_COUNT: 800,
  TICK_RATE: 30, // 30 FPS côté serveur
  INITIAL_SNAKE_LENGTH: 10,
  SEGMENT_RADIUS: 8,
  BASE_SPEED: 2.5,
  BOOST_SPEED: 5,
  BOOST_LOSS: 0.05,
  ORB_VALUE: 1,
  VIEW_DISTANCE: 1200
};

// État du jeu
const gameState = {
  snakes: new Map(),
  orbs: [],
  lastUpdate: Date.now()
};

// Classe Serpent
class Snake {
  constructor(id, nickname, x, y) {
    this.id = id;
    this.nickname = nickname || `Player${id.substring(0, 4)}`;
    this.segments = [];
    this.direction = { x: 1, y: 0 };
    this.speed = CONFIG.BASE_SPEED;
    this.boosting = false;
    this.color = this.randomColor();
    this.alive = true;
    
    // Initialiser les segments
    for (let i = 0; i < CONFIG.INITIAL_SNAKE_LENGTH; i++) {
      this.segments.push({ x: x - i * CONFIG.SEGMENT_RADIUS, y });
    }
  }
  
  randomColor() {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', 
      '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }
  
  get score() {
    return Math.floor((this.segments.length - CONFIG.INITIAL_SNAKE_LENGTH) * 10);
  }
  
  get radius() {
    return CONFIG.SEGMENT_RADIUS + Math.sqrt(this.segments.length) * 0.3;
  }
  
  setDirection(mouseX, mouseY) {
    const head = this.segments[0];
    const dx = mouseX - head.x;
    const dy = mouseY - head.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > 0) {
      this.direction = {
        x: dx / distance,
        y: dy / distance
      };
    }
  }
  
  update() {
    if (!this.alive) return;
    
    const head = this.segments[0];
    const speed = this.boosting ? CONFIG.BOOST_SPEED : CONFIG.BASE_SPEED;
    
    // Nouvelle position de la tête
    const newHead = {
      x: head.x + this.direction.x * speed,
      y: head.y + this.direction.y * speed
    };
    
    // Wrap around aux bordures
    newHead.x = (newHead.x + CONFIG.MAP_SIZE) % CONFIG.MAP_SIZE;
    newHead.y = (newHead.y + CONFIG.MAP_SIZE) % CONFIG.MAP_SIZE;
    
    this.segments.unshift(newHead);
    
    // Gestion du boost (perte de masse)
    if (this.boosting && this.segments.length > CONFIG.INITIAL_SNAKE_LENGTH + 5) {
      const lossAmount = CONFIG.BOOST_LOSS;
      for (let i = 0; i < lossAmount && this.segments.length > CONFIG.INITIAL_SNAKE_LENGTH; i++) {
        this.segments.pop();
      }
    } else {
      this.segments.pop();
    }
  }
  
  grow(amount = 3) {
    const tail = this.segments[this.segments.length - 1];
    for (let i = 0; i < amount; i++) {
      this.segments.push({ ...tail });
    }
  }
  
  die() {
    this.alive = false;
    // Créer des orbes à partir du corps
    const orbs = [];
    for (let i = 0; i < this.segments.length; i += 2) {
      orbs.push({
        x: this.segments[i].x,
        y: this.segments[i].y,
        color: this.color,
        radius: 6,
        value: 2
      });
    }
    return orbs;
  }
  
  toJSON() {
    return {
      id: this.id,
      nickname: this.nickname,
      segments: this.segments.slice(0, 50), // Limiter pour la bande passante
      color: this.color,
      score: this.score,
      radius: this.radius
    };
  }
}

// Génération des orbes
function generateOrbs() {
  gameState.orbs = [];
  for (let i = 0; i < CONFIG.ORB_COUNT; i++) {
    gameState.orbs.push({
      x: Math.random() * CONFIG.MAP_SIZE,
      y: Math.random() * CONFIG.MAP_SIZE,
      color: `hsl(${Math.random() * 360}, 70%, 60%)`,
      radius: 4,
      value: CONFIG.ORB_VALUE
    });
  }
}

// Détection de collision
function checkCollision(x1, y1, r1, x2, y2, r2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return distance < r1 + r2;
}

// Boucle de jeu principale
function gameLoop() {
  const now = Date.now();
  const delta = now - gameState.lastUpdate;
  gameState.lastUpdate = now;
  
  // Mise à jour des serpents
  gameState.snakes.forEach(snake => {
    if (!snake.alive) return;
    
    snake.update();
    const head = snake.segments[0];
    
    // Collision avec les orbes
    for (let i = gameState.orbs.length - 1; i >= 0; i--) {
      const orb = gameState.orbs[i];
      if (checkCollision(head.x, head.y, snake.radius, orb.x, orb.y, orb.radius)) {
        snake.grow(orb.value);
        gameState.orbs.splice(i, 1);
        
        // Régénérer une orbe
        gameState.orbs.push({
          x: Math.random() * CONFIG.MAP_SIZE,
          y: Math.random() * CONFIG.MAP_SIZE,
          color: `hsl(${Math.random() * 360}, 70%, 60%)`,
          radius: 4,
          value: CONFIG.ORB_VALUE
        });
      }
    }
    
    // Collision avec d'autres serpents
    gameState.snakes.forEach(otherSnake => {
      if (snake.id === otherSnake.id || !otherSnake.alive) return;
      
      // Collision tête vs corps
      for (let i = 3; i < otherSnake.segments.length; i++) {
        const segment = otherSnake.segments[i];
        if (checkCollision(head.x, head.y, snake.radius, segment.x, segment.y, otherSnake.radius)) {
          const newOrbs = snake.die();
          gameState.orbs.push(...newOrbs);
          io.to(snake.id).emit('player_died', { 
            killerId: otherSnake.id, 
            killerName: otherSnake.nickname,
            score: snake.score 
          });
          return;
        }
      }
    });
  });
  
  // Nettoyer les serpents morts
  gameState.snakes.forEach((snake, id) => {
    if (!snake.alive) {
      setTimeout(() => gameState.snakes.delete(id), 100);
    }
  });
}

// Obtenir le leaderboard
function getLeaderboard() {
  return Array.from(gameState.snakes.values())
    .filter(s => s.alive)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(s => ({ nickname: s.nickname, score: s.score }));
}

// Obtenir les entités visibles pour un joueur
function getVisibleEntities(playerId) {
  const snake = gameState.snakes.get(playerId);
  if (!snake || !snake.alive) return { snakes: [], orbs: [] };
  
  const head = snake.segments[0];
  const viewDistance = CONFIG.VIEW_DISTANCE;
  
  // Filtrer les serpents visibles
  const visibleSnakes = Array.from(gameState.snakes.values())
    .filter(s => s.alive)
    .filter(s => {
      const dist = Math.sqrt(
        Math.pow(s.segments[0].x - head.x, 2) + 
        Math.pow(s.segments[0].y - head.y, 2)
      );
      return dist < viewDistance;
    })
    .map(s => s.toJSON());
  
  // Filtrer les orbes visibles
  const visibleOrbs = gameState.orbs.filter(orb => {
    const dist = Math.sqrt(
      Math.pow(orb.x - head.x, 2) + 
      Math.pow(orb.y - head.y, 2)
    );
    return dist < viewDistance;
  });
  
  return { snakes: visibleSnakes, orbs: visibleOrbs };
}

// Gestion des connexions Socket.io
io.on('connection', (socket) => {
  console.log(`Joueur connecté: ${socket.id}`);
  
  socket.on('join', (data) => {
    const { nickname } = data;
    const x = Math.random() * CONFIG.MAP_SIZE;
    const y = Math.random() * CONFIG.MAP_SIZE;
    
    const snake = new Snake(socket.id, nickname, x, y);
    gameState.snakes.set(socket.id, snake);
    
    socket.emit('init', {
      playerId: socket.id,
      mapSize: CONFIG.MAP_SIZE
    });
    
    console.log(`${nickname} a rejoint le jeu`);
  });
  
  socket.on('mouse_move', (data) => {
    const snake = gameState.snakes.get(socket.id);
    if (snake && snake.alive) {
      snake.setDirection(data.x, data.y);
    }
  });
  
  socket.on('boost_start', () => {
    const snake = gameState.snakes.get(socket.id);
    if (snake && snake.alive) {
      snake.boosting = true;
    }
  });
  
  socket.on('boost_end', () => {
    const snake = gameState.snakes.get(socket.id);
    if (snake && snake.alive) {
      snake.boosting = false;
    }
  });
  
  socket.on('disconnect', () => {
    gameState.snakes.delete(socket.id);
    console.log(`Joueur déconnecté: ${socket.id}`);
  });
});

// Broadcast de l'état du jeu
setInterval(() => {
  gameState.snakes.forEach((snake, playerId) => {
    if (!snake.alive) return;
    
    const visible = getVisibleEntities(playerId);
    io.to(playerId).emit('game_state', {
      snakes: visible.snakes,
      orbs: visible.orbs,
      leaderboard: getLeaderboard()
    });
  });
}, 1000 / CONFIG.TICK_RATE);

// Démarrer la boucle de jeu
setInterval(gameLoop, 1000 / 60);

// Générer les orbes initiales
generateOrbs();

// Route de test
app.get('/', (req, res) => {
  res.json({ 
    status: 'Serveur Slither.io actif',
    players: gameState.snakes.size,
    orbs: gameState.orbs.length
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🐍 Serveur Slither.io démarré sur le port ${PORT}`);
});
