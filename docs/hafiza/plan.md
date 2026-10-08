# Arama Yönetim Sistemi — ürün ve geliştirme planı

## Amaç ve temel kararlar

Topluluğun Excel ile yürüttüğü kişi dağıtımı, arama, geri arama ve sonuç birleştirme işlerini kolaylaştırmak. Teknik bilgi gerektiren ayarlar koordinatörde kalacak; gönüllü kendisine gelen dosyayı açıp arama yapacak ve sonucunu geri gönderecek.

- **Sunucu ve merkezi veritabanı yok.** Uygulama cihazda çalışır; görev ve sonuçlar taşınabilir dosyalarla aktarılır.
- **Bir etkinliğin dağıtımını tek koordinatör yönetir.** Birbirinden habersiz iki cihazın aynı ana Excel'den görev üretmesi çevrimdışı ortamda çakışmasız garanti edilemez.
- Android kullanıcıları APK'yı kullanır. iPhone kullanıcıları için aynı veri paketlerini açabilen, ana ekrana eklenebilir statik web uygulaması (PWA) hazırlanır.
- İlk yüklenen Excel değiştirilmeden saklanır. Uygulamadaki etkinlik kaydı çalışma kopyasıdır; dışarı alınabilen yedeği bulunur. Cihaz içindeki kayıt tek kopya olamaz.
- Gönüllülere yalnızca atanmış kişiler gönderilir. Statik site sadece uygulama kodunu barındırır; kişi listeleri siteye yüklenmez.

## Roller ve basit kullanım akışı

### Koordinatör

1. **Etkinlik oluştur:** Ana Excel'i veya metin listesini içe aktar. İlk Excel'i ayrıca sakla.
2. **Kaynağı kontrol et:** Varsayılan metin biçimi satır başına `İsim Soyisim [TAB] Telefon` olsun. Farklı dosyada sütun eşleştirmeyi önizlemede yap. Telefon, okul numarası ve diğer sayısal kimlikleri ayrı alanlar olarak belirle; ilk görülen sayıyı otomatik olarak telefon sayma.
3. **Tekrarları incele:** Telefonları ortak biçime dönüştür. Aynı isimli farklı kişileri kabul et. Aynı telefonun birden fazla satırda bulunmasını inceleme listesine al; farklı isimler varsa satırları kendiliğinden birleştirme veya silme.
4. **Formu hazırla:** Soruları, şıkları, alan türlerini ve zorunlu alanları belirle. Arama durumu (`Aranmadı`, `Ulaşılamadı`, `Sonra ara`, `Görüşüldü`, `Yanlış numara`) anket cevaplarından ayrı tutulsun.
5. **Görevleri dağıt:** Atanmamış havuzdan kişiye özel sayılar seç; örneğin A'ya 10, B'ye 50, C'ye 17. Paket oluşturulunca kişiler ayrılmış sayılır. Gönderilmeyen paket iptal edilip havuza geri alınabilir. Gönderilmiş paket yeniden atanacaksa eski kopyanın hâlâ kullanılabileceği açıkça uyarılır.
6. **Sonuçları topla:** Gelen dosyaları topluca seç, önizlemeyi ve çakışmaları incele, yedek alıp birleştir.
7. **Geri arama turu aç:** `Sonra ara` kuyruğundan yeni görev oluştur. İlk görev kapanmadan aynı kişiyi yeni tura vermek varsayılan olarak engellensin.
8. **Nihai Excel'i ve etkinlik yedeğini dışarı al.**

### Gönüllü

1. WhatsApp veya Dosyalar üzerinden görev paketini uygulamada açar; etkinlik, form, bütün soru ve şıklar, kendi kişileri ve varsa önceki geri arama notları otomatik kaydedilir.
2. Formu veya içe aktarma biçimini ayarlamaz. Aynı paketi tekrar açması ikinci bir proje oluşturmaz; kaldığı yerden devam eder.
3. Çevrimdışı arar ve cevapları kaydeder. Arama sonucu ile soruların cevapları ayrı tutulur; `Sonra ara` için istenirse tarih ve kısa not girer.
4. İş bitince veya ara verirken sonuç paketini paylaşır. Kısmi sonuç gönderdikten sonra çalışmaya devam edebilir.

## Paylaşılabilir form ve dosya biçimi

