import { useState, useEffect, useCallback } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, Alert } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../App";
import { AnalysisReport } from "@shared/types/prediction";

const ANALYZE_URL = "http://10.214.214.82:8000/analyze";
const ORDER_URL = "http://10.214.214.82:8000/order";

type Status = "loading" | "done" | "error";
type OrderStatus = "idle" | "loading" | "done" | "error" | "already_ordered";
type Result = AnalysisReport & { _status: Status; _error?: string };

type Props = NativeStackScreenProps<RootStackParamList, "SelfPredictionResults">;

function demandColor(level: string) {
  if (level === "high") return { bg: "#fef2f2", text: "#dc2626" };
  if (level === "medium") return { bg: "#fffbeb", text: "#d97706" };
  return { bg: "#f0fdf4", text: "#16a34a" };
}

function demandText(level: string) {
  if (level === "high") return "Yüksek";
  if (level === "medium") return "Orta";
  if (level === "low") return "Düşük";
  return level;
}

export default function SelfPredictionResultsScreen({ route }: Props) {
  const { productIds } = route.params;
  const [results, setResults] = useState<Map<string, Result>>(new Map());
  const [orders, setOrders] = useState<Map<string, OrderStatus>>(new Map());

  const placeOrder = useCallback(async (sku: string) => {
    setOrders((prev) => new Map(prev).set(sku, "loading"));
    try {
      const res = await fetch(`${ORDER_URL}/${sku}`, { method: "POST", headers: { "Content-Type": "application/json" } });
      const json = await res.json();
      if (res.status === 409) {
        setOrders((prev) => new Map(prev).set(sku, "already_ordered"));
        Alert.alert("Bilgi", json.message || `${sku} için sipariş zaten verilmiş`);
        return;
      }
      if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`);
      setOrders((prev) => new Map(prev).set(sku, "done"));
      Alert.alert("Başarılı", json.message || `${sku} için sipariş verildi`);
    } catch (err) {
      setOrders((prev) => new Map(prev).set(sku, "error"));
      Alert.alert("Hata", `${sku}: Sipariş başarısız — ${err}`);
    }
  }, []);

  const analyzeProduct = useCallback(async (sku: string) => {
    try {
      const res = await fetch(ANALYZE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const report: AnalysisReport = json.data ?? json;
      setResults((prev) => {
        const next = new Map(prev);
        next.set(sku, { ...report, sku, _status: "done" });
        return next;
      });
    } catch (err) {
      setResults((prev) => {
        const next = new Map(prev);
        next.set(sku, { _status: "error", _error: String(err), sku } as Result);
        return next;
      });
    }
  }, []);

  useEffect(() => {
    setResults(new Map(productIds.map((id) => [id, { _status: "loading", sku: id } as Result])));
    productIds.forEach((id) => analyzeProduct(id));
  }, [productIds, analyzeProduct]);

  const doneCount = Array.from(results.values()).filter((r) => r._status !== "loading").length;

  return (
    <View style={styles.container}>
      <Text style={styles.progress}>{doneCount}/{productIds.length} analiz tamamlandı</Text>
      <FlatList
        data={productIds}
        keyExtractor={(item) => item}
        contentContainerStyle={styles.list}
        renderItem={({ item: sku }) => {
          const r = results.get(sku);
          if (!r || r._status === "loading") {
            return (
              <View style={styles.card}>
                <ActivityIndicator size="small" color="#47A141" />
                <Text style={styles.loadingText}>{sku} analiz ediliyor...</Text>
              </View>
            );
          }
          if (r._status === "error") {
            return (
              <View style={[styles.card, styles.errorCard]}>
                <Text style={styles.errorText}>{sku}: Analiz başarısız</Text>
                <TouchableOpacity onPress={() => { setResults((prev) => { const n = new Map(prev); n.set(sku, { _status: "loading", sku } as Result); return n; }); analyzeProduct(sku); }}>
                  <Text style={styles.retryText}>Tekrar Dene</Text>
                </TouchableOpacity>
              </View>
            );
          }

          const dc = demandColor(r.demand_level);
          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.sku}>{r.sku}</Text>
                <View style={[styles.demandBadge, { backgroundColor: dc.bg }]}>
                  <Text style={[styles.demandText, { color: dc.text }]}>Talep: {demandText(r.demand_level)}</Text>
                </View>
              </View>

              <View style={styles.metricsRow}>
                <View style={styles.metricBoxBlue}>
                  <Text style={styles.metricLabel}>Önerilen Sipariş</Text>
                  <Text style={[styles.metricValue, { color: "#2563eb" }]}>{Math.ceil(r.avg_daily_quantity * 30)}</Text>
                  <Text style={{ fontSize: 8, color: "#999" }}>adet / 30 gün</Text>
                </View>
                <View style={styles.metricBox}>
                  <Text style={styles.metricLabel}>Kalan Gün</Text>
                  <Text style={[styles.metricValue, { color: r.stock_remaining_day <= 7 ? "#dc2626" : r.stock_remaining_day <= 14 ? "#d97706" : "#47A141" }]}>{r.stock_remaining_day}</Text>
                </View>
                <View style={styles.metricBox}>
                  <Text style={styles.metricLabel}>Kritik Stok</Text>
                  <Text style={styles.metricValue}>{r.critical_stock_value}</Text>
                </View>
                <View style={styles.metricBox}>
                  <Text style={styles.metricLabel}>Günlük Ort.</Text>
                  <Text style={styles.metricValue}>{r.avg_daily_quantity}</Text>
                </View>
              </View>

              <View style={styles.metricsRow}>
                <View style={styles.metricBoxGray}>
                  <Text style={styles.metricLabel}>Önerilen Fiyat</Text>
                  <Text style={styles.metricValueSm}>₺{r.recommended_price}</Text>
                </View>
                <View style={styles.metricBoxGray}>
                  <Text style={styles.metricLabel}>İndirim</Text>
                  <Text style={[styles.metricValueSm, { color: "#d97706" }]}>%{r.recommended_discount}</Text>
                </View>
                <View style={styles.metricBoxGray}>
                  <Text style={styles.metricLabel}>Toplam Gelir</Text>
                  <Text style={styles.metricValueSm}>₺{r.total_revenue?.toLocaleString("tr-TR")}</Text>
                </View>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoText}>Bitiş: {r.stock_end_date}</Text>
                <Text style={[styles.trendText, { color: r.weekly_trend_pct >= 0 ? "#16a34a" : "#dc2626" }]}>
                  {r.weekly_trend_pct >= 0 ? "↑" : "↓"} %{Math.abs(r.weekly_trend_pct)} trend
                </Text>
              </View>

              {r.action_plan && r.action_plan.length > 0 && (
                <View style={styles.actionSection}>
                  <Text style={styles.actionTitle}>Aksiyon Planı</Text>
                  {r.action_plan.map((a, i) => (
                    <Text key={i} style={styles.actionItem}>✓ {a}</Text>
                  ))}
                </View>
              )}

              {r.needs_order && (
                <View style={styles.orderWarning}>
                  <Text style={styles.orderWarningText}>⚠️ Sipariş verilmesi gerekiyor</Text>
                </View>
              )}

              {/* Order Button */}
              {(() => {
                const os = orders.get(sku) ?? "idle";
                if (os === "done") return (
                  <View style={styles.orderDone}>
                    <Text style={styles.orderDoneText}>✓ Sipariş verildi</Text>
                  </View>
                );
                if (os === "already_ordered") return (
                  <View style={styles.orderAlready}>
                    <Text style={styles.orderAlreadyText}>Bu ürün için sipariş zaten verilmiş</Text>
                  </View>
                );
                if (os === "error") return (
                  <View style={styles.orderErrorRow}>
                    <Text style={styles.orderErrorText}>Sipariş başarısız</Text>
                    <TouchableOpacity onPress={() => placeOrder(sku)}>
                      <Text style={styles.retryText}>Tekrar Dene</Text>
                    </TouchableOpacity>
                  </View>
                );
                return (
                  <TouchableOpacity
                    style={[styles.orderBtn, r.needs_order && styles.orderBtnUrgent, r.stock_remaining_day > 15 && styles.orderBtnDisabled]}
                    onPress={() => placeOrder(sku)}
                    disabled={os === "loading" || r.stock_remaining_day > 15}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.orderBtnText}>
                      {os === "loading" ? "Sipariş veriliyor..." : r.stock_remaining_day > 15 ? "Sipariş gerekmiyor" : r.needs_order ? `⚠️ Sipariş Ver — ${Math.ceil(r.avg_daily_quantity * 30)} adet (Acil)  →` : `Sipariş Ver — ${Math.ceil(r.avg_daily_quantity * 30)} adet  →`}
                    </Text>
                  </TouchableOpacity>
                );
              })()}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f7f5" },
  progress: { textAlign: "center", color: "#999", fontSize: 13, paddingTop: 12 },
  list: { padding: 16, gap: 12 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 1 },
  errorCard: { borderWidth: 1, borderColor: "#fecaca" },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sku: { fontSize: 16, fontWeight: "bold", color: "#1a2e1a" },
  demandBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  demandText: { fontSize: 11, fontWeight: "600" },
  metricsRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  metricBox: { flex: 1, backgroundColor: "#EDF7ED", borderRadius: 10, padding: 10, alignItems: "center" },
  metricBoxBlue: { flex: 1, backgroundColor: "#eff6ff", borderRadius: 10, padding: 10, alignItems: "center" },
  metricBoxGray: { flex: 1, backgroundColor: "#f9fafb", borderRadius: 10, padding: 10, alignItems: "center" },
  metricLabel: { fontSize: 9, color: "#999", textTransform: "uppercase", marginBottom: 2 },
  metricValue: { fontSize: 20, fontWeight: "bold", color: "#1a2e1a" },
  metricValueSm: { fontSize: 15, fontWeight: "bold", color: "#1a2e1a" },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  infoText: { fontSize: 13, color: "#666" },
  trendText: { fontSize: 13, fontWeight: "600" },
  actionSection: { borderTopWidth: 1, borderTopColor: "#f0f0f0", paddingTop: 10 },
  actionTitle: { fontSize: 11, fontWeight: "600", color: "#999", textTransform: "uppercase", marginBottom: 6 },
  actionItem: { fontSize: 13, color: "#47A141", marginBottom: 3 },
  orderWarning: { marginTop: 8, backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca", borderRadius: 10, padding: 10 },
  orderWarningText: { fontSize: 13, fontWeight: "600", color: "#dc2626" },
  orderBtn: { marginTop: 12, backgroundColor: "#47A141", borderRadius: 12, paddingVertical: 14, alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 2 },
  orderBtnUrgent: { backgroundColor: "#ef4444" },
  orderBtnDisabled: { opacity: 0.5 },
  orderBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  orderDone: { marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 10 },
  orderDoneText: { color: "#47A141", fontSize: 14, fontWeight: "600" },
  orderAlready: { marginTop: 12, alignItems: "center", paddingVertical: 10 },
  orderAlreadyText: { color: "#d97706", fontSize: 13, fontWeight: "500" },
  orderErrorRow: { marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 },
  orderErrorText: { color: "#dc2626", fontSize: 13 },
  loadingText: { fontSize: 13, color: "#999", marginTop: 8 },
  errorText: { fontSize: 14, fontWeight: "600", color: "#dc2626" },
  retryText: { fontSize: 13, color: "#47A141", marginTop: 8 },
});