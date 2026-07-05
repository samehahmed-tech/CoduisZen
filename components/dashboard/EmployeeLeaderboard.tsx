import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Medal, Target, Zap, Clock, TrendingUp, User } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { analyticsApi } from '../../services/api/analytics';

interface LeaderboardEntry {
  userId: string;
  userName: string;
  totalPoints: number;
  totalSales: number;
  orderCount: number;
  avgSpeed: number;
}

const EmployeeLeaderboard: React.FC = () => {
  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const { settings } = useAuthStore();
  
  const currency = settings.currencySymbol || 'EGP';
  const isAr = (settings.language || 'en') === 'ar';

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        setLoadError('');
        setData(await analyticsApi.getLeaderboard(5));
      } catch {
        setLoadError(isAr ? 'تعذر تحميل ترتيب الموظفين' : 'Failed to load employee ranking');
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 60000); // 1 min sync
    return () => clearInterval(interval);
  }, [isAr]);

  if (loading) {
    return (
      <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 animate-pulse">
        <div className="h-6 w-48 bg-slate-200 rounded-full mb-8" />
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-slate-100 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Trophy className="text-amber-500" size={28} />
            Top Performers
          </h2>
          <p className="text-slate-500 text-sm font-medium mt-1">Live employee ranking & rewards</p>
        </div>
        <div className="h-10 px-4 rounded-full bg-slate-50 text-slate-600 flex items-center gap-2 text-xs font-bold border border-slate-100">
           <Zap size={14} className="text-indigo-500" />
           DAILY GOAL: 85%
        </div>
      </div>

      <div className="space-y-4">
        {loadError && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">
            {loadError}
          </div>
        )}
        <AnimatePresence mode="popLayout">
          {data.map((entry, index) => (
            <motion.div
              key={entry.userId}
              layout
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`group flex items-center gap-4 p-4 rounded-2xl transition-all ${
                index === 0 ? 'bg-indigo-50/50 ring-1 ring-indigo-100' : 'hover:bg-slate-50'
              }`}
            >
              {/* Rank Badge */}
              <div className="w-12 h-12 flex items-center justify-center shrink-0">
                {index === 0 ? (
                  <Medal className="text-amber-500" size={32} />
                ) : index === 1 ? (
                  <Medal className="text-slate-400" size={28} />
                ) : index === 2 ? (
                  <Medal className="text-amber-700" size={24} />
                ) : (
                  <span className="text-slate-300 font-black text-xl">{index + 1}</span>
                )}
              </div>

              {/* Avatar Placeholder */}
              <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                 <User size={24} />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-slate-900 truncate group-hover:text-indigo-600 transition-colors">
                  {entry.userName}
                </h3>
                <div className="flex items-center gap-4 mt-1">
                   <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <Target size={12} /> {entry.orderCount} Orders
                   </span>
                   <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-l pl-3">
                      <Clock size={12} /> {Math.round(entry.avgSpeed / 60)}m avg
                   </span>
                </div>
              </div>

              {/* Points & Stats */}
              <div className="text-right shrink-0">
                <div className="flex items-center justify-end gap-1 text-indigo-600 font-black text-xl">
                  {entry.totalPoints}
                  <span className="text-[10px] uppercase font-bold text-indigo-400">PTS</span>
                </div>
                <div className="text-[11px] font-bold text-slate-400 flex items-center justify-end gap-1 mt-0.5">
                   <TrendingUp size={10} className="text-emerald-500" />
                   {entry.totalSales.toLocaleString()} {currency}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {data.length === 0 && (
        <div className="text-center py-12 opacity-50">
           <Zap size={48} className="mx-auto mb-4 text-slate-200" />
           <p className="font-bold text-slate-400">No performance data yet</p>
        </div>
      )}

      <button className="w-full mt-8 py-4 bg-slate-50 hover:bg-slate-100 rounded-2xl text-slate-500 text-sm font-black transition-colors border border-slate-100">
         VIEW FULL DASHBOARD
      </button>
    </div>
  );
};

export default EmployeeLeaderboard;
