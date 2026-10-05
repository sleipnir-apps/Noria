import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text } from "react-native";

import { FontSizes, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

interface ToastProps {
  visible: boolean;
  message: string;
}

export function Toast({ visible, message }: ToastProps) {
  const theme = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: visible ? 1 : 0, duration: 250, useNativeDriver: true }),
      Animated.timing(translateY, {
        toValue: visible ? 0 : -8,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, opacity, translateY]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.toast,
        {
          backgroundColor: theme.backgroundElement,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <Text style={[styles.message, { color: theme.text }]}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    top: Spacing.four,
    alignSelf: "center",
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Radius.md,
    maxWidth: "90%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  message: {
    fontSize: FontSizes.sm,
    textAlign: "center",
  },
});
