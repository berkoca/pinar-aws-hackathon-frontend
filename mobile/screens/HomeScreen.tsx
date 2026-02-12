import { Text, TouchableOpacity, Image, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../App";
import { LinearGradient } from "expo-linear-gradient";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

export default function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient
      colors={["#ffffff", "#ffffff", "#a8dda8"]}
      style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
    >
      <Image
        source={require("../assets/pinar_logo.png")}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={styles.title}>Demand Predict System</Text>
      <Text style={styles.description}>
        Gelecek haftalardaki satış taleplerini öngörün, depo stoklarınızı
        optimize edin. Yapay zeka destekli tahmin sistemiyle hangi üründen ne
        kadar stok çekmeniz gerektiğini önceden planlayın.
      </Text>
      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.navigate("SelfPrediction")}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonText}>Başla</Text>
        <Text style={styles.arrow}>→</Text>
      </TouchableOpacity>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 24 },
  logo: { width: 220, height: 100, marginBottom: 24 },
  title: { fontSize: 28, fontWeight: "bold", color: "#1a2e1a", marginBottom: 12, textAlign: "center" },
  description: { fontSize: 16, color: "#666", textAlign: "center", lineHeight: 24, marginBottom: 32, paddingHorizontal: 8 },
  button: { flexDirection: "row", alignItems: "center", backgroundColor: "#47A141", paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12, gap: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 3 },
  buttonText: { color: "#fff", fontSize: 18, fontWeight: "600" },
  arrow: { color: "#fff", fontSize: 20 },
});
