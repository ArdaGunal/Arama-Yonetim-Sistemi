# Kişi listesi olmayan anket

## Kullanım

Ana ekranda **Yeni Proje Oluştur** → **Anket** seçilir. Anketin adı yazılır ve sorular düzenlenir. Kişi listesi alanı bu akışta yoktur. **Arama** seçilirse kişi listesi gerekir. İki tür arasında geçmek için seçim ekranına geri dönülür; doldurulmuş taslak sessizce dönüştürülmez. Ankette en az bir soru gereklidir. Önizleme cevapları kaydetmez.

Tür seçiminde **Anket Platformu'nu aç** bağlantısı da vardır. Geliştiricinin dış sitesi ayrıntılı anket isteyenler için tarayıcıda açılır. Bu uygulamadaki anket, şablon ve yanıtlar siteye gönderilmez veya oradan içe alınmaz.

Oluşturulan anket ana ekrandan açılır. Her **Cevabı kaydet** ayrı bir yanıt üretir; başarılı kayıttan sonra form temizlenir. Zorunlu sorular ve şıklar kayıt sırasında doğrulanır. Boş yanıt kaydedilmez. **Kaydedilen cevapları gör** ekranında yanıtlar aranabilir, açılabilir ve düzeltilebilir. **Yanıtı sil** kaydı Silinenler bölümüne taşır; **Yanıtı geri getir** ile geri alınır. Düzeltme öncesi cevap ve işlem zamanları geçmişte saklanır. Etkin yanıtlar Excel/CSV olarak dışa aktarılır; silinenler ve geçmiş `.ays` tam yedeğine girer. Şablon `.ayst` olarak paylaşılabilir. Bu modda telefon, arama durumu, görev dağıtımı ve sonuç birleştirme yoktur.

## Veri sözleşmesi

- Proje `mode: 'survey'` taşır; eski projelerde alan yoksa `calls` kabul edilir.
- Yeni anketlerde yanıtlar `@ays_survey_responses_<id>` dosyasında `{ id, data, submittedAt, formVersion, history, deletedAt }` biçiminde tutulur; `contacts` kişi listesi yoktur. `history` eski cevap görüntüsünü taşıyan `edit` ile `delete`/`restore` olaylarını saklar. Proje metadatasındaki `responseStorage: 1`, bu dosyanın zorunlu olduğunu belirtir. Dosya eksikse boş listeye dönülmez, hata gösterilir.
- Eski anketler `@ays_project_data_<id>` kişi biçimindeki yanıtları salt okunur adaptörle gösterir. İlk yeni yanıt kaydedilirken eski ve yeni yanıtlar ayrı depoya tek kurtarma günlüğüyle taşınır; yarım yazma eski depo, metadata ve taslağı geri getirir.
- Anket `.ays` yedek şeması 9'dur; `responses` yanıtları silinenler ve geçmişle birlikte taşır. Eski sürüm 7/8 anket yedeklerindeki kişi benzeri `contacts` yanıtları içe aktarılır. Arama yedekleri sürüm 8 olarak üretilmeye devam eder. `.ayst` listesiz şablon şeması 3'tür; önceki yedek ve şablon sürümleri okunur.
- Sorular cevaplardan sonra değişirse form sürümü artar. Eski cevaplar ve eski soru kimlikleri korunur; yeni zorunlu soru eski cevabı düzeltirken istenmez. Excel, CSV ve istatistik ekranında eski soru sütunları `Form N` etiketiyle ayrıca görünür. Aynı adlı sütunlara ayırt edici sıra numarası eklenir.
- Yanıt ekleme, düzeltme, silme ve geri alma işlemleri depolama kuyruğunda sırayla yapılır. Meta veri yazımı başarısız olursa yanıt yan dosyası ve varsa eski kişi yan dosyası önceki haline döndürülür. Düzeltme ve silmede ekrandaki eski yanıt tekrar karşılaştırılır; başka işlemle değişmişse kaydetme durdurulur.

## Sınır

Bu anket aynı cihazda veya aynı tarayıcı profilinde doldurulmak içindir. Ayrı cihazlardan gelen bağımsız anket yanıtlarını otomatik birleştirme protokolü henüz yoktur. Birden çok cihaz kullanılacaksa her cihazın `.ays` yedeği ve Excel çıktısı ayrı saklanmalıdır; `.ays` geri yüklemesi başka cihazın yeni yanıtlarının üzerine yazmak için kullanılmamalıdır. Kaydedilmemiş cevap ayrı taslakta tutulur ve aynı cihazda yeniden açılır; dış yedek almak yine gereklidir.

## Kontrol

`npm test` ankette doğrulama, eşzamanlı iki yanıt, form sürümü, yedek ve Excel akışını kapsar. `npm run build:web` ile PWA derlemesi doğrulanır. Android APK'da yeni proje → Anket → soru oluşturma → cevap kaydetme → çıktı akışı elle kontrol edilir.
