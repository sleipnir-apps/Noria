import { ActivityIndicator, FlatList, Pressable, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { OfflineBanner } from "@/components/offline-banner";
import { useUsers } from "@/features/admin/use-users";
import { useLogout } from "@/features/auth/use-logout";
import { useMe } from "@/features/auth/use-me";
import { syncQueueStore } from "@/features/sync/sync-queue";
import { tasksStore } from "@/features/tasks/tasks.store";

export default function ProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: meData } = useMe();
  const user = meData?.user;
  const isAdmin = user?.role === "admin";

  const { data: usersData, isLoading: isLoadingUsers } = useUsers(1, isAdmin);

  const { mutate: logout, isPending: isLoggingOut } = useLogout();

  function handleLogout() {
    logout(undefined, {
      onSettled: () => {
        void syncQueueStore.reset();
        void tasksStore.replaceAll([]);
        queryClient.clear();
        router.replace("/(auth)/login");
      },
    });
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
        <OfflineBanner />
        <ThemedText type="subtitle">Informations personnelles</ThemedText>
        <ThemedView type="backgroundElement" style={styles.section}>
          {user ? (
            <>
              <ThemedText type="smallBold">{user.displayName}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {user.email}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Rôle : {user.role}
              </ThemedText>
            </>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              Chargement du profil…
            </ThemedText>
          )}
        </ThemedView>

        {isAdmin ? (
          <ThemedView style={styles.adminSection}>
            <ThemedText type="subtitle">Utilisateurs</ThemedText>

            {isLoadingUsers ? (
              <ActivityIndicator />
            ) : (
              <FlatList
                data={usersData?.data ?? []}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.usersList}
                ListEmptyComponent={
                  <ThemedText type="small" themeColor="textSecondary">
                    Aucun utilisateur.
                  </ThemedText>
                }
                ListFooterComponent={
                  usersData?.meta ? (
                    <ThemedText type="small" themeColor="textSecondary" style={styles.usersFooter}>
                      {usersData.meta.total} utilisateur(s) — page {usersData.meta.page}/
                      {usersData.meta.totalPages}
                    </ThemedText>
                  ) : null
                }
                renderItem={({ item }) => (
                  <ThemedView type="backgroundElement" style={styles.userRow}>
                    <ThemedText type="smallBold">{item.displayName}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {item.email}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {item.role}
                    </ThemedText>
                  </ThemedView>
                )}
              />
            )}
          </ThemedView>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Se déconnecter"
          disabled={isLoggingOut}
          onPress={handleLogout}
          style={({ pressed }) => [
            styles.logoutButton,
            { opacity: pressed || isLoggingOut ? 0.55 : 1 },
          ]}
        >
          <ThemedText style={styles.logoutText}>
            {isLoggingOut ? "Déconnexion…" : "Se déconnecter"}
          </ThemedText>
        </Pressable>
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
    padding: Spacing.four,
    gap: Spacing.four,
  },
  section: {
    padding: Spacing.three,
    borderRadius: 12,
    gap: Spacing.two,
  },
  adminSection: {
    flex: 1,
    gap: Spacing.two,
  },
  usersList: {
    gap: Spacing.two,
    paddingBottom: Spacing.two,
  },
  userRow: {
    padding: Spacing.three,
    borderRadius: 12,
    gap: 2,
  },
  usersFooter: {
    marginTop: Spacing.two,
    textAlign: "center",
  },
  logoutButton: {
    alignItems: "center",
    backgroundColor: "#FF3B30",
    borderRadius: 8,
    padding: Spacing.three,
  },
  logoutText: {
    color: "#ffffff",
    fontWeight: "600",
  },
});
