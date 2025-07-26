const { db } = require('./firebase-config');

class TurgoGame {
  constructor(gameId) {
    this.gameId = gameId;
    this.teams = new Map();
    this.currentStage = 1;
    this.currentRound = 0;
    this.currentTeamIndex = 0;
    this.gameState = 'waiting'; // waiting, playing, puzzle, finished
    this.currentWord = null;
    this.currentPuzzle = null;
    this.attempts = 0;
    this.maxAttempts = 5;
    this.guesses = [];
    this.buzzerPressed = new Set();
    this.puzzleTimer = null;
    this.puzzleRevealedLetters = 0;
    this.stageConfig = {
      1: { words: [4, 4, 4], puzzle: 8, wordScore: 1000, puzzleScore: 2000 },
      2: { words: [5, 5, 5, 5], puzzle: 10, wordScore: 1500, puzzleScore: 3000 },
      3: { 
        words: [5, 5], 
        puzzle1: 10, 
        words2: [6, 6], 
        puzzle2: 12, 
        wordScore: 2000, 
        puzzleScore: 4000 
      },
      4: { words: [4, 5, 6, 7], finalStage: true }
    };
  }

  addTeam(teamId, teamName) {
    if (this.teams.size >= 6) return false; // Maksimum 6 takım
    
    this.teams.set(teamId, {
      id: teamId,
      name: teamName,
      score: 0,
      isActive: false,
      isEliminated: false,
      buzzerPressed: false
    });
    return true;
  }

  removeTeam(teamId) {
    this.teams.delete(teamId);
  }

  canStartGame() {
    return this.teams.size >= 3 && this.gameState === 'waiting';
  }

  startGame() {
    if (!this.canStartGame()) return false;
    
    this.gameState = 'playing';
    this.currentStage = 1;
    this.currentRound = 0;
    this.currentTeamIndex = 0;
    this.setActiveTeam();
    return true;
  }

  setActiveTeam() {
    const activeTeams = Array.from(this.teams.values()).filter(team => !team.isEliminated);
    if (activeTeams.length === 0) return;
    
    // Tüm takımları pasif yap
    this.teams.forEach(team => team.isActive = false);
    
    // Sıradaki takımı aktif yap
    const currentTeam = activeTeams[this.currentTeamIndex % activeTeams.length];
    currentTeam.isActive = true;
  }

  async nextRound() {
    const config = this.stageConfig[this.currentStage];
    
    if (this.currentStage === 3) {
      // 3. etap özel mantığı
      if (this.currentRound < 2) {
        // 5 harfli kelimeler
        await this.loadWord(5);
      } else if (this.currentRound === 2) {
        // 10 harfli puzzle
        await this.loadPuzzle(10);
      } else if (this.currentRound < 5) {
        // 6 harfli kelimeler
        await this.loadWord(6);
      } else if (this.currentRound === 5) {
        // 12 harfli puzzle
        await this.loadPuzzle(12);
      } else {
        this.nextStage();
        return;
      }
    } else if (this.currentStage === 4) {
      // Final etabı
      if (this.currentRound < config.words.length) {
        await this.loadWord(config.words[this.currentRound]);
      } else {
        this.endGame();
        return;
      }
    } else {
      // 1. ve 2. etap
      if (this.currentRound < config.words.length) {
        await this.loadWord(config.words[this.currentRound]);
      } else {
        // Puzzle zamanı
        await this.loadPuzzle(config.puzzle);
      }
    }
    
    this.currentRound++;
  }

  async loadWord(length) {
    this.currentWord = await db.getRandomWord(length);
    this.currentPuzzle = null;
    this.attempts = 0;
    this.guesses = [];
    this.gameState = 'playing';
    this.buzzerPressed.clear();
  }

  async loadPuzzle(length) {
    this.currentPuzzle = await db.getRandomPuzzle(length);
    this.currentWord = null;
    this.gameState = 'puzzle';
    this.puzzleRevealedLetters = 0;
    this.buzzerPressed.clear();
    this.startPuzzleTimer();
  }

  startPuzzleTimer() {
    let seconds = 0;
    this.puzzleTimer = setInterval(() => {
      seconds++;
      this.puzzleRevealedLetters = Math.min(seconds, this.currentPuzzle.cevap.length);
      
      if (seconds >= 10) {
        clearInterval(this.puzzleTimer);
        this.puzzleTimer = null;
      }
    }, 1000);
  }

  makeGuess(teamId, guess) {
    const team = this.teams.get(teamId);
    if (!team || !team.isActive) return { success: false, message: 'Sıra sizde değil!' };

    guess = guess.toLowerCase().trim();
    
    if (this.gameState === 'playing' && this.currentWord) {
      return this.handleWordGuess(teamId, guess);
    } else if (this.gameState === 'puzzle' && this.currentPuzzle) {
      return this.handlePuzzleGuess(teamId, guess);
    }
    
    return { success: false, message: 'Geçersiz durum!' };
  }

