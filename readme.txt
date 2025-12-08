Command flow

Terminal 1 (backend):
cd bao-ride-backend
npm run dev


Terminal 2 (ngrok, optional but useful):
ngrok http 4000


Terminal 3 (admin UI):
cd bao-ride-admin
npm run dev


Then open http://localhost:5173/ in your browser.




===================================================
Pre-reqs:
AsyncStorage:
npm install @react-native-async-storage/async-storage

Axios:
npm install axios

React-native-maps and Expo-location:
npm install react-native-maps expo-location

set location permission in app.json:
"android": {
  "permissions": ["ACCESS_FINE_LOCATION"]
},
"ios": {
  "infoPlist": {
    "NSLocationWhenInUseUsageDescription": "This app uses your location to find nearby rides."
  }
}