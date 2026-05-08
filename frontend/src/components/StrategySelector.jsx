const STRATEGIES = [
  {
    id: 'buffett',
    name: 'Warren Buffett',
    emoji: '🏦',
    style: 'Value Investing',
    philosophy: 'Acheter des actifs solides en solde, tenir longtemps. "Soyez craintif quand les autres sont avides."',
    color: 'indigo',
    tags: ['Long terme', 'Prudent', 'Débutant'],
  },
  {
    id: 'momentum',
    name: 'William O\'Neil',
    emoji: '🚀',
    style: 'CAN SLIM / Momentum',
    philosophy: 'Acheter des actions en forte tendance avec volume. Couper les pertes vite à -7%.',
    color: 'green',
    tags: ['Court terme', 'Actif', 'Tendance'],
  },
  {
    id: 'contrarian',
    name: 'Paul Tudor Jones',
    emoji: '↩️',
    style: 'Contrarian / Mean Reversion',
    philosophy: 'Identifier les extrêmes de marché et trader le retour à la moyenne.',
    color: 'amber',
    tags: ['Rebonds', 'Extrêmes', 'Avancé'],
  },
  {
    id: 'trend',
    name: 'Jesse Livermore',
    emoji: '📈',
    style: 'Trend Following',
    philosophy: 'Suivre la tendance dominante. Ne jamais trader contre le marché.',
    color: 'purple',
    tags: ['Tendance', 'Swing', 'Intermédiaire'],
  },
];

const COLOR_MAP = {
  indigo: { border: 'border-indigo-500',  bg: 'bg-indigo-500/10', text: 'text-indigo-400',  tag: 'bg-indigo-500/20 text-indigo-300'  },
  green:  { border: 'border-green-500',   bg: 'bg-green-500/10',  text: 'text-green-400',   tag: 'bg-green-500/20 text-green-300'    },
  amber:  { border: 'border-amber-500',   bg: 'bg-amber-500/10',  text: 'text-amber-400',   tag: 'bg-amber-500/20 text-amber-300'    },
  purple: { border: 'border-purple-500',  bg: 'bg-purple-500/10', text: 'text-purple-400',  tag: 'bg-purple-500/20 text-purple-300'  },
};

export default function StrategySelector({ selected, onChange }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-white font-semibold text-sm">Stratégie de trader</span>
        <span className="text-gray-500 text-xs px-2 py-0.5 bg-surface rounded-full">Choisissez votre style</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {STRATEGIES.map(s => {
          const c = COLOR_MAP[s.color];
          const isActive = selected === s.id;
          return (
            <button
              key={s.id}
              onClick={() => onChange(s.id)}
              className={`relative text-left p-4 rounded-xl border transition-all ${
                isActive
                  ? `${c.border} ${c.bg} ring-1 ${c.border}`
                  : 'border-border bg-card hover:border-gray-500'
              }`}
            >
              {isActive && (
                <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${s.color === 'indigo' ? 'bg-indigo-500' : s.color === 'green' ? 'bg-green-500' : s.color === 'amber' ? 'bg-amber-500' : 'bg-purple-500'} animate-pulse`} />
              )}
              <div className="text-2xl mb-2">{s.emoji}</div>
              <div className={`font-bold text-sm ${isActive ? c.text : 'text-white'}`}>{s.name}</div>
              <div className="text-gray-500 text-xs mt-0.5 mb-2">{s.style}</div>
              <div className="flex flex-wrap gap-1">
                {s.tags.map(t => (
                  <span key={t} className={`text-xs px-1.5 py-0.5 rounded ${isActive ? c.tag : 'bg-border text-gray-500'}`}>
                    {t}
                  </span>
                ))}
              </div>
              {isActive && (
                <p className={`text-xs mt-2 ${c.text} opacity-80 leading-relaxed`}>{s.philosophy}</p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
