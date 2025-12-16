// src/screens/LoginScreen.tsx (DRIVER)
import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import { getSocket } from "../socket";

export default function LoginScreen({
  onLoginRideCheck,
}: {
  onLoginRideCheck: (rideId: number | null) => void;
}) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  const handleLogin = async () => {
    try {
      const res = await api.post("/auth/login", { email, password });

      if (res.data.user.role !== "driver") {
        setMsg("This account is not a driver account.");
        return;
      }

      const token = res.data.token;

      // Check active ride BEFORE login() (so this screen stays mounted for the Alert)
      let rideId: number | null = null;
      try {
        const current = await api.get("/driver/rides/current", {
          headers: { Authorization: `Bearer ${token}` },
        });
        rideId = current.data.ride?.id || null;
      } catch (e) {
        console.log("Failed to check current ride after login", e);
        rideId = null;
      }

      setMsg("");

      // SAME success modal style as your passenger Register/Login (Alert.alert)
      Alert.alert("Login successful", "Welcome back! You’re now signed in.", [
        {
          text: "OK",
          onPress: async () => {
            await login(token, res.data.user);

            const socket = getSocket();
            console.log("Driver login: emitting auth:driver");
            socket.emit("auth:driver", { token });

            onLoginRideCheck(rideId);
          },
        },
      ]);
    } catch (err: any) {
      console.log("Driver login failed", err.response?.data || err);
      setMsg("Login failed.");
    }
  };


  return (
    <View style={{ padding: 20, marginTop: 20 }}>
      <Text style={{ fontSize: 28, fontWeight: "bold", marginBottom: 20 }}>
        Driver Login
      </Text>

      <Text>Email</Text>
      <TextInput
        style={{ borderWidth: 1, padding: 8, marginBottom: 10 }}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
      />

      <Text>Password</Text>
      <TextInput
        style={{ borderWidth: 1, padding: 8, marginBottom: 10 }}
        value={password}
        secureTextEntry
        onChangeText={setPassword}
      />

      {msg ? <Text style={{ color: "red", marginBottom: 10 }}>{msg}</Text> : null}

      <TouchableOpacity
        onPress={handleLogin}
        activeOpacity={0.7}
        style={styles.primaryButton}
      >
        <Text style={styles.primaryButtonText}>Login</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  primaryButton: {
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
});
