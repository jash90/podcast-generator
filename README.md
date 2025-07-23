# 🎙️ AI Podcast Generator

**A sophisticated AI-powered podcast generator that creates engaging multi-perspective conversations with professional-quality audio synthesis.**

Transform any topic into a dynamic podcast featuring a professional host and two expert guests with distinct viewpoints, complete with intelligent voice matching and seamless audio generation.

![AI Podcast Generator](https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&q=80&w=1200&h=400)

## ✨ Key Features

### 🤖 **Advanced AI Integration**
- **Dynamic Model Selection**: Support for GPT-4.1, GPT-4o, o1, o3, and more with automatic API fetching
- **Intelligent Persona Generation**: Separate AI calls for host, guest1, and guest2 with role-specific prompts
- **Multi-Language Support**: Automatic language detection with native-language script generation
- **Smart Voice Matching**: AI-driven voice assignment based on persona characteristics and demographics

### 🎵 **Professional Audio System**
- **6 Voice Profiles**: Male (Echo, Onyx, Fable) and Female (Alloy, Nova, Shimmer) with distinct characteristics
- **Intelligent Voice Assignment**: Compatibility scoring based on age, personality, tone, and speaking style  
- **Text Optimization**: Smart text splitting for 4096-character TTS limits with sentence-boundary respect
- **Parallel Audio Generation**: High-performance concurrent processing for faster generation
- **Seamless Audio Combining**: Professional-quality audio merging with buffer management

### 🎛️ **Advanced Audio Player**
- **Segment-by-Segment Playback**: Individual control over each conversation segment
- **Real-Time Progress Tracking**: Accurate time display with smooth animation updates
- **Smart Preloading**: Parallel segment loading with visual status indicators
- **Professional Controls**: Play/pause, skip, restart, volume control with visual feedback
- **Enhanced Download**: Progress-tracked MP3 export with timestamped filenames

### 🔧 **Sophisticated Configuration**
- **Model Management**: Dynamic fetching and caching of available OpenAI models
- **Persistent Settings**: Local storage for API keys and user preferences
- **Debug Tools**: Comprehensive logging, error tracking, and diagnostic information
- **Text Analysis**: Real-time statistics, chunking analysis, and API impact assessment

### 🎨 **Modern User Experience**
- **Responsive Design**: Mobile-first approach with Tailwind CSS styling
- **Real-Time Feedback**: Generation progress with detailed stage indicators
- **Error Handling**: Intelligent error categorization with specific user guidance
- **Accessibility**: Keyboard navigation and screen reader support

## 🏗️ **Technical Architecture**

### **Frontend Stack**
- **React 18** with functional components and hooks
- **TypeScript** for type safety and developer experience  
- **Tailwind CSS** for responsive, utility-first styling
- **Vite** for fast development and optimized builds
- **Lucide React** for consistent iconography

### **AI & Audio Integration**
- **OpenAI API Integration**: GPT models for text generation, TTS for audio synthesis
- **Web Audio API**: Professional audio processing and playback control
- **Dynamic Model System**: Runtime model discovery and configuration
- **Advanced Caching**: Intelligent audio caching with hash-based keys

### **Core Technologies**
```typescript
// Key Dependencies
"openai": "^4.28.0"      // AI model integration
"react": "^18.3.1"       // UI framework
"lucide-react": "^0.344.0" // Icons
"typescript": "^5.5.3"   // Type safety
"tailwindcss": "^3.4.1"  // Styling
```

## 🚀 **Getting Started**

### **Prerequisites**
- Node.js 18+ and npm
- OpenAI API key with access to GPT and TTS models

### **Installation**

1. **Clone and Install**
   ```bash
   git clone https://github.com/your-repo/ai-podcast-generator.git
   cd ai-podcast-generator
   npm install
   ```

2. **Environment Setup** (Optional)
   ```bash
   # Create .env file for default API key
   echo "VITE_OPENAI_API_KEY=your_api_key_here" > .env
   ```

3. **Development Server**
   ```bash
   npm run dev
   # Opens at http://localhost:5173
   ```

4. **Production Build**
   ```bash
   npm run build
   npm run preview
   ```

## 📖 **Usage Guide**

### **Basic Workflow**
1. **🔑 API Configuration**: Enter your OpenAI API key (saved automatically)
2. **⚙️ Model Selection**: Choose AI models for different generation stages
3. **📝 Topic Input**: Describe your podcast topic in any language
4. **🎭 Generation Process**: Watch real-time progress through 4 stages:
   - Language Detection
   - Persona Creation (Host + 2 Guests)  
   - Script Writing (Opening, Background, Discussion, Conclusion)
   - Voice Initialization
5. **🎧 Audio Experience**: Listen with professional controls or download MP3

### **Advanced Features**

#### **Model Configuration**
```typescript
// Default Models (GPT-4.1 for quality)
personaGeneration: 'gpt-4.1'    // Detailed character creation
scriptGeneration: 'gpt-4.1'     // Natural dialogue generation
languageDetection: 'gpt-4.1'    // Accurate language identification
textToSpeech: 'tts-1'           // Audio synthesis
```

