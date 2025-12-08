// @suggested_answers/passenger_RegisterScreen_NEW.tsx.txt
// This file replaces bao-ride-passenger/src/screens/RegisterScreen.tsx

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

// Props are now a simple function
interface RegisterScreenProps {
  onSwitchToLogin: () => void;
}

export default function RegisterScreen({ onSwitchToLogin }: RegisterScreenProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleRegister = async () => {
    if (!name || !email || !password) {
      Alert.alert("Error", "Please fill in all fields.");
      return;
    }
    setLoading(true);
    try {
      const response = await api.post("/auth/register/passenger", {
        name,
        email,
        password,
      });
      const { token, user } = response.data;
      await login(token, user);
    } catch (error: any) {
      Alert.alert("Registration Failed", "This email may already be taken.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Passenger Registration</Text>
      <TextInput
        style={styles.input}
        placeholder="Name"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
      />
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
      <Button title="Register" onPress={handleRegister} disabled={loading} />
      {loading && <ActivityIndicator style={styles.spinner} size="small" />}
      <TouchableOpacity onPress={onSwitchToLogin}>
        <Text style={styles.loginText}>Already have an account? Login here.</Text>
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
      },
      title: {
        fontSize: 28,
        fontWeight: "bold",
        marginBottom: 30,
      },
      input: {
        width: "100%",
        height: 50,
        borderColor: "#ccc",
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 15,
        marginBottom: 15,
        fontSize: 16,
      },
      spinner: {
        marginTop: 20,
      },
      loginText: {
        marginTop: 25,
        color: '#007bff',
        fontSize: 16,
      },
});
