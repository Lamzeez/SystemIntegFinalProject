// src/screens/RegisterScreen.tsx (PASSENGER)
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from "react-native";
import { api } from "../api";

interface RegisterScreenProps {
  onSwitchToLogin: () => void;
}

export default function RegisterScreen({ onSwitchToLogin }: RegisterScreenProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  // Simple, not-too-strict email regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const handleRegister = async () => {
    setMsg("");

    // Basic required fields
    if (!name.trim() || !email.trim() || !password) {
      setMsg("Please fill in name, email, and password.");
      return;
    }

    // Email format check (not too strict)
    if (!emailRegex.test(email.trim())) {
      setMsg("Please enter a valid email address.");
      return;
    }

    // Password length check
    if (password.length < 8) {
      setMsg("Password must be at least 8 characters.");
      return;
    }

    try {
      const res = await api.post("/auth/register/passenger", {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        password,
      });

      if (res.data?.token) {
        Alert.alert(
          "Registration successful",
          "You can now log in with your new account.",
          [
            {
              text: "OK",
              onPress: onSwitchToLogin,
            },
          ]
        );
      } else {
        setMsg("Registration succeeded but no token was returned.");
      }
    } catch (e: any) {
      console.log("Register error", e?.response || e);
      const apiMessage =
        e?.response?.data?.error || "Failed to register. Please try again.";
      setMsg(apiMessage);
    }
  };

  return (
    <View style={{ flex: 1, padding: 20, marginTop: 20 }}>
      <Text style={{ fontSize: 28, fontWeight: "bold", marginBottom: 16 }}>
        Passenger Registration
      </Text>

      <Text>Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Enter your name"
      />

      <Text style={{ marginTop: 8 }}>Phone (optional)</Text>
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        placeholder="09xxxxxxxxx"
        keyboardType="phone-pad"
      />

      <Text style={{ marginTop: 8 }}>Email</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <Text style={{ marginTop: 8 }}>Password</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder="At least 8 characters"
        secureTextEntry
      />

      {msg ? (
        <Text style={{ color: "red", marginBottom: 10, marginTop: 8 }}>
          {msg}
        </Text>
      ) : null}

      <TouchableOpacity
        onPress={handleRegister}
        activeOpacity={0.7}
        style={styles.primaryButton}
      >
        <Text style={styles.primaryButtonText}>Register</Text>
      </TouchableOpacity>

      <View style={{ marginTop: 16 }}>
        <TouchableOpacity
          onPress={onSwitchToLogin}
          activeOpacity={0.7}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>Back to Login</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginTop: 4,
  },
  primaryButton: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 4,
    alignItems: "center",
    backgroundColor: "#1976D2",
  },
  primaryButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
  },
  secondaryButton: {
    paddingVertical: 12,
    borderRadius: 4,
    alignItems: "center",
    backgroundColor: "#EEEEEE",
  },
  secondaryButtonText: {
    color: "#1976D2",
    fontWeight: "600",
    fontSize: 15,
  },
});
