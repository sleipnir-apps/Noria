import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Colors, FontSizes, Radius, Spacing } from "@/constants/theme";
import { useItem } from "@/features/items/use-item";
import { useUpdateItem } from "@/features/items/use-update-item";
import { useDeleteItem } from "@/features/items/use-delete-item";

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme === "dark" ? "dark" : "light"];

  const { data: item, isLoading } = useItem(id);
  const { mutate: update, isPending: isUpdating } = useUpdateItem(id);
  const { mutate: remove, isPending: isDeleting } = useDeleteItem();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (item) {
      setTitle(item.title);
      setDescription(item.description ?? "");
    }
  }, [item]);

  function handleSave() {
    update({ title, description: description || undefined });
  }

  function handleToggleStatus() {
    if (!item) return;
    update({ status: item.status === "active" ? "archived" : "active" });
  }

  function handleDelete() {
    remove(id, { onSuccess: () => router.back() });
  }

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </ThemedView>
    );
  }

  if (!item) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText themeColor="textSecondary">Item introuvable.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
        {/* Champs */}
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="small" themeColor="textSecondary">
            Titre
          </ThemedText>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
            value={title}
            onChangeText={setTitle}
            placeholder="Titre"
            placeholderTextColor={colors.textSecondary}
          />
          <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: Spacing.two }}>
            Description
          </ThemedText>
          <TextInput
            style={[
              styles.input,
              styles.multiline,
              { color: colors.text, borderColor: colors.border },
            ]}
            value={description}
            onChangeText={setDescription}
            placeholder="Description (optionnel)"
            placeholderTextColor={colors.textSecondary}
            multiline
            numberOfLines={3}
          />
        </ThemedView>

        {/* Statut */}
        <Pressable
          onPress={handleToggleStatus}
          style={({ pressed }) => [
            styles.statusButton,
            {
              backgroundColor: item.status === "active" ? colors.backgroundElement : colors.primary,
              opacity: pressed || isUpdating ? 0.7 : 1,
            },
          ]}
        >
          <ThemedText
            style={{
              color: item.status === "active" ? colors.textSecondary : colors.onPrimary,
              fontWeight: "600",
            }}
          >
            {item.status === "active" ? "Archiver" : "Réactiver"}
          </ThemedText>
        </Pressable>

        {/* Métadonnées */}
        <View style={styles.meta}>
          <ThemedText type="small" themeColor="textSecondary">
            Créé le {new Date(item.createdAt).toLocaleDateString("fr-FR")}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Modifié le {new Date(item.updatedAt).toLocaleDateString("fr-FR")}
          </ThemedText>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [
              styles.saveButton,
              { backgroundColor: colors.primary, opacity: pressed || isUpdating ? 0.7 : 1 },
            ]}
            onPress={handleSave}
            disabled={isUpdating}
          >
            <ThemedText style={{ color: colors.onPrimary, fontWeight: "600" }}>
              {isUpdating ? "Enregistrement…" : "Enregistrer"}
            </ThemedText>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.deleteButton,
              { backgroundColor: colors.danger, opacity: pressed || isDeleting ? 0.7 : 1 },
            ]}
            onPress={handleDelete}
            disabled={isDeleting}
          >
            <ThemedText style={{ color: "#fff", fontWeight: "600" }}>
              {isDeleting ? "Suppression…" : "Supprimer"}
            </ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  safeArea: { flex: 1, padding: Spacing.four, gap: Spacing.three },
  card: { padding: Spacing.three, borderRadius: Radius.lg, gap: 4 },
  input: { fontSize: FontSizes.md, borderBottomWidth: 1, paddingVertical: 4 },
  multiline: { minHeight: 60, textAlignVertical: "top" },
  statusButton: { padding: Spacing.three, borderRadius: Radius.md, alignItems: "center" },
  meta: { gap: 4 },
  actions: { marginTop: "auto", gap: Spacing.two },
  saveButton: { padding: Spacing.three, borderRadius: Radius.md, alignItems: "center" },
  deleteButton: { padding: Spacing.three, borderRadius: Radius.md, alignItems: "center" },
});
