export default function StatsCard({ icon: Icon, label, value, sub, accent = 'teal' }) {
  const accents = {
    teal: 'bg-accent-teal/10 text-accent-teal',
    gold: 'bg-accent-gold/10 text-accent-gold',
    green: 'bg-green-500/10 text-green-400',
    red: 'bg-red-500/10 text-red-400',
  };

  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-400">{label}</p>
          <p className="text-3xl font-bold text-white mt-2">{value}</p>
          {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
        </div>
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${accents[accent]}`}>
          <Icon size={22} />
        </div>
      </div>
    </div>
  );
}
