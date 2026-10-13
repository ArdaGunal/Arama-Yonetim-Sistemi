# Proje durumu ve devir notu

Son gözden geçirme: 14 Ekim 2026. Kaynak kodun bulunduğu dizin `Arama_Yonetim_Sistemi`; giriş noktası depo kökündeki `package.json` dosyasıdır. Kodda sabit yerel proje yolu kullanılmamalıdır.

## Mevcut uygulama

- Expo SDK 54, React Native 0.81, React 19. Android ve web hedefleri vardır. iOS için Expo yapılandırması bulunur; gerçek iPhone dağıtım akışı henüz hazırlanmadı.
- Yeni proje iki adımda oluşturulur: listeyi ekle, ardından kişileri kontrol edip etkinliği oluştur. Soru düzenleme alanları alt alta ve doğrudan görünür; sütun düzeltme ayrı bir ekrandadır. Şıklı soruya geçince iki boş şık açılır. Üstteki anket önizlemesi gerçek kayıt yapmayan ayrı bir penceredir ve kapanınca deneme cevapları silinir. Aynı telefon tekrar ederse ilk satır varsayılan seçilir, kullanıcı bunu değiştirebilir. Geçersiz ve seçilmeyen satırlar inceleme kaydında kalır. Oluşturma başarısızsa neden kaydet düğmesinin üstünde gösterilir.
- Formda sorular zorunlu yapılabilir; görüşülen kişinin zorunlu cevabı boşsa kayıt tamamlanmaz. İlk görevden veya tamamlanan aramadan sonra düzenleme yeni form sürümü açar. Eski görevler ve cevaplar kendi sürümünde kalır. `.ayst` şablon dosyası kaynak sütun görevleri ve zorunlu alanlarla paylaşılır.
- Projeler ve kişi cevapları AsyncStorage'da cihaz üzerinde saklanır. Anket ekranı değişiklikleri taslağa ve proje kaydına yazar.
- Sonuçlar `.ays` paketleriyle kısmi veya tam paylaşılır. Aynı cihazın daha yeni gönderim sürümü öncekinin yerine işlenir; farklı cihaz, iptal veya devir çakışmaları koordinatöre gösterilir. Gelen dosyalar önce kalıcı kutuya alınır. Excel/CSV ayrıca insan tarafından okunabilen çıktı olarak alınabilir.
- Gönüllü yeni cevap kaydettiğinde ana ekranda sonuç dosyası hatırlatması görünür. İptal edilen web paylaşımı hatırlatmayı kapatmaz; dosya hazırlanırken yeni cevap gelirse eski sürüm hatırlatmayı kapatamaz. Paylaşım menüsünün kapanması dosyanın koordinatöre ulaştığını kanıtlamaz.
- Her proje `.ays` sürüm 6 tam yedeği olarak dışa aktarılabilir; sürüm 1–5 de okunur. Form sürümleri, görevler, arama geçmişi ve birleştirme kararları yedeğe girer. Dosya SHA-256 ile doğrulanır; aynı içerik ikinci kez içe alınmaz ve farklı içerikli etkinlik otomatik ezilmez.
- Görev hazırlanması/gönderilmesi/iptali ve sonuç birleştirmesi sonrasında güncel yedek dosyası oluşturulur. Android'de kullanıcı bir kez yedek klasörü seçer; web dosyayı indirir; iPhone paylaşım menüsünden Dosyalara Kaydet gerekir. Kaydetme başarısızsa ekranda tekrar deneme yolu gösterilir. Birleştirmeden önce dış yedek almak zorunlu kalır.
- Farklı içerikli aynı etkinlik yedeği, önce mevcut sürüm dışarı kaydedilip açık onay verildikten sonra geri yüklenebilir. İşlem öncesi sürüm yeniden karşılaştırılır; kesintide eski proje, kişiler ve taslak kurtarılır. Bu işlem gelen sonuçları birleştirme yerine kullanılmamalıdır.
- Ana ekrandan proje silme önce dışarı `.ays` yedeği kaydeder, dosyanın kontrol edildiğini ayrıca sorar. Yedekten sonra proje veya taslak değişmişse silme durdurulur. Yedek kaydetme iptal edilirse proje yerinde kalır.
- Koordinatör kişi sayısıyla ilk tur görevi ayırır; paket yalnızca ayrılmış kişileri ve formu taşır. Hazırlandı/gönderildi/iptal durumları izlenir. Gönüllü Android veya web uygulamasında dosyayı seçince sorular ve kendi kişileri açılır. Aynı dosyanın yeniden açılması cevapları sıfırlamaz.
- `Sonra ara` cevaplarından yeni tur görevi oluşturulur. Önceki arama denemeleri ve anlamlı cevaplar saklanır. Nihai Excel'de Güncel Durum, Arama Geçmişi ve varsa İncelenecek Çakışmalar sayfaları vardır.
- İptal edilmiş görevlerin yapılmayan kişileri havuza döner. Kısmi görevde yalnızca yapılmayan kişiler devredilir; eski dosya geç sonuç getirirse karar istenir. Koordinatör kendi adına görev ayırıp cevapları doğrudan ana etkinliğe kaydedebilir. Emülatörde sentetik kişiyle bu akış ve otomatik yedek doğrulandı.
- Android'de WhatsApp'tan açılan sonuç dosyası ve web'de seçilen sonuç dosyası kalıcı gelen kutusuna kaydedilir. Aynı dosyanın yeniden açılması ikinci kayıt oluşturmaz. Sonuç paketi sürüm 2 cihaz kimliği taşır; eski sürüm 1 sonuçlar okunur. Başka cihazdan gelen yüksek sürüm tek başına güncel cevabı değiştirmez. `Mevcut kalsın` kararında yeni arama denemeleri korunur.
- Android uygulaması `ACTION_VIEW` ile gelen dosyaları açar. Kullanıcı WhatsApp dosyasına dokununca uygulamanın açıldığını gerçek kullanımda doğruladı; Dosyalar'dan seçme yolu da korunur.
- iPhone için ana ekrana eklenebilen PWA üretim derlemesi, sürümlü çevrimdışı önbellek ve dosya paylaşımı hazırlandı. Yerel tarayıcıda sunucu kapalıyken uygulama yeniden açıldı; sahte görev içe aktarıldı, cevap kaydedildi ve yenilemeden sonra korundu. [GitHub Pages yayını](https://ardagunal.github.io/Arama-Yonetim-Sistemi/) 8 Ekim 2026'da açıldı; yayın iş akışı başarılı ve canlı ana ekran, manifest, servis işçisi ile simge HTTP 200 döndü. Gerçek iPhone kabul testi bekliyor.
- Web yedek ekranında tarayıcının kalıcı depolama izni durumu gösterilir ve destekleniyorsa kullanıcı düğmeyle ek koruma isteyebilir. Tarayıcı izin vermeyebilir; bu özellik `.ays` dış yedeğinin yerini tutmaz.
- Yeni içe alınan `.xlsx` ve `.xlsm` dosyalarının orijinal baytları saklanır; nihai Excel'e sonuç sayfaları eklenirken kaynak sayfalar, formüller ve stil parçaları yeniden yazılmaz. Orijinal dosya ayrıca aynen dışa verilebilir ve `.ays` tam yedeğinde taşınır. `.xls` dosyası aynen saklanır fakat nihai sonuç ayrı `.xlsx` olur. Excel eki üst sınırı 8 MB'dir. Eski etkinliklerin daha önce saklanmamış kaynak dosyası geri getirilemez.
- Geliştirici paneli JavaScript hata bilgilerini ve uygulama içindeki son işlem izlerini gösterip paylaşır. Android yerel çökme kaydı sonraki açılışta okunur; yerel bir çökme anında uygulamanın kapanmasını tamamen önlemek teknik olarak mümkün değildir.
- Android için `localapk.bat` ile yerel APK üretilebilir. Sürüm 1.0.14/b15 emülatöre güncelleme olarak kuruldu; mevcut sentetik projeler korundu, görev ekranındaki dört sayaç görüldü ve gelen kutusu kısayolu açıldı. Önceki 1.0.13/b14 Android emülatöründe koordinatörün kendi görevi, sonuç dosyasının Android `ACTION_VIEW` ile gelen kutusuna alınması, yeniden açılışta korunması ve yinelenen dosyanın tek kayıt kalması sentetik verilerle denendi. Web gelen kutusunun IndexedDB kalıcılığı otomatik testte doğrulandı. Çıktı mevcut Android debug anahtarıyla imzalanır; mağaza yayını için ayrı imzalama gerekir.
- Ana ekranın sağ üstünde Ayarlar bulunur; yedek ve tanılama bağlantıları buraya taşındı. Yeni etkinliklerde varsayılan yapıştırma düzeni ve ek sorular otomatik açılır. `.ayst` sürüm 2 bu düzeni paylaşır; eski sürüm 1 okunur. Kapsam ve sınırlar [ayarlar belgesinde](../gelistirme/ayarlar-ve-varsayilan-format.md) açıklanır.
- 1.0.15/b16 Android emülatörüne mevcut projeleri koruyarak kuruldu. Ayarlar açıldı; liste biçimi değiştirilip uygulama yeniden açılınca korundu ve yeni etkinlik girişinde uygulandı. Seçim başlangıç değerine geri alındı. Soru düzenleyicisinde şıklı sorunun iki şıkla açılması, yedek ve tanılama bağlantıları kontrol edildi. 5.000 kişi/100 görev/100 sonuç ölçümü ile 44 otomatik test geçti.
- 5.000 kişi/100 görev/100 sonuç için [sentetik ölçüm komutu](../gelistirme/buyuk-veri-performansi.md) vardır. Geri arama adayları görevleri bir kez dizinler; görev ekranı bitenleri gizler ve uzun listeyi 20'şer gösterir. Yerel web önizlemesinde büyük yedek açıldı. Android telefon üzerinde gerçek süreler henüz ölçülmedi.

## Henüz yapılmadı

- Gerçek Excel/LibreOffice ve Android cihazda farklı biçim, makro ve büyük dosya örnekleriyle kaynak biçimi doğrulaması yapılmadı. Standart dışı OOXML dosyaları sonuç sayfası eklemeyi reddedebilir; orijinal dosya her durumda ayrı saklanmalıdır.
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
- Android 37 önizleme emülatöründe ADB ile art arda çok hızlı durdurma/açma sırasında React Native yaşam döngüsü kaynaklı tek bir yerel çökme görüldü (`Pausing an activity that is not the current activity`). Normal aralıklı açılışta tekrar etmedi. Gerçek cihazda aynı durum görülürse geliştirici panelindeki raporla ayrıca incelenmelidir.
