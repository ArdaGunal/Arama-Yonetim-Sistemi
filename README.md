# Arama Yönetim Sistemi

Topluluk etkinlikleri için çevrimdışı kişi arama ve anket uygulaması. Android uygulaması React Native ve Expo ile geliştirilir; web sürümü geliştirme ortamında çalışır. Veriler şu anda cihazın yerel depolamasında tutulur.

> **Devir için başlangıç noktası:** [docs/README.md](docs/README.md). Ürünün uzun vadeli hedefleri [docs/hafiza/plan.md](docs/hafiza/plan.md) içindedir. Plandaki görev dağıtımı, sonuç birleştirme, yedek ve iPhone PWA özellikleri henüz tamamlanmış özellikler olarak görülmemelidir.

## Bugün neler yapılabiliyor?

- Metin listesinden veya Excel/CSV/TSV dosyasından kişi içe aktarma.
- Projeye özel metin ve seçim alanları oluşturma, kişileri arayıp cevapları kaydetme.
- Sonuçları Excel veya CSV olarak dışa aktarma.
- Projeyi `.ays` dosyası olarak yedekleme ve önizleyerek geri yükleme.
- Android'de hata raporunu geliştirici panelinden paylaşma; önceki açılışta kaydedilen yerel çökme bilgisini görüntüleme.

## Hızlı başlangıç

Node.js 20.19.4 veya üzeri ile proje klasöründe:

```powershell
npm ci
npm test
npx expo start
```

Windows'ta Android Studio ve Android SDK kuruluysa `localapk.bat` yerel APK üretir. Çıktıyı sürüm, derleme kodu ve tarih içeren adla `APK/` klasörüne kopyalar. Bu klasördeki APK'lar Git'e yüklenmez. Ayrıntılar: [kurulum ve yayın](docs/gelistirme/kurulum-ve-yayin.md).

## Önemli sınır

Şu anki `.ays` biçimi yalnızca tam etkinlik yedeğidir. Excel/CSV çıktısı çalışılan projenin sonuç dosyasıdır; birden fazla gönüllünün sonucunu güvenle birleştiren görev paketi sistemi henüz yoktur. Kişi verisi içeren gerçek dosyaları ve hata raporlarını herkese açık GitHub deposuna eklemeyin.
