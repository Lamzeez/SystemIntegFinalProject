// @suggested_answers/passenger_AuthContext_FINAL.tsx.txt
// This file replaces bao-ride-passenger/src/AuthContext.tsx
// It now perfectly mimics the working logic from the driver app.

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { setAuthToken } from "./api";

type User = {
  id: number;
  name: string;
  email: string;
  role: string;
};

// The 'isLoading' property is no longer needed in the context value
type AuthContextType = {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadAuth = async () => {
      try {
        const savedToken = await AsyncStorage.getItem("bao_passenger_token");
        const savedUser = await AsyncStorage.getItem("bao_passenger_user");

        if (savedToken && savedUser) {
          const parsedUser: User = JSON.parse(savedUser);
          setAuthToken(savedToken);
          setToken(savedToken);
          setUser(parsedUser);
        }
      } catch (e) {
        console.error("Failed to restore passenger auth state", e);
      } finally {
        setIsLoading(false);
      }
    };

    loadAuth();
  }, []);

  const login = async (newToken: string, newUser: User) => {
    setAuthToken(newToken);
    setUser(newUser);
    setToken(newToken);

    await AsyncStorage.setItem("bao_passenger_token", newToken);
    await AsyncStorage.setItem("bao_passenger_user", JSON.stringify(newUser));
  };

  const logout = async () => {
    setAuthToken(null);
    setUser(null);
    setToken(null);
    await AsyncStorage.removeItem("bao_passenger_token");
    await AsyncStorage.removeItem("bao_passenger_user");
  };

  // --- THIS IS THE CRITICAL FIX ---
  // While loading, we return null, preventing any children from rendering.
  // This matches the behavior of your working driver app.
  if (isLoading) {
    return null;
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
};
