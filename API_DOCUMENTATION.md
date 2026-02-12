# LimonCloud Agentic Backend — API Dokümantasyonu

**Versiyon:** 0.1.0  
**Base URL:** `http://localhost:8000`

---

## Genel Bilgiler

- Tüm JSON yanıtları `application/json` content type ile döner.
- Rate limiting IP bazlı token bucket algoritması ile uygulanır.
- Hassas bilgiler (token, password, api_key vb.) loglarda otomatik maskelenir.
- CORS tüm origin'lere açıktır (yapılandırılabilir).

---

## Şemalar (Pydantic Modelleri)

### ChatRequest

| Alan         | Tip              | Zorunlu | Varsayılan  | Açıklama                          |
|--------------|------------------|---------|-------------|-----------------------------------|
| `message`    | `string`         | Evet    | —           | Kullanıcı mesajı (1–4096 karakter)|
| `session_id` | `string \| null` | Hayır   | `null`      | Mevcut session ID                 |
| `profile`    | `string`         | Hayır   | `"default"` | Agent profili                     |

### ChatResponse

| Alan         | Tip      | Açıklama              |
|--------------|----------|-----------------------|
| `reply`      | `string` | Agent yanıtı          |
| `session_id` | `string` | Kullanılan session ID |

### ErrorResponse

| Alan         | Tip      | Açıklama              |
|--------------|----------|-----------------------|
| `error_code` | `string` | Hata kodu             |
| `message`    | `string` | Hata mesajı           |
| `details`    | `object` | Ek detaylar (opsiyonel)|

### HealthResponse

| Alan              | Tip      | Açıklama                |
|-------------------|----------|-------------------------|
| `status`          | `string` | Sistem durumu (`"ok"`)  |
| `active_sessions` | `int`    | Aktif session sayısı    |
| `version`         | `string` | Uygulama versiyonu      |

### AnalyzeRequest

| Alan  | Tip      | Zorunlu | Açıklama     |
|-------|----------|---------|--------------|
| `sku` | `string` | Evet    | Ürün SKU kodu|

---

## Endpoints

### 1. Health Check

#### `GET /health`

Sistem sağlık durumunu döndürür.

**Yanıt:** `HealthResponse`

```json
{
  "status": "ok",
  "active_sessions": 3,
  "version": "0.1.0"
}
```

---

### 2. Chat (Senkron)

#### `POST /chat`

Kullanıcı mesajını agent'a gönderir ve senkron yanıt döndürür. Mevcut `session_id` varsa ilgili session kullanılır, yoksa yeni session oluşturulur.

**İstek:** `ChatRequest`

```json
{
  "message": "Stok durumunu kontrol et",
  "session_id": null,
  "profile": "default"
}
```

**Başarılı Yanıt (200):** `ChatResponse`

```json
{
  "reply": "Stok durumu kontrol edildi...",
  "session_id": "abc-123"
}
```

**Hata Yanıtları:**

| Kod | Açıklama          |
|-----|--------------------|
| 422 | Doğrulama hatası   |
| 500 | Sunucu hatası      |

---

### 3. Chat Stream (SSE)

#### `POST /chat/stream`

Kullanıcı mesajını agent'a gönderir ve SSE (Server-Sent Events) streaming yanıt döndürür.

**İstek:** `ChatRequest`

```json
{
  "message": "Detaylı analiz yap",
  "session_id": "abc-123",
  "profile": "default"
}
```

**Yanıt:** `text/event-stream`

SSE event tipleri:

| Event   | Açıklama                                  |
|---------|-------------------------------------------|
| `chunk` | Agent yanıt parçası (`data` alanında metin)|
| `done`  | Streaming tamamlandı                      |
| `error` | Hata oluştu (`data` alanında hata mesajı) |

```
event: chunk
data: Analiz sonuçlarına göre...
id: abc-123

event: done
data:
id: abc-123
```

**Hata Yanıtları:**

| Kod | Açıklama          |
|-----|--------------------|
| 422 | Doğrulama hatası   |
| 500 | Sunucu hatası      |

---

### 4. WebSocket

#### `WS /ws`

Çift yönlü gerçek zamanlı iletişim için WebSocket endpoint'i. JSON tabanlı protokol kullanır.

**Mesaj Tipleri:**

| Tip       | Yön              | Açıklama                  |
|-----------|------------------|---------------------------|
| `message` | Client → Server  | Kullanıcı mesajı          |
| `ping`    | Client → Server  | Bağlantı kontrolü         |
| `pong`    | Server → Client  | Ping yanıtı               |
| `error`   | Server → Client  | Hata bildirimi            |

**WebSocket Mesaj Formatı:**

```json
{
  "type": "message",
  "payload": { "text": "Merhaba" },
  "session_id": "abc-123"
}
```

---

### 5. Raporlar

#### `GET /reports`

Tüm analiz raporlarını DynamoDB'den döndürür.

**Başarılı Yanıt (200):**

```json
{
  "data": [
    {
      "sku": "SKU-001",
      "critical_stock_value": 150,
      "stock_end_date": "2026-03-01",
      "stock_remaining_day": 17
    }
  ]
}
```

