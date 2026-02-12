import { useState, useEffect, useMemo } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList, Image, StyleSheet, ActivityIndicator, ScrollView,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../App";
import { Product, ApiResponse } from "@shared/types/product";

const API_URL = "https://api.pinar.retter.io/3cn87h0si/CALL/Order/getHackathonOrders";
const API_KEY = "aws-hackathon";
const REPORTS_BASE = "http://10.214.214.82:8000/reports";

function isCritical(p: Product) {
  if (p.critical_stock_value != null) return p.stock <= p.critical_stock_value;
  return p.stock < 20;
}

function stockSeverity(p: Product): "critical" | "warning" | "healthy" {
  if (isCritical(p)) return "critical";
  if (p.stock_remaining_day != null && p.stock_remaining_day <= 14) return "warning";
  if (p.critical_stock_value != null && p.stock <= p.critical_stock_value * 2) return "warning";
  if (p.stock < 100) return "warning";
  return "healthy";
}

type Props = NativeStackScreenProps<RootStackParamList, "SelfPrediction">;

export default function SelfPredictionScreen({ navigation }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [reportMap, setReportMap] = useState<Map<string, Pick<Product, "critical_stock_value" | "stock_end_date" | "stock_remaining_day">>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<string>("default");

  useEffect(() => {
    async function fetchProducts() {
      try {
        const res = await fetch(API_URL, {
          method: "POST",
          headers: { "x-api-key": API_KEY, "Content-Type": "application/json" },
        });
        const json: ApiResponse = await res.json();
        const productMap = new Map<string, Product>();
        for (const order of json.data) {
          for (const p of order.products) {
            if (!productMap.has(p.id)) {
              productMap.set(p.id, {
                product_id: p.id,
                image: p.image,
                title: p.name,
                stock: p.stockQuantity,
                price: p.price.toFixed(2),
              });
            }
          }
        }
        const items = Array.from(productMap.values());
        setProducts(items);
        setLoading(false);

        // Fetch reports individually — each updates reportMap as it arrives
        items.forEach((product) => {
          fetch(`${REPORTS_BASE}/${product.product_id}`)
            .then((r) => r.ok ? r.json() : null)
            .then((json) => {
              const report = json?.data ?? json;
              if (!report) return;
              setReportMap((prev) => {
                const next = new Map(prev);
                next.set(product.product_id, { critical_stock_value: report.critical_stock_value, stock_end_date: report.stock_end_date, stock_remaining_day: report.stock_remaining_day });
                return next;
              });
            })
            .catch(() => {});
        });
      } catch (err) {
        console.error("Failed to fetch products:", err);
        setLoading(false);
      }
    }
    fetchProducts();
  }, []);

  const enrichedProducts = useMemo(() => {
    return products.map((p) => {
      const report = reportMap.get(p.product_id);
      return report ? { ...p, ...report } : p;
    });
  }, [products, reportMap]);

  const filtered = useMemo(() => {
    let list = enrichedProducts;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) => p.title.toLowerCase().includes(q) || p.product_id.toLowerCase().includes(q)
      );
    }
    if (sort === "critical") {
      const severityOrder = { critical: 0, warning: 1, healthy: 2 };
      list = [...list].sort((a, b) => severityOrder[stockSeverity(a)] - severityOrder[stockSeverity(b)] || a.stock - b.stock);
    }
    else if (sort === "name-asc") list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === "name-desc") list = [...list].sort((a, b) => b.title.localeCompare(a.title));
    else if (sort === "stock-asc") list = [...list].sort((a, b) => a.stock - b.stock);
    else if (sort === "stock-desc") list = [...list].sort((a, b) => b.stock - a.stock);
    // Default: report data loaded first
    if (sort === "default") {
      list = [...list].sort((a, b) => {
        const aHas = a.critical_stock_value != null ? 0 : 1;
        const bHas = b.critical_stock_value != null ? 0 : 1;
        return aHas - bHas;
      });
    }
    return list;
  }, [search, enrichedProducts, sort]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.product_id));

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((p) => next.delete(p.product_id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((p) => next.add(p.product_id));
        return next;
      });
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#47A141" />
        <Text style={{ color: "#47A141", marginTop: 12, fontSize: 16 }}>Ürünler yükleniyor...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.searchInput}
        placeholder="Ürün adı veya ID ile ara..."
        placeholderTextColor="#999"
        value={search}
        onChangeText={setSearch}
      />

      <View style={styles.actions}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortRow}>
          {([
            ["default", "Varsayılan"],
            ["critical", "🔴 Kritik Stok"],
            ["name-asc", "İsim A-Z"],
            ["name-desc", "İsim Z-A"],
            ["stock-asc", "Stok ↑"],
            ["stock-desc", "Stok ↓"],
          ] as const).map(([key, label]) => (
            <TouchableOpacity
              key={key}
              style={[styles.sortChip, sort === key && styles.sortChipActive]}
              onPress={() => setSort(key)}
            >
              <Text style={[styles.sortChipText, sort === key && styles.sortChipTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.selectAllBtn} onPress={toggleSelectAll}>
          <Text style={styles.selectAllText}>
            {allFilteredSelected ? "Seçimi Kaldır" : "Tümünü Seç"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.criticalBtn}
          onPress={() => {
            const criticalIds = enrichedProducts.filter((p) => isCritical(p)).map((p) => p.product_id);
            setSelected((prev) => {
              const next = new Set(prev);
              const allSelected = criticalIds.every((id) => next.has(id));
              criticalIds.forEach((id) => allSelected ? next.delete(id) : next.add(id));
              return next;
            });
          }}
        >
          <Text style={styles.criticalBtnText}>🔴 Kritik Stok</Text>
        </TouchableOpacity>

        {selected.size > 0 && (
          <TouchableOpacity
            style={styles.analyzeBtn}
            onPress={() => navigation.navigate("SelfPredictionResults", { productIds: Array.from(selected) })}
            activeOpacity={0.8}
          >
            <Text style={styles.analyzeBtnText}>Analiz Et ({selected.size})</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.product_id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const isSelected = selected.has(item.product_id);
          const severity = stockSeverity(item);
          const badgeStyle = severity === "critical" ? styles.stockLow : severity === "warning" ? styles.stockMid : styles.stockHigh;
          return (
            <TouchableOpacity
              style={[styles.card, isSelected && styles.cardSelected]}
              onPress={() => toggleSelect(item.product_id)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                {isSelected && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <View style={[styles.stockBadge, badgeStyle]}>
                <Text style={styles.stockLabel}>Stok</Text>
                <Text style={styles.stockNumber}>{item.stock}</Text>
              </View>
              <View style={styles.imageContainer}>
                <Image source={{ uri: item.image }} style={styles.productImage} resizeMode="contain" />
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.productTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.productId}>{item.product_id}</Text>
                {item.stock_remaining_day != null && (
                  <View style={styles.reportInfo}>
                    <View style={styles.reportRow}>
                      <View style={[styles.severityDot, severity === "critical" ? styles.dotRed : severity === "warning" ? styles.dotAmber : styles.dotGreen]} />
                      <Text style={[styles.remainingDays, severity === "critical" ? styles.textRed : severity === "warning" ? styles.textAmber : styles.textGreen]}>
                        {item.stock_remaining_day} gün kaldı
                      </Text>
                    </View>
                    {item.stock_end_date && (
                      <Text style={styles.reportDetail}>Bitiş: {item.stock_end_date}</Text>
                    )}
                    {item.critical_stock_value != null && (
                      <Text style={styles.reportDetail}>Kritik: {item.critical_stock_value}</Text>
                    )}
                  </View>
                )}
                <Text style={styles.price}>₺{item.price}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>Aramanızla eşleşen ürün bulunamadı.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f7f5", paddingHorizontal: 16, paddingTop: 8 },
  searchInput: { backgroundColor: "#fff", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, borderWidth: 1, borderColor: "#e5e7eb", marginBottom: 12 },
  actions: { flexDirection: "row", gap: 8, marginBottom: 10 },
  sortRow: { gap: 6, paddingRight: 8 },
  sortChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: "#e5e7eb", backgroundColor: "#fff" },
  sortChipActive: { backgroundColor: "#47A141", borderColor: "#47A141" },
  sortChipText: { fontSize: 12, fontWeight: "500", color: "#555" },
  sortChipTextActive: { color: "#fff" },
  selectAllBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: "#e5e7eb", backgroundColor: "#fff" },
  selectAllText: { fontSize: 13, fontWeight: "500", color: "#555" },
  criticalBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: "#fecaca", backgroundColor: "#fef2f2" },
  criticalBtnText: { fontSize: 13, fontWeight: "500", color: "#dc2626" },
  analyzeBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, backgroundColor: "#47A141", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  analyzeBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  list: { paddingBottom: 24 },
  row: { justifyContent: "space-between", marginBottom: 10 },
  card: { backgroundColor: "#fff", borderRadius: 12, width: "48%", borderWidth: 2, borderColor: "transparent", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2, overflow: "hidden" },
  cardSelected: { borderColor: "#47A141" },
  checkbox: { position: "absolute", top: 10, left: 10, zIndex: 10, width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: "#ccc", backgroundColor: "rgba(255,255,255,0.85)", justifyContent: "center", alignItems: "center" },
  checkboxSelected: { backgroundColor: "#47A141", borderColor: "#47A141" },
  checkmark: { color: "#fff", fontSize: 13, fontWeight: "bold" },
  imageContainer: { backgroundColor: "#fff", alignItems: "center", justifyContent: "center", paddingVertical: 20, paddingHorizontal: 16 },
  productImage: { width: "100%", height: 140 },
  cardBody: { padding: 12, borderTopWidth: 1, borderTopColor: "#f0f0f0" },
  productTitle: { fontSize: 13, fontWeight: "600", color: "#1a2e1a", marginBottom: 2, minHeight: 36, lineHeight: 18 },
  productId: { fontSize: 11, color: "#999", marginBottom: 8 },
  productMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  price: { fontSize: 18, fontWeight: "bold", color: "#1a2e1a", marginTop: 6 },
  stockBadge: { position: "absolute", top: 8, right: 8, zIndex: 10, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 2, elevation: 3 },
  stockLow: { backgroundColor: "#ef4444" },
  stockMid: { backgroundColor: "#f59e0b" },
  stockHigh: { backgroundColor: "#47A141" },
  stockLabel: { fontSize: 9, fontWeight: "500", color: "rgba(255,255,255,0.8)" },
  stockNumber: { fontSize: 18, fontWeight: "bold", color: "#fff", lineHeight: 22 },
  empty: { textAlign: "center", color: "#999", marginTop: 40, fontSize: 15 },
  reportInfo: { marginTop: 4, marginBottom: 4, gap: 2 },
  reportRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  severityDot: { width: 6, height: 6, borderRadius: 3 },
  dotRed: { backgroundColor: "#ef4444" },
  dotAmber: { backgroundColor: "#f59e0b" },
  dotGreen: { backgroundColor: "#22c55e" },
  remainingDays: { fontSize: 12, fontWeight: "600" },
  textRed: { color: "#dc2626" },
  textAmber: { color: "#d97706" },
  textGreen: { color: "#16a34a" },
  reportDetail: { fontSize: 10, color: "#999" },
});
