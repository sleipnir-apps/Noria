import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FontSizes, Radius, Spacing } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import { Toast } from "@/components/toast";
import { useTheme } from "@/hooks/use-theme";
import { useMe } from "@/features/auth/use-me";
import { ApiError } from "@/api/api-error";

/** Délai au-delà duquel on considère que le backend est lent. */
export const SLOW_TIMEOUT_MS = 5000;

/**
 * État réseau du premier appel backend (/auth/me) :
 * - `isSlow` : la requête est en vol depuis plus de 5 s
 * - `isError` : le backend est injoignable ou en erreur
 */
export function useBackendStatus() {
  const { isLoading, isError, error, refetch } = useMe();
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setIsSlow(false);
      return;
    }
    const timer = setTimeout(() => setIsSlow(true), SLOW_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isLoading]);

  // Une ApiError (ex: 401) vient du backend lui-même : il répond, donc pas
  // d'écran "Oups". Seule une erreur réseau (timeout, serveur down) compte.
  const isNetworkError = isError && !(error instanceof ApiError);

  return { isLoading, isError: isNetworkError, isSlow, refetch };
}

interface BackendLoadingScreenProps {
  isSlow: boolean;
}

/** Écran de chargement plein écran pendant que le premier appel est en vol. */
export function BackendLoadingScreen({ isSlow }: BackendLoadingScreenProps) {
  const theme = useTheme();

  return (
    <View style={[styles.loading, { backgroundColor: theme.background }]}>
      <ActivityIndicator size="large" color={theme.primary} />
      <Toast visible={isSlow} message="Backend lent... merci de patienter" />
    </View>
  );
}

interface BackendErrorScreenProps {
  onRefresh: () => void;
}

/** Écran "Oups" affiché quand le backend est injoignable, avec bouton Réessayer. */
export function BackendErrorScreen({ onRefresh }: BackendErrorScreenProps) {
  const theme = useTheme();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={styles.container}>
        <ThemedText type="subtitle" style={styles.title}>
          Oups ! 😕
        </ThemedText>
        <ThemedText style={styles.message}>
          Impossible de joindre le serveur. Vérifie ta connexion ou réessaie plus tard.
        </ThemedText>

        <TouchableOpacity
          style={[styles.button, { backgroundColor: theme.primary }]}
          onPress={onRefresh}
        >
          <ThemedText themeColor="onPrimary" style={styles.buttonText}>
            Réessayer
          </ThemedText>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.four,
    gap: Spacing.three,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.three,
  },
  title: {
    fontSize: FontSizes.xl,
    textAlign: "center",
  },
  message: {
    textAlign: "center",
  },
  button: {
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: Radius.md,
    minWidth: 160,
    alignItems: "center",
  },
  buttonText: {
    fontSize: FontSizes.md,
  },
});
