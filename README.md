# Thoth: The Global Dream Archive

Thoth is a real-time, collaborative dream archiving platform. It visualizes the collective subconscious of humanity through an interactive world map, transcribing and analyzing dreams from users across the globe.

## Features

- **Voice-to-Dream**: Real-time transcription of dream narratives.
- **Global Dream Map**: Interactive D3.js visualization showing dream activity by country.
- **Subconscious Pulse**: Visual indicators of live archive updates.
- **Personal Archive**: Secure storage for your own dream history.
- **Imagery Hall**: Explore the collective symbols and themes emerging from the global archive.

## Tech Stack

- **Frontend**: React, Vite, Tailwind CSS, Framer Motion
- **Visualization**: D3.js, TopoJSON
- **Backend**: Firebase (Firestore, Authentication)
- **Icons**: Lucide React

## Deployment Guide

To deploy this project as a production-ready global application, follow these steps:

### 1. Firebase Setup
1. Create a new project in the [Firebase Console](https://console.firebase.google.com/).
2. Enable **Firestore Database** in production mode.
3. Enable **Google Authentication**.
4. Register a Web App and copy the configuration object.

### 2. Environment Variables
Create a `.env` file in the root directory (or set these in your hosting provider's dashboard):
```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_FIRESTORE_DATABASE_ID=(default)
```

### 3. Hosting
We recommend **Vercel** or **Netlify** for global delivery:
1. Connect your GitHub repository.
2. Set the build command to `npm run build`.
3. Set the output directory to `dist`.
4. Add the environment variables listed above.

### 4. Security Rules
Deploy the `firestore.rules` file to your Firebase project to ensure data integrity and privacy.

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.
