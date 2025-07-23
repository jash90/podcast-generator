import React, { useState, useEffect } from 'react';
import { Mic } from 'lucide-react';
import ApiKeyInput from './components/ApiKeyInput';
import TopicInput from './components/TopicInput';
import Script from './components/Script';
import AudioPlayer from './components/AudioPlayer';
import GenerationProgress, { GenerationStage } from './components/GenerationProgress';
import ModelSelector from './components/ModelSelector';
import { generatePodcastScript } from './utils/scriptGenerator';
import type { PodcastScript } from './types';
import { DEFAULT_MODELS, fetchModelsFromAPI, updateModels } from './config/models';
import type { ProjectModels } from './config/models';

function App() {
  const [apiKey, setApiKey] = useState('');
  const [topic, setTopic] = useState('');
  const [script, setScript] = useState<PodcastScript | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [generationStage, setGenerationStage] = useState<GenerationStage>(null);
  const [models, setModels] = useState<ProjectModels>(DEFAULT_MODELS);
  const [isModelSelectorExpanded, setIsModelSelectorExpanded] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  // Fetch models when API key changes
  useEffect(() => {
    const fetchModels = async () => {
      if (!apiKey.trim()) return;
      
      try {
        setIsLoadingModels(true);
        setModelsError(null);
        const fetchedModels = await fetchModelsFromAPI(apiKey);
        updateModels(fetchedModels);
        
        // Update current models to use only available models
        const availableChatModels = fetchedModels.chat.map(m => m.id);
        const availableTTSModels = fetchedModels.tts.map(m => m.id);
        
        setModels(currentModels => ({
          personaGeneration: availableChatModels.includes(currentModels.personaGeneration) 
            ? currentModels.personaGeneration 
            : availableChatModels[0] || 'gpt-3.5-turbo',
          scriptGeneration: availableChatModels.includes(currentModels.scriptGeneration)
            ? currentModels.scriptGeneration
            : availableChatModels[0] || 'gpt-3.5-turbo',
          languageDetection: availableChatModels.includes(currentModels.languageDetection)
            ? currentModels.languageDetection
            : availableChatModels[0] || 'gpt-3.5-turbo',
          textToSpeech: availableTTSModels.includes(currentModels.textToSpeech)
            ? currentModels.textToSpeech
            : availableTTSModels[0] || 'tts-1'
        }));
        
      } catch (err: unknown) {
        setModelsError('Failed to fetch models from OpenAI API. Using fallback models.');
        console.warn('Models fetch error:', err);
      } finally {
        setIsLoadingModels(false);
      }
    };

    // Debounce API calls
    const timeoutId = setTimeout(fetchModels, 500);
    return () => clearTimeout(timeoutId);
  }, [apiKey]);

  const handleGenerate = async () => {
    if (!apiKey.trim() || !topic.trim()) {
      setError('Please provide both an API key and a topic.');
      return;
    }

    setError(null);
    setIsLoading(true);
    setScript(null);
    setGenerationStage('detecting-language');

    try {
      const generatedScript = await generatePodcastScript(topic, apiKey, setGenerationStage, models);
      setScript(generatedScript);
      setGenerationStage('complete');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate podcast script. Please try again.';
      setError(errorMessage);
      setGenerationStage(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-purple-900 text-purple-50">
      <div className="max-w-4xl mx-auto p-6 space-y-8">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center space-x-2">
            <Mic className="w-8 h-8 text-purple-300" />
            <h1 className="text-3xl font-bold text-purple-100">AI Podcast Generator</h1>
          </div>
          <p className="text-purple-300">Generate engaging podcast scripts with multiple perspectives</p>
        </div>

        <div className="space-y-6">
          <div className="bg-purple-800/30 p-6 rounded-xl border border-purple-700/50">
            <ApiKeyInput 
              apiKey={apiKey} 
              onChange={setApiKey}
              error={error || undefined}
            />
            
            <div className="mt-6">
              <TopicInput 
                topic={topic}
                onChange={setTopic}
                onSubmit={handleGenerate}
                isLoading={isLoading}
              />
            </div>
          </div>

          <ModelSelector
            models={models}
            onChange={setModels}
            isExpanded={isModelSelectorExpanded}
            onToggle={() => setIsModelSelectorExpanded(!isModelSelectorExpanded)}
            isLoadingModels={isLoadingModels}
            modelsError={modelsError}
          />

          {(isLoading || generationStage === 'complete') && (
            <div className="bg-purple-800/30 p-6 rounded-xl border border-purple-700/50">
              <GenerationProgress currentStage={generationStage} />
            </div>
          )}
        </div>

        {script && (
          <div className="space-y-6">
            <AudioPlayer 
              script={script} 
              isPlaying={isPlaying} 
              setIsPlaying={setIsPlaying} 
              apiKey={apiKey}
              ttsModel={models.textToSpeech}
            />
            <Script script={script} />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;