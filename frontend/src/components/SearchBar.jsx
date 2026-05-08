import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

export default function SearchBar({ onAnalyze, loading }) {
  const [input, setInput]           = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSugg, setShowSugg]     = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (input.length < 2) { setSuggestions([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await axios.get(`/api/search/${input}`);
        setSuggestions(res.data.slice(0, 6));
        setShowSugg(true);
      } catch {
        setSuggestions([]);
      }
    }, 350);
  }, [input]);

  const submit = (sym) => {
    setShowSugg(false);
    setInput(sym);
    onAnalyze(sym);
  };

  return (
    <div className="relative">
      <div className="flex gap-3">
        <div className="relative flex-1">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-lg">🔎</span>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && submit(input)}
            onFocus={() => suggestions.length > 0 && setShowSugg(true)}
            onBlur={() => setTimeout(() => setShowSugg(false), 200)}
            placeholder="Symbole — ex: AAPL, BTC-USD, TSLA…"
            className="w-full bg-card border border-border rounded-xl pl-11 pr-4 py-3.5 text-white placeholder-gray-600 focus:outline-none focus:border-accent transition-colors text-base pulse-border"
          />
        </div>
        <button
          onClick={() => submit(input)}
          disabled={loading || !input}
          className="px-6 py-3.5 bg-accent hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-xl transition-colors whitespace-nowrap"
        >
          {loading ? 'Analyse…' : 'Analyser'}
        </button>
      </div>

      {/* Autocomplete dropdown */}
      {showSugg && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl overflow-hidden z-50 shadow-xl">
          {suggestions.map(s => (
            <button
              key={s.symbol}
              onMouseDown={() => submit(s.symbol)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-border transition-colors text-left"
            >
              <div>
                <span className="text-white font-mono font-semibold">{s.symbol}</span>
                <span className="text-gray-400 text-sm ml-3">{s.name}</span>
              </div>
              <span className="text-gray-600 text-xs bg-surface px-2 py-0.5 rounded">
                {s.type === 'CRYPTOCURRENCY' ? 'CRYPTO' : s.exchange}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
