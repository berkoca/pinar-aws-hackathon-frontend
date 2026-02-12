# Retail AI — Frontend Implementasyon Rehberi

Bu doküman, backend'deki WebSocket status event'lerini ve REST endpoint'lerini frontend'e entegre etmek için gereken tüm değişiklikleri açıklar.

---

## 1. WebSocket Status Event Yapısı

Backend artık analiz sırasında per-SKU status event'leri gönderiyor. Mevcut event tipleri:

### Event Tipleri

| type | Açıklama | payload |
|------|----------|---------|
| `stream_start` | Agent yanıtı başladı | `{}` |
| `status` | Tool/analiz durum bildirimi | `{ status, message, tool? }` |
| `stream_chunk` | Text token parçası | `{ text }` |
| `stream_end` | Agent yanıtı tamamlandı | `{}` |
| `error` | Hata | `{ message }` |
| `pong` | Ping yanıtı | `{}` |

### Status Event Alt Tipleri (`payload.status`)

| status | Açıklama | Örnek message |
|--------|----------|---------------|
| `tool_start` | Tool çalışmaya başladı | `🔧 sku_talep_analizi çalıştırılıyor...` |
| `tool_end` | Tool tamamlandı | `✅ sku_talep_analizi tamamlandı` |
| `processing` | İşlem devam ediyor (per-SKU) | `📊 [1/10] SKU 152903427 verisi çekiliyor...` |
| `success` | İşlem başarılı (per-SKU) | `✅ [1/10] SKU 152903427 analizi tamamlandı — Stok: 16, Talep: Orta` |
| `error` | İşlem hatası (per-SKU) | `❌ [3/10] SKU 999999 hata: 404` |
| `info` | Genel bilgi | `📋 10 SKU analiz edilecek` |

### Örnek Event Akışı (3 SKU analizi)

```
→ stream_start
→ status { status: "tool_start", tool: "sku_talep_analizi", message: "🔧 sku_talep_analizi çalıştırılıyor..." }
→ status { status: "processing", message: "📋 3 SKU analiz edilecek" }
→ status { status: "processing", message: "📊 [1/3] SKU 152903427 verisi çekiliyor..." }
→ status { status: "processing", message: "🔍 [1/3] SKU 152903427 analiz ediliyor (19 sipariş)..." }
→ status { status: "success", message: "✅ [1/3] SKU 152903427 analizi tamamlandı — Stok: 16, Talep: Orta" }
→ status { status: "processing", message: "📊 [2/3] SKU 153107186 verisi çekiliyor..." }
→ status { status: "processing", message: "🔍 [2/3] SKU 153107186 analiz ediliyor (45 sipariş)..." }
→ status { status: "success", message: "✅ [2/3] SKU 153107186 analizi tamamlandı — Stok: 0, Talep: Yüksek" }
→ status { status: "error", message: "⚠️ [3/3] SKU 999999 — sipariş verisi bulunamadı" }
→ status { status: "processing", message: "💾 2 SKU sonucu DynamoDB'ye yazılıyor..." }
→ status { status: "success", message: "✅ DynamoDB yazımı tamamlandı" }
→ status { status: "tool_end", tool: "sku_talep_analizi", message: "✅ sku_talep_analizi tamamlandı" }
→ stream_chunk { text: "Analiz sonuçlarına göre..." }
→ stream_chunk { text: " 3 SKU incelendi..." }
→ stream_end
```

---

## 2. useChat.js Değişiklikleri

`src/hooks/useChat.js` dosyasında status event'lerini yakalamak için state ve handler eklenmelidir.

### Yeni State

```js
const [statusEvents, setStatusEvents] = useState([]);
const [activeTools, setActiveTools] = useState([]);
```

### ws.onmessage İçine Eklenecek Handler

Mevcut `ws.onmessage` callback'inde `stream_chunk`, `stream_end`, `error` handler'larının yanına:

```js
// Mevcut handler'ların arasına ekle:
else if (msg.type === 'status') {
  const { status, message, tool } = msg.payload;

  // Status event'ini listeye ekle
  setStatusEvents((prev) => [
    ...prev,
    { id: Date.now().toString(36), status, message, tool, timestamp: Date.now() },
  ]);

  // Tool başlangıç/bitiş takibi
  if (status === 'tool_start' && tool) {
    setActiveTools((prev) => [...prev, tool]);
  } else if (status === 'tool_end' && tool) {
    setActiveTools((prev) => prev.filter((t) => t !== tool));
  }
}
```

### stream_end Handler'ına Ekleme

`stream_end` handler'ında status event'lerini temizle:

```js
else if (msg.type === 'stream_end') {
  setIsLoading(false);
  botMsgIdRef.current = null;
  // 3 saniye sonra status event'lerini temizle (animasyon için süre ver)
  setTimeout(() => {
    setStatusEvents([]);
    setActiveTools([]);
  }, 3000);
}
```

