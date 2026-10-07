# Proje durumu ve devir notu

Son gözden geçirme: 7 Ekim 2026. Kaynak kodun bulunduğu dizin artık `Arama_Yonetim_Sistemi`; eski GitHub sürümünde proje `Arama Yönetim Sistemi/` altındaydı. Yeni düzenin giriş noktası depo kökündeki `package.json` dosyasıdır. Kodda sabit yerel proje yolu kullanılmamalıdır.

## Mevcut uygulama

- Expo SDK 54, React Native 0.81, React 19. Android ve web hedefleri vardır. iOS için Expo yapılandırması bulunur; gerçek iPhone dağıtım akışı henüz hazırlanmadı.
- Yeni projede metinden telefon/isim ayrıştırılır veya Excel/CSV/TSV ilk sayfası içe aktarılır. Form alanları ve seçim seçenekleri proje oluşturulurken düzenlenir.
- Projeler ve kişi cevapları AsyncStorage'da cihaz üzerinde saklanır. Anket ekranı değişiklikleri taslağa ve proje kaydına yazar.
- Sonuçlar Excel/CSV olarak paylaşılabilir veya kaydedilebilir. Bu dışa aktarma, ileride tasarlanan görev/sonuç paket biçimi değildir.
- Her proje `.ays` tam yedeği olarak dışa aktarılabilir. Dosya SHA-256 ile doğrulanır; geri yüklemeden önce etkinlik ve kişi sayısı gösterilir. Aynı içerik ikinci kez içe alınmaz. Farklı içerikli mevcut etkinliğin üzerine otomatik yazılmaz.
- Geliştirici paneli JavaScript hata bilgilerini ve uygulama içindeki son işlem izlerini gösterip paylaşır. Android yerel çökme kaydı sonraki açılışta okunur; yerel bir çökme anında uygulamanın kapanmasını tamamen önlemek teknik olarak mümkün değildir.
- Android için `localapk.bat` ile yerel APK üretilebilir. Bu çıktı mevcut Android debug anahtarıyla imzalanır; mağaza yayını için ayrı imzalama gerekir.

## Henüz yapılmadı

- Ayrı koordinatör/gönüllü rolleri, tek ana liste üzerinden çakışmasız görev dağıtımı, sonuç paketlerini geri alıp birleştirme, geri arama turları.
- Form/görev/sonuç paketleri ve bunların sürüm sözleşmeleri; mevcut `.ays` sürüm 1 yalnızca tam etkinlik yedeğidir.
- Kalıcı, çevrimdışı çalışan ve gerçek iPhone'da doğrulanmış PWA dağıtımı.
- Büyük veri setleri ve 100 gönüllü senaryosu için performans doğrulaması.

Bu gereksinimlerin tasarımı [plan.md](plan.md) içindedir. Kodda varmış gibi kabul etmeyin.

## Devralan kişinin ilk kontrolü

1. [Kurulum ve yayın](../gelistirme/kurulum-ve-yayin.md) adımlarını izleyin; `npm test` ve Android cihazda temel içe aktarma/anket/dışa aktarma akışını çalıştırın.
2. GitHub deposunun `main` dalını ve yerel değişiklikleri kontrol edin. `APK/` klasörü yalnızca yerel sürüm arşividir.
3. Gerçek kişi verileriyle çalışmadan önce verinin nerede tutulduğunu ve yedek durumunu [mimari ve veri](../gelistirme/mimari-ve-veri.md) dosyasından okuyun.
4. Yeni özellikte önce [plan.md](plan.md) içindeki dosya sözleşmesi ve kimlik kurallarını netleştirin; böylece farklı cihazlardan gelen sonuçlar güvenle birleştirilebilir.

## Bilinen riskler

- Yerel depolama silinirse, uygulamanın içinde kalan cevaplar kaybolabilir. Mevcut Excel/CSV dışa aktarımı düzenli alınmalıdır; tam geri yükleme henüz yoktur.
- Depo herkese açıktır. Telefon listelerini, gönüllü dosyalarını ve paylaşılan tanılama raporlarını Git'e koymayın.
- Hata paneli tanılama içindir. Raporun içinde hata metni ve işlem izleri bulunur; paylaşan kişi içeriği kontrol etmelidir.
- `.ays` dosyası şifrelenmez ve kişi verileri içerir. SHA-256 bozulmayı saptar, dosyayı kimin oluşturduğunu kanıtlamaz. Aynı etkinliğin farklı içerikli yedeğini geri almak için güvenli değiştirme akışı henüz yoktur.