- Varsayılan kaynak biçimi `İsim Soyisim [TAB] Telefon` olur. Koordinatör farklı metin/Excel düzenleri için örnek satırlar üzerinde sütun eşleştirmesini kaydedebilir.
- Form şablonu alan kimliklerini, görünen adları, türleri, şıkları, sıralamayı ve kaynak eşleştirmesini taşır. Koordinatör şablonu başka etkinlik koordinatörleriyle ayrıca paylaşabilir; içe aktarılan şablon kaydedilir. **Gönüllü için ayrı şablon dosyası gerekmez:** görev paketinin içinde formun tamamı vardır.
- İlk görev gönderildiğinde etkinliğin form sürümü sabitlenir. Daha sonra değişiklik gerekiyorsa yeni sürüm oluşturulur; eski sonuçların hangi sürüme ait olduğu korunur ve uyumsuz dosyalar sessizce birleştirilmez.
- Görev, sonuç ve yedek için sürümlü, uygulamanın okuyabildiği taşınabilir bir dosya biçimi kullanılır (örneğin `.ays`; iç yapısı belgelenmiş JSON/ZIP). İnsanların okuyacağı kaynak ve son çıktı Excel olarak kalır. Bu dosya biçimi Android ile iPhone web uygulamasında aynı olmalıdır.
- Görev paketi **yalnızca atanmış kayıtları** ve gerekli formu içerir. Sonuç paketi ilgili görevin cevaplarını ve arama geçmişini içerir; ana listenin tamamını taşımaz.

## Kimlikler, dağıtım ve tekrar kontrolü

Her etkinliğe `eventId`, her ana liste satırına kalıcı `recordId`, her görev paketine `assignmentId` ve her geri arama turuna sıra numarası verilir. Telefon, aynı etkinlikte tekrarları bulmak ve yanlış dağıtımı önlemek için normalleştirilir; **birleştirmenin asıl anahtarı isim veya telefon değil `recordId` olur.** Telefon değişse de kayıt kimliği kalır.

İlk dağıtım yalnızca atanmamış havuzdan yapılır. 2.000 benzersiz kayıtlı örnekte 10 + 50 + 17 kişi ayrıldıktan sonra ilk tur için 1.923 kişi kalır. Aynı telefon ilk turda başka etkin göreve verilmez. Geri aramada aynı `recordId` yeni `assignmentId` ve yeni turla bilinçli olarak tekrar verilir; eski cevap silinmez. Farklı etkinlikler birbirinin kişi havuzunu etkilemez.

Paketler için `Hazırlandı`, `Gönderildi`, `Kısmi sonuç`, `Sonuçlandı`, `İptal edildi` durumları izlenir. Kaybolan dosya aynı görev kimliğiyle yeniden gönderilir. Sonucu dönmeyen görevdeki kişiler kendiliğinden atanmamış havuza düşmez.

## Sonuçların birleştirilmesi

Koordinatör bir veya çok sonuç dosyası seçer. Uygulama önce etkinlik, form sürümü, görev kimliği, tur, kayıt kimlikleri ve gönderim sürümünü doğrular. Bilinmeyen kayıtlar, değiştirilmiş telefonlar ve çakışan cevaplar önizlemede görünür. Onaydan önce etkinliğin yedeği oluşturulur; birleştirme bütün olarak uygulanır veya hiç uygulanmaz.

- Aynı sonuç dosyası iki kez alınırsa ikinci içe aktarma atlanır.
- Gönüllünün her dışa aktarımı aynı görevin artan bir **gönderim sürümünü** taşır. Kısmi sonuç sürüm 1, tamamlanmış sonuç sürüm 2 ise daha yeni tam görüntü geçerlidir; dosyaların geliş sırası veya cihaz saati karar vermez.
- Her arama denemesinin ayrı kimliği vardır. Önceki denemeler ve cevaplar geçmişte saklanır. Aynı kayıt için aynı turda iki bağımsız ve çelişen cevap varsa biri rastgele seçilmez; koordinatör karar verir.
- `Son arama sonucu` ile `son alınan anlamlı cevap` ayrı tutulur. Örneğin ilk tur `Belki`, ikinci tur `Ulaşılamadı` ise `Belki` bilgisi kaybolmaz.
- İlk Excel'in satır ve sütunları korunarak güncel durum eklenir. Nihai çalışma kitabında **Güncel Durum**, **Arama Geçmişi** ve varsa **İncelenecek Çakışmalar** sayfaları bulunur. Telefon ve okul numarası metin olarak yazılır; baştaki sıfırlar korunur.

## Veri kaybını önleme ve devir

**Hiçbir cihazın uygulama içi depolaması tek gerçek kopya olmayacak.** Orijinal Excel, son etkinlik yedeği ve gelen sonuç dosyaları ayrı saklanır. Paket dağıtımı veya sonuç birleştirmesi gibi önemli işlemlerden sonra uygulama yeni yedek üretir. Geri yükleme ekranı bir yedeğin etkinlik kimliğini, sürümünü ve içeriğini önce gösterir; mevcut veriyi habersizce ezmez.

