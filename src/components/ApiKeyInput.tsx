import React from 'react';
import { Key } from 'lucide-react';

interface ApiKeyInputProps {
  apiKey: string;
  onChange: (key: string) => void;
  error?: string;
}

function ApiKeyInput({ apiKey, onChange, error }: ApiKeyInputProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-purple-200">
        <div className="flex items-center space-x-2">
          <Key className="w-4 h-4" />
          <span>OpenAI API Key</span>
        </div>
      </label>
      <input
        type="password"
        value={apiKey}
        onChange={(e) => onChange(e.target.value)}
        placeholder="sk-..."
        className="w-full px-4 py-2 bg-purple-900/20 border border-purple-700/50 rounded-lg 
                 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
                 placeholder-purple-400/50 text-purple-100"
      />
      {error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}
    </div>
  );
}

export default ApiKeyInput;