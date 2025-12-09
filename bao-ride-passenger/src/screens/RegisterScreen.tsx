// src/screens/RegisterScreen.tsx (PASSENGER)
import React, { useState } from "react";
import { View, Text, TextInput, Button, Alert } from "react-native";
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

  const handleRegister = async () => {
    if (!name || !email || !password) {
      setMsg("Name, email, and password are required.");
      return;
    }

    try {
      setMsg("");
      // IMPORTANT: this matches your backend route:
      // app.post('/auth/register/passenger', ...)
      await api.post("/auth/register/passenger", {
        name,
        email,
        phone: phone || null,
        password,
      });

      Alert.alert("Success", "Account created. You can now log in.");
      onSwitchToLogin();
    } catch (error: any) {
      console.log(error?.response?.data || error);
      setMsg("Registration failed. Email may already be registered.");
    }
  };

  return (
    <View style={{ padding: 20, marginTop: 20 }}>
      <Text style={{ fontSize: 28, fontWeight: "bold", marginBottom: 20 }}>
        Passenger Register
      </Text>

      <Text>Name</Text>
      <TextInput
        style={{ borderWidth: 1, padding: 8, marginBottom: 10 }}
        value={name}
        onChangeText={setName}
      />

      <Text>Phone (optional)</Text>
      <TextInput
        style={{ borderWidth: 1, padding: 8, marginBottom: 10 }}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
      />

      <Text>Email</Text>
      <TextInput
        style={{ borderWidth: 1, padding: 8, marginBottom: 10 }}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <Text>Password</Text>
      <TextInput
        style={{ borderWidth: 1, padding: 8, marginBottom: 10 }}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      {msg ? <Text style={{ color: "red", marginBottom: 10 }}>{msg}</Text> : null}

      <Button title="Register" onPress={handleRegister} />

      <View style={{ marginTop: 16 }}>
        <Button title="Back to Login" onPress={onSwitchToLogin} />
      </View>
    </View>
  );
}
