import { useEffect, useState } from 'react';

export default function AlertToast({ alerts, onDismiss }) {
  if (!alerts.length) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm">
      {alerts.map(alert => (
        <ToastItem key={alert.id} alert={alert} onDismiss={() => onDismiss(alert.id)} />
      ))}
    </div>
  );
}

function ToastItem({ alert, onDismiss }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Animate in
    setTimeout(() => setVisible(true), 50);
    // Auto-dismiss after 8 seconds
    const t = setTimeout(() => { setVisible(false); setTimeout(onDismiss, 300); }, 8000);
    return () => clearTimeout(t);
  }, []);

  const isGood = alert.action === 'BUY';
  const isNeutral = alert.action === 'HOLD';

  return (
    <div
      className={`transition-all duration-300 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
    >
      <div className={`bg-card border rounded-xl p-4 shadow-2xl ${
        isGood ? 'border-buy/50' : isNeutral ? 'border-hold/50' : 'border-sell/50'
      }`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="text-2xl mt-0.5">
              {isGood ? '🚀' : isNeutral ? '⏸️' : '🔻'}
            </span>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-white font-bold">{alert.symbol}</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                  isGood ? 'bg-buy/10 text-buy' : isNeutral ? 'bg-hold/10 text-hold' : 'bg-sell/10 text-sell'
                }`}>
                  {alert.recommendation}
                </span>
              </div>
              <p className="text-gray-400 text-xs leading-relaxed">
                {alert.strategy?.emoji} {alert.strategy?.name} — Signal changé
              </p>
              <p className="text-gray-300 text-xs mt-1">{alert.timing}</p>
              <p className="text-gray-500 text-xs mt-0.5">
                Prix: {alert.currency} {Number(alert.currentPrice).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
          <button onClick={onDismiss} className="text-gray-600 hover:text-gray-300 text-sm mt-0.5 shrink-0">✕</button>
        </div>
      </div>
    </div>
  );
}
