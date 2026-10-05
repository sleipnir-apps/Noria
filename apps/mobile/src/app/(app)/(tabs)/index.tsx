import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AnimatedIcon } from "@/components/animated-icon";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";

export default function HomeScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <AnimatedIcon />
        <ThemedText type="title" style={styles.title}>
          Accueil
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.description}>
          Utilise l’onglet Items pour tester le module CRUD.
        </ThemedText>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.four,
    gap: Spacing.two,
  },
  title: {
    textAlign: "center",
  },
  description: {
    textAlign: "center",
  },
});
