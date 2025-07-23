import React from 'react';
import { Key, X, Check } from 'lucide-react';

interface ApiKeyInputProps {
  apiKey: string;
  onChange: (key: string) => void;
  onClear: () => void;
  error?: string;
}

function ApiKeyInput({ apiKey, onChange, onClear, error }: ApiKeyInputProps) {
  const isApiKeySaved = apiKey.length > 0;

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-purple-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Key className="w-4 h-4" />
            <span>OpenAI API Key</span>
          </div>
          {isApiKeySaved && (
            <div className="flex items-center space-x-1 text-xs text-green-400">
              <Check className="w-3 h-3" />
              <span>Saved locally</span>
            </div>
          )}
        </div>
      </label>
      <div className="relative">
        <input
          type="password"
          value={apiKey}
          onChange={(e) => onChange(e.target.value)}
          placeholder="sk-..."
          className="w-full bg-purple-700/50 border border-purple-600/50 text-purple-100 placeholder-purple-400 rounded-lg px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />
        {apiKey && (
          <button
            onClick={onClear}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 text-purple-400 hover:text-purple-200 transition-colors"
            title="Clear API key"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}
      <p className="text-xs text-purple-400">
        Your API key is stored locally in your browser and never sent to our servers.
      </p>
    </div>
  );
}

export default ApiKeyInput;