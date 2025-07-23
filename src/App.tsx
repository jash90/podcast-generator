import React, { useState, useEffect } from 'react';
import { Mic } from 'lucide-react';
import ApiKeyInput from './components/ApiKeyInput';
import TopicInput from './components/TopicInput';
import Script from './components/Script';
import AudioPlayer from './components/AudioPlayer';
import GenerationProgress, { GenerationStage } from './components/GenerationProgress';
import ModelSelector from './components/ModelSelector';
import TextStats from './components/TextStats';
import TopicsDisplay from './components/TopicsDisplay';
import { generatePodcastScript } from './utils/scriptGenerator';
import type { PodcastScript } from './types';
import { DEFAULT_MODELS } from './config/models';
import type { ProjectModels } from './config/models';
import { getStorageItem, setStorageItem, removeStorageItem } from './utils/storage';

const API_KEY_STORAGE_KEY = 'podcast-generator-api-key';

function App() {
  const [apiKey, setApiKey] = useState('');
  const [topic, setTopic] = useState('');
  const [script, setScript] = useState<PodcastScript | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [generationStage, setGenerationStage] = useState<GenerationStage>(null);
  const [currentSegment, setCurrentSegment] = useState<number | undefined>(undefined);
  const [totalSegments, setTotalSegments] = useState<number | undefined>(undefined);
  const [models, setModels] = useState<ProjectModels>(DEFAULT_MODELS);
  const [isModelSelectorExpanded, setIsModelSelectorExpanded] = useState(false);

  // Load API key from localStorage on mount
  useEffect(() => {
    const savedApiKey = getStorageItem(API_KEY_STORAGE_KEY);
    if (savedApiKey) {
      setApiKey(savedApiKey);
    }
  }, []);

  // Save API key to localStorage when it changes
  useEffect(() => {
    if (apiKey.trim()) {
      setStorageItem(API_KEY_STORAGE_KEY, apiKey);
    } else {
      removeStorageItem(API_KEY_STORAGE_KEY);
    }
  }, [apiKey]);

  const handleApiKeyChange = (newApiKey: string) => {
    setApiKey(newApiKey);
    setError(null);
  };

  const handleClearApiKey = () => {
    setApiKey('');
    removeStorageItem(API_KEY_STORAGE_KEY);
  };

  const handleGenerate = async () => {
    if (!apiKey.trim() || !topic.trim()) {
      setError('Please provide both an API key and a topic.');
      return;
    }

    setError(null);
    setIsLoading(true);
    setScript(null);
    setGenerationStage('detecting-language');
    setCurrentSegment(undefined);
    setTotalSegments(undefined);

    try {
      const generatedScript = await generatePodcastScript(
        topic, 
        apiKey, 
        (stage, current, total) => {
          setGenerationStage(stage);
          setCurrentSegment(current);
          setTotalSegments(total);
        }, 
        models
      );
      setScript(generatedScript);
      setGenerationStage('complete');
      setCurrentSegment(undefined);
      setTotalSegments(undefined);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate podcast script. Please try again.';
      setError(errorMessage);
      setGenerationStage(null);
      setCurrentSegment(undefined);
      setTotalSegments(undefined);
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
              onChange={handleApiKeyChange}
              onClear={handleClearApiKey}
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
            isLoadingModels={false}
            modelsError={null}
          />

          {(isLoading || generationStage === 'complete') && (
            <div className="bg-purple-800/30 p-6 rounded-xl border border-purple-700/50">
              <GenerationProgress 
                currentStage={generationStage} 
                currentSegment={currentSegment}
                totalSegments={totalSegments}
              />
            </div>
          )}

          {script && (
            <div className="space-y-6">
              {script.topics && (
                <TopicsDisplay topics={script.topics} />
              )}
              
              <AudioPlayer
                script={script}
                isPlaying={isPlaying}
                setIsPlaying={setIsPlaying}
                apiKey={apiKey}
                ttsModel={models.textToSpeech}
              />
              
              <Script script={script} />
              <TextStats script={script} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;