#### **Voice Profile System**
- **Echo** (Male): Authoritative, professional, analytical voice
- **Onyx** (Male): Warm, friendly, approachable style
- **Fable** (Male): Energetic, confident, dynamic delivery
- **Alloy** (Female): Professional, composed, trustworthy tone
- **Nova** (Female): Vibrant, passionate, expressive voice
- **Shimmer** (Female): Calm, mature, balanced approach

#### **Intelligent Matching Algorithm**
```typescript
// Compatibility scoring based on:
- Gender matching (essential requirement)
- Tone alignment (40% weight)
- Speaking style (30% weight)  
- Age range compatibility (20% weight)
- Personality traits (10% weight)
```

## 📁 **Project Structure**

```
src/
├── components/           # React UI components
│   ├── AudioPlayer.tsx   # Professional audio playback system
│   ├── ModelSelector.tsx # AI model configuration interface
│   ├── TextStats.tsx     # Real-time text analysis and debug tools
│   ├── GenerationProgress.tsx # Stage-by-stage progress tracking
│   └── ...
├── utils/               # Core business logic
│   ├── scriptGenerator.ts    # AI-powered script generation
│   ├── audioGenerator.ts     # TTS and voice management  
│   ├── textSplitter.ts      # Smart text chunking for TTS limits
│   ├── languageDetector.ts  # Multi-language support
│   └── storage.ts          # Local storage utilities
├── config/              # System configuration
│   ├── models.ts         # Dynamic model management
│   └── api.ts           # OpenAI client configuration
└── types/               # TypeScript definitions
    ├── index.ts         # Core types and interfaces
    └── ...
```

## 🎯 **Key Capabilities**

### **AI-Powered Generation**
- **Contextual Understanding**: Deep topic analysis for relevant persona creation
- **Perspective Diversity**: Automatic generation of supporting vs. alternative viewpoints  
- **Natural Dialogue**: Sophisticated conversation flow with realistic interactions
- **Cultural Adaptation**: Language-specific nuances and speaking patterns

### **Audio Excellence** 
- **Professional Quality**: Studio-grade audio synthesis and processing
- **Voice Consistency**: Persistent character voices throughout conversations
- **Optimal Performance**: Parallel processing for faster generation times
- **Smart Caching**: Efficient memory management and audio reuse

### **Developer Experience**
- **Type Safety**: Comprehensive TypeScript coverage across all modules
- **Error Boundaries**: Graceful error handling with specific user guidance
- **Debug Support**: Extensive logging and diagnostic tools
- **Modern Tooling**: Hot reloading, fast builds, and optimized development

## 🐛 **Troubleshooting**

### **Common Issues**

| Issue                     | Solution                                           |
| ------------------------- | -------------------------------------------------- |
| **API Key Invalid**       | Verify OpenAI API key has GPT and TTS access       |
| **Download Not Working**  | Check browser settings, disable ad blockers        |
| **Audio Generation Slow** | Use faster models (GPT-4o vs GPT-4.1)              |
| **Text Too Long**         | Automatic splitting handles 4096+ character limits |
| **Model Not Available**   | Dynamic fetching will show only accessible models  |

### **Debug Tools**
- **Text Analysis Panel**: Character counts, chunking info, API impact
- **Console Logging**: Detailed generation and audio processing logs
- **Browser Compatibility**: Automatic download support detection
- **Model Diagnostics**: Real-time model availability and configuration

## 🤝 **Contributing**

We welcome contributions! Areas for enhancement:

- **Additional Languages**: Extend multi-language support
- **Voice Profiles**: Integration with new TTS models and voices
- **Export Formats**: Additional audio formats and quality options
- **UI/UX**: Interface improvements and accessibility features
- **Performance**: Further optimization of generation and audio processing

### **Development Workflow**
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📊 **Performance & Scalability**

- **Generation Time**: ~30-60 seconds for complete podcast (varies by model)
- **Audio Quality**: Professional TTS with 22kHz sampling rate
- **Concurrent Processing**: Parallel audio generation for optimal speed
- **Memory Efficiency**: Smart caching and buffer management
- **Browser Support**: Modern browsers with Web Audio API support

## 📄 **License**

MIT License - see [LICENSE](LICENSE) file for details.

Feel free to use, modify, and distribute for personal or commercial projects.

## 🙏 **Acknowledgments**

- **OpenAI** - GPT models and TTS API powering the AI generation
- **Lucide** - Beautiful, consistent iconography throughout the interface  
- **Tailwind CSS** - Utility-first CSS framework for responsive design
- **Unsplash** - High-quality images for visual enhancement
- **React Community** - Excellent ecosystem and development tools

---

**Built with ❤️ for the AI and podcasting communities**

*Transform any topic into engaging conversations with professional-quality AI-generated podcasts.*