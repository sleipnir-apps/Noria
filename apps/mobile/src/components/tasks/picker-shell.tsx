import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Radius, Spacing } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";
import type { ReactNode } from "react";

/**
 * Shared shell of the date/time picker sheets: centered card on a dimmed
 * backdrop. The backdrop closes by tapping outside; the inner card swallows
 * press events (an empty onPress stops them from reaching the backdrop).
 */
export function PickerShell({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const theme = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer le sélecteur">
        <Pressable
          style={[styles.sheet, { backgroundColor: theme.background, borderColor: theme.border }]}
          onPress={() => {}}
        >
          <View style={styles.headerRow}>
            <ThemedText type="subtitle">{title}</ThemedText>
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Fermer">
              <Ionicons name="close" size={20} color={theme.textSecondary} />
            </Pressable>
          </View>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    padding: Spacing.four,
  },
  sheet: {
    width: "100%",
    maxWidth: 360,
    alignSelf: "center",
    gap: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.four,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
