const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const morgan = require('morgan');
const fs = require('fs');
const dotenv = require('dotenv');

// Bot modülünü yükle
const bot = require('./index');

// Express uygulaması oluştur
const app = express();
const PORT = process.env.PORT || 3000;

// Güvenlik önlemleri
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 100, // Her IP için 15 dakikada maksimum 100 istek
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// CORS ayarları
app.use(cors());

// JSON ve form verisi işleme
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Loglama
app.use(morgan('dev'));

// Statik dosyalar için klasör
app.use(express.static(path.join(__dirname, 'public')));

// API rotaları
// Bot durumunu getir
app.get('/api/status', (req, res) => {
  try {
    const status = bot.getBotStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bot yapılandırmasını güncelle
app.post('/api/config', (req, res) => {
  try {
    const { username, password, maxFollowsPerDay, followDelayMin, followDelayMax, useProxy, proxyHost, proxyPort, proxyUsername, proxyPassword, headless } = req.body;
    
    // .env dosyasını yükle
    const envPath = path.join(__dirname, '.env');
    let envContent = fs.readFileSync(envPath, 'utf8');
    
    // Gerekli değerleri güncelle
    if (username) envContent = envContent.replace(/X_USERNAME=.*/g, `X_USERNAME=${username}`);
    if (password) envContent = envContent.replace(/X_PASSWORD=.*/g, `X_PASSWORD=${password}`);
    if (maxFollowsPerDay) envContent = envContent.replace(/MAX_FOLLOWS_PER_DAY=.*/g, `MAX_FOLLOWS_PER_DAY=${maxFollowsPerDay}`);
    if (followDelayMin) envContent = envContent.replace(/FOLLOW_DELAY_MIN=.*/g, `FOLLOW_DELAY_MIN=${followDelayMin}`);
    if (followDelayMax) envContent = envContent.replace(/FOLLOW_DELAY_MAX=.*/g, `FOLLOW_DELAY_MAX=${followDelayMax}`);
    
    if (typeof useProxy !== 'undefined') envContent = envContent.replace(/USE_PROXY=.*/g, `USE_PROXY=${useProxy}`);
    if (proxyHost) envContent = envContent.replace(/PROXY_HOST=.*/g, `PROXY_HOST=${proxyHost}`);
    if (proxyPort) envContent = envContent.replace(/PROXY_PORT=.*/g, `PROXY_PORT=${proxyPort}`);
    if (proxyUsername) envContent = envContent.replace(/PROXY_USERNAME=.*/g, `PROXY_USERNAME=${proxyUsername}`);
    if (proxyPassword) envContent = envContent.replace(/PROXY_PASSWORD=.*/g, `PROXY_PASSWORD=${proxyPassword}`);
    
    if (typeof headless !== 'undefined') envContent = envContent.replace(/HEADLESS=.*/g, `HEADLESS=${headless}`);
    
    // .env dosyasını kaydet
    fs.writeFileSync(envPath, envContent);
    
    // process.env'i yeniden yükle
    dotenv.config();
    
    res.json({ success: true, message: 'Yapılandırma güncellendi' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Takip edilen kullanıcıları getir
app.get('/api/followed-users', (req, res) => {
  try {
    const followedUsers = bot.loadFollowedUsers();
    res.json(followedUsers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Botu başlat
app.post('/api/start', (req, res) => {
  try {
    const { targetAccounts } = req.body;
    
    if (!targetAccounts || !Array.isArray(targetAccounts) || targetAccounts.length === 0) {
      return res.status(400).json({ error: 'Geçerli hedef hesaplar belirtilmedi' });
    }
    
    // Botu arka planda başlat
    bot.runBot(targetAccounts).catch(error => {
      console.error('Bot çalışırken hata:', error);
    });
    
    res.json({ success: true, message: 'Bot başlatıldı', targetAccounts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ana sayfaya yönlendir
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Sunucuyu başlat
app.listen(PORT, () => {
  console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor`);
}); 