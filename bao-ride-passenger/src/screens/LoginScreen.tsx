// src/screens/LoginScreen.tsx (PASSENGER)
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import { getSocket } from "../socket";

export default function LoginScreen({
  onLoginRideCheck,
  onNavigateToRegister,
}: {
  onLoginRideCheck: (rideId: number | null) => void;
  onNavigateToRegister: () => void;
}) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  const handleLogin = async () => {
    try {
      const res = await api.post("/auth/login", { email, password });

      if (res.data.user.role !== "passenger") {
        setMsg("This account is not a passenger account.");
        return;
      }

      const token = res.data.token;

      // Check active ride using token directly (so we can still show Alert before login() unmounts this screen)
      const check = await api.get("/passenger/rides/current", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const rideId = check.data.ride?.id || null;

      setMsg("");

      // SAME “success modal” pattern as RegisterScreen (Alert.alert)
      Alert.alert("Login successful", "Welcome back! You’re now signed in.", [
        {
          text: "OK",
          onPress: async () => {
            await login(token, res.data.user);

            const socket = getSocket();
            socket.emit("auth:passenger", { token });

            onLoginRideCheck(rideId);
          },
        },
      ]);
    } catch (err) {
      console.log(err);
      setMsg("Login failed.");
    }
  };

  return (
    <View style={{ padding: 20, marginTop: 20 }}>
      <Text style={{ fontSize: 28, fontWeight: "bold", marginBottom: 20 }}>
        Passenger Login
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
        style={{ borderWidth: 1, padding: 8, marginBottom: 20 }}
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

      <View style={{ marginTop: 20 }}>
        <TouchableOpacity
          onPress={onNavigateToRegister}
          activeOpacity={0.7}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>Register</Text>
        </TouchableOpacity>
      </View>
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
