import { zodResolver } from "@hookform/resolvers/zod";
import { LoginInputSchema, type LoginInput } from "@template/contracts";
import { useRouter } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { SafeAreaView } from "react-native-safe-area-context";
import React from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";

import { useLogin } from "@/features/auth/use-login";
import { FontSizes, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { ThemedText } from "@/components/themed-text";

export default function LoginScreen() {
  const router = useRouter();
  const { mutate: login, isPending, error } = useLogin();
  const theme = useTheme();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(LoginInputSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  function onSubmit(data: LoginInput) {
    login(data, {
      onSuccess: () => router.replace("/"),
    });
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={styles.container}>
        <ThemedText type="title" style={styles.title}>
          Connexion
        </ThemedText>

        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, value } }) => (
            <View style={styles.field}>
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
              {errors.email && (
                <Text style={[styles.errorText, { color: theme.danger }]}>
                  {errors.email.message}
                </Text>
              )}
            </View>
          )}
        />

        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, value } }) => (
            <View style={styles.field}>
              <TextInput
                style={[styles.input, { color: theme.text, borderColor: theme.border }]}
                placeholder="Mot de passe"
                secureTextEntry
                autoComplete="current-password"
                textContentType="password"
                onChangeText={onChange}
                value={value ?? ""}
                placeholderTextColor={theme.textSecondary}
              />
              {errors.password && (
                <Text style={[styles.errorText, { color: theme.danger }]}>
                  {errors.password.message}
                </Text>
              )}
            </View>
          )}
        />

        {error && <Text style={[styles.errorText, { color: theme.danger }]}>{error.message}</Text>}

        <TouchableOpacity
          style={[
            styles.button,
            { backgroundColor: theme.primary },
            isPending && styles.buttonDisabled,
          ]}
          onPress={handleSubmit(onSubmit)}
          disabled={isPending}
        >
          {isPending ? (
            <ActivityIndicator color={theme.onPrimary} />
          ) : (
            <Text style={[styles.buttonText, { color: theme.onPrimary }]}>Se connecter</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push("/(auth)/register")} style={styles.link}>
          <ThemedText type="small" themeColor="primary">
            Pas encore de compte ? S'inscrire
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
    padding: Spacing.four,
    justifyContent: "center",
    gap: Spacing.three,
  },
  title: {
    textAlign: "center",
    marginBottom: Spacing.four,
  },
  field: {
    marginBottom: Spacing.two,
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
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: FontSizes.md,
  },
  link: {
    marginTop: Spacing.two,
    alignItems: "center",
  },
  errorText: {
    marginTop: 6,
  },
});
