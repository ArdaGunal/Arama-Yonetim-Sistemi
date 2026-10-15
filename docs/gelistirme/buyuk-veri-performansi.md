# Büyük etkinlik performansı

## Tekrarlanabilir sentetik senaryo

`npm run benchmark:large` komutu gerçek kişi verisi kullanmadan 5.000 kişilik iki sayfalı kaynak Excel oluşturur; 100 gönüllüye 50'şer kişilik çakışmasız görev ayırır; 100 sonuç dosyasını inceler ve birleştirir; 5.000 geri arama adayını, kaynak sayfalarını koruyan nihai Excel'i ve kaynak eki içeren tam yedeği üretir. Her aşamada kişi ve görev sayıları doğrulanır. İstenirse `node scripts/benchmark-large-event.cjs --write-backup C:\...\sentetik.ays` ile tarayıcı veya Android denemesi için sahte yedek çıkarılır. Bu dosya gerçek kişi içermez; yine de deneme bitince silinmelidir.

8 Ekim 2026'da Windows üzerinde Node 24 ile yapılan ölçümde 100 görevin ayrılması yaklaşık 0,7–3,5 saniye, 100 sonucun önizlemesi 0,05–0,46 saniye, birleştirilmesi 0,07–0,43 saniye sürdü. Aynı sentetik senaryoda yedek yaklaşık 3,6 MB, proje metadatası 1,2 MB, kişi verisi 2,3 MB oldu. Değerler bilgisayar yüküne göre değişir; cihaz performans garantisi değildir.

10 Ekim 2026'da kaynak Excel ekiyle yeniden çalıştırıldığında sonuç Excel'i yaklaşık 0,35 saniyede, `.ays` yedeği 0,09 saniyede üretildi. Yedek 4,35 MB, kaynak ekinin base64 içeriği 0,72 MB oldu. Bu süreler Windows/Node ölçümüdür; Android ve iPhone depolama/ZIP sürelerini göstermez.

14 Ekim 2026'da sürüm 1.0.13 koduyla tekrar ölçüldü: 100 görev ayırma 611 ms, 100 sonucu önizleme 151 ms, birleştirme 155 ms, Excel oluşturma 305 ms sürdü. Yedek 4,36 MB idi. Ölçüm sentetiktir; gerçek cihaz süreleri ayrıca izlenmelidir.

15 Ekim 2026'da ölçüm yükleyicisi ayrılmış depo modüllerine uyarlandı; 5.000 kişilik güncelleme adımı eklendi. Node bellek taklidinde kişi listesini kurtarma kaydıyla güncelleme 26 ms, 100 görev ayırma 620 ms sürdü. Kurtarma kaydı Android'de ayrı dosyaya, web'de `IndexedDB` alanına taşınınca AsyncStorage taklidindeki tepe kullanım yaklaşık 5,2 MB oldu. Gerçek cihaz kotası ve süreleri ayrıca ölçülmelidir.

Geri arama adayları artık görevleri kişi başına yeniden taramak yerine bir kez dizinler. Sentetik 5.000 kişi/100 görev koşulunda bu aşama yaklaşık 100 ms'den 3–18 ms aralığına indi. Görev ekranındaki atanabilir ve geri arama sayıları da her klavye girişinde yeniden hesaplanmaz.

Yerel üretim web önizlemesine bu senaryonun `.ays` yedeği yüklendi. 5.000 kişi ve 100 tamamlanmış görev göründü; görev ekranı bitenleri başlangıçta gizledi, ilk 20 görevi ve **20 görev daha göster** düğmesini doğru sundu. Tarayıcı hata kaydı boştu.

## 5.000 anket yanıtı

`npm run benchmark:survey` komutu 5.000 sentetik, kimliği ayrı anket yanıtını boş depoya kaydeder; projeyi açar, Excel/CSV ve `.ays` yedeği üretir, yedeği doğrular ve ikinci boş depoya geri yükler. Her adımda 5.000 yanıtın korunması ve Excel/CSV satır sayısı kontrol edilir. Telefon numarası veya gerçek cevap kullanılmaz.

16 Ekim 2026 Windows/Node ölçümünde proje açılışı 12 ms, Excel üretimi 129 ms, CSV üretimi 8 ms, yedek hazırlama 42 ms ve boş depoya geri yükleme 12 ms sürdü. Anket yanıt yan dosyası yaklaşık 1,03 MB, Excel yaklaşık 1,43 MB oldu. Bu süreler Android/iPhone cihaz garantisi değildir; gerçek cihaz denemesinde aynı akış ve dosya bütünlüğü ayrıca kaydedilmelidir.

## Gerçek cihazda kalan ölçüm

Bu komutlar AsyncStorage'ı bellekle taklit eder; Android'in kalıcı depolama süresini ölçmez. Nihai kabul için Android telefonda 5.000 satırlı dosyayı içe aktarın, 100 görevi üretin, 100 sonuç dosyasını toplayın, Excel ve yedeği dışa alın. Anket için binlerce yanıtla açılış, kayıt ve çıktı süresini de ölçün. Her adımda süreyi, uygulamanın yanıt verip vermediğini ve dosyaların açıldığını kaydedin. iPhone testi kullanıcı uygun cihaz bulduğunda ayrıca yapılacak.