---

#### `GET /reports/{sku}`

Belirtilen SKU'nun analiz raporunu döndürür.

**Path Parametreleri:**

| Parametre | Tip      | Açıklama      |
|-----------|----------|---------------|
| `sku`     | `string` | Ürün SKU kodu |

**Başarılı Yanıt (200):**

```json
{
  "data": {
    "sku": "SKU-001",
    "critical_stock_value": 150,
    "stock_end_date": "2026-03-01",
    "stock_remaining_day": 17
  }
}
```

**Hata Yanıtları:**

| Kod | Açıklama                |
|-----|--------------------------|
| 404 | SKU bulunamadı           |

---

#### `POST /analyze`

SKU için talep analizi çalıştırır ve sonucu `analysis_report_table`'a yazar. Stok kalan gün sayısı 7'nin altındaysa `order_product` tablosuna da kayıt oluşturur.

**İstek:** `AnalyzeRequest`

```json
{
  "sku": "SKU-001"
}
```

**Başarılı Yanıt (200):**

```json
{
  "data": {
    "sku": "SKU-001",
    "critical_stock_value": 150,
    "stock_end_date": "2026-03-01",
    "stock_remaining_day": 5,
    "avg_daily_quantity": 30,
    "recommended_discount": 10,
    "recommended_price": 89.90,
    "demand_level": "high",
    "action_plan": ["Stok siparişi ver", "İndirim uygula"],
    "weekly_trend_pct": 12.5,
    "total_revenue": 45000.00
  },
  "needs_order": true,
  "saved_to_report": true,
  "saved_to_order_product": true
}
```

**Hata Yanıtları:**

| Kod | Açıklama                          |
|-----|-----------------------------------|
| 404 | Sipariş verisi bulunamadı         |
| 502 | Harici API'den veri çekilemedi    |

---

#### `POST /order/{sku}`

SKU için sipariş verir, DynamoDB'de `order_placed=True` olarak günceller ve SNS üzerinden bildirim gönderir.

**Path Parametreleri:**

| Parametre | Tip      | Açıklama      |
|-----------|----------|---------------|
| `sku`     | `string` | Ürün SKU kodu |

**Başarılı Yanıt (200):**

```json
{
  "message": "SKU 'SKU-001' için sipariş verildi ve bildirim gönderildi",
  "sku": "SKU-001",
  "order_placed": true,
  "notification_sent": true
}
```

**Hata Yanıtları:**

| Kod | Açıklama                                          |
|-----|---------------------------------------------------|
| 404 | SKU `order_product` tablosunda bulunamadı          |
| 409 | Bu SKU için sipariş zaten verilmiş                 |
| 500 | Sipariş kaydedildi ama SNS bildirimi gönderilemedi |

---

### 6. Webhooks

#### `POST /webhooks/teams`

Microsoft Teams webhook endpoint'i. Bot Framework token doğrulaması yapar, gelen mesajı parse eder, agent yanıtı üretir ve Teams'e geri gönderir.

**Akış:**
1. Bot Framework token doğrulaması
2. Teams mesajını parse et
3. ChatService ile agent yanıtı üret
4. Yanıtı Teams'e geri gönder

**Başarılı Yanıt (200):**

```json
{
  "status": "ok"
}
```

**Hata Yanıtları:**

| Kod | Açıklama                          |
|-----|-----------------------------------|
| 400 | Mesaj parse hatası                |
| 401 | Kimlik doğrulama başarısız        |
| 500 | Agent yanıt üretemedi             |
| 502 | Yanıt Teams'e gönderilemedi       |

---

## Middleware

### RequestLoggingMiddleware

Her HTTP isteğini yapılandırılmış JSON formatında loglar. Hassas header bilgileri (`Authorization`, `Token`, `API-Key` vb.) otomatik maskelenir.

### RateLimitMiddleware

IP bazlı token bucket rate limiter. Limit aşıldığında HTTP `429 Too Many Requests` döner.

```json
{
  "error_code": "RATE_LIMIT_EXCEEDED",
  "message": "İstek limiti aşıldı. Lütfen daha sonra tekrar deneyin.",
  "details": {}
}
```

---

## Endpoint Özet Tablosu

| Metod       | Path               | Tag        | Açıklama                              |
|-------------|---------------------|------------|----------------------------------------|
| `GET`       | `/health`           | health     | Sistem sağlık durumu                   |
| `POST`      | `/chat`             | chat       | Senkron chat                           |
| `POST`      | `/chat/stream`      | chat       | SSE streaming chat                     |
| `WebSocket` | `/ws`               | chat       | Çift yönlü gerçek zamanlı iletişim     |
| `GET`       | `/reports`          | reports    | Tüm analiz raporları                   |
| `GET`       | `/reports/{sku}`    | reports    | Tek SKU raporu                         |
| `POST`      | `/analyze`          | reports    | SKU analizi çalıştır                   |
| `POST`      | `/order/{sku}`      | reports    | Sipariş ver ve bildirim gönder         |
| `POST`      | `/webhooks/teams`   | webhooks   | Microsoft Teams webhook                |