### Return Objesine Ekleme

```js
return {
  conversations,
  activeId,
  activeConversation,
  messages,
  isLoading,
  statusEvents,    // ← yeni
  activeTools,     // ← yeni
  setActiveId,
  createConversation,
  deleteConversation,
  send,
};
```

---

## 3. StatusMonitor Bileşeni

`src/components/Chat/StatusMonitor.jsx` — Analiz sırasında canlı durum gösteren floating panel.

```jsx
import { useEffect, useState } from 'react';
import { Activity, CheckCircle, AlertCircle, Loader, Database, Package } from 'lucide-react';

const STATUS_ICONS = {
  tool_start: Loader,
  tool_end: CheckCircle,
  processing: Loader,
  success: CheckCircle,
  error: AlertCircle,
  info: Activity,
};

const STATUS_COLORS = {
  tool_start: 'var(--color-primary)',
  tool_end: 'var(--color-success)',
  processing: 'var(--color-primary)',
  success: 'var(--color-success)',
  error: 'var(--color-danger)',
  info: 'var(--color-text-secondary)',
};

export default function StatusMonitor({ statusEvents, activeTools }) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (statusEvents.length > 0) {
      setVisible(true);
      setExiting(false);
    } else if (visible) {
      setExiting(true);
      const timer = setTimeout(() => {
        setVisible(false);
        setExiting(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [statusEvents.length]);

  if (!visible) return null;

  // Son 6 event'i göster
  const recentEvents = statusEvents.slice(-6);
  const latestEvent = statusEvents[statusEvents.length - 1];
  const isActive = activeTools.length > 0;

  return (
    <div className={`status-monitor ${exiting ? 'status-monitor-exit' : ''}`}>
      <div className="status-monitor-header">
        <div className="status-monitor-indicator">
          {isActive ? (
            <Loader size={14} className="status-spin" />
          ) : (
            <CheckCircle size={14} />
          )}
          <span>{isActive ? 'İşlem devam ediyor...' : 'Tamamlandı'}</span>
        </div>
        {isActive && (
          <span className="status-monitor-tool">{activeTools[activeTools.length - 1]}</span>
        )}
      </div>
      <div className="status-monitor-events">
        {recentEvents.map((event) => {
          const Icon = STATUS_ICONS[event.status] || Activity;
          return (
            <div key={event.id} className={`status-event status-event-${event.status}`}>
              <Icon
                size={13}
                style={{ color: STATUS_COLORS[event.status], flexShrink: 0 }}
                className={event.status === 'processing' || event.status === 'tool_start' ? 'status-spin' : ''}
              />
              <span className="status-event-message">{event.message}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

---

## 4. ChatView.jsx Değişiklikleri

`StatusMonitor`'ü ChatView'a ekle:

```jsx
import { useChatContext } from '../../context/ChatContext';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import StatusMonitor from './StatusMonitor';

export default function ChatView() {
  const { messages, isLoading, send, statusEvents, activeTools } = useChatContext();

  return (
    <div className="chat-view">
      {messages.length === 0 ? (
        <WelcomeScreen onSuggestionClick={send} />
      ) : (
        <MessageList messages={messages} isLoading={isLoading} />
      )}
      <StatusMonitor statusEvents={statusEvents} activeTools={activeTools} />
      <ChatInput onSend={send} disabled={isLoading} />
    </div>
  );
}
```

---

## 5. CSS Stilleri

`src/styles/index.css` dosyasına eklenecek stiller:

```css
/* ===== Status Monitor ===== */
.status-monitor {
  position: fixed;
  bottom: 100px;
  right: 24px;
  width: 380px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  z-index: 50;
  overflow: hidden;
  animation: statusSlideIn 0.3s ease-out;
}

.status-monitor-exit {
  animation: statusSlideOut 0.5s ease-in forwards;
}

@keyframes statusSlideIn {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes statusSlideOut {
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  to {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
}

.status-monitor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--color-primary);
  color: var(--color-white);
}

.status-monitor-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
}

.status-monitor-tool {
  font-size: 11px;
  background: rgba(255, 255, 255, 0.15);
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-family: 'SF Mono', 'Fira Code', monospace;
}

