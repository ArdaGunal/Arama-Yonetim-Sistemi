# Büyük etkinlik performansı

## Tekrarlanabilir sentetik senaryo

`npm run benchmark:large` komutu gerçek kişi verisi kullanmadan 5.000 kişilik iki sayfalı kaynak Excel oluşturur; 100 gönüllüye 50'şer kişilik çakışmasız görev ayırır; 100 sonuç dosyasını inceler ve birleştirir; 5.000 geri arama adayını, kaynak sayfalarını koruyan nihai Excel'i ve kaynak eki içeren tam yedeği üretir. Her aşamada kişi ve görev sayıları doğrulanır. İstenirse `node scripts/benchmark-large-event.cjs --write-backup C:\...\sentetik.ays` ile tarayıcı veya Android denemesi için sahte yedek çıkarılır. Bu dosya gerçek kişi içermez; yine de deneme bitince silinmelidir.

8 Ekim 2026'da Windows üzerinde Node 24 ile yapılan ölçümde 100 görevin ayrılması yaklaşık 0,7–3,5 saniye, 100 sonucun önizlemesi 0,05–0,46 saniye, birleştirilmesi 0,07–0,43 saniye sürdü. Aynı sentetik senaryoda yedek yaklaşık 3,6 MB, proje metadatası 1,2 MB, kişi verisi 2,3 MB oldu. Değerler bilgisayar yüküne göre değişir; cihaz performans garantisi değildir.

10 Ekim 2026'da kaynak Excel ekiyle yeniden çalıştırıldığında sonuç Excel'i yaklaşık 0,35 saniyede, `.ays` yedeği 0,09 saniyede üretildi. Yedek 4,35 MB, kaynak ekinin base64 içeriği 0,72 MB oldu. Bu süreler Windows/Node ölçümüdür; Android ve iPhone depolama/ZIP sürelerini göstermez.

Geri arama adayları artık görevleri kişi başına yeniden taramak yerine bir kez dizinler. Sentetik 5.000 kişi/100 görev koşulunda bu aşama yaklaşık 100 ms'den 3–18 ms aralığına indi. Görev ekranındaki atanabilir ve geri arama sayıları da her klavye girişinde yeniden hesaplanmaz.

Yerel üretim web önizlemesine bu senaryonun `.ays` yedeği yüklendi. 5.000 kişi ve 100 tamamlanmış görev göründü; görev ekranı bitenleri başlangıçta gizledi, ilk 20 görevi ve **20 görev daha göster** düğmesini doğru sundu. Tarayıcı hata kaydı boştu.

## Gerçek cihazda kalan ölçüm

Bu komut AsyncStorage'ı bellekle taklit eder; Android'in kalıcı depolama süresini ölçmez. Nihai kabul için Android telefonda 5.000 satırlı dosyayı içe aktarın, 100 görevi üretin, 100 sonuç dosyasını toplayın, Excel ve yedeği dışa alın. Her adımda süreyi, uygulamanın yanıt verip vermediğini ve dosyaların açıldığını kaydedin. iPhone testi kullanıcı uygun cihaz bulduğunda ayrıca yapılacak.
