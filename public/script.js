// DOM Yüklendikten Sonra Başla
document.addEventListener('DOMContentLoaded', function() {
  // Açılış bildirimi - botun ne yaptığını açıkla
  setTimeout(() => {
    showToast(
      '🔔 Bilgi', 
      'Bu bot, belirttiğiniz hedef X hesaplarının TAKİPÇİLERİNİ takip eder. Yani hesapların kendilerini değil, onların takipçilerini takip edersiniz.',
      'info',
      10000
    );
  }, 1000);
  
  // Sidebar Geçişi
  document.getElementById('sidebarCollapse').addEventListener('click', function() {
    document.getElementById('sidebar').classList.toggle('active');
  });
  
  // Proxy Ayarları Göster/Gizle
  document.getElementById('useProxy').addEventListener('change', function() {
    const proxySettings = document.getElementById('proxy-settings');
    if (this.checked) {
      proxySettings.classList.remove('d-none');
    } else {
      proxySettings.classList.add('d-none');
    }
  });
  
  // Hedef Hesaplar Listesi
  const targetAccounts = [];
  const targetAccountsList = document.getElementById('target-accounts-list');
  
  // Hedef Hesap Ekle Formu
  document.getElementById('add-account-form').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const accountInput = document.getElementById('new-account');
    const accountName = accountInput.value.trim();
    
    if (accountName && !targetAccounts.includes(accountName)) {
      targetAccounts.push(accountName);
      updateTargetAccountsList();
      accountInput.value = '';
      
      showToast(
        'Hesap Eklendi', 
        `@${accountName} hedef hesap olarak eklendi. Bu hesabın TAKİPÇİLERİ takip edilecek.`,
        'success'
      );
    } else if (targetAccounts.includes(accountName)) {
      showToast('Hata', 'Bu hesap zaten listede mevcut!', 'error');
    }
  });
  
  // Takip Edilenler Yenileme
  document.getElementById('refresh-followed').addEventListener('click', function() {
    loadFollowedUsers();
  });
  
  // Log Yenileme
  document.getElementById('refresh-logs').addEventListener('click', function() {
    loadLogs();
  });
  
  // Log Temizleme
  document.getElementById('clear-logs').addEventListener('click', function() {
    document.getElementById('log-content').textContent = 'Loglar temizlendi.';
    showToast('Loglar Temizlendi', 'Tüm log kayıtları temizlendi.');
  });
  
  // Hızlı Başlat Formu
  document.getElementById('quick-start-form').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const accountsInput = document.getElementById('target-accounts').value;
    if (!accountsInput.trim()) {
      showToast('Hata', 'Lütfen en az bir hedef hesap girin!', 'error');
      return;
    }
    
    const accounts = accountsInput.split(',').map(acc => acc.trim()).filter(Boolean);
    
    // Hesapları açıkla
    let accountsInfo = `<strong>${accounts.length} hedef hesap:</strong> @${accounts.join(', @')}`;
    addActivityItem(accountsInfo);
    addActivityItem('<strong>ÖNEMLİ:</strong> Bu hesapların kendileri değil, TAKİPÇİLERİ takip edilecek.');
    
    startBot(accounts);
  });
  
  // Yapılandırma Formu
  document.getElementById('config-form').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const formData = new FormData(this);
    const config = {
      username: formData.get('username'),
      password: formData.get('password'),
      maxFollowsPerDay: formData.get('maxFollowsPerDay'),
      followDelayMin: formData.get('followDelayMin'),
      followDelayMax: formData.get('followDelayMax'),
      headless: formData.get('headless') === 'on',
      useProxy: formData.get('useProxy') === 'on',
      proxyHost: formData.get('proxyHost'),
      proxyPort: formData.get('proxyPort'),
      proxyUsername: formData.get('proxyUsername'),
      proxyPassword: formData.get('proxyPassword')
    };
    
    updateConfig(config);
  });
  
  // Hedef Hesaplar Listesini Güncelle
  function updateTargetAccountsList() {
    if (targetAccounts.length === 0) {
      targetAccountsList.innerHTML = `
        <tr>
          <td colspan="2" class="text-center">Hedef hesap eklenmemiş</td>
        </tr>
      `;
      return;
    }
    
    targetAccountsList.innerHTML = '';
    
    targetAccounts.forEach(account => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><a href="https://twitter.com/${account}" target="_blank">@${account}</a></td>
        <td>
          <button class="btn btn-sm btn-danger remove-account" data-account="${account}">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      `;
      targetAccountsList.appendChild(row);
    });
    
    // Hesap Silme Butonlarını Dinle
    document.querySelectorAll('.remove-account').forEach(button => {
      button.addEventListener('click', function() {
        const account = this.getAttribute('data-account');
        const index = targetAccounts.indexOf(account);
        if (index !== -1) {
          targetAccounts.splice(index, 1);
          updateTargetAccountsList();
          showToast('Hesap Kaldırıldı', `@${account} hedef hesaplardan kaldırıldı.`);
        }
      });
    });
  }
  
  // Takip Edilen Kullanıcıları Yükle
  function loadFollowedUsers() {
    fetch('/api/followed-users')
      .then(response => response.json())
      .then(data => {
        const followedList = document.getElementById('followed-users-list');
        document.getElementById('followed-total').textContent = data.length;
        document.getElementById('followed-count').textContent = data.length;
        
        if (data.length === 0) {
          followedList.innerHTML = `
            <tr>
              <td colspan="2" class="text-center">Takip edilen kullanıcı bulunmuyor</td>
            </tr>
          `;
          return;
        }
        
        followedList.innerHTML = '';
        data.forEach(username => {
          const row = document.createElement('tr');
          row.innerHTML = `
            <td><a href="https://twitter.com/${username}" target="_blank">@${username}</a></td>
            <td>
              <a href="https://twitter.com/${username}" target="_blank" class="btn btn-sm btn-outline-primary">
                <i class="bi bi-box-arrow-up-right"></i> Profili Görüntüle
              </a>
            </td>
          `;
          followedList.appendChild(row);
        });
      })
      .catch(error => {
        console.error('Takip edilen kullanıcılar yüklenirken hata:', error);
        showToast('Hata', 'Takip edilen kullanıcılar yüklenirken bir sorun oluştu!', 'error');
      });
  }
  
  // Günlük Logları Yükle (Bot.log dosyası)
  function loadLogs() {
    // Normalde sunucu tarafından bir API ile log dosyası okunur
    // Ancak burada bir örnek gösterim için
    const logContent = document.getElementById('log-content');
    logContent.textContent = 'Loglar sunucudan yükleniyor...';
    
    // Demo log mesajları
    setTimeout(() => {
      const demoLogs = `2023-03-19T12:34:56 info: === X Takipçi Botu Başlatılıyor ===
2023-03-19T12:34:56 info: Hedef hesaplar: @elonmusk, @jackdorsey - Bu hesapların takipçileri takip edilecek
2023-03-19T12:34:57 info: Proxy yapılandırıldı: 91.107.130.145:11000
2023-03-19T12:34:57 info: Tarayıcı başlatılıyor...
2023-03-19T12:34:58 info: X'e giriş yapılıyor... (Zaman aşımı: 60000ms)
2023-03-19T12:35:02 info: X'e başarıyla giriş yapıldı
2023-03-19T12:35:03 info: Önceden takip edilen kullanıcı sayısı: 42
2023-03-19T12:35:04 info: Hedef hesap: @elonmusk - Takipçileri alınıyor...
2023-03-19T12:35:08 info: Takipçi listesi yüklendi, 10 sayfa kaydırılacak
2023-03-19T12:35:10 info: Kaydırma 1/10: Toplamda 12 takipçi bulundu
2023-03-19T12:35:12 info: Kaydırma 2/10: Toplamda 23 takipçi bulundu
2023-03-19T12:35:15 info: Kaydırma 3/10: Toplamda 35 takipçi bulundu
2023-03-19T12:35:16 info: @elonmusk için 35 takipçi bulundu
2023-03-19T12:35:18 info: @johndoe profiline gidiliyor...
2023-03-19T12:35:19 info: @johndoe için takip butonu aranıyor...
2023-03-19T12:35:20 info: @johndoe kullanıcısı takip ediliyor...
2023-03-19T12:35:21 info: ✅ @johndoe kullanıcısı başarıyla takip edildi
2023-03-19T12:35:21 info: 📊 Bugün takip edilen kullanıcı sayısı: 1/50
2023-03-19T12:35:21 info: Bekleniyor: 22 saniye`;
      
      logContent.textContent = demoLogs;
      addActivityItem('Loglar yenilendi');
    }, 1000);
  }
  
  // Bot Durumunu Getir
  function getBotStatus() {
    fetch('/api/status')
      .then(response => response.json())
      .then(data => {
        document.getElementById('followed-count').textContent = data.followedCount;
        document.getElementById('daily-limit').textContent = data.config.maxFollowsPerDay;
        
        // Proxy Durumu
        const proxyStatus = document.getElementById('proxy-status');
        const proxyIcon = document.getElementById('proxy-icon');
        if (data.config.useProxy) {
          proxyStatus.textContent = 'Aktif';
          proxyIcon.classList.remove('text-secondary');
          proxyIcon.classList.add('text-success');
        } else {
          proxyStatus.textContent = 'Kapalı';
          proxyIcon.classList.remove('text-success');
          proxyIcon.classList.add('text-secondary');
        }
        
        // Form değerlerini doldur
        document.getElementById('username').value = data.config.username;
        document.getElementById('maxFollowsPerDay').value = data.config.maxFollowsPerDay || 500;
        document.getElementById('followDelayMin').value = data.config.followDelayMin;
        document.getElementById('followDelayMax').value = data.config.followDelayMax;
        document.getElementById('headless').checked = data.config.headless;
        document.getElementById('useProxy').checked = data.config.useProxy;
        
        if (data.config.useProxy) {
          document.getElementById('proxy-settings').classList.remove('d-none');
        }
        
        // Bağlantı durumu
        const statusIndicator = document.getElementById('status-indicator');
        statusIndicator.innerHTML = '<span class="badge rounded-pill text-bg-success">Bağlantı Kuruldu</span>';
      })
      .catch(error => {
        console.error('Bot durumu alınırken hata:', error);
        const statusIndicator = document.getElementById('status-indicator');
        statusIndicator.innerHTML = '<span class="badge rounded-pill text-bg-danger">Bağlantı Hatası</span>';
      });
  }
  
  // Bot Yapılandırmasını Güncelle
  function updateConfig(config) {
    fetch('/api/config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(config)
    })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          showToast('Başarılı', 'Bot ayarları başarıyla güncellendi!', 'success');
          getBotStatus(); // Durumu yenile
          addActivityItem('Bot ayarları güncellendi');
        } else {
          showToast('Hata', data.error || 'Ayarlar güncellenirken bir sorun oluştu!', 'error');
        }
      })
      .catch(error => {
        console.error('Ayarlar güncellenirken hata:', error);
        showToast('Hata', 'Ayarlar güncellenirken bir sorun oluştu!', 'error');
      });
  }
  
  // Botu Başlat
  function startBot(targetAccounts) {
    fetch('/api/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ targetAccounts })
    })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          showToast(
            'Bot Başlatıldı', 
            `Bot ${targetAccounts.length} hedef hesabın TAKİPÇİLERİNİ takip etmeye başladı.`, 
            'success'
          );
          
          // Bot durumu değiştir
          const botStatus = document.getElementById('bot-status');
          const botStatusIcon = document.getElementById('bot-status-icon');
          
          botStatus.textContent = 'Çalışıyor';
          botStatusIcon.classList.remove('text-secondary');
          botStatusIcon.classList.add('text-success');
          
          addActivityItem(`Bot başlatıldı: @${targetAccounts.join(', @')} hesaplarının takipçileri takip edilecek`);
        } else {
          showToast('Hata', data.error || 'Bot başlatılırken bir sorun oluştu!', 'error');
        }
      })
      .catch(error => {
        console.error('Bot başlatılırken hata:', error);
        showToast('Hata', 'Bot başlatılırken bir sorun oluştu!', 'error');
      });
  }
  
  // Toast Bildirim Göster
  function showToast(title, message, type = 'info', duration = 5000) {
    const toastEl = document.getElementById('notification-toast');
    const toastTitle = document.getElementById('toast-title');
    const toastMessage = document.getElementById('toast-message');
    
    toastTitle.textContent = title;
    toastMessage.textContent = message;
    
    // Toast tipine göre renklendirme
    const toast = bootstrap.Toast.getOrCreateInstance(toastEl, {
      autohide: true,
      delay: duration
    });
    
    // Renk sınıflarını kaldır
    toastEl.classList.remove('bg-success', 'bg-danger', 'bg-warning', 'bg-info', 'text-white');
    
    // Renk tipi ekle
    if (type === 'success') {
      toastEl.classList.add('bg-success', 'text-white');
    } else if (type === 'error') {
      toastEl.classList.add('bg-danger', 'text-white');
    } else if (type === 'warning') {
      toastEl.classList.add('bg-warning');
    } else {
      toastEl.classList.add('bg-info', 'text-white');
    }
    
    toast.show();
  }
  
  // Aktivite Öğesi Ekle
  function addActivityItem(message) {
    const activityFeed = document.getElementById('activity-feed');
    const now = new Date();
    const timeString = now.toLocaleTimeString();
    
    // İlk öğeyi kaldır
    if (activityFeed.querySelector('.text-center')) {
      activityFeed.innerHTML = '';
    }
    
    const activityItem = document.createElement('div');
    activityItem.className = 'activity-item';
    activityItem.innerHTML = `
      <div class="d-flex justify-content-between">
        <div>${message}</div>
        <span class="activity-time">${timeString}</span>
      </div>
    `;
    
    activityFeed.prepend(activityItem);
  }
  
  // Sayfa Yüklendiğinde
  getBotStatus();
  loadFollowedUsers();
  loadLogs();
}); 