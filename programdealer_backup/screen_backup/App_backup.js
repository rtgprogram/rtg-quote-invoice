// App.js
import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";

// Screens
import CreateQuoteScreen from "./screens/CreateQuoteScreen";
import QuotesListScreen from "./screens/QuotesListScreen";
import AdminPanelScreen from "./screens/AdminPanelScreen";

// Providers
import { SettingsProvider } from "./storage/settingsStore";
import { LanguageProvider, useLanguage } from "./src/i18n/LanguageContext";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
  const { t } = useLanguage(); // 👈 hook de idiomas

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#FF6600", // 👈 color activo (ejemplo)
        tabBarInactiveTintColor: "gray",
      }}
    >
      <Tab.Screen
        name="CreateQuote"
        component={CreateQuoteScreen}
        options={{
          tabBarLabel: t("createQuote"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="document-text-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="QuotesList"
        component={QuotesListScreen}
        options={{
          tabBarLabel: t("quoteLog"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="albums-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="AdminPanel"
        component={AdminPanelScreen}
        options={{
          tabBarLabel: t("adminPanel"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <LanguageProvider>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Main" component={MainTabs} />
          </Stack.Navigator>
        </NavigationContainer>
      </LanguageProvider>
    </SettingsProvider>
  );
}
