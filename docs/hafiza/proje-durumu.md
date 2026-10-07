# Proje durumu ve devir notu

Son gözden geçirme: 8 Ekim 2026. Kaynak kodun bulunduğu dizin artık `Arama_Yonetim_Sistemi`; eski GitHub sürümünde proje `Arama Yönetim Sistemi/` altındaydı. Yeni düzenin giriş noktası depo kökündeki `package.json` dosyasıdır. Kodda sabit yerel proje yolu kullanılmamalıdır.

## Mevcut uygulama

- Expo SDK 54, React Native 0.81, React 19. Android ve web hedefleri vardır. iOS için Expo yapılandırması bulunur; gerçek iPhone dağıtım akışı henüz hazırlanmadı.
- Yeni projede metin veya Excel/CSV/TSV ilk sayfası üç adımda içe alınır: kaynak sütunları önizlenip eşleştirilir, aynı telefonlu satırlardan biri açıkça seçilir, sorular/şıklar düzenlenir. Geçersiz ve seçilmeyen satırlar inceleme kaydında kalır.
- Form, ilk tamamlanan arama veya ilk görev oluşturulana kadar düzenlenebilir; ardından kilitlenir. `.ayst` şablon dosyası kaynak sütun görevleriyle birlikte paylaşılır ve içe alındığında kaydedilir.
- Projeler ve kişi cevapları AsyncStorage'da cihaz üzerinde saklanır. Anket ekranı değişiklikleri taslağa ve proje kaydına yazar.
- Sonuçlar `.ays` paketleriyle kısmi veya tam paylaşılır. Daha yeni gönderim sürümü öncekinin yerine işlenir; çakışmalar koordinatöre gösterilir. Excel/CSV ayrıca insan tarafından okunabilen çıktı olarak alınabilir.
- Her proje `.ays` sürüm 4 tam yedeği olarak dışa aktarılabilir; sürüm 1, 2 ve 3 de okunur. Görevler, arama geçmişi ve birleştirme kararları yedeğe girer. Dosya SHA-256 ile doğrulanır; aynı içerik ikinci kez içe alınmaz ve farklı içerikli etkinlik otomatik ezilmez.
- Koordinatör kişi sayısıyla ilk tur görevi ayırır; paket yalnızca ayrılmış kişileri ve formu taşır. Hazırlandı/gönderildi/iptal durumları izlenir. Gönüllü Android veya web uygulamasında dosyayı seçince sorular ve kendi kişileri açılır. Aynı dosyanın yeniden açılması cevapları sıfırlamaz.
- `Sonra ara` cevaplarından yeni tur görevi oluşturulur. Önceki arama denemeleri ve anlamlı cevaplar saklanır. Nihai Excel'de Güncel Durum, Arama Geçmişi ve varsa İncelenecek Çakışmalar sayfaları vardır.
- Android uygulaması `ACTION_VIEW` ile gelen dosyaları açar. Kullanıcı WhatsApp dosyasına dokununca uygulamanın açıldığını gerçek kullanımda doğruladı; Dosyalar'dan seçme yolu da korunur.
- iPhone için ana ekrana eklenebilen PWA üretim derlemesi, sürümlü çevrimdışı önbellek ve dosya paylaşımı hazırlandı. Yerel tarayıcıda sunucu kapalıyken uygulama yeniden açıldı; sahte görev içe aktarıldı, cevap kaydedildi ve yenilemeden sonra korundu. GitHub Pages yayını ve gerçek iPhone kabul testi bekliyor.
- Yeni etkinliklerde ilk sayfanın kaynak sütunları ve hücreleri nihai Excel'in başında korunur; özgün Excel'in ek sayfaları ve görsel biçimi korunmaz. Eski etkinliklerde önceden saklanmamış kaynak hücreleri geri getirilemez.
- Geliştirici paneli JavaScript hata bilgilerini ve uygulama içindeki son işlem izlerini gösterip paylaşır. Android yerel çökme kaydı sonraki açılışta okunur; yerel bir çökme anında uygulamanın kapanmasını tamamen önlemek teknik olarak mümkün değildir.
- Android için `localapk.bat` ile yerel APK üretilebilir. Bu çıktı mevcut Android debug anahtarıyla imzalanır; mağaza yayını için ayrı imzalama gerekir.

## Henüz yapılmadı

- Orijinal Excel'in ek sayfaları ve görsel biçimi otomatik dışa aktarılmaz; ilk kaynak dosya ayrıca saklanmalıdır.
- Gönderilmiş dosyanın karşı tarafta gerçekten açıldığını doğrulayan merkezi sistem yoktur; durum koordinatör tarafından işaretlenir.
- GitHub Pages yayını, gerçek iPhone'da uçak modu/dosya akışı/WhatsApp paylaşımı ve temiz cihazda yedekten geri yükleme doğrulaması.
- Büyük veri setleri ve 100 gönüllü senaryosu için performans doğrulaması.

Bu gereksinimlerin tasarımı [plan.md](plan.md) içindedir. Kodda varmış gibi kabul etmeyin.

## Devralan kişinin ilk kontrolü

1. [Kurulum ve yayın](../gelistirme/kurulum-ve-yayin.md) adımlarını izleyin; `npm test` ve Android cihazda temel içe aktarma/anket/dışa aktarma akışını çalıştırın.
   iPhone web sürümü için [PWA yayını ve cihaz testi](../gelistirme/pwa-yayin.md) yönergesini ayrıca izleyin.
2. GitHub deposunun `main` dalını ve yerel değişiklikleri kontrol edin. `APK/` klasörü yalnızca yerel sürüm arşividir.
3. Gerçek kişi verileriyle çalışmadan önce verinin nerede tutulduğunu ve yedek durumunu [mimari ve veri](../gelistirme/mimari-ve-veri.md) dosyasından okuyun.
4. Yeni özellikte önce [plan.md](plan.md) içindeki dosya sözleşmesi ve kimlik kurallarını netleştirin; böylece farklı cihazlardan gelen sonuçlar güvenle birleştirilebilir.

## Bilinen riskler

- Yerel depolama silinirse, uygulamanın içinde kalan cevaplar kaybolabilir. Düzenli `.ays` tam yedeği alınmalıdır; farklı içerikli mevcut etkinliğin üzerine güvenli geri alma henüz yoktur.
- Depo herkese açıktır. Telefon listelerini, gönüllü dosyalarını ve paylaşılan tanılama raporlarını Git'e koymayın.
- Hata paneli tanılama içindir. Raporun içinde hata metni ve işlem izleri bulunur; paylaşan kişi içeriği kontrol etmelidir.
- `.ays` dosyası şifrelenmez ve kişi verileri içerir. SHA-256 bozulmayı saptar, dosyayı kimin oluşturduğunu kanıtlamaz. Aynı etkinliğin farklı içerikli yedeğini geri almak için güvenli değiştirme akışı henüz yoktur.
