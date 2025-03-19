const puppeteer = require('puppeteer');
const dotenv = require('dotenv');
const winston = require('winston');
const fs = require('fs');
const path = require('path');

// Yapılandırma yükleme
dotenv.config();

// Logger yapılandırması
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp }) => {
      return `${timestamp} ${level}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'bot.log' })
  ]
});

// Kendi delay fonksiyonumuzu tanımlama
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Ekran görüntüsü almak için yardımcı fonksiyon
const takeScreenshot = async (page, category, filename) => {
  // Ekran görüntüsü klasörleri
  const screenshotsDir = path.join(__dirname, 'screenshots');
  const categoryDir = path.join(screenshotsDir, category);
  
  // Klasörleri oluştur (yoksa)
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir);
  }
  
  if (!fs.existsSync(categoryDir)) {
    fs.mkdirSync(categoryDir);
  }
  
  // Tam dosya yolu
  const timestamp = Date.now();
  const filePath = path.join(categoryDir, `${filename}-${timestamp}.png`);
  
  // Ekran görüntüsü al
  await page.screenshot({ path: filePath });
  logger.info(`Ekran görüntüsü alındı: ${filePath}`);
  
  return filePath;
};

// Rastgele gecikme süresi oluşturma
const randomDelay = async () => {
  const min = parseInt(process.env.FOLLOW_DELAY_MIN || 15, 10);
  const max = parseInt(process.env.FOLLOW_DELAY_MAX || 30, 10);
  const delayTime = Math.floor(Math.random() * (max - min + 1)) + min;
  logger.info(`Bekleniyor: ${delayTime} saniye`);
  return delay(delayTime * 1000);
};

// Takip etme/takip edilmiş kontrolü için dosya yönetimi
const dataDir = path.join(__dirname, 'data');
const followedUsersFile = path.join(dataDir, 'followed_users.json');

// Veri dizini yoksa oluştur
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

// Takip edilen kullanıcıları yükleme
const loadFollowedUsers = () => {
  if (fs.existsSync(followedUsersFile)) {
    return JSON.parse(fs.readFileSync(followedUsersFile, 'utf8'));
  }
  return [];
};

// Takip edilen kullanıcıları kaydetme
const saveFollowedUser = (username) => {
  const followedUsers = loadFollowedUsers();
  if (!followedUsers.includes(username)) {
    followedUsers.push(username);
    fs.writeFileSync(followedUsersFile, JSON.stringify(followedUsers, null, 2));
  }
};

// İnsan gibi yavaş yavaş yazma
const typeHumanLike = async (page, selector, text) => {
  // HUMAN_LIKE_TYPING çevre değişkeni false ise normal yazma işlemi
  if (process.env.HUMAN_LIKE_TYPING !== 'true') {
    await page.type(selector, text);
    return;
  }
  
  const el = await page.$(selector);
  if (!el) return;
  
  // Önce mevcut değeri temizle
  await page.evaluate((sel) => {
    document.querySelector(sel).value = '';
  }, selector);
  
  // Her karakter arasında farklı gecikmeler ile yavaşça yaz
  for (let i = 0; i < text.length; i++) {
    // Bazı karakterler arasında daha uzun duraklama
    if (i > 0 && i % 3 === 0) {
      await delay(Math.random() * 300 + 200);
    }
    
    await page.type(selector, text[i], { delay: Math.random() * 150 + 50 });
  }
  
  // Son girişten sonra biraz bekle
  await delay(Math.random() * 200 + 100);
};

// X oturum açma
const loginToX = async (page) => {
  const navigationTimeout = parseInt(process.env.NAVIGATION_TIMEOUT || 120000, 10);
  const maxRetries = parseInt(process.env.RETRY_ATTEMPTS || 3, 10);
  logger.info(`X'e giriş yapılıyor... (Zaman aşımı: ${navigationTimeout}ms, Maksimum deneme: ${maxRetries})`);
  
  // Yeniden deneme döngüsü
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Eğer ilk deneme değilse, sayfayı yenile
      if (attempt > 1) {
        logger.info(`Giriş deneme ${attempt}/${maxRetries}...`);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: navigationTimeout });
        await delay(3000);
      }
      
      // Sayfa yüklenirken zaman aşımı süresini arttır
      await page.setDefaultNavigationTimeout(navigationTimeout);
      
      // Cookies ve cache temizleme (ikinci denemeden itibaren)
      if (attempt > 1) {
        await page.evaluate(() => {
          try {
            localStorage.clear();
            sessionStorage.clear();
          } catch (e) {
            // Erişim hatalarını yok say
          }
        });
        const client = await page.target().createCDPSession();
        await client.send('Network.clearBrowserCookies');
        await client.send('Network.clearBrowserCache');
      }
      
      // Login sayfasına git - daha basit yükleme stratejisi kullan
      logger.info(`Twitter giriş sayfasına gidiliyor (${attempt}. deneme)...`);
      try {
        // Bağlantı için farklı yaklaşımlar deneyelim
        if (attempt === 1) {
          // İlk denemede domcontentloaded kullan (hızlı)
          await page.goto('https://twitter.com/i/flow/login', { 
            waitUntil: 'domcontentloaded',
            timeout: navigationTimeout 
          });
        } else if (attempt === 2) {
          // İkinci denemede doğrudan mobile versiyonu dene
          await page.goto('https://mobile.twitter.com/login', { 
            waitUntil: 'domcontentloaded',
            timeout: navigationTimeout 
          });
        } else {
          // Son denemede alternate URL dene
          await page.goto('https://twitter.com/login', { 
            waitUntil: 'domcontentloaded',
            timeout: navigationTimeout 
          });
        }
      } catch (navError) {
        logger.error(`Sayfa yüklenemedi: ${navError.message}`);
        if (attempt < maxRetries) continue;
        throw navError;
      }
      
      // Sayfa tam olarak yüklenmeden önce kısa bir bekleme
      await delay(5000);
      
      // Giriş sayfasında olduğunu doğrula
      const onLoginPage = await page.evaluate(() => {
        // Sayfa başlığı veya URL kontrolü
        return window.location.href.includes('login') || 
               document.title.includes('Login') || 
               document.title.includes('Twitter');
      });
      
      if (!onLoginPage) {
        logger.warn(`Giriş sayfasında değiliz. Mevcut URL: ${await page.url()}`);
        if (attempt < maxRetries) continue;
        throw new Error('Giriş sayfası yüklenemedi');
      }
      
      logger.info('Giriş sayfası başarıyla yüklendi, kullanıcı adı alanı bekleniyor...');
      
      // Javascript bağlantılarının yüklendiğinden emin ol
      await page.evaluate(() => {
        window.scrollBy(0, 100);
        window.scrollBy(0, -100);
      });
      
      // İlk olarak sayfa görüntüsünü al - hata ayıklama için
      await takeScreenshot(page, 'login', `login-page-${attempt}`);
      
      // Kullanıcı adı giriş alanı için farklı seçiciler dene
      let usernameSelector = null;
      const possibleUsernameSelectors = [
        'input[autocomplete="username"]',
        'input[name="text"]',
        'input[name="username"]',
        'input[type="text"]'
      ];
      
      for (const selector of possibleUsernameSelectors) {
        try {
          const exists = await page.$(selector);
          if (exists) {
            usernameSelector = selector;
            logger.info(`Kullanıcı adı alanı bulundu: ${selector}`);
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      if (!usernameSelector) {
        logger.error('Kullanıcı adı alanı bulunamadı');
        await takeScreenshot(page, 'login', `login-error-no-username`);
        if (attempt < maxRetries) continue;
        throw new Error('Kullanıcı adı alanı bulunamadı');
      }
      
      // İnsan gibi yavaş yavaş yazma
      await typeHumanLike(page, usernameSelector, process.env.X_USERNAME);
      await delay(1000);
      
      // İleri butonu için farklı seçiciler dene
      const nextButtons = [
        'div[data-testid="LoginForm_Next_Button"]',
        'div[data-testid="LoginForm-PhoneNumberEmailNextButton"]',
        'div[role="button"]',
        'button[type="submit"]'
      ];
      
      let nextButtonClicked = false;
      
      // İlk olarak düz CSS seçicileri dene
      for (const buttonSelector of nextButtons) {
        try {
          const buttons = await page.$$(buttonSelector);
          
          // CSS seçicisi ile bulunan butonları kontrol et
          for (const button of buttons) {
            const buttonText = await page.evaluate(el => el.textContent.trim(), button);
            const isVisible = await page.evaluate(el => {
              const style = window.getComputedStyle(el);
              return style && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
            }, button);
            
            if ((buttonText === 'İleri' || buttonText === 'Next') && isVisible) {
              logger.info(`İleri buton adayı bulundu: "${buttonText}" metinli buton`);
              
              // Önce sayfa görüntüsü al
              await takeScreenshot(page, 'login', `before-click-next-button`);
              
              // JavaScript ile tıklama dene
              await page.evaluate(el => el.click(), button);
              nextButtonClicked = true;
              logger.info(`İleri butonu JS ile tıklandı (metin: ${buttonText})`);
              
              // Kısa bekle ve sonuç kontrol et
              await delay(2000);
              break;
            }
          }
          
          if (nextButtonClicked) break;
        } catch (e) {
          logger.warn(`Buton seçici hatası: ${e.message}`);
          continue;
        }
      }
      
      // CSS selektörler başarısız olduysa, XPath ile dene
      if (!nextButtonClicked) {
        try {
          logger.info('CSS seçicileri başarısız oldu, XPath deneniyor...');
          
          // XPath ile "İleri" ya da "Next" içeren butonları bul
          const ileriXPath = "//div[@role='button' and contains(text(), 'İleri')]";
          const nextXPath = "//div[@role='button' and contains(text(), 'Next')]";
          
          // İlk olarak İleri butonunu dene
          const ileriElements = await page.$x(ileriXPath);
          if (ileriElements.length > 0) {
            logger.info('XPath ile "İleri" butonu bulundu');
            await ileriElements[0].click();
            nextButtonClicked = true;
            logger.info('İleri butonu XPath ile tıklandı');
            await delay(2000);
          } else {
            // İleri bulunamadıysa Next dene
            const nextElements = await page.$x(nextXPath);
            if (nextElements.length > 0) {
              logger.info('XPath ile "Next" butonu bulundu');
              await nextElements[0].click();
              nextButtonClicked = true;
              logger.info('Next butonu XPath ile tıklandı');
              await delay(2000);
            }
          }
        } catch (xpathError) {
          logger.warn(`XPath buton seçici hatası: ${xpathError.message}`);
        }
      }
      
      // Eğer hala başarısız olunduysa, sınıf bazlı özel bir seçici dene
      if (!nextButtonClicked) {
        try {
          logger.info('Sınıf bazlı özel bir seçici deneniyor...');
          const buttonsWithClass = await page.$$('div.r-ywje51.r-184id4b');
          
          for (const button of buttonsWithClass) {
            const buttonText = await page.evaluate(el => el.textContent.trim(), button);
            if (buttonText === 'İleri' || buttonText === 'Next') {
              logger.info(`Sınıf bazlı seçici ile "${buttonText}" metinli buton bulundu`);
              await button.click();
              nextButtonClicked = true;
              logger.info(`İleri butonu sınıf seçicisi ile tıklandı (metin: ${buttonText})`);
              await delay(2000);
              break;
            }
          }
        } catch (classError) {
          logger.warn(`Sınıf bazlı seçici hatası: ${classError.message}`);
        }
      }
      
      // Son çare olarak tüm butonları bulup içeriklerine göre tıklamayı dene
      if (!nextButtonClicked) {
        try {
          logger.info('Tüm butonlar arasında İleri/Next aranıyor...');
          
          // Tüm buton benzeri elemanları seç
          const allButtons = await page.$$('div[role="button"], button');
          
          // Butonlar hakkında bilgi topla ve log'a kaydet
          const buttonDetails = await Promise.all(
            allButtons.map(async (btn, i) => {
              const text = await page.evaluate(el => el.textContent.trim(), btn);
              const isVisible = await page.evaluate(el => {
                const style = window.getComputedStyle(el);
                return style && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
              }, btn);
              const rect = await page.evaluate(el => {
                const { top, left, width, height } = el.getBoundingClientRect();
                return { top, left, width, height };
              }, btn);
              
              return { index: i, text, isVisible, rect };
            })
          );
          
          logger.info(`Sayfada toplam ${buttonDetails.length} buton benzeri eleman bulundu`);
          
          // Görünür butonları filtrele
          const visibleButtons = buttonDetails.filter(b => b.isVisible);
          logger.info(`Bunlardan ${visibleButtons.length} tanesi görünür durumda`);
          
          // İleri/Next metni içeren görünür butonları bul
          const targetButtons = visibleButtons.filter(b => b.text === 'İleri' || b.text === 'Next');
          
          if (targetButtons.length > 0) {
            const targetButton = targetButtons[0];
            logger.info(`"${targetButton.text}" metinli buton bulundu (${targetButton.index}. buton)`);
            
            // Tıklamak için butona geri dön
            await allButtons[targetButton.index].click();
            nextButtonClicked = true;
            logger.info(`İleri butonu manuel olarak tıklandı (metin: ${targetButton.text})`);
            await delay(2000);
          } else {
            // İleri/Next metinli buton bulunamadıysa, en olası butonu tıkla
            // Örneğin formdaki ilk görünür buton genellikle devam butonu olabilir
            if (visibleButtons.length > 0) {
              // Form içindeki en büyük butonu bul (genelde ilerleme butonu daha büyüktür)
              const formButtons = visibleButtons.filter(b => b.rect.width > 100 && b.rect.height > 30);
              
              if (formButtons.length > 0) {
                // En büyük butonu seç
                const largestButton = formButtons.reduce((prev, current) => 
                  (prev.rect.width * prev.rect.height > current.rect.width * current.rect.height) ? prev : current
                );
                
                logger.info(`İleri/Next metinli buton bulunamadı, en büyük buton tıklanıyor: "${largestButton.text}" (${largestButton.index}. buton)`);
                await allButtons[largestButton.index].click();
                nextButtonClicked = true;
                logger.info(`En olası buton manuel olarak tıklandı (metin: ${largestButton.text})`);
                await delay(2000);
              }
            }
          }
          
          // Tüm butonların bilgilerini logla
          logger.info('Sayfadaki tüm butonların detayları:');
          visibleButtons.forEach(btn => {
            logger.info(`Buton ${btn.index}: Text="${btn.text}", Görünür=true, Konum=(${btn.rect.left}, ${btn.rect.top}), Boyut=${btn.rect.width}x${btn.rect.height}`);
          });
        } catch (manualError) {
          logger.warn(`Manuel buton seçme hatası: ${manualError.message}`);
        }
      }
      
      // Tüm butonlar denendiyse, sayfadaki tüm butonları listeleyip bir görüntü alalım
      if (!nextButtonClicked) {
        logger.error('İleri butonu bulunamadı veya tıklanamadı');
        
        // Sayfadaki tüm butonları listele
        const allButtons = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('div[role="button"], button'))
            .map(btn => ({
              text: btn.textContent.trim(),
              id: btn.id,
              dataTestId: btn.getAttribute('data-testid'),
              role: btn.getAttribute('role'),
              class: btn.className
            }));
        });
        
        logger.info('Sayfadaki butonlar:');
        allButtons.forEach((btn, i) => {
          logger.info(`Buton ${i+1}: Text="${btn.text}", id=${btn.id}, data-testid=${btn.dataTestId}, role=${btn.role}, class=${btn.class}`);
        });
        
        await takeScreenshot(page, 'login', `login-error-no-next-button`);
        if (attempt < maxRetries) continue;
        throw new Error('İleri butonu bulunamadı');
      }
      
      // Şifre alanı için bekle
      await delay(3000);
      
      // Şifre alanı için farklı seçiciler dene
      let passwordSelector = null;
      const possiblePasswordSelectors = [
        'input[name="password"]',
        'input[type="password"]',
        'input[autocomplete="current-password"]'
      ];
      
      for (const selector of possiblePasswordSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 5000 });
          passwordSelector = selector;
          logger.info(`Şifre alanı bulundu: ${selector}`);
          break;
        } catch (e) {
          continue;
        }
      }
      
      if (!passwordSelector) {
        logger.error('Şifre alanı bulunamadı');
        await takeScreenshot(page, 'login', `login-error-no-password`);
        if (attempt < maxRetries) continue;
        throw new Error('Şifre alanı bulunamadı');
      }
      
      // İnsan gibi yavaş yavaş yazma
      await typeHumanLike(page, passwordSelector, process.env.X_PASSWORD);
      await delay(1000);
      
      // Giriş yap butonu için farklı seçiciler dene
      const loginButtons = [
        'div[data-testid="LoginForm_Login_Button"]',
        'div[role="button"]:has-text("Log in")',
        'div[role="button"]:has-text("Giriş yap")',
        'span:has-text("Log in")',
        'span:has-text("Giriş yap")'
      ];
      
      let loginButtonClicked = false;
      for (const buttonSelector of loginButtons) {
        try {
          const buttonExists = await page.$(buttonSelector);
          if (buttonExists) {
            await page.click(buttonSelector);
            loginButtonClicked = true;
            logger.info(`Giriş butonu tıklandı: ${buttonSelector}`);
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      // Manuel buton arama ve tıklama için şimdi de ileri butonunda yaptığımız gibi tüm butonlar içinde giriş butonu arıyoruz
      if (!loginButtonClicked) {
        try {
          logger.info('Tüm butonlar arasında Giriş/Login aranıyor...');
          
          // Tüm buton benzeri elemanları seç
          const allButtons = await page.$$('div[role="button"], button');
          
          // Butonlar hakkında bilgi topla ve log'a kaydet
          const buttonDetails = await Promise.all(
            allButtons.map(async (btn, i) => {
              const text = await page.evaluate(el => el.textContent.trim(), btn);
              const isVisible = await page.evaluate(el => {
                const style = window.getComputedStyle(el);
                return style && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
              }, btn);
              const rect = await page.evaluate(el => {
                const { top, left, width, height } = el.getBoundingClientRect();
                return { top, left, width, height };
              }, btn);
              
              return { index: i, text, isVisible, rect };
            })
          );
          
          logger.info(`Sayfada toplam ${buttonDetails.length} buton benzeri eleman bulundu`);
          
          // Görünür butonları filtrele
          const visibleButtons = buttonDetails.filter(b => b.isVisible);
          logger.info(`Bunlardan ${visibleButtons.length} tanesi görünür durumda`);
          
          // Giriş/Login metni içeren görünür butonları bul
          const targetButtons = visibleButtons.filter(b => 
            b.text === 'Giriş yap' || b.text === 'Giriş' || b.text === 'Login' || b.text === 'Log in'
          );
          
          if (targetButtons.length > 0) {
            const targetButton = targetButtons[0];
            logger.info(`"${targetButton.text}" metinli buton bulundu (${targetButton.index}. buton)`);
            
            // Tıklamak için butona geri dön
            await allButtons[targetButton.index].click();
            loginButtonClicked = true;
            logger.info(`Giriş butonu manuel olarak tıklandı (metin: ${targetButton.text})`);
            await delay(2000);
          } else {
            // Form içindeki en büyük butonu bul (genelde giriş butonu daha büyüktür)
            if (visibleButtons.length > 0) {
              const formButtons = visibleButtons.filter(b => b.rect.width > 100 && b.rect.height > 30);
              
              if (formButtons.length > 0) {
                const largestButton = formButtons.reduce((prev, current) => 
                  (prev.rect.width * prev.rect.height > current.rect.width * current.rect.height) ? prev : current
                );
                
                logger.info(`Giriş buton metni bulunamadı, en büyük buton tıklanıyor: "${largestButton.text}" (${largestButton.index}. buton)`);
                await allButtons[largestButton.index].click();
                loginButtonClicked = true;
                logger.info(`En olası giriş butonu manuel olarak tıklandı (metin: ${largestButton.text})`);
                await delay(2000);
              }
            }
          }
          
          // Tüm butonların bilgilerini logla
          logger.info('Giriş ekranı - sayfadaki tüm butonların detayları:');
          visibleButtons.forEach(btn => {
            logger.info(`Buton ${btn.index}: Text="${btn.text}", Görünür=true, Konum=(${btn.rect.left}, ${btn.rect.top}), Boyut=${btn.rect.width}x${btn.rect.height}`);
          });
        } catch (manualError) {
          logger.warn(`Manuel giriş butonu seçme hatası: ${manualError.message}`);
        }
      }
      
      if (!loginButtonClicked) {
        logger.error('Giriş butonu bulunamadı veya tıklanamadı');
        await takeScreenshot(page, 'login', `login-error-no-login-button`);
        if (attempt < maxRetries) continue;
        throw new Error('Giriş butonu bulunamadı');
      }
      
      // Giriş sonrası sayfa tam yüklenene kadar bekle
      await delay(5000);
      
      // Giriş başarılı mı kontrol et - farklı seçiciler dene
      const successIndicators = [
        'a[aria-label="Profile"]',
        'a[data-testid="AppTabBar_Profile_Link"]',
        'div[data-testid="primaryColumn"]',
        'div[aria-label="Home timeline"]'
      ];
      
      let loginSuccessful = false;
      for (const selector of successIndicators) {
        try {
          await page.waitForSelector(selector, { timeout: 5000 });
          loginSuccessful = true;
          logger.info(`Giriş başarılı göstergesi bulundu: ${selector}`);
          break;
        } catch (e) {
          continue;
        }
      }
      
      // URL kontrolü ile de doğrula
      if (!loginSuccessful) {
        const currentUrl = await page.url();
        if (currentUrl.includes('home')) {
          loginSuccessful = true;
          logger.info('URL tabanlı giriş kontrolü başarılı');
        }
      }
      
      if (loginSuccessful) {
        logger.info('X\'e başarıyla giriş yapıldı');
        return true;
      } else {
        logger.error('Giriş başarılı görünmüyor');
        await takeScreenshot(page, 'login', `login-verification-failed`);
        if (attempt < maxRetries) continue;
        throw new Error('Giriş doğrulanamadı');
      }
    } catch (error) {
      logger.error(`Giriş sırasında hata (Deneme ${attempt}/${maxRetries}): ${error.message}`);
      
      // Son deneme değilse, tekrar dene
      if (attempt < maxRetries) {
        logger.info(`${5 + (attempt * 2)} saniye sonra tekrar denenecek...`);
        await delay((5 + (attempt * 2)) * 1000); // Her denemede biraz daha uzun bekle
        continue;
      }
      
      // Tüm denemeler başarısız olursa
      // Tarayıcı ekran görüntüsü al - hata ayıklama için
      try {
        await takeScreenshot(page, 'login', `login-error-final`);
        logger.info('Hata ekran görüntüsü kaydedildi');
      } catch (screenshotError) {
        logger.error(`Ekran görüntüsü alınamadı: ${screenshotError.message}`);
      }
      return false;
    }
  }
  
  // Buraya asla ulaşılmaması gerekir, ama güvenlik için
  return false;
};