.status-monitor-events {
  padding: 8px 12px;
  max-height: 220px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.status-event {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  line-height: 1.4;
  animation: statusEventFadeIn 0.2s ease-out;
}

.status-event-success {
  background: rgba(34, 197, 94, 0.06);
}

.status-event-error {
  background: rgba(239, 68, 68, 0.06);
}

.status-event-processing,
.status-event-tool_start {
  background: rgba(64, 91, 119, 0.04);
}

.status-event-message {
  color: var(--color-text-secondary);
  word-break: break-word;
}

@keyframes statusEventFadeIn {
  from {
    opacity: 0;
    transform: translateX(-8px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.status-spin {
  animation: spin 1s linear infinite;
}

/* Responsive */
@media (max-width: 768px) {
  .status-monitor {
    right: 12px;
    left: 12px;
    width: auto;
    bottom: 90px;
  }
}
```

---

## 6. REST API Client Fonksiyonları

`src/api/client.js` dosyasına eklenecek fonksiyonlar:

```js
// Tüm raporları getir
export async function getAllReports() {
  return request('/reports');
}

// Tek SKU raporu
export async function getReportBySku(sku) {
  return request(`/reports/${sku}`);
}

// SKU analiz et (DynamoDB'ye de yazar)
export async function analyzeSku(sku) {
  return request('/analyze', {
    method: 'POST',
    body: JSON.stringify({ sku }),
  });
}

// Sipariş oluştur (SNS bildirimi gönderir)
export async function placeOrder(sku) {
  return request(`/order/${sku}`, {
    method: 'POST',
  });
}
```

---

## 7. REST Endpoint Özeti

| Method | Endpoint | Body | Açıklama |
|--------|----------|------|----------|
| `GET` | `/reports` | — | Tüm analiz raporları |
| `GET` | `/reports/{sku}` | — | Tek SKU raporu |
| `POST` | `/analyze` | `{ "sku": "152903427" }` | Analiz çalıştır + DynamoDB'ye yaz |
| `POST` | `/order/{sku}` | — | Sipariş ver + SNS mail gönder |
| `GET` | `/health` | — | Sistem sağlık durumu |

### POST /analyze Response

```json
{
  "data": {
    "sku": "152903427",
    "current_stock": 16,
    "total_orders": 19,
    "total_quantity": 19,
    "total_revenue": 1425.0,
    "avg_price": 75.0,
    "recommended_price": 63.75,
    "recommended_discount": 15.0,
    "discount_reason": "Düşük satış hızı — indirim artırılmalı",
    "avg_daily_quantity": 1.58,
    "peak_daily_quantity": 3,
    "min_daily_quantity": 1,
    "demand_level": "Düşük",
    "weekly_trend_pct": -12.5,
    "critical_stock_value": 5,
    "stock_remaining_day": 10,
    "stock_end_date": "22-02-2026",
    "action_plan": ["ACİL: Stok 3 gün içinde tükenecek — hemen sipariş verilmeli"],
    "daily_trend": { "2026-02-12": 1, "2026-02-11": 2 },
    "time_range": { "earliest": "2026-01-30", "latest": "2026-02-12" }
  },
  "needs_order": true,
  "saved_to_report": true,
  "saved_to_order_product": true
}
```

### POST /order/{sku} Response

```json
{
  "message": "SKU '152903427' için sipariş verildi ve bildirim gönderildi",
  "sku": "152903427",
  "order_placed": true,
  "notification_sent": true
}
```

### Hata Kodları

| Endpoint | Kod | Açıklama |
|----------|-----|----------|
| `/analyze` | 404 | Sipariş verisi bulunamadı |
| `/analyze` | 502 | Pınar API erişim hatası |
| `/order/{sku}` | 404 | SKU order_product tablosunda yok (önce /analyze çağır) |
| `/order/{sku}` | 409 | Sipariş zaten verilmiş |
| `/order/{sku}` | 500 | SNS bildirim hatası (sipariş kaydedildi) |

---

## 8. Önerilen UI Bileşen Yapısı

Monitoring dashboard için önerilen ek bileşenler:

```
src/components/
├── Chat/
│   ├── ChatView.jsx          ← StatusMonitor eklendi
│   ├── ChatInput.jsx
│   ├── MessageList.jsx
│   ├── MessageBubble.jsx
│   └── StatusMonitor.jsx     ← YENİ
├── Dashboard/                 ← OPSİYONEL (ayrı sayfa)
│   ├── ReportsTable.jsx       — GET /reports verisi ile tablo
│   ├── SkuDetailCard.jsx      — Tek SKU detay kartı
│   └── OrderButton.jsx        — POST /order/{sku} tetikleyici
└── ui/
    ├── Avatar.jsx
    ├── Badge.jsx
    ├── Button.jsx
    └── Spinner.jsx
```

---

## 9. WebSocket Bağlantı Bilgileri

```
URL:  ws://localhost:8000/api/ws
      wss://{host}/api/ws (production)

Mesaj Gönderme:
{
  "type": "message",
  "payload": { "text": "152903427,153107186 SKU'larını analiz et", "profile": "demand_prediction" },
  "session_id": null | "önceki_session_id"
}

Ping/Pong:
{ "type": "ping" }  →  { "type": "pong" }
```
