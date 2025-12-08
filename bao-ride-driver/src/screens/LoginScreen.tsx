// src/screens/LoginScreen.tsx (DRIVER)
import React, { useState } from "react";
import { View, Text, TextInput, Button } from "react-native";
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

      // Save auth state
      await login(res.data.token, res.data.user);

      // Authenticate this socket as a driver
      const socket = getSocket();
      socket.emit("auth:driver", { token: res.data.token });

      // Check if driver already has an active ride
      try {
        const current = await api.get("/driver/rides/current");
        onLoginRideCheck(current.data.ride?.id || null);
      } catch (e) {
        console.log("Failed to check current ride after login", e);
        onLoginRideCheck(null);
      }

      setMsg("");
    } catch (err: any) {
      console.log("Driver login failed", err.response?.data || err);
      setMsg("Login failed.");
    }
  };

  return (
    <View style={{ padding: 20 }}>
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

      {msg ? <Text style={{ color: "red" }}>{msg}</Text> : null}

      <Button title="Login" onPress={handleLogin} />
    </View>
  );
}
