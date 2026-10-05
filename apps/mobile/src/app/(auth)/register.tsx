import { zodResolver } from "@hookform/resolvers/zod";
import { RegisterInputSchema, type RegisterInput } from "@template/contracts";
import { useRouter } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { StyleSheet, TextInput, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { useRegister } from "@/features/auth/use-register";
import { FontSizes, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export default function RegisterScreen() {
  const router = useRouter();
  const { mutate: register, isPending, error } = useRegister();
  const theme = useTheme();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(RegisterInputSchema),
    defaultValues: {
      email: "",
      displayName: "",
      password: "",
    },
  });

  function onSubmit(data: RegisterInput) {
    register(data, {
      onSuccess: () => router.replace("/"),
    });
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ThemedText type="title" style={styles.title}>
        Inscription
      </ThemedText>

      <Controller
        control={control}
        name="displayName"
        render={({ field: { onChange, value } }) => (
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            placeholder="Nom d'affichage"
            autoComplete="name"
            textContentType="name"
            onChangeText={onChange}
            value={value ?? ""}
            placeholderTextColor={theme.textSecondary}
          />
        )}
      />
      {errors.displayName && (
        <ThemedText type="small" themeColor="danger">
          {errors.displayName.message}
        </ThemedText>
      )}

      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, value } }) => (
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            placeholder="Email"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            keyboardType="email-address"
            importantForAutofill="yes"
            onChangeText={onChange}
            value={value ?? ""}
            placeholderTextColor={theme.textSecondary}
          />
        )}
      />
      {errors.email && (
        <ThemedText type="small" themeColor="danger">
          {errors.email.message}
        </ThemedText>
      )}

      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, value } }) => (
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            placeholder="Mot de passe"
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            onChangeText={onChange}
            value={value ?? ""}
            placeholderTextColor={theme.textSecondary}
          />
        )}
      />
      {errors.password && (
        <ThemedText type="small" themeColor="danger">
          {errors.password.message}
        </ThemedText>
      )}

      {error && (
        <ThemedText type="small" themeColor="danger">
          {error.message}
        </ThemedText>
      )}

      <TouchableOpacity
        style={[styles.button, { backgroundColor: theme.primary }]}
        onPress={handleSubmit(onSubmit)}
        disabled={isPending}
      >
        <Text style={[styles.buttonText, { color: theme.onPrimary }]}>
          {isPending ? "Inscription..." : "S'inscrire"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push("/(auth)/login")} style={styles.link}>
        <ThemedText type="small" themeColor="primary">
          Déjà un compte ? Se connecter
        </ThemedText>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.three,
    justifyContent: "center",
  },
  title: {
    textAlign: "center",
    marginBottom: Spacing.four,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    padding: Spacing.three,
    fontSize: FontSizes.md,
  },
  button: {
    padding: Spacing.three,
    borderRadius: Radius.sm,
    alignItems: "center",
    marginTop: Spacing.two,
  },
  buttonText: {
    fontSize: FontSizes.md,
  },
  link: {
    marginTop: Spacing.two,
    alignItems: "center",
  },
});
