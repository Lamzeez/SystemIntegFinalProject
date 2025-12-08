// @answersHere/passenger_HomeScreen_NO_MAP.tsx.txt
// This is a temporary debugging version of HomeScreen.tsx
// It removes all map-related code to isolate the "codegenNativeComponent" error.

import React from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import { useAuth } from '../AuthContext';
// import { api } from '../api'; // api is not used in this simplified version

// Props are now simpler
interface HomeScreenProps {
// onRideAssigned: (id: number) => void; // No longer needed for this debug step
}

export default function HomeScreen({ /* onRideAssigned */ }: HomeScreenProps) {
const { user, logout } = useAuth();

return (
<View style={styles.container}>
<Text style={styles.title}>Hello, {user?.name}!</Text>
<Text style={styles.subtitle}>This is the Home Screen (Map removed for debugging).</Text>

<View style={styles.logoutButtonContainer}>
<Button title="Logout" onPress={logout} color="#dc3545" />
</View>
</View>
);
}

const styles = StyleSheet.create({
container: {
flex: 1,
justifyContent: 'center',
alignItems: 'center',
backgroundColor: '#add8e6', // Light Blue to clearly show this screen renders
},
title: {
fontSize: 26,
fontWeight: 'bold',
marginBottom: 10,
color: '#333',
textAlign: 'center',
},
subtitle: {
fontSize: 18,
color: '#666',
marginBottom: 30,
textAlign: 'center',
},
logoutButtonContainer: {
marginTop: 40,
width: '80%',
}
});