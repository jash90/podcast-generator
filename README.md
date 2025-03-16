# AI Podcast Generator

Generate engaging podcast scripts with multiple perspectives using AI. This application creates dynamic conversations between a host and two guests, complete with text-to-speech audio generation.

![AI Podcast Generator](https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&q=80&w=1200&h=400)

## Features

- 🎙️ Dynamic podcast script generation
- 🗣️ Multiple speaker perspectives
- 🌍 Automatic language detection
- 🎵 Text-to-speech audio generation
- 🎨 Beautiful, responsive UI
- ⚡ Real-time generation progress
- 💾 Download complete podcast audio

## Tech Stack

- React 18
- TypeScript
- Tailwind CSS
- Vite
- OpenAI API (GPT-4 & TTS)
- Web Audio API

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file with your OpenAI API key:
   ```
   VITE_OPENAI_API_KEY=your_api_key_here
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

## Usage

1. Enter your OpenAI API key
2. Input a podcast topic
3. Click "Generate" to create your podcast
4. Listen to individual segments or download the full audio
5. View the complete script with speaker segments

## Project Structure

```
src/
├── components/         # React components
├── utils/             # Utility functions
├── types/             # TypeScript types
└── config/            # Configuration files
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

MIT License - feel free to use this project for personal or commercial purposes.

## Credits

- Icons by [Lucide](https://lucide.dev)
- UI Design inspired by modern podcast platforms
- Background image from [Unsplash](https://unsplash.com)