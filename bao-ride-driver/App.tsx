// App.tsx (at project root, not inside src)
import React from "react";
import { AuthProvider } from "./src/AuthContext";
import AppNavigator from "./src/AppNavigator";

export default function App() {
  return (
    <AuthProvider>
      <AppNavigator />
    </AuthProvider>
  );
}
