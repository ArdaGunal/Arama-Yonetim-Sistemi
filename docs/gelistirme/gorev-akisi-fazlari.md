# Görev akışı: uygulama fazları

Bu sıra [görev devri ve sonuç kurallarını](gorev-devri-ve-sonuc-plani.md) uygulamaya geçirmek içindir. Her faz sonunda ilgili senaryolar otomatik testlerle ve mümkün olan platformlarda gerçek dosya akışıyla doğrulanır. Bir sonraki faza geçmeden önce mevcut `.ays` yedeklerinin okunması ve verilerin kaybolmaması kontrol edilir.

**14 Ekim 2026 durumu:** Faz 1–3'ün veri kuralları ve ekranları, Faz 4'ün kalıcı sonuç kutusu, Faz 5'in çakışma kararları uygulandı. Faz 6'da görev ekranının dört sayacı eklendi ve teknik kimlikler varsayılan görünümden kaldırıldı. 43 otomatik test, web derlemesi, 5.000 kişi/100 görev/100 sonuç sentetik ölçümü ve Android emülatöründe kendi görevi ile gelen sonuç dosyası denendi. Gerçek Android cihaz ve iPhone kabul testleri açık; iPhone testi kullanıcı cihaz bulana kadar ertelendi.

## Faz 1 — İptal edilen kişiler görünür ve yeniden atanabilir

**Hedef:** İptal edilen ilk tur görevindeki yapılmamış kişiler ana listede kalır; ayrı **Yarım kalanlar** sayacıyla görünür ve yeni görevde önce seçilir. İptal edilen görevin kimliği/geçmişi korunur. Gönderilmiş dosyanın eski kopyası uyarısı açık kalır.

**Kabul:** 50 kişilik görev hiç yapılmadan iptal edildiğinde 50 kişi kuyruğa döner. B'ye 30 verildiğinde kalan 20 görünür. Aynı `recordId` veya telefon iki etkin göreve girmez. Yeniden açılan yedekte sayılar aynıdır.

## Faz 2 — Kısmi görevin kişi bazında devri

**Hedef:** 50 kişilik görevin 20'si ana kayda alınmışsa yalnızca kalan 30 kişi devredilir. Sonuç bekleyen veya arama denemesi bulunan satırlar açıkça gösterilir. Devir tek işlemde eski sahipliği kapatıp yeni görevi ayırır; işlem başarısızsa ikisi de değişmez. Eski görev ve dosyası geçmişte kalır.

**Kabul:** 20 cevap korunur, 30 kişi yeniden atanır, eski dosyadan gelen geç sonuç güncel cevabı sessizce değiştirmez. İptal edilmiş geri arama görevi uygun geri arama kuyruğuna döner.

## Faz 3 — Koordinatörün kendi görevi

**Hedef:** **Kendime görev al** seçeneği aynı kişi/telefon sahipliği kurallarını uygular. Koordinatör görevini açıp cevapları doğrudan ana kayda yazar. Başka gönüllüye ayrılmış kişiye doğrudan cevap yazmadan önce kişi bazında devir gerekir.

**Kabul:** Koordinatör 10 kişi ayırdığında gönüllüye bu 10 kişi çıkmaz. Koordinatörün cevabı ve arama geçmişi yedekte ve Excel'de görünür. Ekran açıkken sahiplik değişirse eski ekrandan kaydetme engellenir.

## Faz 4 — Gelen dosyalar kutusu ve kolay paylaşım

**Hedef:** Android'de WhatsApp'tan açılan `.ays` görev/sonuç türüne göre yönlendirilir. Sonuç dosyası önizlemeden önce kalıcı gelen kutusuna alınır; aynı dosya ikinci kez işlenmez. Web/PWA dosya seçme yolu aynı doğrulamayı kullanır. Koordinatör ve gönüllü için düğmeler tek ana eyleme indirilir; paylaşımın gerçekten gönderildiği kullanıcı teyidiyle işaretlenir.

**Kabul:** Uygulama gelen dosya açıldıktan sonra kapanıp yeniden açıldığında işlenmemiş sonuç görünür. Doğru etkinlik/görev otomatik eşleşir. Yanlış dosya ana kaydı değiştirmez.

## Faz 5 — Geç ve çakışan sonuçları güvenli birleştirme

**Hedef:** Devredilmiş, iptal edilmiş ve iki cihazda çözülmüş görev sonuçları kişi bazında incelenir. Son cevap ile arama geçmişi ayrı ele alınır; “mevcut kalsın” kararı benzersiz arama denemesini kaybettirmez. Birleştirme öncesi dış yedek, işlem günlüğü ve son anda sahiplik kontrolü korunur. Yeni dosya sürümü eski sürümleri okumaya devam eder.

**Kabul:** Eski sonuç yeni cevabı ezmez; aynı dosya idempotenttir; aynı görev iki cihazda çözüldüğünde yüksek sürüm numarası tek başına karar vermez; kesinti sonrası ana veri ve gelen kutusu tutarlıdır.

## Faz 6 — Sade ekranlar ve uçtan uca doğrulama

**Hedef:** Koordinatörde **Dağıtılacak**, **Yarım kalanlar**, **Tekrar aranacak**, **İncelenecek** sayıları; gönüllüde yalnızca gelen görev, arama ve sonucu gönderme adımları görünür. Gereksiz teknik kimlikler varsayılan ekranda saklanır. Belgeler ve APK/PWA paketleri güncellenir.

**Kabul:** 2.000 ve 5.000 kişilik sentetik listeler, 100 görev, iptal/devir, ters sırada gelen sonuçlar, yedekten dönüş ve Android WhatsApp dosya açılışı denenir. Gerçek iPhone bulunursa PWA dosya alma ve çevrimdışı kullanım ayrıca doğrulanır.

## Her fazın kontrolü

1. Önce hedef veri kuralı ve eski dosya uyumluluğu belirlenir.
2. Davranışı ölçen test yazılır; yalnızca ekranın kendi uygulamasını tekrar eden test eklenmez.
3. Kod ve arayüz değiştirilir.
4. Testler, yedek geri yükleme ve `git diff --check` çalıştırılır.
5. Fazın sonucu ve kalan riskler kullanıcıya bildirilir.
