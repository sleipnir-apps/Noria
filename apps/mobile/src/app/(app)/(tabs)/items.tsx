import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useState } from "react";
import type { Item } from "@template/contracts";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Colors, FontSizes, Spacing } from "@/constants/theme";
import { useCreateItem } from "@/features/items/use-create-item";
import { useDeleteItem } from "@/features/items/use-delete-item";
import { useItems } from "@/features/items/use-items";

type StatusFilter = "active" | "archived" | undefined;

export default function ItemsScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme === "dark" ? "dark" : "light"];

  const [title, setTitle] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>(undefined);
  const [pendingDelete, setPendingDelete] = useState<Item | null>(null);

  const { data, isLoading, isRefetching, refetch } = useItems({
    page: 1,
    limit: 20,
    search: search.trim() || undefined,
    status,
  });

  const { mutate: createItem, isPending: isCreating } = useCreateItem();
  const { mutate: deleteItem, isPending: isDeleting } = useDeleteItem();

  function handleCreate() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || isCreating) return;
    createItem({ title: trimmedTitle }, { onSuccess: () => setTitle("") });
  }

  function handleDelete(item: Item) {
    if (isDeleting) return;
    setPendingDelete(item);
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    deleteItem(pendingDelete.id, { onSettled: () => setPendingDelete(null) });
  }

  return (
    <ThemedView style={styles.container}>
      <Modal
        visible={pendingDelete !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingDelete(null)}
      >
        <View style={styles.modalOverlay}>
          <ThemedView type="backgroundElement" style={styles.modalCard}>
            <ThemedText type="subtitle">Supprimer l'item</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Supprimer « {pendingDelete?.title} » ?
            </ThemedText>
            <View style={styles.modalButtons}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setPendingDelete(null)}
                style={({ pressed }) => [
                  styles.modalButton,
                  { backgroundColor: colors.backgroundSelected, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <ThemedText>Annuler</ThemedText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={isDeleting}
                onPress={confirmDelete}
                style={({ pressed }) => [
                  styles.modalButton,
                  { backgroundColor: colors.danger, opacity: pressed || isDeleting ? 0.6 : 1 },
                ]}
              >
                <ThemedText style={{ color: "#fff", fontWeight: "700" }}>
                  {isDeleting ? "…" : "Supprimer"}
                </ThemedText>
              </Pressable>
            </View>
          </ThemedView>
        </View>
      </Modal>

      <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
        <ThemedView type="backgroundElement" style={styles.createCard}>
          <ThemedText type="subtitle">Créer un item</ThemedText>

          <View style={styles.createRow}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              onSubmitEditing={handleCreate}
              returnKeyType="done"
              placeholder="Titre de l'item"
              placeholderTextColor={colors.textSecondary}
              style={[
                styles.input,
                {
                  color: colors.text,
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                },
              ]}
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Créer un item"
              disabled={!title.trim() || isCreating}
              onPress={handleCreate}
              style={({ pressed }) => [
                styles.createButton,
                {
                  backgroundColor: colors.primary,
                  opacity: pressed || isCreating || !title.trim() ? 0.55 : 1,
                },
              ]}
            >
              <ThemedText style={styles.createButtonText}>
                {isCreating ? "..." : "Ajouter"}
              </ThemedText>
            </Pressable>
          </View>
        </ThemedView>

        <View style={styles.filters}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Rechercher"
            placeholderTextColor={colors.textSecondary}
            style={[
              styles.searchInput,
              {
                color: colors.text,
                borderColor: colors.border,
                backgroundColor: colors.background,
              },
            ]}
          />

          <View style={styles.filterButtons}>
            <FilterButton
              label="Tous"
              selected={status === undefined}
              onPress={() => setStatus(undefined)}
              colors={colors}
            />
            <FilterButton
              label="Actifs"
              selected={status === "active"}
              onPress={() => setStatus("active")}
              colors={colors}
            />
            <FilterButton
              label="Archivés"
              selected={status === "archived"}
              onPress={() => setStatus("archived")}
              colors={colors}
            />
          </View>
        </View>

        {isLoading ? (
          <View style={styles.loader}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={data?.data ?? []}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            refreshing={isRefetching}
            onRefresh={refetch}
            ListEmptyComponent={
              <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                Aucun item.
              </ThemedText>
            }
            ListFooterComponent={
              data?.meta ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.footer}>
                  {data.meta.total} item(s) — page {data.meta.page}/{data.meta.totalPages}
                </ThemedText>
              ) : null
            }
            renderItem={({ item }) => (
              <ThemedView type="backgroundElement" style={styles.itemRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Ouvrir ${item.title}`}
                  onPress={() => router.push(`/(app)/items/${item.id}`)}
                  style={({ pressed }) => [styles.itemContent, { opacity: pressed ? 0.65 : 1 }]}
                >
                  <ThemedText type="smallBold">{item.title}</ThemedText>

                  {item.description ? (
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                      {item.description}
                    </ThemedText>
                  ) : null}

                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor:
                          item.status === "active" ? colors.primary : colors.backgroundSelected,
                      },
                    ]}
                  >
                    <ThemedText
                      style={[
                        styles.statusText,
                        {
                          color: item.status === "active" ? colors.onPrimary : colors.textSecondary,
                        },
                      ]}
                    >
                      {item.status === "active" ? "Actif" : "Archivé"}
                    </ThemedText>
                  </View>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Supprimer ${item.title}`}
                  onPress={() => handleDelete(item)}
                  hitSlop={8}
                  style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                >
                  <ThemedText style={[styles.deleteIcon, { color: colors.danger }]}>×</ThemedText>
                </Pressable>
              </ThemedView>
            )}
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function FilterButton({
  label,
  selected,
  onPress,
  colors,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  colors: (typeof Colors)["light"] | (typeof Colors)["dark"];
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterButton,
        {
          backgroundColor: selected ? colors.primary : colors.backgroundElement,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <ThemedText
        style={{
          color: selected ? colors.onPrimary : colors.textSecondary,
          fontSize: FontSizes.xs,
          fontWeight: "600",
        }}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  createCard: {
    padding: Spacing.three,
    borderRadius: 12,
    gap: Spacing.two,
  },
  createRow: {
    flexDirection: "row",
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: Spacing.three,
    fontSize: FontSizes.md,
  },
  createButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    paddingHorizontal: Spacing.three,
  },
  createButtonText: {
    color: "#ffffff",
    fontWeight: "700",
  },
  filters: {
    gap: Spacing.two,
  },
  searchInput: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: Spacing.three,
    fontSize: FontSizes.sm,
  },
  filterButtons: {
    flexDirection: "row",
    gap: Spacing.two,
  },
  filterButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 999,
  },
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.four,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: 12,
  },
  itemContent: {
    flex: 1,
    gap: 3,
  },
  statusBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    marginTop: 2,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
  statusText: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
  },
  deleteIcon: {
    fontSize: FontSizes.xl,
    lineHeight: FontSizes.xl,
  },
  empty: {
    marginTop: Spacing.six,
    textAlign: "center",
  },
  footer: {
    marginTop: Spacing.two,
    textAlign: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCard: {
    width: "85%",
    maxWidth: 360,
    padding: Spacing.four,
    borderRadius: 16,
    gap: Spacing.three,
  },
  modalButtons: {
    flexDirection: "row",
    gap: Spacing.two,
    justifyContent: "flex-end",
  },
  modalButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 8,
  },
});
