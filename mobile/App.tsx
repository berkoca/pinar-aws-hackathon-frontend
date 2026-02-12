import { StatusBar } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import HomeScreen from "./screens/HomeScreen";
import SelfPredictionScreen from "./screens/SelfPredictionScreen";
import SelfPredictionResultsScreen from "./screens/SelfPredictionResultsScreen";

export type RootStackParamList = {
  Home: undefined;
  SelfPrediction: undefined;
  SelfPredictionResults: { productIds: string[] };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor="#f5f7f5" />
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: "#fff" },
            headerTintColor: "#47A141",
            headerTitleStyle: { fontWeight: "600", color: "#1a2e1a" },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: "#f5f7f5" },
          }}
        >
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="SelfPrediction"
            component={SelfPredictionScreen}
            options={{ title: "Ürün Seçimi" }}
          />
          <Stack.Screen
            name="SelfPredictionResults"
            component={SelfPredictionResultsScreen}
            options={{ title: "Tahmin Sonuçları" }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
