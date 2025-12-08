// App.tsx (in bao-ride-passenger)
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
