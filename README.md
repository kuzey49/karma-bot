# Discord Bot - Karma Bot

Bu bot, otorol, spam engelleyici ve küfür engelleyici özelliklerine sahip bir Discord botudur.

## Özellikler

- **Otorol**: Yeni gelen üyelere otomatik rol verir.
- **Spam Engelleyici**: Hızlı mesaj gönderenleri engeller ve mesajlarını siler.
- **Küfür Engelleyici**: Yöneticiler tarafından belirlenen kelimeleri içeren mesajları siler.
- **Dinamik Liste**: Küfür listesi sınırsızdır, yöneticiler istedikleri kadar ekleme yapabilir.

## Komutlar (Yalnızca Yönetici)

- `/otorol-ayarla @rol`: Üyelere otomatik verilecek rolü belirler.
- `/kufur-ekle [kelime]`: Yasaklı kelime ekler.
- `/kufur-sil [kelime]`: Yasaklı kelimeyi listeden çıkarır.
- `/kufur-liste`: Mevcut yasaklı kelimeleri listeler.

## Kurulum ve Deployment

1. **GitHub'a Yükleme**:
   - Bir GitHub reposu oluşturun.
   - Dosyaları (index.js, package.json, .gitignore) yükleyin.
   - `.env` ve `settings.json` dosyalarını yüklemeyin (zaten .gitignore içindeler).

2. **Render'da Çalıştırma**:
   - Render.com'a gidin ve "New + Web Service" seçin.
   - GitHub reponuzu bağlayın.
   - Runtime: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - **Environment Variables**: "Advanced" bölümünden `TOKEN` değişkenini ekleyin ve Discord bot tokeninizi yazın.

## Önemli Not
Render'ın ücretsiz sürümü disk yazma özelliğine sahip değildir. Bot her yeniden başladığında (deploy veya uyuma sonrası), ayarlar (otorol ve küfür listesi) sıfırlanabilir. Kalıcılık için bir veritabanı (örn. MongoDB Atlas) kullanılması önerilir.
