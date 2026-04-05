# Quota & Usage

Thoth offers a flexible usage model to ensure everyone can archive their dreams.

## Daily Public Quota

- **Limit**: 3 dreams per day.
- **Reset**: The quota resets automatically at the start of each new day (UTC).
- **Usage**: This quota is shared among all users using the public Gemini API key provided by the developer.

## Personal API Key

If you'd like to remove the daily limit and have a dedicated, private usage quota, you can use your own API keys.

### Google AI Studio Key
1. **Get a Key**: Visit [Google AI Studio](https://aistudio.google.com/app/apikey) to generate a free or paid API key.
2. **Configure**: Click the "Public Quota" button in the Thoth header.
3. **Select Key**: Choose your personal API key from the list.

### Minimax API Key (Optional)
For advanced synthesis or to bypass public limits, you can provide your own Minimax API key in the **Settings** tab. This allows for private, high-priority processing of your dream data.

1. **Get a Key**: Visit the Minimax developer portal.
2. **Configure**: Go to the **Profile** tab in Thoth.
3. **Save**: Enter your key in the "Minimax API Key" field. It will be stored securely and used for your future recordings.

## Privacy & Data

Your dreams are stored securely in your private Firestore database. Only you can access your dream archive. Recordings are processed by Gemini AI for transcription and tagging purposes only.
