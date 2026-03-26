export const README_MD = `# Thoth Documentation

Welcome to Thoth, the archive of the human subconscious. This application allows you to record, archive, and analyze your dreams using advanced AI.

## Features

- **Voice Recording**: Capture your dreams immediately upon waking using high-quality voice recording.
- **AI Transcription**: Automatically transcribe your voice recordings into text using Gemini AI.
- **Subconscious Tagging**: AI-generated tags help you categorize and find patterns in your dreams.
- **Dream Archive**: A searchable history of all your recorded dreams.
- **Export & Share**: Export your dreams as beautiful images to share or keep in your personal journal.

## Getting Started

1. **Sign In**: Use your Google account to create a secure, private archive.
2. **Record**: Tap the microphone icon to start recording. Speak clearly about your dream.
3. **Save**: Once you stop recording, Thoth will transcribe and tag your dream automatically.
4. **Explore**: Use the search bar to find specific themes or symbols in your past dreams.
`;

export const QUOTA_MD = `# Quota & Usage

Thoth offers a flexible usage model to ensure everyone can archive their dreams.

## Daily Public Quota

- **Limit**: 3 dreams per day.
- **Reset**: The quota resets automatically at the start of each new day (UTC).
- **Usage**: This quota is shared among all users using the public Gemini API key provided by the developer.

## Personal API Key

If you'd like to remove the daily limit and have a dedicated, private usage quota, you can use your own Google AI Studio API key.

1. **Get a Key**: Visit [Google AI Studio](https://aistudio.google.com/app/apikey) to generate a free or paid API key.
2. **Configure**: Click the "Public Quota" button in the Thoth header.
3. **Select Key**: Choose your personal API key from the list.
4. **Unlimited Recording**: Once configured, you can record as many dreams as you like without daily limits.

## Privacy & Data

Your dreams are stored securely in your private Firestore database. Only you can access your dream archive. Recordings are processed by Gemini AI for transcription and tagging purposes only.
`;

export const PRIVACY_MD = `# Privacy & Security

Thoth is designed to be a private, secure archive for your subconscious thoughts.

## Data Storage

- **Dreams**: All dream transcripts, tags, and metadata are stored in a private Firestore database.
- **Audio**: Voice recordings are stored in a private Firebase Storage bucket.
- **Access**: Access to your dreams is restricted to your authenticated Google account only.

## AI Processing

- **Gemini AI**: Thoth uses Google's Gemini AI to transcribe and tag your dreams.
- **Data Usage**: Your dream data is only sent to the AI for processing during transcription and tagging.
- **Privacy**: Google's AI models are designed to respect user privacy. For more information, please refer to Google's AI privacy policies.

## Security

- **Authentication**: Thoth uses Firebase Authentication for secure, industry-standard login.
- **Data Encryption**: All data is encrypted in transit and at rest using standard cloud security protocols.
- **No Sharing**: Thoth does not share your dream data with any third parties without your explicit consent.
`;
