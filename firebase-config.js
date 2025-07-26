const admin = require('firebase-admin');

// Firebase Admin SDK yapılandırması
// Gerçek projede serviceAccountKey.json dosyası kullanılacak
const serviceAccount = {
  "type": "service_account",
  "project_id": "turgo-game",
  "private_key_id": "dummy",
  "private_key": "-----BEGIN PRIVATE KEY-----\nDUMMY_KEY_FOR_DEVELOPMENT\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk@turgo-game.iam.gserviceaccount.com",
  "client_id": "dummy",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token"
};

// Geliştirme ortamı için mock data kullanacağız
const mockDatabase = {
  words: {
    4: [
      { kelime: "masa", anlam: "Üzerine yemek yenen, yazı yazılan mobilya" },
      { kelime: "kedi", anlam: "Evcil hayvan, miyavlar" },
      { kelime: "kitap", anlam: "Okumak için kullanılan basılı materyal" },
      { kelime: "araba", anlam: "Motorlu taşıt aracı" },
      { kelime: "deniz", anlam: "Büyük su kütlesi" },
      { kelime: "güneş", anlam: "Dünyayı aydınlatan yıldız" },
      { kelime: "çiçek", anlam: "Güzel kokulu, renkli bitki organı" },
      { kelime: "kalem", anlam: "Yazı yazmak için kullanılan araç" },
      { kelime: "telefon", anlam: "Uzaktan konuşma aracı" },
      { kelime: "pencere", anlam: "Duvardaki cam açıklık" }
    ],
    5: [
      { kelime: "bilgisayar", anlam: "Elektronik hesaplama makinesi" },
      { kelime: "okul", anlam: "Eğitim verilen kurum" },
      { kelime: "doktor", anlam: "Hastalıkları tedavi eden kişi" },
      { kelime: "müzik", anlam: "Seslerden oluşan sanat dalı" },
      { kelime: "spor", anlam: "Fiziksel aktivite" },
      { kelime: "yemek", anlam: "Beslenme için alınan gıda" },
      { kelime: "oyun", anlam: "Eğlence amaçlı aktivite" },
      { kelime: "film", anlam: "Sinema eseri" },
      { kelime: "şarkı", anlam: "Müzikli söz" },
      { kelime: "resim", anlam: "Görsel sanat eseri" }
    ],
    6: [
      { kelime: "bilgisayar", anlam: "Elektronik hesaplama makinesi" },
      { kelime: "televizyon", anlam: "Görüntü ve ses yayını alan cihaz" },
      { kelime: "hastane", anlam: "Hastaların tedavi edildiği yer" },
      { kelime: "üniversite", anlam: "Yüksek öğretim kurumu" },
      { kelime: "kütüphane", anlam: "Kitapların toplandığı yer" },
      { kelime: "restoran", anlam: "Yemek yenen ticari işletme" },
      { kelime: "mağaza", anlam: "Alışveriş yapılan yer" },
      { kelime: "havaalanı", anlam: "Uçakların kalktığı yer" },
      { kelime: "otobüs", anlam: "Toplu taşıma aracı" },
      { kelime: "bisiklet", anlam: "İki tekerlekli araç" }
    ],
    7: [
      { kelime: "bilgisayar", anlam: "Elektronik hesaplama makinesi" },
      { kelime: "üniversite", anlam: "Yüksek öğretim kurumu" },
      { kelime: "kütüphane", anlam: "Kitapların toplandığı yer" },
      { kelime: "hastane", anlam: "Hastaların tedavi edildiği yer" },
      { kelime: "restoran", anlam: "Yemek yenen ticari işletme" },
      { kelime: "havaalanı", anlam: "Uçakların kalktığı yer" },
      { kelime: "televizyon", anlam: "Görüntü ve ses yayını alan cihaz" },
      { kelime: "otomobil", anlam: "Motorlu taşıt aracı" },
      { kelime: "bisiklet", anlam: "İki tekerlekli araç" },
      { kelime: "mağaza", anlam: "Alışveriş yapılan yer" }
    ]
  },
  puzzles: {
    8: [
      { soru: "Evde oturduğumuz eşya", cevap: "mobilya", harf_sayisi: 8 },
      { soru: "Yemek pişirilen yer", cevap: "mutfakta", harf_sayisi: 8 },
      { soru: "Gece uyuduğumuz yer", cevap: "yatak", harf_sayisi: 8 },
      { soru: "Kitap okuduğumuz yer", cevap: "koltukta", harf_sayisi: 8 },
      { soru: "Su içtiğimiz kap", cevap: "bardakta", harf_sayisi: 8 }
    ],
    10: [
      { soru: "Kitapların toplandığı yer", cevap: "kütüphane", harf_sayisi: 10 },
      { soru: "Hastaların tedavi edildiği yer", cevap: "hastanede", harf_sayisi: 10 },
      { soru: "Öğrencilerin eğitim gördüğü yer", cevap: "okulda", harf_sayisi: 10 },
      { soru: "Yemek yediğimiz ticari yer", cevap: "restoranda", harf_sayisi: 10 },
      { soru: "Alışveriş yaptığımız yer", cevap: "mağazada", harf_sayisi: 10 }
    ],
    12: [
      { soru: "Uçakların kalktığı ve indiği yer", cevap: "havaalanında", harf_sayisi: 12 },
      { soru: "Yüksek öğretim yapılan kurum", cevap: "üniversitede", harf_sayisi: 12 },
      { soru: "Televizyon programlarının yapıldığı yer", cevap: "televizyonda", harf_sayisi: 12 },
      { soru: "Bilgisayar oyunlarının oynandığı yer", cevap: "bilgisayarda", harf_sayisi: 12 },
      { soru: "Spor müsabakalarının yapıldığı yer", cevap: "stadyumda", harf_sayisi: 12 }
    ]
  }
};

class MockFirebaseDatabase {
  constructor() {
    this.data = mockDatabase;
  }

  async getWords(length) {
    return this.data.words[length] || [];
  }

  async getPuzzles(length) {
    return this.data.puzzles[length] || [];
  }

  async getRandomWord(length) {
    const words = await this.getWords(length);
    return words[Math.floor(Math.random() * words.length)];
  }

  async getRandomPuzzle(length) {
    const puzzles = await this.getPuzzles(length);
    return puzzles[Math.floor(Math.random() * puzzles.length)];
  }
}

// Mock database instance
const db = new MockFirebaseDatabase();

module.exports = { db };