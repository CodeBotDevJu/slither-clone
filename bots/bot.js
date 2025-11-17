// bot.js - Script pour créer des bots Slither.io
// Ce script se connecte au serveur comme un vrai joueur

const io = require('socket.io-client');

// ⚙️ CONFIGURATION
const SERVER_URL = 'https://slither-server-cmt6.onrender.com'; // TON URL ICI
const NUM_BOTS = 5; // Nombre de bots à lancer
const BOT_NAMES = [
  'BotAlpha', 'BotBeta', 'BotGamma', 'BotDelta', 'BotOmega',
  'SnakeAI', 'PyBot', 'AutoSnake', 'NeuralBot', 'SmartSnake'
];

// 🤖 Classe Bot
class Bot {
  constructor(id) {
    this.id = id;
    this.nickname = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] + id;
    this.socket = null;
    this.playerId = null;
    this.position = { x: 0, y: 0 };
    this.targetOrb = null;
    this.nearbySnakes = [];
    this.mapSize = 5000;
    this.alive = false;
    this.updateInterval = null;
  }

  // Connexion au serveur
  connect() {
    console.log(`🤖 [${this.nickname}] Connexion au serveur...`);
    
    this.socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true
    });

    this.socket.on('connect', () => {
      console.log(`✅ [${this.nickname}] Connecté`);
      this.socket.emit('join', { nickname: this.nickname });
    });

    this.socket.on('init', (data) => {
      this.playerId = data.playerId;
      this.mapSize = data.mapSize;
      this.alive = true;
      console.log(`🎮 [${this.nickname}] Entré dans le jeu`);
      this.startAI();
    });

    this.socket.on('game_state', (data) => {
      this.updateGameState(data);
    });

    this.socket.on('player_died', (data) => {
      console.log(`💀 [${this.nickname}] Mort ! Score: ${data.score}`);
      this.alive = false;
      clearInterval(this.updateInterval);
      
      // Respawn après 3 secondes
      setTimeout(() => this.respawn(), 3000);
    });

    this.socket.on('disconnect', () => {
      console.log(`❌ [${this.nickname}] Déconnecté`);
      this.alive = false;
      clearInterval(this.updateInterval);
    });
  }

  // Respawn
  respawn() {
    if (this.socket && this.socket.connected) {
      console.log(`🔄 [${this.nickname}] Respawn...`);
      this.socket.emit('join', { nickname: this.nickname });
    }
  }

  // Mise à jour de l'état du jeu
  updateGameState(data) {
    // Trouver le bot dans la liste des serpents
    const mySnake = data.snakes.find(s => s.id === this.playerId);
    if (mySnake && mySnake.segments && mySnake.segments.length > 0) {
      this.position = mySnake.segments[0];
    }

    // Trouver l'orbe la plus proche
    this.targetOrb = this.findNearestOrb(data.orbs);
    
    // Détecter les serpents dangereux
    this.nearbySnakes = data.snakes.filter(s => 
      s.id !== this.playerId && this.distance(s.segments[0], this.position) < 200
    );
  }

  // Trouver l'orbe la plus proche
  findNearestOrb(orbs) {
    if (!orbs || orbs.length === 0) return null;
    
    let nearest = null;
    let minDist = Infinity;

    orbs.forEach(orb => {
      const dist = this.distance(orb, this.position);
      if (dist < minDist) {
        minDist = dist;
        nearest = orb;
      }
    });

    return nearest;
  }

  // Calculer la distance
  distance(pos1, pos2) {
    if (!pos1 || !pos2) return Infinity;
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // 🧠 Intelligence artificielle
  startAI() {
    this.updateInterval = setInterval(() => {
      if (!this.alive) return;

      let targetX = this.position.x;
      let targetY = this.position.y;

      // 🎯 Stratégie 1 : Éviter les serpents dangereux
      if (this.nearbySnakes.length > 0) {
        const threat = this.nearbySnakes[0];
        const threatHead = threat.segments[0];
        
        // Fuir dans la direction opposée
        targetX = this.position.x + (this.position.x - threatHead.x) * 2;
        targetY = this.position.y + (this.position.y - threatHead.y) * 2;
        
        console.log(`⚠️ [${this.nickname}] Évite un serpent !`);
      }
      // 🎯 Stratégie 2 : Chercher des orbes
      else if (this.targetOrb) {
        targetX = this.targetOrb.x;
        targetY = this.targetOrb.y;
      }
      // 🎯 Stratégie 3 : Se promener aléatoirement
      else {
        targetX = this.position.x + (Math.random() - 0.5) * 200;
        targetY = this.position.y + (Math.random() - 0.5) * 200;
      }

      // Garder dans les limites de la carte
      targetX = Math.max(50, Math.min(this.mapSize - 50, targetX));
      targetY = Math.max(50, Math.min(this.mapSize - 50, targetY));

      // Envoyer la direction au serveur
      this.socket.emit('mouse_move', { x: targetX, y: targetY });

      // 🚀 Boost aléatoire (10% de chance)
      if (Math.random() < 0.1) {
        this.socket.emit('boost_start');
        setTimeout(() => {
          if (this.alive) this.socket.emit('boost_end');
        }, 500);
      }

    }, 200); // Mise à jour toutes les 200ms
  }

  // Déconnexion
  disconnect() {
    if (this.socket) {
      clearInterval(this.updateInterval);
      this.socket.disconnect();
      console.log(`👋 [${this.nickname}] Déconnecté proprement`);
    }
  }
}

// 🚀 Lancer les bots
console.log(`🤖 Lancement de ${NUM_BOTS} bots...`);
console.log(`🎯 Serveur cible: ${SERVER_URL}\n`);

const bots = [];
for (let i = 0; i < NUM_BOTS; i++) {
  const bot = new Bot(i + 1);
  bots.push(bot);
  
  // Délai entre chaque bot pour éviter la surcharge
  setTimeout(() => {
    bot.connect();
  }, i * 1000);
}

// Gestion de l'arrêt propre
process.on('SIGINT', () => {
  console.log('\n\n🛑 Arrêt des bots...');
  bots.forEach(bot => bot.disconnect());
  process.exit(0);
});

// Statistiques toutes les 10 secondes
setInterval(() => {
  const alive = bots.filter(b => b.alive).length;
  console.log(`\n📊 Statistiques: ${alive}/${NUM_BOTS} bots actifs`);
}, 10000);