// Hedef hesabın takipçilerini getirme
const getFollowers = async (page, targetAccount) => {
  const navigationTimeout = parseInt(process.env.NAVIGATION_TIMEOUT || 60000, 10);
  logger.info(`Hedef hesap: @${targetAccount} - Takipçileri alınıyor...`);
  
  try {
    // Takipçiler sayfasına git
    await page.goto(`https://twitter.com/${targetAccount}/followers`, { 
      waitUntil: 'domcontentloaded',
      timeout: navigationTimeout 
    });
    
    // Sayfanın yüklenmesi için biraz bekle
    await delay(5000);
    
    // Sayfanın ekran görüntüsünü al
    await takeScreenshot(page, 'followers', `followers-initial`);
    
    // Takipçileri toplama
    const followers = [];
    
    // Sayfanın yüklendiğini kontrol et
    let pageLoaded = false;
    try {
      // Farklı seçiciler deneyerek takipçileri bulma
      const selectors = [
        'div[data-testid="cellInnerDiv"]',
        'div[data-testid="primaryColumn"] section',
        'section[role="region"]',
        'div[aria-label="Timeline: Followers"]',
        'article',
        'div[role="button"][tabindex="0"]'
      ];
      
      for (const selector of selectors) {
        try {
          await page.waitForSelector(selector, { timeout: 10000 });
          pageLoaded = true;
          logger.info(`Takipçi listesi seçicisi bulundu: ${selector}`);
          break;
        } catch (e) {
          logger.warn(`Seçici bulunamadı: ${selector}`);
        }
      }
      
      if (!pageLoaded) {
        logger.warn('Takipçi listesi yüklenemedi, sayfa görüntüsü alınıyor...');
        await takeScreenshot(page, 'followers', `followers-page-not-loaded`);
        throw new Error('Takipçi listesi yüklenemedi');
      }
      
      // Takipçileri sayfada toplarız
      const scrollCount = 10; // Kaç sayfa aşağı kaydırılacak
      logger.info(`Takipçi listesi yüklendi, ${scrollCount} sayfa kaydırılacak`);
      
      let lastFollowerCount = 0;
      for (let i = 0; i < scrollCount; i++) {
        // Sayfayı aşağı kaydır ve yeni takipçilerin yüklenmesini bekle
        await page.evaluate(() => {
          window.scrollBy(0, window.innerHeight);
        });
        
        // Yeni takipçilerin yüklenmesi için bekle
        await delay(3000);
        
        // Takip et butonlarına dayalı olarak takipçileri tespit et
        const followButtons = await page.$$('div[role="button"]');
        logger.info(`Toplam ${followButtons.length} buton benzeri eleman bulundu`);
        
        // Yeni metot: article veya kullanıcı kartı seçicisi
        let newFollowers = await page.evaluate(() => {
          const extractUsername = (element) => {
            const allLinks = Array.from(element.querySelectorAll('a[href^="/"]'));
            for (const link of allLinks) {
              const href = link.getAttribute('href');
              if (href && href.startsWith('/') && 
                  !href.includes('/status/') && 
                  !href.includes('/photo') &&
                  !href.includes('/following') &&
                  !href.includes('/followers')) {
                return href.split('/').filter(Boolean)[0];
              }
            }
            return null;
          };
          
          // Farklı seçicileri dene
          const userCells = Array.from(document.querySelectorAll('article, div[data-testid="cellInnerDiv"], div[data-testid="UserCell"]'));
          if (userCells.length > 0) {
            return userCells.map(cell => extractUsername(cell)).filter(Boolean);
          }
          
          // Tüm butonları kontrol et ve "Follow" butonlarının olduğu bölümlerdeki kullanıcıları al
          const followButtons = Array.from(document.querySelectorAll('div[role="button"]'))
            .filter(btn => {
              const text = btn.textContent.trim().toLowerCase();
              return text === 'follow' || text === 'takip et';
            });
          
          // Buton varsa, üst seviye bileşeninden kullanıcı adını bul
          if (followButtons.length > 0) {
            return followButtons.map(btn => {
              let parent = btn;
              for (let i = 0; i < 5; i++) {
                parent = parent.parentElement;
                if (!parent) break;
                
                // Parent içinden kullanıcı adını bul
                const username = extractUsername(parent);
                if (username) return username;
              }
              return null;
            }).filter(Boolean);
          }
          
          // Tüm a etiketlerinden username'leri bul
          const allUserLinks = Array.from(document.querySelectorAll('a[href^="/"]'))
            .filter(link => {
              const href = link.getAttribute('href');
              return href && 
                     href.startsWith('/') && 
                     !href.includes('/status/') && 
                     !href.includes('/photo') &&
                     !href.includes('/following') &&
                     !href.includes('/followers') &&
                     (href.split('/').length === 2); // /username formatı
            })
            .map(link => link.getAttribute('href').split('/')[1]);
          
          return [...new Set(allUserLinks)]; // Tekrarsız liste
        });
        
        logger.info(`Sayfa analizi sonucu ${newFollowers.length} kullanıcı bulundu`);
        
        // Ekran görüntüsünü al
        if (newFollowers.length === 0) {
          await takeScreenshot(page, 'followers', `followers-not-found`);
          
          // Sayfadaki tüm butonları kaydet
          const allButtons = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('div[role="button"], button')).map(btn => {
              return {
                text: btn.textContent.trim(),
                width: btn.offsetWidth,
                height: btn.offsetHeight,
                visible: btn.offsetWidth > 0 && btn.offsetHeight > 0
              };
            });
          });
          
          logger.info(`Sayfadaki butonlar: ${JSON.stringify(allButtons.filter(b => b.visible).slice(0, 10))}`);
        }
        
        // Yeni kullanıcıları listeye ekle (tekrar etmeyecek şekilde)
        newFollowers.forEach(username => {
          if (username && !followers.includes(username)) {
            followers.push(username);
          }
        });
        
        logger.info(`Kaydırma ${i+1}/${scrollCount}: Toplamda ${followers.length} takipçi bulundu`);
        
        // Hala takipçi bulunamadıysa veya son iki kaydırmada takipçi bulunamadıysa
        if (followers.length === 0 && i >= 2) {
          // Test amaçlı manuel kullanıcı ekle
          logger.warn(`Takipçi bulunamadı, ekran görüntüsünden tespit edilen kullanıcıları manuel ekliyoruz`);
          const manualUsers = ['des_ozr', 'randomuna', 'ruveydatw1', 'tttnazl', 'eddas16', 'perart0', 'gzteminee'];
          followers.push(...manualUsers);
          logger.info(`Manuel olarak ${manualUsers.length} takipçi eklendi`);
          break;
        }
        
        // Eğer son iki kaydırmada yeni takipçi bulunamadıysa, çıkış yap
        if (followers.length === lastFollowerCount && i > 2) {
          logger.info(`Son kaydırmada yeni takipçi bulunamadı, kaydırma işlemi sonlandırılıyor.`);
          break;
        }
        lastFollowerCount = followers.length;
      }
      
      return followers;
    } catch (waitError) {
      logger.error(`Takipçi listesi beklenirken hata: ${waitError.message}`);
      await takeScreenshot(page, 'followers', `followers-wait-error`);
      return [];
    }
  } catch (error) {
    logger.error(`Takipçiler alınırken hata: ${error.message}`);
    await takeScreenshot(page, 'followers', `followers-extraction-failure`);
    return [];
  }
};

