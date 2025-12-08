// @suggested_answers/passenger_app_LoginScreen_NO_NAV.tsx.txt
// This file replaces bao-ride-passenger/src/screens/LoginScreen.tsx

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity
} from "react-native";
import { useAuth } from "../AuthContext";
import { api } from "../api";

// The props are now simpler, just a function to call
interface LoginScreenProps {
  onSwitchToRegister: () => void;
}

export default function LoginScreen({ onSwitchToRegister }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please enter both email and password.");
      return;
    }

    setLoading(true);
    try {
      const response = await api.post("/auth/login", { email, password });
      const { token, user } = response.data;

      if (user.role !== 'passenger') {
        Alert.alert("Login Failed", "This account is not a passenger account.");
        setLoading(false);
        return;
      }

      // login() will cause the user to be set in context, and AppNavigator
      // will automatically show the HomeScreen.
      await login(token, user);

    } catch (error: any) {
      console.error("Login error:", error.response?.data || error.message);
      Alert.alert(
        "Login Failed",
        error.response?.data?.error || "Invalid credentials."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Passenger Login</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <Button title="Login" onPress={handleLogin} disabled={loading} />

      {loading && <ActivityIndicator style={styles.spinner} size="small" />}

      {/* This now calls the function passed via props */}
      <TouchableOpacity onPress={onSwitchToRegister}>
        <Text style={styles.registerText}>Don't have an account? Register here.</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: '#f8f9fa',
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 30,
    color: '#343a40',
  },
  input: {
    width: "100%",
    height: 50,
    borderColor: "#ced4da",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    backgroundColor: 'white',
    fontSize: 16,
  },
  spinner: {
    marginTop: 20,
  },
  registerText: {
    marginTop: 25,
    color: '#007bff',
    fontSize: 16,
  },
});
