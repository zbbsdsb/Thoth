# Project Summary: Thoth (Powered by dreambase)

## 1. Project Overview
Thoth is a sophisticated, privacy-focused dream archiving system designed to capture the subconscious. Its core mission is to transform fragmented dream experiences into "atomic information," which is stored in **dreambase**—the underlying imagery database that serves as a foundational infrastructure for the future metaverse.

**dreambase is a core component of the Thoth ecosystem**, acting as the repository for all captured imagery and symbols.

## 2. Key Features Implemented
- **Multi-Modal Entry**: Support for both high-quality voice recording (with real-time visualization) and manual text entry.
- **AI-Powered Analysis**:
    - **Transcription**: Automatic speech-to-text using Gemini.
    - **Symbol Extraction**: Extraction of evocative keywords and subconscious symbols.
    - **Multi-Provider Support**: Users can choose between **Gemini**, **OpenAI**, **Deepseek**, and **Minimax** for their dream analysis.
- **Secure Cloud Storage**:
    - **Firebase Authentication**: Secure Google-based login.
    - **Firestore Database**: Real-time synchronization of dream logs and user profiles.
    - **Firebase Storage**: Secure hosting for audio recordings.
- **User Management**:
    - **Quota System**: Daily limits for public usage, with the ability for users to use their own API keys to bypass limits.
    - **Personal API Configuration**: Securely store and use personal keys for various AI providers.
- **Advanced UI/UX**:
    - **Brutalist/Minimalist Aesthetic**: A dark, high-contrast design inspired by modern creative tools.
    - **Interactive Archive**: Searchable list of dreams with detailed views and deletion capabilities.
    - **Export Functionality**: Ability to export dream entries as high-quality images for sharing or personal keeping.
    - **Responsive Design**: Fully functional across desktop and mobile devices.

## 3. Technical Stack
- **Frontend**: React 18, TypeScript, Vite.
- **Styling**: Tailwind CSS, Lucide Icons, Framer Motion (for animations).
- **Backend/Infrastructure**: Firebase (Auth, Firestore, Storage).
- **AI Integration**: @google/genai (Gemini), Fetch API (OpenAI, Deepseek, Minimax).

---

# Next Steps & Future Roadmap

## Phase 1: Enhanced Visualization & Analysis
- [ ] **Dream-to-Image Generation**: Use Gemini 2.5 Flash Image or Imagen to generate a visual representation of the dream based on the transcript.
- [ ] **Subconscious Patterns**: Implement a "Symbol Cloud" or analytics dashboard to track recurring themes and symbols over time.
- [ ] **Sentiment Analysis**: Add emotional tone detection to categorize dreams by mood (e.g., Lucid, Nightmare, Peaceful).

## Phase 2: Social & Collaborative Features
- [ ] **Public/Private Toggle**: Allow users to share specific dreams to a "Global Dream Stream" (anonymously).
- [ ] **Dream Circles**: Small, private groups for sharing and discussing dreams with friends.
- [ ] **AI Dream Interpretation**: Add a dedicated "Oracle" mode where the AI provides deeper psychological interpretations based on Jungian or Freudian archetypes.

## Phase 3: Mobile & Offline Experience
- [ ] **PWA Support**: Enable "Install to Home Screen" and offline recording capabilities.
- [ ] **Native Mobile App**: Explore React Native or Capacitor for a true mobile experience with push notifications for "Dream Reminders."

## Phase 4: Security & Privacy Hardening
- [ ] **End-to-End Encryption**: Optional client-side encryption for dream transcripts for ultimate privacy.
- [ ] **Advanced Security Rules**: Further refine Firestore rules for complex sharing scenarios.
