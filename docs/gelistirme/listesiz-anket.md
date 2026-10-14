# Kişi listesi olmayan anket

## Kullanım

Ana ekranda **Yeni Proje Oluştur** → **Anket** seçilir. Anketin adı yazılır ve sorular düzenlenir. Kişi listesi alanı bu akışta yoktur. **Arama** seçilirse kişi listesi gerekir. İki tür arasında geçmek için seçim ekranına geri dönülür; doldurulmuş taslak sessizce dönüştürülmez. Ankette en az bir soru gereklidir. Önizleme cevapları kaydetmez.

Oluşturulan anket ana ekrandan açılır. Her **Cevabı kaydet** ayrı bir yanıt üretir; başarılı kayıttan sonra form temizlenir. Zorunlu sorular ve şıklar kayıt sırasında doğrulanır. Boş yanıt kaydedilmez. Yanıtlar Excel/CSV olarak dışa aktarılır; `.ays` tam yedeğine girer. Şablon `.ayst` olarak paylaşılabilir. Bu modda telefon, arama durumu, görev dağıtımı ve sonuç birleştirme yoktur.

## Veri sözleşmesi

- Proje `mode: 'survey'` taşır; eski projelerde alan yoksa `calls` kabul edilir.
- Yanıtlar mevcut büyük veri yan dosyasında (`contacts`) ayrı kimliklerle saklanır. Bu modda `phone: ''`, `completed: true` ve geçerli `completedAt` zorunludur. Gerçek kişi/telefon kaydı gibi yorumlanmaz.
- `.ays` yedek şeması 7, `.ayst` listesiz şablon şeması 3'tür. Önceki yedek ve şablon sürümleri okunur.
- Sorular cevaplardan sonra değişirse form sürümü artar. Eski cevaplar ve eski soru kimlikleri korunur; Excel'de eski soru sütunları ayrıca görünür.
- Yanıt ekleme işlemleri depolama kuyruğunda sırayla yapılır. Meta veri yazımı başarısız olursa yanıt yan dosyası önceki haline döndürülmeye çalışılır.

## Sınır

Bu anket aynı cihazda veya aynı tarayıcı profilinde doldurulmak içindir. Ayrı cihazlardan gelen bağımsız anket yanıtlarını otomatik birleştirme protokolü henüz yoktur. Birden çok cihaz kullanılacaksa her cihazın `.ays` yedeği ve Excel çıktısı ayrı saklanmalıdır; `.ays` geri yüklemesi başka cihazın yeni yanıtlarının üzerine yazmak için kullanılmamalıdır. Kaydedilmemiş, o anda formda yazılan cevaplar uygulama kapanırsa geri gelmez.

## Kontrol

`npm test` ankette doğrulama, eşzamanlı iki yanıt, form sürümü, yedek ve Excel akışını kapsar. `npm run build:web` ile PWA derlemesi doğrulanır. Android APK'da yeni proje → Anket → soru oluşturma → cevap kaydetme → çıktı akışı elle kontrol edilir.
