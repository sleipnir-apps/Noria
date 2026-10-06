import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Radius, Spacing } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useTheme } from "@/hooks/use-theme";

const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 30;

/**
 * Tag editor: text input + add button, removable chips. Max 10 tags of 30
 * characters, matching the contracts (user feedback stays in French).
 */
export function TagInput({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const theme = useTheme();
  const [draft, setDraft] = useState("");

  const add = (): void => {
    const tag = draft.trim();
    if (tag === "" || tags.includes(tag) || tags.length >= MAX_TAGS) return;
    onChange([...tags, tag]);
    setDraft("");
  };

  return (
    <View style={styles.container}>
      <View style={styles.adder}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={add}
          blurOnSubmit={false}
          placeholder="Ajouter une étiquette"
          placeholderTextColor={theme.textSecondary}
          maxLength={MAX_TAG_LENGTH}
          autoCapitalize="none"
          style={[styles.input, { color: theme.text, borderColor: theme.border }]}
          accessibilityLabel="Nouvelle étiquette"
        />
        <Pressable onPress={add} style={styles.addButton} hitSlop={4}>
          <Ionicons name="add" size={20} color={theme.primary} />
        </Pressable>
      </View>
      {tags.length > 0 && (
        <View style={styles.tags}>
          {tags.map((tag) => (
            <ThemedView key={tag} type="backgroundSelected" style={styles.tagChip}>
              <ThemedText type="small" themeColor="text" numberOfLines={1}>
                {tag}
              </ThemedText>
              <Pressable
                onPress={() => onChange(tags.filter((existing) => existing !== tag))}
                hitSlop={6}
              >
                <Ionicons name="close" size={14} color={theme.textSecondary} />
              </Pressable>
            </ThemedView>
          ))}
        </View>
      )}
      {tags.length >= MAX_TAGS && (
        <ThemedText type="small" themeColor="danger">
          10 étiquettes maximum
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  adder: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    fontSize: 14,
  },
  addButton: {
    padding: Spacing.one,
  },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.half,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
});
