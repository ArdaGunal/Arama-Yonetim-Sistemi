# Arama Yönetim Sistemi

Topluluk etkinlikleri için çevrimdışı kişi arama ve anket uygulaması. Android uygulaması React Native ve Expo ile geliştirilir; iPhone için ana ekrana eklenebilen web sürümünün yayın paketi hazırlanmıştır. Veriler cihazın yerel depolamasında tutulur.

> **Devir için başlangıç noktası:** [docs/README.md](docs/README.md). Ürünün uzun vadeli hedefleri [docs/hafiza/plan.md](docs/hafiza/plan.md) içindedir. iPhone PWA derlemesi hazır; GitHub Pages yayını ve gerçek cihaz doğrulaması bekliyor.

## Bugün neler yapılabiliyor?

- Metin listesinden veya Excel/CSV/TSV dosyasından kişi içe aktarma.
- Projeye özel metin ve seçim alanları oluşturma, kişileri arayıp cevapları kaydetme.
- Sonuçları Excel veya CSV olarak dışa aktarma.
- Projeyi `.ays` dosyası olarak yedekleme ve önizleyerek geri yükleme.
- Ana listeden çakışmasız görev ayırma, `.ays` görev paketini paylaşma ve gönüllü cihazında otomatik içe alma. [Kısa kılavuz](docs/kullanim/gorev-dagitimi.md).
- Gönüllü sonuçlarını `.ays` olarak kısmi veya tam paylaşma; koordinatörde toplu önizleme, çakışma kararı ve geri arama görevi oluşturma.
- Android'de hata raporunu geliştirici panelinden paylaşma; önceki açılışta kaydedilen yerel çökme bilgisini görüntüleme.

## Hızlı başlangıç

Node.js 20.19.4 veya üzeri ile proje klasöründe:

```powershell
npm ci
npm test
npx expo start
```

Windows'ta Android Studio ve Android SDK kuruluysa `localapk.bat` yerel APK üretir. Çıktıyı sürüm, derleme kodu ve tarih içeren adla `APK/` klasörüne kopyalar. Bu klasördeki APK'lar Git'e yüklenmez. Ayrıntılar: [kurulum ve yayın](docs/gelistirme/kurulum-ve-yayin.md).

iPhone web derlemesi için `npm run build:web`, yerel üretim önizlemesi için `npm run preview:web` kullanılır. [iPhone gönüllü yönergesi](docs/kullanim/iphone.md) ve [PWA yayın/test notları](docs/gelistirme/pwa-yayin.md) hazırdır.

## Önemli sınır

`.ays` dosyası yedek, görev veya sonuç paketi olabilir; içindeki `kind` bunu belirtir. Excel/CSV insan tarafından okunacak çıktıdır; otomatik birleştirme için `.ays` sonuç paketi kullanılır. Kişi verisi içeren gerçek dosyaları ve hata raporlarını herkese açık GitHub deposuna eklemeyin.
