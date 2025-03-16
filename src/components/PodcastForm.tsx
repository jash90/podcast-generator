import React from 'react';
import { Mic } from 'lucide-react';

interface PodcastFormProps {
  topic: string;
  setTopic: (topic: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
}

function PodcastForm({ topic, setTopic, onGenerate, isGenerating }: PodcastFormProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onGenerate();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="topic" className="block text-sm font-medium text-purple-200">
          Podcast Topic
        </label>
        <div className="mt-1 relative rounded-lg shadow-sm">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Mic className="h-5 w-5 text-purple-300" />
          </div>
          <input
            type="text"
            id="topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="block w-full pl-10 pr-12 py-2 bg-white/5 border border-purple-300/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400/30 text-white placeholder-purple-200/50"
            placeholder="Enter your podcast topic"
            required
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={isGenerating}
        className={`w-full py-2 px-4 rounded-lg font-medium transition-all duration-200 ${
          isGenerating
            ? 'bg-purple-500/50 cursor-not-allowed'
            : 'bg-purple-500 hover:bg-purple-600 active:bg-purple-700'
        }`}
      >
        {isGenerating ? 'Generating...' : 'Generate Podcast'}
      </button>
    </form>
  );
}

export default PodcastForm;