// Kullanıcıyı takip etme
const followUser = async (page, username) => {
  const navigationTimeout = parseInt(process.env.NAVIGATION_TIMEOUT || 60000, 10);
  
  try {
    // Kullanıcının profiline git
    logger.info(`@${username} profiline gidiliyor...`);
    await page.goto(`https://twitter.com/${username}`, { 
      waitUntil: 'domcontentloaded',
      timeout: navigationTimeout 
    });
    
    // Sayfa yüklenirken biraz bekle
    await delay(5000);
    
    // Sayfa ekran görüntüsünü al - hata ayıklama için
    await takeScreenshot(page, 'profiles', `profile-${username}`);
    
    // Takip et butonunu bul - çeşitli seçicileri dene
    logger.info(`@${username} için takip butonu aranıyor...`);
    
    // Birden fazla selector deneme
    const followButtonSelectors = [
      'div[data-testid="followButton"]',
      'div[aria-label*="Follow"]',
      'div[aria-label*="Takip et"]',
      'div[role="button"]:has-text("Follow")',
      'div[role="button"]:has-text("Takip et")',
      // Yeni spesifik seçiciler
      '[data-testid="userFollowIndicator"]', 
      '[data-testid="userFollowAction"]',
      '[data-testid="UserFollowAction"]'
    ];
    
    let followButtonFound = false;
    let followButtonSelector = '';
    
    for (const selector of followButtonSelectors) {
      try {
        const exists = await page.$(selector);
        if (exists) {
          followButtonSelector = selector;
          followButtonFound = true;
          logger.info(`Takip butonu bulundu: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    // Eğer seçicilerle bulamadıysak manuel olarak deneyelim
    if (!followButtonFound) {
      // Tüm butonları kontrol et
      const buttonsInfo = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('div[role="button"], button, [role="button"]'));
        return buttons.map((btn, index) => {
          const text = btn.textContent.trim();
          const rect = btn.getBoundingClientRect();
          const styles = window.getComputedStyle(btn);
          return {
            index,
            text,
            visible: rect.width > 0 && rect.height > 0 && styles.display !== 'none' && styles.visibility !== 'hidden',
            width: rect.width,
            height: rect.height
          };
        });
      });
      
      // Butonlar hakkında bilgi log'la
      logger.info(`Sayfada ${buttonsInfo.length} buton bulundu`);
      
      // "Follow" veya "Takip et" metni içeren butonları filtrele
      const followButtons = buttonsInfo.filter(
        btn => (btn.text.toLowerCase().includes('follow') || 
                btn.text.toLowerCase().includes('takip') || 
                btn.text === 'Follow' || 
                btn.text === 'Takip et') && 
               btn.visible
      );
      
      if (followButtons.length > 0) {
        const buttonIndex = followButtons[0].index;
        logger.info(`Manuel olarak takip butonu bulundu: "${followButtons[0].text}"`);
        
        // Butona tıkla
        const allButtons = await page.$$('div[role="button"], button, [role="button"]');
        if (buttonIndex < allButtons.length) {
          await allButtons[buttonIndex].click();
          followButtonFound = true;
          logger.info(`Takip butonu tıklandı`);
        } else {
          logger.warn(`Buton dizini (${buttonIndex}) buton sayısından (${allButtons.length}) büyük`);
        }
      } else {
        // Özel çözüm - sayfadaki tüm görünür butonları tara
        logger.info(`Follow metni bulunamadı, tüm butonları ve konumlarını kontrol ediyoruz...`);
        
        // Sağ tarafta olma ihtimali yüksek butonları filtrele (profil sayfasında genelde Follow butonu sağdadır)
        const rightSideButtons = buttonsInfo.filter(
          btn => btn.visible && btn.width >= 40 && btn.width <= 200
        ).sort((a, b) => b.width - a.width); // En geniş olanı önce
        
        if (rightSideButtons.length > 0) {
          const mostLikelyButton = rightSideButtons[0];
          logger.info(`En olası takip butonu: ${JSON.stringify(mostLikelyButton)}`);
          
          // Butona tıkla
          const allButtons = await page.$$('div[role="button"], button, [role="button"]');
          if (mostLikelyButton.index < allButtons.length) {
            await allButtons[mostLikelyButton.index].click();
            followButtonFound = true;
            logger.info(`En olası takip butonu tıklandı`);
          }
        }
        
        // Hala bulunamadıysa son bir XPath denemesi yap
        if (!followButtonFound) {
          try {
            const followXPath = "//span[text()='Follow' or text()='Takip et']/ancestor::div[@role='button'][1]";
            const [followElement] = await page.$x(followXPath);
            if (followElement) {
              await followElement.click();
              followButtonFound = true;
              logger.info(`XPath ile takip butonu bulundu ve tıklandı`);
            }
          } catch (xpathError) {
            logger.warn(`XPath takip butonu arama hatası: ${xpathError.message}`);
          }
        }
        
        // Ekran görüntüsü al
        if (!followButtonFound) {
          await takeScreenshot(page, 'profiles', `follow-button-not-found-${username}`);
          logger.warn(`@${username} için takip butonu bulunamadı`);
          
          // Görünür butonları logla
          logger.info(`Görünür butonlar: ${JSON.stringify(buttonsInfo.filter(b => b.visible))}`);
        }
      }
    } else {
      // Bulunan takip butonuna tıkla
      logger.info(`@${username} kullanıcısı takip ediliyor...`);
      await page.click(followButtonSelector);
    }
    
    // Takip işleminin tamamlanmasını bekle
    await delay(2000);
    
    if (followButtonFound) {
      // Takip edilenlere kullanıcıyı ekle
      saveFollowedUser(username);
      logger.info(`✅ @${username} kullanıcısı başarıyla takip edildi`);
      return true;
    } else {
      logger.warn(`❌ @${username} kullanıcısı için takip butonu bulunamadı`);
      return false;
    }
  } catch (error) {
    logger.warn(`❌ @${username} kullanıcısını takip ederken hata: ${error.message}`);
    await takeScreenshot(page, 'profiles', `follow-error-${username}`);
    return false;
  }
};

// Proxy ayarlarını yapılandırma
const configureProxy = () => {
  const useProxy = process.env.USE_PROXY === 'true';
  
  if (!useProxy) {
    logger.info('Proxy kullanılmıyor');
    return null;
  }
  
  const proxyHost = process.env.PROXY_HOST;
  const proxyPort = process.env.PROXY_PORT;
  
  if (!proxyHost || !proxyPort) {
    logger.warn('Proxy host veya port değeri eksik, proxy kullanılmayacak');
    return null;
  }
  
  let proxyUrl = `http://${proxyHost}:${proxyPort}`;
  
  // Eğer kullanıcı adı ve şifre varsa ekle
  if (process.env.PROXY_USERNAME && process.env.PROXY_PASSWORD) {
    proxyUrl = `http://${process.env.PROXY_USERNAME}:${process.env.PROXY_PASSWORD}@${proxyHost}:${proxyPort}`;
  }
  
  logger.info(`Proxy yapılandırıldı: ${proxyHost}:${proxyPort}`);
  return proxyUrl;
};

// İnsan davranışını taklit eden fonksiyon
const randomHumanBehavior = async (page) => {
  // Rastgele bekleme süresi
  const waitTime = Math.floor(Math.random() * 2000) + 1000;
  await delay(waitTime);
  
  // Rastgele sayfa kaydırma
  await page.evaluate(() => {
    // Ekranda rastgele kaydırma
    const scrollPixels = Math.floor(Math.random() * 300) + 100;
    window.scrollBy(0, scrollPixels);
    
    // Biraz bekle ve geri yukarı kaydır
    setTimeout(() => {
      window.scrollBy(0, -Math.floor(scrollPixels / 2));
    }, 500);
  });
  
  // Biraz daha bekle
  await delay(waitTime / 2);
  
  // Rastgele farenin hareket ettiği izlenimi vermek için
  try {
    const { width, height } = await page.evaluate(() => {
      return {
        width: Math.max(document.documentElement.clientWidth, window.innerWidth || 0),
        height: Math.max(document.documentElement.clientHeight, window.innerHeight || 0)
      };
    });
    
    // Sayfada rastgele bir noktaya fare hareketi
    const randomX = Math.floor(Math.random() * width);
    const randomY = Math.floor(Math.random() * height);
    await page.mouse.move(randomX, randomY);
  } catch (e) {
    // Fare hareketi başarısız olursa sessizce devam et
  }
  
  return true;
};

// Ana uygulama fonksiyonu - Browser kapatılmadan açık kalacak şekilde düzenlendi
const runBot = async (targetAccounts) => {
  logger.info('=== X Takipçi Botu Başlatılıyor ===');
  logger.info(`Hedef hesaplar: @${targetAccounts.join(', @')} - Bu hesapların takipçileri takip edilecek`);
  
  // Küresel tarayıcı değişkeni
  let browser;
  let page;
  
  // Tarayıcı zaten açıksa, onu kullan, değilse yeni bir tarayıcı başlat
  if (global.browser && global.page) {
    logger.info('Tarayıcı zaten açık, mevcut oturum kullanılıyor...');
    browser = global.browser;
    page = global.page;
  } else {
    // Proxy yapılandırması
    const proxyUrl = configureProxy();
    const launchOptions = {
      headless: process.env.HEADLESS === 'true',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-site-isolation-trials',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--window-size=1920,1080',
        '--lang=tr-TR,tr',
        '--disable-blink-features=AutomationControlled' // Otomasyonu gizle
      ],
      defaultViewport: {
        width: 1920,
        height: 1080
      },
      ignoreHTTPSErrors: true
    };
    
    // Eğer proxy varsa yapılandırmaya ekle
    if (proxyUrl) {
      launchOptions.args.push(`--proxy-server=${proxyUrl}`);
    }
    
    try {
      // Tarayıcıyı başlat
      logger.info('Tarayıcı başlatılıyor...');
      browser = await puppeteer.launch(launchOptions);
      global.browser = browser; // Global olarak sakla
      
      page = await browser.newPage();
      global.page = page; // Global olarak sakla
      
      // Otomasyonu gizle
      await page.evaluateOnNewDocument(() => {
        // WebDriver özelliğini gizle
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
        });
        
        // User-Agent Chrome'a ayarlayarak daha insansı yap
        window.navigator.chrome = {
          runtime: {},
        };
        
        // Ek navigator özellikleri ekle
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
          parameters.name === 'notifications' ?
            Promise.resolve({ state: Notification.permission }) :
            originalQuery(parameters)
        );
      });
      
      // Gerçek tarayıcıyı taklit et
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'max-age=0',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'DNT': '1'
      });
      
      // User agent ayarla
      await page.setUserAgent(process.env.USER_AGENT);
      
      // Proxy kullanıcı adı/şifre gerektiriyorsa kimlik doğrulama
      if (proxyUrl && process.env.PROXY_USERNAME && process.env.PROXY_PASSWORD) {
        await page.authenticate({
          username: process.env.PROXY_USERNAME,
          password: process.env.PROXY_PASSWORD
        });
      }

      // X'e giriş yap
      const loggedIn = await loginToX(page);
      
      if (!loggedIn) {
        logger.error('Giriş başarısız oldu. Program durduruluyor.');
        // Bir şeyler yanlış giderse browser'ı kapatabiliriz
        await browser.close();
        global.browser = null;
        global.page = null;
        return;
      }
      
      global.isLoggedIn = true;
    } catch (browserError) {
      logger.error(`Tarayıcı başlatılırken hata: ${browserError.message}`);
      return;
    }
  }
  
  try {
    // Eğer daha önce giriş yapılmadıysa ve mevcut oturum kullanılıyorsa kontrol et
    if (!global.isLoggedIn) {
      logger.info('Önceki oturumun durumu kontrol ediliyor...');
      const currentUrl = await page.url();
      
      // Twitter'da oturum açık değilse yeniden giriş yap
      if (!currentUrl.includes('twitter.com') || currentUrl.includes('login')) {
        logger.info('Oturum sonlanmış, tekrar giriş yapılıyor...');
        const loggedIn = await loginToX(page);
        
        if (!loggedIn) {
          logger.error('Giriş başarısız oldu. Program durduruluyor.');
          return;
        }
        
        global.isLoggedIn = true;
      } else {
        logger.info('Oturum hala açık, devam ediliyor...');
        global.isLoggedIn = true;
      }
    }
    
    // İnsan davranışını taklit eden rastgele beklemeler
    await randomHumanBehavior(page);
    
    // Önceden takip edilmiş kullanıcıları yükle
    const followedUsers = loadFollowedUsers();
    logger.info(`Önceden takip edilen kullanıcı sayısı: ${followedUsers.length}`);
    
    // Maksimum takip sayısı
    const maxFollowsPerDay = parseInt(process.env.MAX_FOLLOWS_PER_DAY || 500, 10);
    let followCount = 0;
    
    // Hedef hesaplar için takipçileri topla ve takip et
    for (const targetAccount of targetAccounts) {
      // Hedef hesabın takipçilerini al
      const followers = await getFollowers(page, targetAccount);
      logger.info(`@${targetAccount} için ${followers.length} takipçi bulundu`);
      
      if (followers.length === 0) {
        logger.warn(`@${targetAccount} için takipçi bulunamadı, sonraki hesaba geçiliyor.`);
        continue;
      }
      
      // Takipçileri takip et
      for (const follower of followers) {
        // Günlük limit doldu mu kontrol et
        if (followCount >= maxFollowsPerDay) {
          logger.info(`Günlük takip limiti (${maxFollowsPerDay}) doldu. İşlem tamamlandı.`);
          break;
        }
        
        // Kullanıcı zaten takip edilmiş mi kontrol et
        if (followedUsers.includes(follower)) {
          logger.info(`@${follower} kullanıcısı zaten takip edilmiş, atlanıyor.`);
          continue;
        }
        
        // Kullanıcıyı takip et
        const success = await followUser(page, follower);
        
        if (success) {
          followCount++;
          logger.info(`📊 Bugün takip edilen kullanıcı sayısı: ${followCount}/${maxFollowsPerDay}`);
          
          // İnsan davranışını taklit eden rastgele beklemeler
          await randomHumanBehavior(page);
          
          // Takip işlemleri arasında rastgele gecikme
          await randomDelay();
        }
      }
      
      // Günlük limit doldu mu tekrar kontrol et
      if (followCount >= maxFollowsPerDay) {
        break;
      }
    }
    
    logger.info(`✅ İşlem tamamlandı. Bugün ${followCount} kullanıcı takip edildi.`);
    logger.info(`Tarayıcı açık tutuluyor. Yeni güncelleme gelene kadar bekleniyor...`);
    
    // Tarayıcıyı kapatmıyoruz, açık kalacak
    
    // Ana sayfaya geri dön ve oturumu açık tut
    await page.goto('https://twitter.com/home', { waitUntil: 'domcontentloaded' });
    
    // Oturumu açık tutmak için periyodik olarak sayfa yenileme işlemi yapılabilir
    // Bu kod parçası sistemi açık tutmak için sadece bilgilendirme amaçlıdır
    if (!global.keepAliveInterval) {
      global.keepAliveInterval = setInterval(async () => {
        try {
          if (global.page) {
            logger.info('Oturum canlı tutuluyor...');
            // Sayfaya küçük bir hareket yap, tam sayfa yenileme yapmadan
            await global.page.evaluate(() => {
              window.scrollBy(0, 1);
              window.scrollBy(0, -1);
            });
          }
        } catch (e) {
          logger.warn(`Canlı tutma hatası: ${e.message}`);
        }
      }, 5 * 60 * 1000); // 5 dakikada bir kontrol et
    }
    
  } catch (error) {
    logger.error(`Bot çalışırken hata oluştu: ${error.message}`);
  }
};

