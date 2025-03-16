import React from 'react';
import { MessageCircle } from 'lucide-react';

interface TopicInputProps {
  topic: string;
  onChange: (topic: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
}

function TopicInput({ topic, onChange, onSubmit, isLoading }: TopicInputProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <label className="block text-sm font-medium text-purple-200">
        <div className="flex items-center space-x-2">
          <MessageCircle className="w-4 h-4" />
          <span>Podcast Topic</span>
        </div>
      </label>
      <div className="flex space-x-2">
        <input
          type="text"
          value={topic}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter a topic for your podcast..."
          className="flex-1 px-4 py-2 bg-purple-900/20 border border-purple-700/50 rounded-lg 
                   focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
                   placeholder-purple-400/50 text-purple-100"
        />
        <button
          type="submit"
          disabled={isLoading || !topic.trim()}
          className="px-6 py-2 bg-purple-600 text-white rounded-lg font-medium
                   hover:bg-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500 
                   focus:ring-offset-2 focus:ring-offset-purple-900 disabled:opacity-50 
                   disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? 'Generating...' : 'Generate'}
        </button>
      </div>
    </form>
  );
}

export default TopicInput;