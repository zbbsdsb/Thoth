# Privacy & Security

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
