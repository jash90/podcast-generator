import React from 'react';
import { Settings, ChevronDown } from 'lucide-react';
import { CHAT_MODELS, TTS_MODELS, DEFAULT_MODELS, getModelById } from '../config/models';
import type { ProjectModels } from '../config/models';

interface ModelSelectorProps {
  models: ProjectModels;
  onChange: (models: ProjectModels) => void;
  isExpanded: boolean;
  onToggle: () => void;
}

function ModelSelector({ models, onChange, isExpanded, onToggle }: ModelSelectorProps) {
  const handleModelChange = (category: keyof ProjectModels, modelId: string) => {
    onChange({
      ...models,
      [category]: modelId
    });
  };

  const renderModelSelect = (
    label: string,
    category: keyof ProjectModels,
    availableModels: typeof CHAT_MODELS,
    description: string
  ) => {
    const currentModel = getModelById(models[category]);
    
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-purple-200">
            {label}
          </label>
          <span className="text-xs text-purple-400">
            {currentModel?.name || models[category]}
          </span>
        </div>
        <select
          value={models[category]}
          onChange={(e) => handleModelChange(category, e.target.value)}
          className="w-full bg-purple-700/50 border border-purple-600/50 text-purple-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        >
          {availableModels.map((model) => (
            <option key={model.id} value={model.id} className="bg-purple-800">
              {model.name} - {model.description}
            </option>
          ))}
        </select>
        <p className="text-xs text-purple-400">{description}</p>
      </div>
    );
  };

  return (
    <div className="bg-purple-800/30 rounded-xl border border-purple-700/50">
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center justify-between text-left hover:bg-purple-700/20 transition-colors rounded-xl"
      >
        <div className="flex items-center space-x-2">
          <Settings className="w-5 h-5 text-purple-400" />
          <span className="font-medium text-purple-200">AI Model Configuration</span>
        </div>
        <ChevronDown 
          className={`w-5 h-5 text-purple-400 transition-transform ${
            isExpanded ? 'rotate-180' : ''
          }`} 
        />
      </button>
      
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-purple-700/50 mt-4 pt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {renderModelSelect(
              'Persona Generation',
              'personaGeneration',
              CHAT_MODELS,
              'Model used to create detailed character personas'
            )}
            
            {renderModelSelect(
              'Script Generation',
              'scriptGeneration',
              CHAT_MODELS,
              'Model used to generate podcast dialogue'
            )}
            
            {renderModelSelect(
              'Language Detection',
              'languageDetection',
              CHAT_MODELS,
              'Model used to detect topic language'
            )}
            
            {renderModelSelect(
              'Text-to-Speech',
              'textToSpeech',
              TTS_MODELS,
              'Model used for audio generation'
            )}
          </div>
          
          <div className="bg-purple-900/30 p-3 rounded-lg">
            <h4 className="text-sm font-medium text-purple-200 mb-2">Current Configuration</h4>
            <div className="grid gap-2 text-xs">
              <div className="flex justify-between">
                <span className="text-purple-300">Persona:</span>
                <span className="text-purple-100">{getModelById(models.personaGeneration)?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-purple-300">Script:</span>
                <span className="text-purple-100">{getModelById(models.scriptGeneration)?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-purple-300">Language:</span>
                <span className="text-purple-100">{getModelById(models.languageDetection)?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-purple-300">TTS:</span>
                <span className="text-purple-100">{getModelById(models.textToSpeech)?.name}</span>
              </div>
            </div>
          </div>
          
          <button
            onClick={() => onChange(DEFAULT_MODELS)}
            className="w-full px-4 py-2 bg-purple-600/50 hover:bg-purple-600/70 text-purple-100 rounded-lg text-sm transition-colors"
          >
            Reset to Defaults
          </button>
        </div>
      )}
    </div>
  );
}

export default ModelSelector; 