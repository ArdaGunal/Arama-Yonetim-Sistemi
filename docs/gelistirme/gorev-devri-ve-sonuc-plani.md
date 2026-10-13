# Görev devri, koordinatörün araması ve sonuç alma planı

Durum: 13 Ekim 2026. Bu belge hedef davranışı tanımlar; aşağıdaki yeni kurallar henüz uygulama koduna eklenmemiştir.

## Değişmeyen ilkeler

- Her etkinliğin yazılabilir tek bir ana kaydı ve tek koordinatörü olur. Orijinal Excel ile son etkinlik yedeği ayrıca saklanır. Görev dosyası, ana kayıt yerine geçmez.
- Kişinin kalıcı anahtarı `recordId`, etkinliğin anahtarı `eventId` olur. İsim eşleştirme anahtarı değildir. Telefon normalleştirilerek aynı numaraya eşzamanlı görev verilmesi önlenir.
- Görev iptali veya devri ana listeden kişi ya da arama geçmişi silmez. Yeni görev aynı `recordId` için yeni bir `assignmentId` üretir. Eski görev geçmişte kalır.
- Bir kişi için aynı anda yalnızca bir **etkin çalışma sahibi** bulunur: gönüllü veya koordinatör. Yeni tur / geri arama, önceki turdaki kişi bazlı çalışma kapandığında açılır.
- Sunucusuz ve çevrimdışı sistem, gönderilmiş dosyanın diğer cihazdaki kopyasını geri alamaz. Çift aramayı azaltır ve sonuçları güvenle uzlaştırır; fiziksel olarak hiç çift arama yapılmayacağını garanti edemez.

## Mevcut davranış ve giderilecek boşluklar

Bugün iptal edilen ilk tur görevi, atanmamış ve tamamlanmamış kişileri yeniden `getAvailableContacts` havuzuna bırakır. Ancak kullanıcıya ayrı bir iade kuyruğu gösterilmez; sonraki göreve özellikle bu kişilerin seçilmesi garanti edilmez. `partial` görev iptal edilemez. İptal edilen görevden gelen sonuç dosyası reddedilir. Görev atandıktan sonra koordinatörün anket ekranında atanmış kişiyi kendisinin aramasını engelleyen sahiplik kontrolü yoktur. Koordinatör kartı, görevler varsa anket yerine dağıtım ekranına gider. Aynı görev iki cihazda çözüldüğünde sürüm numarası cihazları ayırt etmez.

## Kişi bazında durum

Ana kayıtta her kayıt ve tur için `ownerAssignmentId`, `ownerType` (`volunteer` veya `coordinator`), `generation` ve çalışma durumu tutulur. Görev içindeki her kişi için ayrı durum geçmişi saklanır. Eski yedek ve görevler açılırken bu bilgiler mevcut görevlerden türetilir; eski `.ays` dosyaları okunmaya devam eder.

Kullanıcıya dört basit kuyruk gösterilir:

1. **Dağıtılacak:** Daha önce atanmamış kişiler.
2. **Yarım kalanlar:** İptal veya devir nedeniyle geri gelen, henüz sonuçlandırılmamış kişiler. Yeni görev hazırlanırken varsayılan olarak bu kuyruk önce seçilir.
3. **Tekrar aranacak:** `Sonra ara` veya `Ulaşılamadı` sonucu için koordinatörün yeniden aramaya karar verdiği kişiler. `Yanlış numara` burada otomatik bulunmaz; önce numara düzeltilir.
4. **İncelenecek:** Eski görevden geç sonuç, farklı cevap, değişmiş telefon veya aynı görevin iki cihazda çözülmesi gibi durumlar.

`Aranmadı` ile `Ulaşılamadı` aynı şey değildir. İkincisinde yapılmış arama denemesi korunur. `Görüşüldü` ve kesin cevaplar sıradan bir iptal yüzünden yeniden dağıtılmaz.

## İptal ve devir kuralları

