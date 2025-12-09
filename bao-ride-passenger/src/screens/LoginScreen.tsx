// src/screens/LoginScreen.tsx
import React, { useState } from "react";
import { View, Text, TextInput, Button } from "react-native";
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

      await login(res.data.token, res.data.user);

      const socket = getSocket();
      socket.emit("auth:passenger", { token: res.data.token });

      const check = await api.get("/passenger/rides/current");
      onLoginRideCheck(check.data.ride?.id || null);

      setMsg("");
    } catch (err) {
      console.log(err);
      setMsg("Login failed.");
    }
  };

  return (
    <View style={{ padding: 20 }}>
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
        style={{ borderWidth: 1, padding: 8, marginBottom: 10 }}
        value={password}
        secureTextEntry
        onChangeText={setPassword}
      />

      {msg ? <Text style={{ color: "red", marginBottom: 10 }}>{msg}</Text> : null}

      <Button title="Login" onPress={handleLogin} />

      <View style={{ marginTop: 20 }}>
        <Button title="Register" onPress={onNavigateToRegister} />
      </View>
    </View>
  );
}
