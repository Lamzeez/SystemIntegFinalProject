// bao-ride-driver/src/AuthContext.tsx
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
  const [loading, setLoading] = useState(true);

  // Load saved auth state on app start
  useEffect(() => {
    const loadAuth = async () => {
      try {
        const savedToken = await AsyncStorage.getItem("bao_driver_token");
        const savedUser = await AsyncStorage.getItem("bao_driver_user");

        if (savedToken && savedUser) {
          const parsedUser: User = JSON.parse(savedUser);
          setAuthToken(savedToken);
          setToken(savedToken);
          setUser(parsedUser);
        }
      } catch (e) {
        console.log("Failed to restore auth state", e);
      } finally {
        setLoading(false);
      }
    };

    loadAuth();
  }, []);

  const login = async (token: string, user: User) => {
    setAuthToken(token);
    setUser(user);
    setToken(token);

    await AsyncStorage.setItem("bao_driver_token", token);
    await AsyncStorage.setItem("bao_driver_user", JSON.stringify(user));
  };

  const logout = async () => {
    setAuthToken(null);
    setUser(null);
    setToken(null);

    await AsyncStorage.removeItem("bao_driver_token");
    await AsyncStorage.removeItem("bao_driver_user");
  };

  if (loading) {
    // simple loading placeholder; you can replace with a proper splash
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
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
};