| Durum | Ana kayıtta yapılacak işlem |
| --- | --- |
| Hazırlanmış, gönderilmemiş görev iptal edildi | Görev geçmişte `iptal` olur. Sonuçlanmamış kişilerin sahipliği kaldırılır ve **Yarım kalanlar** kuyruğuna konur. |
| Gönderilmiş, hiç sonuç alınmamış görev iptal edildi | Ana kayıtta sonuçlanmamış kişiler aynı kuyruğa döner. Eski dosyanın gönüllüde kalabileceği açıkça gösterilir; eski gönüllüye durdurma mesajı paylaşılabilir. |
| Kısmi görevden kalanlar devredildi | Ana kayda alınmış cevaplar ve denemeler korunur. Sadece seçilen sonuçlanmamış kişiler yeni göreve geçer. Eski görevin kişi bazlı sahipliği kapanır; tüm görev silinmez. |
| İptal sırasında sonuç dosyası henüz gelmemişti | Daha sonra gelen dosya kalıcı gelen kutusunda tutulur; geçerli cevabı otomatik değiştirmez. Arama geçmişi ve cevaplar koordinatöre karşılaştırmalı gösterilir. |
| Gönüllü görevi bitirmedi ama `Ulaşılamadı` kaydetti | Arama denemesi korunur. Koordinatör bu kişiyi bilinçli olarak **Tekrar aranacak** kuyruğuna alabilir. |

**İptal ve yeniden ata** tek işlem olarak yapılabilir: koordinatör yeni gönüllüyü seçer; uygulama uygun kişileri önce eski görevden çıkarır, sonra yeni görev için ayırır, ardından yedek üretir. Yeni gönüllü henüz belli değilse kişiler **Yarım kalanlar** kuyruğunda bekler. Görev iptal edilmesi hiçbir kaydın görünmez olmasına yol açmaz. Havuzların toplamı, incelenecek istisnalar hariç ana listedeki kişi sayısıyla tutarlı olmalıdır.

Gönderilmiş görevde eski gönüllüyü bilgilendirmek önemlidir. Uygulama WhatsApp için kısa bir “Bu kişiler artık başka görevde, aramayı durdurun” mesajı hazırlayabilir. Mesajın gerçekten okunduğunu çevrimdışı uygulama doğrulayamaz; gerektiğinde koordinatör risk uyarısıyla devri tamamlar.

## Koordinatör de arama yapar

Dağıtım ekranında **Kendime görev al** seçeneği olur. Koordinatör kişi sayısını seçer; sistem gönüllülere uyguladığı aynı rezervasyon ve telefon tekrar kontrolünü uygular. Koordinatör görevi aynı etkinlik içinde açar; cevap doğrudan ana kayda yazılır, WhatsApp sonuç dosyası üretmesi gerekmez. Görev kimliği, form sürümü ve arama geçmişi yine saklanır.

Koordinatör, başka gönüllüye atanmış bir kişiyi doğrudan düzenleyemez. Gerekirse **Bu kişiyi devral** işlemiyle tek kişilik devir yapar. Kaydetme anında sahiplik tekrar kontrol edilir; ekran açıkken başka göreve devredilmiş kayıt sessizce yazılamaz. Gönüllüden daha sonra gelen eski sonuç inceleme kuyruğuna düşer.

## WhatsApp dosyası ve sonuç birleştirme