iPhone PWA'da tarayıcı depolaması silinebilir veya cihaz değişebilir. Bu nedenle sonuçları dışa aktarma/yedekleme akışı zorunlu kullanımın parçası olmalı; yalnızca tarayıcı içinde duran gönderilmemiş cevaplar güvenli kabul edilmemeli. İmkân varsa kalıcı depolama istenir, fakat **dosya yedeğinin yerine geçmez**. Statik siteye kullanıcı verisi yüklenmez. Gönüllülere yalnızca kendi paketleri verilir.

Proje topluluktan bir başkasına devredilebilmeli: kaynak kodu, statik site hesabı, APK üretimi, dosya biçimi, son etkinlik yedeği ve kısa kullanım yönergesi topluluk kontrolünde tutulur. Kişisel hesaba veya tek telefona bağımlı bir düzen kurulmaz.

## Platform planı

- **Android:** Mevcut APK korunur; görev/sonuç/yedek dosyalarını içe aktarma, paylaşma ve geri yükleme eklenir.
- **iPhone:** Mevcut web sürümü, HTTPS üzerinde sunulan ve ana ekrana eklenebilen PWA'ya dönüştürülür. Uygulama kodu ücretsiz statik barındırmada durabilir; kişi verisi barındırmaya gönderilmez.
- PWA için çevrimdışı önbellek ve güvenli güncelleme akışı, gerçek iPhone'da telefon bağlantısı, Dosyalar/WhatsApp içe aktarma, dışa aktarma, uçak modu, uzun süreli kullanım ve yedekten geri dönüş test edilir. Ana ekrana eklemek tek başına çevrimdışı çalışma garantisi sayılmaz.

## Geliştirme sırası

**Durum (8 Ekim 2026):** Yedek `.ays` sürüm 4'e çıktı; sürüm 1–3 okunur. Kaynak/form akışı, tekrar incelemesi, `.ayst` şablonu ve çakışmasız görev dağıtımı çalışıyor. 4. adımda kısmi/tam sonuç paketi, toplu dosya seçimi, çakışma kararı, sürümlü birleştirme, arama geçmişi, geri arama turu ve çok sayfalı Excel eklendi. Android'de WhatsApp dosyasına dokunarak açma gerçek kullanımda doğrulandı. 5. adımın PWA derlemesi ve yerel çevrimdışı akışı hazır; [GitHub Pages yayını](https://ardagunal.github.io/Arama-Yonetim-Sistemi/) açıldı ve canlı ana ekran yüklendi. Gerçek iPhone testi bekliyor. Mevcut etkinliğin farklı yedeğiyle güvenli değiştirilmesi de ayrı bir iş olarak duruyor. Dosya ayrıntıları [sözleşmede](../gelistirme/dosya-sozlesmesi.md).

1. **Dosya sözleşmesi ve güvenlik temeli:** Sürümlü paket/yedek biçimi, kimlikler, bütünlük kontrolü, tekrar içe aktarmaya dayanıklılık, geri yükleme.
2. **Koordinatör akışı:** Kaynak önizleme ve eşleştirme, telefon tekrar incelemesi, form/şık düzenleme, şablon paylaşımı ve sürüm kilidi.
3. **Görev akışı:** İstenen sayıda çakışmasız dağıtım, paket durumları, Android ve web üzerinde tek adımlı gönüllü içe aktarımı.
4. **Sonuç ve geri arama:** Kısmi/tam sonuç paketleri, toplu birleştirme önizlemesi, çakışma çözümü, arama geçmişi, geri arama kuyruğu, nihai Excel.
5. **iPhone PWA ve devir:** Çevrimdışı çalışma, iPhone dosya akışı, yedek/geri yükleme, statik yayınlama ve topluluk için kısa kullanım yönergesi.

## Tamamlanma ölçütleri

- 2.000 kayıttan A'ya 10, B'ye 50, C'ye 17 kişi verildiğinde ilk tur görevleri kesişmez; atanmamış sayı doğru kalır.
- Aynı isim kabul edilir; aynı telefonun farklı satırlarda bulunması dağıtımdan önce incelemeye düşer.
- Aynı görev veya sonuç dosyası tekrar içe aktarılınca kişi ve cevap sayısı artmaz. Kısmi ve tam sonuçlar ters sırada gelse de son durum doğru kalır.
- `Sonra ara` ikinci turu önceki cevabı korur. Çelişkiler görünür ve çözümlenmeden nihai sonuç olarak sessizce seçilmez.
- Yanlış etkinlik veya uyumsuz form sürümü otomatik birleştirilmez; birleştirme önizlemesi ve geri dönüş yedeği vardır.
- Android APK ve gerçek iPhone PWA aynı görev dosyasını açar; iPhone uçak modunda çalışır ve veri silinmiş bir cihaz yedekten geri yüklenebilir.
- 5.000 kişi ve 100 görev paketiyle içe aktarma, dağıtım ve birleştirme performansı gerçek cihazlarda ölçülür.
