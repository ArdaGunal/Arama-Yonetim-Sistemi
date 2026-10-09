# iPhone web uygulaması: yayın ve doğrulama

## Mimari

- Uygulama Expo'nun tek sayfalı web çıktısıdır. `npm run build:web` komutu `dist/` üretir ve `scripts/build-pwa.mjs` ile `sw.js` ve `.nojekyll` ekler.
- `app.json` içindeki `experiments.baseUrl` GitHub Pages proje yoludur: `/Arama-Yonetim-Sistemi`. Depo adı veya barındırma yolu değişirse bunu, `public/manifest.json` bağlantılarını ve `scripts/preview-pwa.mjs` içindeki yolu birlikte gözden geçirin.
- `public/index.html` service worker'ı kaydeder. Her üretim derlemesindeki dosyaların SHA-256 özetinden yeni önbellek adı yapılır. Yeni sürüm tam indirilemezse eski sürüm kalır; etkin sekme kapanana kadar yeni sürüm devreye girmez. Ana ekrandaki uyarı yedek alıp uygulamayı yeniden açmayı söyler.
- Service worker yalnızca aynı kökendeki uygulama dosyalarını önbelleğe alır. Kişi ve cevaplar sunucuya gönderilmez; uygulama tarayıcı depolamasında saklar. Bu depolama silinebilir. `.ays` sonuç ve yedek dosyaları zorunlu kullanımın parçasıdır.
- Web yedek ekranı `navigator.storage.persisted()` ile ek depolama korumasını kontrol eder. Kullanıcı düğmeye bastığında `persist()` çağrılır; desteklenmiyorsa veya tarayıcı reddederse dosya yedeği akışı aynen sürer. Bu izin tarayıcı verilerinin kullanıcı tarafından silinmesini veya cihaz değişimini önlemez.
- `public/pwa-icon.png` Android APK'daki görsel simgenin kopyasıdır. Görsel değiştiğinde iki kopyayı birlikte güncelleyin.

## Yerel kontrol

1. `npm ci`, `npm test`, `npm run build:web` çalıştırın.
2. `npm run preview:web` ile `http://localhost:8091/Arama-Yonetim-Sistemi/` adresini açın. İlk açılışta `manifest.json`, `sw.js`, JavaScript ve simge isteklerinin başarılı olduğunu doğrulayın.
3. Sayfayı açtıktan sonra önizleme sunucusunu durdurun; sayfayı yeniden yükleyin. Uygulama, önceki içerik ve görevler görünmelidir. Sahte `.ays` dosyasıyla içe aktarma, cevap kaydetme, sonuç dosyası çıkarma ve yedekten geri yüklemeyi sınayın.
4. Üretim alanında çevrimdışı kullanım için HTTPS gerekir. `localhost` yalnızca geliştirici testidir.

## GitHub Pages yayını

Uygulama 8 Ekim 2026'da [GitHub Pages adresinde](https://ardagunal.github.io/Arama-Yonetim-Sistemi/) yayınlandı. İlk [yayın iş akışı](https://github.com/ArdaGunal/Arama-Yonetim-Sistemi/actions/runs/37732819182) başarılı oldu; canlı ana ekran, `manifest.json`, `sw.js` ve simge dosyası açıldı. Bu kontrol gerçek iPhone kabul testinin yerini tutmaz.

`.github/workflows/pages.yml` elle çalıştırılabilen yayın iş akışıdır. Sonraki kod güncellemelerinde **Actions → iPhone web uygulaması → Run workflow** ile `main` dalını yeniden yayınlayın. İş akışı kaynak kodu derler, testleri çalıştırır, yalnızca `dist/` klasörünü yayınlar. Kişi dosyaları depoda veya sitede bulunmamalıdır. Yayın ayarı yeniden yapılacaksa **Settings → Pages → Source** bölümünde **GitHub Actions** seçilmelidir.

GitHub hesabı bireysel olduğu için topluluğa devredilecekse depo ve Pages yönetimi topluluğun denetlediği hesaba/organizasyona taşınmalı, yeni yolda `baseUrl` güncellenmeli ve eski adresten geçiş duyurulmalıdır. Uygulamadaki veriler bu taşınma sırasında kendiliğinden aktarılmaz; kullanıcılar önceden `.ays` yedeği almalıdır.

## Gerçek iPhone kabul testi

- Safari'den ana ekrana ekle; simge ve tam ekran açılışını gör.
- WhatsApp'taki görev dosyasını Dosyalar'a kaydet, PWA'da dosya seçerek aç. Aynı dosyayı tekrar açıp önceki cevabın kaldığını gör.
- Uçak modunda uygulamayı kapatıp aç; kişi ve cevapları gör; yeni cevap kaydet.
- Sonuç `.ays` dosyasını WhatsApp'a gönder, koordinatörün Android uygulamasında önizleyip birleştir.
- Yeni cevap kaydedilince ana ekranda sonuç hatırlatmasının çıktığını, web paylaşımı iptal edilince kaldığını ve güncel dosya indirildikten/paylaşıldıktan sonra kapandığını doğrula. Paylaşım menüsünden gerçek gönderimi ayrıca kontrol et.
- Etkinlik yedeğini Dosyalar'a kaydet; temiz tarayıcı/profil veya başka cihazda geri yükle.
- Yedek ekranındaki ek depolama koruması durumunu gör. Tarayıcı destekliyorsa düğmeyi dene; reddederse `.ays` yedeğini yine dışarı kaydet.
- Yeni sürüm yayınlandığında eski açık oturumda uyarıyı gör; yedek alıp uygulamayı kapat/aç; verilerin kaldığını doğrula.
- 5.000 kişi ve 100 görev paketi için koordinatör tarafında gerçek cihaz performansını ayrıca ölç. iPhone gönüllü cihazına yalnızca kendi görevi gönderilmeli.

Gerçek iPhone testi tamamlanmadan çevrimdışı kullanım ve WhatsApp dosya paylaşımı tüm iPhone sürümleri için doğrulanmış kabul edilmez.