- Tek giriş noktası `.ays` dosyasının türünü tanır. Görev paketi kendi formunu ve kişilerini taşır; gönüllüye anket seçtirilmez. Sonuç paketi etkinlik adıyla değil `eventId`, `assignmentId`, dosya özeti ve kişi kimlikleriyle eşleşir.
- Gelen sonuç, önizlemeden **önce** cihazda kalıcı gelen kutusuna kaydedilir. Tekrar gelen aynı dosya özeti atlanır; uygulama kapanırsa dosya işlenmeyi bekler. Dosyayı uygulama içinden silme, yalnızca güvenli arşiv/yedek koşullarıyla yapılır.
- Birleştirme öncesi dış etkinlik yedeği alınır. Yedek yoksa otomatik yazma başlamaz. İşlem, mevcut sahiplik ve `generation` değerini kaydetmeden hemen önce yeniden doğrular.
- Doğru görevden, güncel ve çakışmasız dosya kısa bir onayla veya önceden ayarlı yedek konumunda otomatik işlenebilir. Sadece istisnalar **İncelenecek** ekranına gider.
- Aynı görevin iki cihazda açılmış kopyaları ayrı `workerInstanceId` / `submissionId` ile izlenir. Büyük `revision`, farklı cihazın küçük `revision` değerini kendiliğinden ezmez. Eski dosyalarda cihaz kimliği yoksa çakışma ihtimali ihtiyatlı değerlendirilir.
- Devredilmiş veya eski turdan gelen sonuç otomatik olarak güncel cevabın yerine geçmez. Koordinatör cevabı değiştirmemeyi seçse bile benzersiz arama denemesi kaynak görev bilgisiyle geçmişe alınır; gelen dosyanın kendisi saklanır.
- Farklı etkinlik, bozuk dosya veya uyuşmayan form ana kaydı değiştirmez. Telefon düzeltilmişse aynı `recordId` üzerinden açık inceleme yapılır. Tek hatalı dosya, aynı anda seçilen diğer geçerli dosyaları görünmez kılmaz.
- WhatsApp paylaşım menüsünün kapanması teslim kanıtı değildir. Görevde **Gönderdim**, gönüllüde **Sonucu gönderdim** durumu ancak kullanıcının açık teyidiyle gösterilir.

## Diğer sorunlar için kararlar

- Aynı isim farklı `recordId` ve farklı telefonla ayrı kişi olabilir. Aynı telefonun iki satırı kaynak içe aktarımında incelemeye girer; aynı anda iki görevde bulunmaz.
- Görev dosyası yanlış kişiye iletilmişse aynı dosya kimliği tekrar kullanılmaz; koordinatör devreder ve yeni görev çıkarır. Eski kopya riski gösterilir.
- Gönüllü uygulamayı siler veya telefon değiştirirse son gönderdiği sonuç ile varsa görev yedeği korunur; ana kayıt bu dosyaları yeniden işleyebilir. Gönderilmemiş yerel cevap dış yedek olmadan kurtarılamayabilir.
- Aynı etkinliğin iki koordinatör cihazında eşzamanlı yönetimi desteklenmez. Görev devri için tam etkinlik yedeği aktarılır ve eski cihazda etkinlik arşivlenir; iki ana dosya ayrı ayrı dağıtım yapmaz.
- Görev ve sonuç dosyaları telefon/cevap içerir. SHA-256 bozulmayı saptar ama gönderenin kimliğini doğrulamaz ve dosyayı şifrelemez. Görev paketi yalnızca ilgili gönüllünün kişilerini taşır.

## Uygulama sırası ve kabul senaryoları

1. Kişi bazlı sahiplik, görev geçmişi ve eski yedekten geçiş kurallarını ekle.
2. İptal/devir ve **Yarım kalanlar** kuyruğunu atomik işlemler ve yedekle tamamla.
3. Koordinatörün kendi görevi ve kaydetme anındaki sahiplik denetimini ekle.
4. Kalıcı gelen dosyalar kutusu, otomatik eşleştirme ve kolay WhatsApp akışını ekle.
5. Farklı cihaz/eskimiş görev sonuçlarını kişi bazında uzlaştır; arama geçmişini her kararda koru.
6. Android APK ve web/PWA akışlarını, büyük veri ve geri yükleme ile doğrula.

Kabul testlerinde en az şu örnekler bulunur: 50 kişi gönderildi, hiç aranmadan iptal edildi ve 50 kişi yeniden dağıtıldı; 20 cevap alındı ve 30 kişi devredildi; eski gönüllü geç sonuç yolladı; koordinatör kendine 10 kişi ayırdı ve başka gönüllünün kişisini doğrudan kaydedemedi; aynı görev iki cihazda farklı cevaplandı; aynı telefon iki satırda geldi; iPhone web uygulaması ve Android aynı paketleri okuyabildi; işlem sırasında uygulama kapandı ve gelen dosya/yedek üzerinden toparlandı.
