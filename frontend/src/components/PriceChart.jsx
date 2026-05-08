import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine, ResponsiveContainer
} from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl p-3 shadow-xl text-sm">
      <p className="text-gray-400 mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-gray-400">{p.name}:</span>
          <span className="text-white font-mono font-bold">{Number(p.value).toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
};

export default function PriceChart({ chartData, entryPrice, targetPrice, stopLoss, action, symbol }) {
  if (!chartData?.length) return null;

  const prices = chartData.map(d => d.close);
  const minP = Math.min(...prices) * 0.995;
  const maxP = Math.max(...prices) * 1.005;

  const labelEntry = `Entrée: ${entryPrice?.toFixed(2)}`;
  const labelTarget = `Objectif: ${targetPrice?.toFixed(2)}`;
  const labelStop   = `Stop Loss: ${stopLoss?.toFixed(2)}`;

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-bold">{symbol} — 90 derniers jours</h2>
        <div className="flex gap-3 text-xs">
          <span className="flex items-center gap-1"><span className="w-6 h-0.5 bg-indigo-400 inline-block" /> Prix</span>
          <span className="flex items-center gap-1"><span className="w-6 h-0.5 bg-yellow-400 inline-block" /> SMA20</span>
          <span className="flex items-center gap-1"><span className="w-6 h-0.5 bg-purple-400 inline-block" /> SMA50</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0}   />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3a" />
          <XAxis
            dataKey="date"
            tick={{ fill: '#6b7280', fontSize: 11 }}
            tickLine={false}
            tickFormatter={v => v?.slice(5)}
            interval={14}
          />
          <YAxis
            domain={[minP, maxP]}
            tick={{ fill: '#6b7280', fontSize: 11 }}
            tickLine={false}
            tickFormatter={v => v.toFixed(0)}
            width={55}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* Reference lines for trade levels */}
          {entryPrice && (
            <ReferenceLine y={entryPrice} stroke="#6366f1" strokeDasharray="4 4" strokeWidth={1.5}
              label={{ value: labelEntry, fill: '#6366f1', fontSize: 11, position: 'insideTopRight' }} />
          )}
          {targetPrice && (
            <ReferenceLine y={targetPrice} stroke="#22c55e" strokeDasharray="4 4" strokeWidth={1.5}
              label={{ value: labelTarget, fill: '#22c55e', fontSize: 11, position: 'insideTopRight' }} />
          )}
          {stopLoss && (
            <ReferenceLine y={stopLoss} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1.5}
              label={{ value: labelStop, fill: '#ef4444', fontSize: 11, position: 'insideBottomRight' }} />
          )}

          <Area
            type="monotone"
            dataKey="close"
            name="Prix"
            stroke="#6366f1"
            strokeWidth={2}
            fill="url(#priceGrad)"
            dot={false}
            activeDot={{ r: 4, fill: '#6366f1' }}
          />
          <Line
            type="monotone"
            dataKey="sma20"
            name="SMA20"
            stroke="#fbbf24"
            strokeWidth={1.5}
            dot={false}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="sma50"
            name="SMA50"
            stroke="#a855f7"
            strokeWidth={1.5}
            dot={false}
            connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