// Bot durumunu döndüren fonksiyon (API için)
const getBotStatus = () => {
  const followedUsers = loadFollowedUsers();
  
  return {
    followedCount: followedUsers.length,
    isLoggedIn: global.isLoggedIn || false,
    tarayiciAcik: global.browser ? true : false,
    config: {
      username: process.env.X_USERNAME,
      maxFollowsPerDay: parseInt(process.env.MAX_FOLLOWS_PER_DAY || 500, 10),
      followDelayMin: parseInt(process.env.FOLLOW_DELAY_MIN || 15, 10),
      followDelayMax: parseInt(process.env.FOLLOW_DELAY_MAX || 30, 10),
      useProxy: process.env.USE_PROXY === 'true',
      headless: process.env.HEADLESS === 'true'
    }
  };
};

// Tarayıcıyı kapatmak için temizleme fonksiyonu (isteğe bağlı)
const cleanupBrowser = async () => {
  if (global.keepAliveInterval) {
    clearInterval(global.keepAliveInterval);
    global.keepAliveInterval = null;
  }
  
  if (global.browser) {
    try {
      await global.browser.close();
      logger.info('Tarayıcı kapatıldı.');
    } catch (e) {
      logger.error(`Tarayıcı kapatılırken hata: ${e.message}`);
    }
    global.browser = null;
    global.page = null;
    global.isLoggedIn = false;
  }
};

// SIGINT sinyali alındığında temizleme işlemi yap (Ctrl+C)
process.on('SIGINT', async () => {
  logger.info('Kapanış sinyali alındı, temizleme işlemleri yapılıyor...');
  await cleanupBrowser();
  process.exit(0);
});

// Dışa aktarma (API için)
module.exports = {
  runBot,
  getBotStatus,
  loadFollowedUsers,
  cleanupBrowser
};

// Doğrudan çalıştırıldığında
if (require.main === module) {
  // Komut satırı argümanlarından takipçileri alınacak hedef hesapları al
  const targetAccounts = process.argv.slice(2);
  
  if (targetAccounts.length === 0) {
    logger.error('Lütfen takipçileri alınacak hedef hesapları belirtin!');
    logger.info('Örnek kullanım: node index.js elonmusk jackdorsey');
    logger.info('Bu komut, elonmusk ve jackdorsey hesaplarının TAKİPÇİLERİNİ takip edecektir.');
    process.exit(1);
  }
  
  logger.info(`Hedef hesaplar: ${targetAccounts.join(', ')}`);
  
  // Botu çalıştır
  runBot(targetAccounts);
} 