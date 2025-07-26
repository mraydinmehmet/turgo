const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const TurgoGame = require('./game-logic');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Güvenlik middleware'leri
app.use(helmet());
app.use(cors());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 100 // IP başına maksimum 100 istek
});
app.use(limiter);

app.use(express.static('public'));
app.use(express.json());

// Oyun yönetimi
const games = new Map(); // gameId -> TurgoGame
const playerSockets = new Map(); // socketId -> {gameId, teamId, teamName}

function generateGameCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
  console.log('Yeni oyuncu bağlandı:', socket.id);

  // Oyun oluşturma
  socket.on('createGame', (data) => {
    try {
      const gameCode = generateGameCode();
      const game = new TurgoGame(gameCode);
      
      if (!game.addTeam(socket.id, data.teamName)) {
        socket.emit('error', { message: 'Takım eklenemedi!' });
        return;
      }
      
      games.set(gameCode, game);
      playerSockets.set(socket.id, {
        gameId: gameCode,
        teamId: socket.id,
        teamName: data.teamName
      });
      
      socket.join(gameCode);
      
      socket.emit('gameCreated', {
        gameCode: gameCode,
        teamId: socket.id,
        teamName: data.teamName
      });
      
      // Oyun durumunu gönder
      io.to(gameCode).emit('gameUpdate', game.getGameState());
      
    } catch (error) {
      console.error('Oyun oluşturma hatası:', error);
      socket.emit('error', { message: 'Oyun oluşturulamadı!' });
    }
  });

  // Oyuna katılma
  socket.on('joinGame', (data) => {
    try {
      const { gameCode, teamName } = data;
      const game = games.get(gameCode);
      
      if (!game) {
        socket.emit('error', { message: 'Oyun bulunamadı!' });
        return;
      }
      
      if (game.gameState !== 'waiting') {
        socket.emit('error', { message: 'Oyun zaten başlamış!' });
        return;
      }
      
      if (!game.addTeam(socket.id, teamName)) {
        socket.emit('error', { message: 'Oyuna katılamazsınız! (Maksimum 6 takım)' });
        return;
      }
      
      playerSockets.set(socket.id, {
        gameId: gameCode,
        teamId: socket.id,
        teamName: teamName
      });
      
      socket.join(gameCode);
      
      socket.emit('gameJoined', {
        gameCode: gameCode,
        teamId: socket.id,
        teamName: teamName
      });
      
      // Oyun durumunu güncelle
      io.to(gameCode).emit('gameUpdate', game.getGameState());
      
    } catch (error) {
      console.error('Oyuna katılma hatası:', error);
      socket.emit('error', { message: 'Oyuna katılamazsınız!' });
    }
  });

  // Oyunu başlatma
  socket.on('startGame', () => {
    try {
      const playerData = playerSockets.get(socket.id);
      if (!playerData) return;
      
      const game = games.get(playerData.gameId);
      if (!game) return;
      
      if (game.startGame()) {
        // İlk kelimeyi yükle
        game.nextRound();
        io.to(playerData.gameId).emit('gameUpdate', game.getGameState());
        io.to(playerData.gameId).emit('gameStarted');
      } else {
        socket.emit('error', { message: 'Oyun başlatılamadı! En az 3 takım gerekli.' });
      }
      
    } catch (error) {
      console.error('Oyun başlatma hatası:', error);
      socket.emit('error', { message: 'Oyun başlatılamadı!' });
    }
  });

  // Tahmin yapma
  socket.on('makeGuess', (data) => {
    try {
      const playerData = playerSockets.get(socket.id);
      if (!playerData) return;
      
      const game = games.get(playerData.gameId);
      if (!game) return;
      
      const result = game.makeGuess(socket.id, data.guess);
      
      socket.emit('guessResult', result);
      io.to(playerData.gameId).emit('gameUpdate', game.getGameState());
      
      // Eğer kelime/puzzle tamamlandıysa bir sonraki raunda geç
      if (result.correct) {
        setTimeout(() => {
          game.nextRound();
          io.to(playerData.gameId).emit('gameUpdate', game.getGameState());
        }, 2000);
      }
      
    } catch (error) {
      console.error('Tahmin yapma hatası:', error);
      socket.emit('error', { message: 'Tahmin yapılamadı!' });
    }
  });

  // Buzzer basma
  socket.on('pressBuzzer', () => {
    try {
      const playerData = playerSockets.get(socket.id);
      if (!playerData) return;
      
      const game = games.get(playerData.gameId);
      if (!game) return;
      
      const result = game.pressBuzzer(socket.id);
      
      socket.emit('buzzerResult', result);
      io.to(playerData.gameId).emit('gameUpdate', game.getGameState());
      
    } catch (error) {
      console.error('Buzzer basma hatası:', error);
      socket.emit('error', { message: 'Buzzer basılamadı!' });
    }
  });

  // Pas geçme (sadece final etabında)
  socket.on('passWord', () => {
    try {
      const playerData = playerSockets.get(socket.id);
      if (!playerData) return;
      
      const game = games.get(playerData.gameId);
      if (!game || game.currentStage !== 4) return;
      
      const activeTeam = game.getActiveTeam();
      if (!activeTeam || activeTeam.id !== socket.id) return;
      
      // Yeni kelime yükle
      game.nextRound();
      io.to(playerData.gameId).emit('gameUpdate', game.getGameState());
      
    } catch (error) {
      console.error('Pas geçme hatası:', error);
      socket.emit('error', { message: 'Pas geçilemedi!' });
    }
  });

  // Bağlantı kopma
  socket.on('disconnect', () => {
    try {
      console.log('Oyuncu ayrıldı:', socket.id);
      
      const playerData = playerSockets.get(socket.id);
      if (playerData) {
        const game = games.get(playerData.gameId);
        if (game) {
          game.removeTeam(socket.id);
          
          // Eğer oyunda kimse kalmadıysa oyunu sil
          if (game.teams.size === 0) {
            games.delete(playerData.gameId);
          } else {
            io.to(playerData.gameId).emit('gameUpdate', game.getGameState());
          }
        }
        
        playerSockets.delete(socket.id);
      }
      
    } catch (error) {
      console.error('Bağlantı kopma hatası:', error);
    }
  });
});

// API endpoint'leri
app.get('/api/games/:gameId', (req, res) => {
  const game = games.get(req.params.gameId);
  if (!game) {
    return res.status(404).json({ error: 'Oyun bulunamadı' });
  }
  res.json(game.getGameState());
});

app.get('/api/stats', (req, res) => {
  res.json({
    totalGames: games.size,
    totalPlayers: playerSockets.size,
    activeGames: Array.from(games.values()).filter(g => g.gameState === 'playing').length
  });
});

// Hata yakalama middleware'i
app.use((error, req, res, next) => {
  console.error('Sunucu hatası:', error);
  res.status(500).json({ error: 'Sunucu hatası oluştu' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎮 Turgo sunucusu ${PORT} portunda çalışıyor!`);
  console.log(`📱 Oyun adresi: http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Sunucu kapatılıyor...');
  server.close(() => {
    console.log('Sunucu kapatıldı.');
    process.exit(0);
  });
});

module.exports = app;