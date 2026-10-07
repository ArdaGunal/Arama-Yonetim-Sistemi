# Proje durumu ve devir notu

Son gözden geçirme: 8 Ekim 2026. Kaynak kodun bulunduğu dizin artık `Arama_Yonetim_Sistemi`; eski GitHub sürümünde proje `Arama Yönetim Sistemi/` altındaydı. Yeni düzenin giriş noktası depo kökündeki `package.json` dosyasıdır. Kodda sabit yerel proje yolu kullanılmamalıdır.

## Mevcut uygulama

- Expo SDK 54, React Native 0.81, React 19. Android ve web hedefleri vardır. iOS için Expo yapılandırması bulunur; gerçek iPhone dağıtım akışı henüz hazırlanmadı.
- Yeni projede metin veya Excel/CSV/TSV ilk sayfası üç adımda içe alınır: kaynak sütunları önizlenip eşleştirilir, aynı telefonlu satırlardan biri açıkça seçilir, sorular/şıklar düzenlenir. Geçersiz ve seçilmeyen satırlar inceleme kaydında kalır.
- Form, ilk tamamlanan arama veya ilk görev oluşturulana kadar düzenlenebilir; ardından kilitlenir. `.ayst` şablon dosyası kaynak sütun görevleriyle birlikte paylaşılır ve içe alındığında kaydedilir.
- Projeler ve kişi cevapları AsyncStorage'da cihaz üzerinde saklanır. Anket ekranı değişiklikleri taslağa ve proje kaydına yazar.
- Sonuçlar Excel/CSV olarak paylaşılabilir veya kaydedilebilir. Bu dışa aktarma, ileride tasarlanan görev/sonuç paket biçimi değildir.
- Her proje `.ays` sürüm 3 tam yedeği olarak dışa aktarılabilir; sürüm 1 ve 2 de okunur. Görev kayıtları yedeğe girer. Dosya SHA-256 ile doğrulanır; aynı içerik ikinci kez içe alınmaz ve farklı içerikli etkinlik otomatik ezilmez.
- Koordinatör kişi sayısıyla ilk tur görevi ayırır; paket yalnızca ayrılmış kişileri ve formu taşır. Hazırlandı/gönderildi/iptal durumları izlenir. Gönüllü Android veya web uygulamasında dosyayı seçince sorular ve kendi kişileri açılır. Aynı dosyanın yeniden açılması cevapları sıfırlamaz.
- Geliştirici paneli JavaScript hata bilgilerini ve uygulama içindeki son işlem izlerini gösterip paylaşır. Android yerel çökme kaydı sonraki açılışta okunur; yerel bir çökme anında uygulamanın kapanmasını tamamen önlemek teknik olarak mümkün değildir.
- Android için `localapk.bat` ile yerel APK üretilebilir. Bu çıktı mevcut Android debug anahtarıyla imzalanır; mağaza yayını için ayrı imzalama gerekir.

## Henüz yapılmadı

- Gönüllü sonuç paketleri, bunları güvenle birleştirme, geri arama turları ve durum geçmişi. Şimdiki Excel/CSV dışa aktarımı bu birleştirme dosyası değildir.
- Gönderilmiş dosyanın karşı tarafta gerçekten açıldığını doğrulayan merkezi sistem yoktur; durum koordinatör tarafından işaretlenir.
- Kalıcı, çevrimdışı çalışan ve gerçek iPhone'da doğrulanmış PWA dağıtımı.
- Büyük veri setleri ve 100 gönüllü senaryosu için performans doğrulaması.

Bu gereksinimlerin tasarımı [plan.md](plan.md) içindedir. Kodda varmış gibi kabul etmeyin.

## Devralan kişinin ilk kontrolü

1. [Kurulum ve yayın](../gelistirme/kurulum-ve-yayin.md) adımlarını izleyin; `npm test` ve Android cihazda temel içe aktarma/anket/dışa aktarma akışını çalıştırın.
2. GitHub deposunun `main` dalını ve yerel değişiklikleri kontrol edin. `APK/` klasörü yalnızca yerel sürüm arşividir.
3. Gerçek kişi verileriyle çalışmadan önce verinin nerede tutulduğunu ve yedek durumunu [mimari ve veri](../gelistirme/mimari-ve-veri.md) dosyasından okuyun.
4. Yeni özellikte önce [plan.md](plan.md) içindeki dosya sözleşmesi ve kimlik kurallarını netleştirin; böylece farklı cihazlardan gelen sonuçlar güvenle birleştirilebilir.

## Bilinen riskler

- Yerel depolama silinirse, uygulamanın içinde kalan cevaplar kaybolabilir. Düzenli `.ays` tam yedeği alınmalıdır; farklı içerikli mevcut etkinliğin üzerine güvenli geri alma henüz yoktur.
- Depo herkese açıktır. Telefon listelerini, gönüllü dosyalarını ve paylaşılan tanılama raporlarını Git'e koymayın.
- Hata paneli tanılama içindir. Raporun içinde hata metni ve işlem izleri bulunur; paylaşan kişi içeriği kontrol etmelidir.
- `.ays` dosyası şifrelenmez ve kişi verileri içerir. SHA-256 bozulmayı saptar, dosyayı kimin oluşturduğunu kanıtlamaz. Aynı etkinliğin farklı içerikli yedeğini geri almak için güvenli değiştirme akışı henüz yoktur.
