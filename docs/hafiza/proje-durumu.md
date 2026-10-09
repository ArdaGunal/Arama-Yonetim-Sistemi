# Proje durumu ve devir notu

Son gözden geçirme: 10 Ekim 2026. Kaynak kodun bulunduğu dizin artık `Arama_Yonetim_Sistemi`; eski GitHub sürümünde proje `Arama Yönetim Sistemi/` altındaydı. Yeni düzenin giriş noktası depo kökündeki `package.json` dosyasıdır. Kodda sabit yerel proje yolu kullanılmamalıdır.

## Mevcut uygulama

- Expo SDK 54, React Native 0.81, React 19. Android ve web hedefleri vardır. iOS için Expo yapılandırması bulunur; gerçek iPhone dağıtım akışı henüz hazırlanmadı.
- Yeni projede metin veya Excel/CSV/TSV ilk sayfası üç adımda içe alınır: kaynak sütunları önizlenip eşleştirilir, aynı telefonlu satırlardan biri açıkça seçilir, sorular/şıklar düzenlenir. Geçersiz ve seçilmeyen satırlar inceleme kaydında kalır.
- Formda sorular zorunlu yapılabilir; görüşülen kişinin zorunlu cevabı boşsa kayıt tamamlanmaz. İlk görevden veya tamamlanan aramadan sonra düzenleme yeni form sürümü açar. Eski görevler ve cevaplar kendi sürümünde kalır. `.ayst` şablon dosyası kaynak sütun görevleri ve zorunlu alanlarla paylaşılır.
- Projeler ve kişi cevapları AsyncStorage'da cihaz üzerinde saklanır. Anket ekranı değişiklikleri taslağa ve proje kaydına yazar.
- Sonuçlar `.ays` paketleriyle kısmi veya tam paylaşılır. Daha yeni gönderim sürümü öncekinin yerine işlenir; çakışmalar koordinatöre gösterilir. Excel/CSV ayrıca insan tarafından okunabilen çıktı olarak alınabilir.
- Gönüllü yeni cevap kaydettiğinde ana ekranda sonuç dosyası hatırlatması görünür. İptal edilen web paylaşımı hatırlatmayı kapatmaz; dosya hazırlanırken yeni cevap gelirse eski sürüm hatırlatmayı kapatamaz. Paylaşım menüsünün kapanması dosyanın koordinatöre ulaştığını kanıtlamaz.
- Her proje `.ays` sürüm 5 tam yedeği olarak dışa aktarılabilir; sürüm 1–4 de okunur. Form sürümleri, görevler, arama geçmişi ve birleştirme kararları yedeğe girer. Dosya SHA-256 ile doğrulanır; aynı içerik ikinci kez içe alınmaz ve farklı içerikli etkinlik otomatik ezilmez.
- Görev hazırlanması/gönderilmesi/iptali ve sonuç birleştirmesi sonrasında güncel yedek dosyası oluşturulur. Android'de kullanıcı bir kez yedek klasörü seçer; web dosyayı indirir; iPhone paylaşım menüsünden Dosyalara Kaydet gerekir. Kaydetme başarısızsa ekranda tekrar deneme yolu gösterilir. Birleştirmeden önce dış yedek almak zorunlu kalır.
- Farklı içerikli aynı etkinlik yedeği, önce mevcut sürüm dışarı kaydedilip açık onay verildikten sonra geri yüklenebilir. İşlem öncesi sürüm yeniden karşılaştırılır; kesintide eski proje, kişiler ve taslak kurtarılır. Bu işlem gelen sonuçları birleştirme yerine kullanılmamalıdır.
- Koordinatör kişi sayısıyla ilk tur görevi ayırır; paket yalnızca ayrılmış kişileri ve formu taşır. Hazırlandı/gönderildi/iptal durumları izlenir. Gönüllü Android veya web uygulamasında dosyayı seçince sorular ve kendi kişileri açılır. Aynı dosyanın yeniden açılması cevapları sıfırlamaz.
- `Sonra ara` cevaplarından yeni tur görevi oluşturulur. Önceki arama denemeleri ve anlamlı cevaplar saklanır. Nihai Excel'de Güncel Durum, Arama Geçmişi ve varsa İncelenecek Çakışmalar sayfaları vardır.
- Android uygulaması `ACTION_VIEW` ile gelen dosyaları açar. Kullanıcı WhatsApp dosyasına dokununca uygulamanın açıldığını gerçek kullanımda doğruladı; Dosyalar'dan seçme yolu da korunur.
- iPhone için ana ekrana eklenebilen PWA üretim derlemesi, sürümlü çevrimdışı önbellek ve dosya paylaşımı hazırlandı. Yerel tarayıcıda sunucu kapalıyken uygulama yeniden açıldı; sahte görev içe aktarıldı, cevap kaydedildi ve yenilemeden sonra korundu. [GitHub Pages yayını](https://ardagunal.github.io/Arama-Yonetim-Sistemi/) 8 Ekim 2026'da açıldı; yayın iş akışı başarılı ve canlı ana ekran, manifest, servis işçisi ile simge HTTP 200 döndü. Gerçek iPhone kabul testi bekliyor.
- Web yedek ekranında tarayıcının kalıcı depolama izni durumu gösterilir ve destekleniyorsa kullanıcı düğmeyle ek koruma isteyebilir. Tarayıcı izin vermeyebilir; bu özellik `.ays` dış yedeğinin yerini tutmaz.
- Yeni etkinliklerde ilk sayfanın kaynak sütunları ve hücreleri nihai Excel'in başında korunur; özgün Excel'in ek sayfaları ve görsel biçimi korunmaz. Eski etkinliklerde önceden saklanmamış kaynak hücreleri geri getirilemez.
- Geliştirici paneli JavaScript hata bilgilerini ve uygulama içindeki son işlem izlerini gösterip paylaşır. Android yerel çökme kaydı sonraki açılışta okunur; yerel bir çökme anında uygulamanın kapanmasını tamamen önlemek teknik olarak mümkün değildir.
- Android için `localapk.bat` ile yerel APK üretilebilir. Bu çıktı mevcut Android debug anahtarıyla imzalanır; mağaza yayını için ayrı imzalama gerekir.
- 5.000 kişi/100 görev/100 sonuç için [sentetik ölçüm komutu](../gelistirme/buyuk-veri-performansi.md) vardır. Geri arama adayları görevleri bir kez dizinler; görev ekranı bitenleri gizler ve uzun listeyi 20'şer gösterir. Yerel web önizlemesinde büyük yedek açıldı. Android telefon üzerinde gerçek süreler henüz ölçülmedi.

## Henüz yapılmadı

- Orijinal Excel'in ek sayfaları ve görsel biçimi otomatik dışa aktarılmaz; ilk kaynak dosya ayrıca saklanmalıdır.
- Gönderilmiş dosyanın karşı tarafta gerçekten açıldığını doğrulayan merkezi sistem yoktur; durum koordinatör tarafından işaretlenir.
- Gerçek iPhone'da uçak modu/dosya akışı/WhatsApp paylaşımı ve temiz cihazda yedekten geri yükleme doğrulaması (kullanıcı uygun cihaz bulana kadar ertelendi).
- Büyük veri setleri ve 100 gönüllü senaryosu için gerçek Android telefon performans doğrulaması.

Bu gereksinimlerin tasarımı [plan.md](plan.md) içindedir. Kodda varmış gibi kabul etmeyin.

## Devralan kişinin ilk kontrolü

1. [Kurulum ve yayın](../gelistirme/kurulum-ve-yayin.md) adımlarını izleyin; `npm test` ve Android cihazda temel içe aktarma/anket/dışa aktarma akışını çalıştırın.
   iPhone web sürümü için [PWA yayını ve cihaz testi](../gelistirme/pwa-yayin.md) yönergesini ayrıca izleyin.
2. GitHub deposunun `main` dalını ve yerel değişiklikleri kontrol edin. `APK/` klasörü yalnızca yerel sürüm arşividir.
3. Gerçek kişi verileriyle çalışmadan önce verinin nerede tutulduğunu ve yedek durumunu [mimari ve veri](../gelistirme/mimari-ve-veri.md) dosyasından okuyun.
4. Yeni özellikte önce [plan.md](plan.md) içindeki dosya sözleşmesi ve kimlik kurallarını netleştirin; böylece farklı cihazlardan gelen sonuçlar güvenle birleştirilebilir.

## Bilinen riskler

- Yerel depolama silinirse, uygulamanın içinde kalan cevaplar kaybolabilir. Düzenli `.ays` tam yedeği alınmalıdır. Eski yedeği geri yükleme yeni cevapları silebilir; önce mevcut sürümün dışarı kaydedildiğini kontrol edin.
- Depo herkese açıktır. Telefon listelerini, gönüllü dosyalarını ve paylaşılan tanılama raporlarını Git'e koymayın.
- Hata paneli tanılama içindir. Raporun içinde hata metni ve işlem izleri bulunur; paylaşan kişi içeriği kontrol etmelidir.
- `.ays` dosyası şifrelenmez ve kişi verileri içerir. SHA-256 bozulmayı saptar, dosyayı kimin oluşturduğunu kanıtlamaz. iPhone paylaşım menüsünün kapanması dosyanın gerçekten Dosyalar'a kaydedildiğini doğrulamaz; kullanıcı dosyayı kontrol etmelidir.
