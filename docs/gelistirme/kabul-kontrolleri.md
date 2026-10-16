# Sürüm kabul kontrolleri

Bu liste yeni sorumlunun Android APK ve web sürümünü gerçek kullanımda doğrulaması içindir. Testlerde yalnızca sentetik isim/numara kullanın; **Ara** düğmesine basmayın. Her denemeden önce `.ays` dış yedeğini saklayın ve sürüm kodunu not edin.

## Android

| Kontrol | Beklenen sonuç | 1.0.39/b40 durumu |
| --- | --- | --- |
| Eski APK üstüne güncelleme | Önceki projeler, görevler ve cevaplar korunur | 1.0.39/b40 eski kurulum üstüne yüklendi; projeler, görev ve gelen anket cevap dosyası korundu |
| Temiz kurulum | Boş ana ekran açılır; Arama/Anket seçimi ve ilk kayıt tamamlanır | Ayrı temiz emülatör/telefon bekliyor |
| İki kişilik arama | Kişi değiştir, geri dön, uygulamayı kapatıp aç; yazı ve durum korunur | 1.0.36/b37 emülatörde geçti; yeni sürümde proje ve görev ekranı açıldı, tam tur bekliyor |
| WhatsApp/Dosyalar `.ays` açma | Uygulama dosyayı doğru görev/sonuç ekranına götürür; ikinci açma cevap çoğaltmaz | Emülatörde önceki sürümde geçti; gerçek WhatsApp cihazı bekliyor |
| Çevrimdışı çalışma | İnternet kapalıyken mevcut görev açılır, cevap kaydolur, uygulama yeniden açılır | Gerçek cihaz bekliyor |
| Yedek ve Excel | Dış dosyalar seçilen klasörde/paylaşımda görünür; yedek boş kurulumda geri yüklenir | 1.0.38/b39 emülatörde `.ays` Documents klasörüne yazıldı; Excel ve boş gerçek cihaz geri yüklemesi bekliyor |
| 5.000 kişi / 100 görev | Arayüz kullanılabilir kalır, sonuç ve Excel'de kişi kaybı/tekrar yoktur | Node sentetik veri testi geçti; gerçek telefon süresi bekliyor |

## Web ve iPhone

| Kontrol | Beklenen sonuç | Durum |
| --- | --- | --- |
| PWA çevrimdışı tekrar açma | Önceden yüklenmiş uygulama ağ kapalıyken açılır; yerel cevap korunur | Yerel web denemesi geçti |
| Yeni sürüm önbelleği | Yeni sürüm uyarısı ve güvenli yenileme görünür | Yerel web denemesi geçti; canlı sürümde gözlem bekliyor |
| Depolama izni | Ayarlar/yedek ekranı izin durumunu söyler; dış `.ays` yedeği alınabilir | Otomatik test geçti; gerçek tarayıcı kontrolü bekliyor |
| Sekmeyi kapatıp açma | Kaydedilen cevap ve gelen dosya kutusu korunur | Yerel web denemesi geçti |
| Safari Ana Ekran ve Dosyalar | iPhone'da uygulama ana ekrandan açılır; `.ays` açma/paylaşma/geri yükleme çalışır | Kullanıcı uygun iPhone bulana kadar bekliyor |
| 5.000 anket yanıtı | Açılış, Excel/CSV, yedek ve boş depoya geri yükleme 5.000 yanıtı korur | Node sentetik ölçüm ve bütünlük geçti; gerçek cihaz süresi bekliyor |

## Kullanılabilirlik denemesi

Üç teknolojiye uzak gönüllüye uygulamayı açıklamadan şu işleri yaptırın: **Arama** veya **Anket** seçme, ilk projeyi oluşturma, bir cevabı kaydetme, gelen `.ays` dosyasını açma ve sonucu paylaşma. Her kişinin durduğu yeri, anlamadığı kelimeyi ve yanlış bastığı düğmeyi kaydedin; gerçek kişi verisi veya telefon araması kullanmayın. Bulgular düzeltilip aynı adım tekrar denenmeden Faz 5 tamamlandı sayılmaz.

## Kayıt şablonu

`Tarih · sürüm · cihaz/tarayıcı · kontrol · geçti/kaldı · gözlenen hata · tanılama raporu veya ekran görüntüsü yolu`

Gerçek cihaz sonuçlarını [proje durumu](../hafiza/proje-durumu.md) ve [master plan](../hafiza/masterplan.md) ile birlikte güncelleyin. Tanılama raporunda kişi bilgisi varsa herkese açık GitHub deposuna yüklemeyin.