  handleWordGuess(teamId, guess) {
    const team = this.teams.get(teamId);
    const correctAnswer = this.currentWord.kelime.toLowerCase();
    
    // Tahmin kontrolü
    if (guess === correctAnswer) {
      // Doğru tahmin
      const config = this.stageConfig[this.currentStage];
      let score = config.wordScore;
      
      if (this.currentStage === 3) {
        // 3. etapta her yanlış denemede -400 puan (minimum 400)
        score = Math.max(400, config.wordScore - (this.attempts * 400));
      }
      
      team.score += score;
      this.nextTeam();
      return { 
        success: true, 
        correct: true, 
        score: score,
        message: `Doğru! +${score} puan kazandınız!`,
        word: this.currentWord
      };
    } else {
      // Yanlış tahmin
      this.attempts++;
      this.guesses.push({ team: team.name, guess, correct: false });
      
      if (this.attempts >= this.maxAttempts) {
        // Hak bitti, sıradaki takıma geç
        this.nextTeam();
        return { 
          success: true, 
          correct: false, 
          message: 'Tahmin hakkınız bitti!',
          word: this.currentWord
        };
      }
      
      return { 
        success: true, 
        correct: false, 
        message: `Yanlış! ${this.maxAttempts - this.attempts} hakkınız kaldı.`
      };
    }
  }

  handlePuzzleGuess(teamId, guess) {
    const team = this.teams.get(teamId);
    const correctAnswer = this.currentPuzzle.cevap.toLowerCase();
    
    if (guess === correctAnswer) {
      // Doğru tahmin
      const config = this.stageConfig[this.currentStage];
      let score = config.puzzleScore - (this.puzzleRevealedLetters * 100);
      
      team.score += score;
      
      if (this.puzzleTimer) {
        clearInterval(this.puzzleTimer);
        this.puzzleTimer = null;
      }
      
      return { 
        success: true, 
        correct: true, 
        score: score,
        message: `Doğru! +${score} puan kazandınız!`,
        puzzle: this.currentPuzzle
      };
    } else {
      // Yanlış tahmin
      this.guesses.push({ team: team.name, guess, correct: false });
      
      // Puzzle'da yanlış tahminde sıra diğer takıma geçer
      this.nextTeam();
      return { 
        success: true, 
        correct: false, 
        message: 'Yanlış tahmin!'
      };
    }
  }

  pressBuzzer(teamId) {
    const team = this.teams.get(teamId);
    if (!team || team.isEliminated || this.buzzerPressed.has(teamId)) {
      return { success: false, message: 'Buzzer basamazsınız!' };
    }
    
    if (this.gameState === 'puzzle' || (this.currentStage >= 2 && !this.getActiveTeam())) {
      this.buzzerPressed.add(teamId);
      
      // İlk basan takımı aktif yap
      if (this.buzzerPressed.size === 1) {
        this.teams.forEach(t => t.isActive = false);
        team.isActive = true;
        return { success: true, message: 'Buzzer bastınız! Cevap verebilirsiniz.' };
      }
    }
    
    return { success: false, message: 'Şu anda buzzer basamazsınız!' };
  }

  nextTeam() {
    const activeTeams = Array.from(this.teams.values()).filter(team => !team.isEliminated);
    this.currentTeamIndex = (this.currentTeamIndex + 1) % activeTeams.length;
    this.setActiveTeam();
    this.attempts = 0;
  }

  nextStage() {
    // Eleme kontrolü (2. ve 3. etap sonunda)
    if (this.currentStage === 2 || this.currentStage === 3) {
      this.eliminateLowestTeam();
    }
    
    this.currentStage++;
    this.currentRound = 0;
    this.currentTeamIndex = 0;
    
    if (this.currentStage > 4) {
      this.endGame();
      return;
    }
    
    this.setActiveTeam();
  }

  eliminateLowestTeam() {
    const activeTeams = Array.from(this.teams.values()).filter(team => !team.isEliminated);
    if (activeTeams.length <= 2) return; // En az 2 takım kalmalı
    
    // En düşük puanlı takımı bul
    const lowestTeam = activeTeams.reduce((min, team) => 
      team.score < min.score ? team : min
    );
    
    lowestTeam.isEliminated = true;
  }

  endGame() {
    this.gameState = 'finished';
    
    // Kazananı belirle
    const activeTeams = Array.from(this.teams.values()).filter(team => !team.isEliminated);
    const winner = activeTeams.reduce((max, team) => 
      team.score > max.score ? team : max
    );
    
    return winner;
  }

  getActiveTeam() {
    return Array.from(this.teams.values()).find(team => team.isActive);
  }

  getGameState() {
    return {
      gameId: this.gameId,
      teams: Array.from(this.teams.values()),
      currentStage: this.currentStage,
      currentRound: this.currentRound,
      gameState: this.gameState,
      currentWord: this.currentWord,
      currentPuzzle: this.currentPuzzle,
      attempts: this.attempts,
      maxAttempts: this.maxAttempts,
      guesses: this.guesses,
      puzzleRevealedLetters: this.puzzleRevealedLetters,
      activeTeam: this.getActiveTeam(),
      canStartGame: this.canStartGame()
    };
  }
}

module.exports = TurgoGame;