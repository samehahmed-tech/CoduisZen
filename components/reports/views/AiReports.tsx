import React from 'react';
import {
   BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area, Cell, PieChart, Pie
} from 'recharts';
import {
   DollarSign, TrendingUp, ShoppingBag, Calendar, Download, Printer,
   ChevronDown, Filter, Target, Megaphone, Zap, Scale, Info, Users, Clock, Box, ShieldCheck, Activity, LineChart as ChartIcon
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const AiReports = ({ state }: any) => {
   const {
      activeCategory, activeSubReport, navigate,
      dailySales, profitDaily, overview, profitSummary, foodCostData,
      paymentSummary, vatReport, hourlySales, cashierSummary, refunds,
      integrity, trialBalance, profitAndLoss, topExpenses,
      stockMovementLog, wasteLoss, reorderAlerts, expiringBatches,
      payrollData, attendanceData, overtimeData,
      customerLTV, campaignROI, branchPerformance, orderPrepTime,
      salesByOrderType, salesByItem, salesByCategory,
      discountAnalysis, cancelledOrders, deliveryPerformance,
      salesBySource, dineInTables, peakHoursData,
      modifierSalesData, avgTicketTrend, salesComparisonData,
      slowMovingItems, revenueByWeekday, voidItemsData,
      tipsData, serviceChargeData, shiftSummaryData,
      actualVsTheoreticalData, purchaseHistoryData, inventoryValuationData,
      staffCostData, salesPerLaborData,
      customerRetentionData, newVsReturningData, customerFrequencyData,
      kitchenPerformanceData, menuEngineeringData, daypartData, basketData,
      seasonalityData, onlineOfflineData, foodCostTrendData,
      taxComplianceData, auditTrailData, cashFlowData,
      supplierPriceData, recipeCostData, abcData,
      empProductivityData, churnData, loyaltyData, promoImpactData,
      tableTurnoverData, waitTimeData, driverUtilData, branchCompData,
      demandForecastData, priceElasticityData, cannibalizationData,
      anomalyData, breakEvenData, reconciliationData,
      dailyFlashData, menuLifecycleData, catContribData,
      shiftProfitData, deliveryZoneData, deliveryCostData,
      journeyFunnelData, channelMixData, optimalPricingData,
      thirdPartyData, timeToFirstData,
      salesSeries, peakHoursLookup, peakHoursMaxOrders,
      revenueByWeekdayMax, daypartRevenueMax
   } = state;

   return (
      <>
               {activeCategory === 'AI' && activeSubReport === 'Daily Flash Report' && dailyFlashData && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="card-primary rounded-2xl border border-blue-200 dark:border-blue-800 p-5 shadow-lg bg-blue-50/30 dark:bg-blue-950/20">
                        <p className="text-[10px] font-black uppercase tracking-widest text-blue-400">Daily Flash - {dailyFlashData.date}</p>
                     </div>
                     <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                           { l: 'Revenue', v: `${dailyFlashData.revenue.toLocaleString()} LE` },
                           { l: 'Orders', v: dailyFlashData.orderCount },
                           { l: 'Avg Ticket', v: `${dailyFlashData.avgTicket} LE` },
                           { l: 'Cancelled', v: dailyFlashData.cancelledOrders, c: 'text-rose-500' },
                           { l: 'Discounts', v: `${dailyFlashData.totalDiscount.toLocaleString()} LE`, c: 'text-amber-500' },
                           { l: 'Tips', v: `${dailyFlashData.totalTips.toLocaleString()} LE`, c: 'text-emerald-500' },
                        ].map((c: any, i: number) => (
                           <div key={i} className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-lg">
                              <p className="text-[10px] font-black uppercase tracking-widest text-muted">{c.l}</p>
                              <p className={`text-2xl font-black mt-1 ${c.c || 'text-main'}`}>{c.v}</p>
                           </div>
                        ))}
                     </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-xl p-6">
                           <h3 className="text-lg font-black text-main mb-3">By Type</h3>
                           {dailyFlashData.byType.map((row: any, i: number) => (<div key={i} className="flex justify-between py-1.5 text-xs border-b border-border/20"><span className="font-black">{row.type}</span><span className="text-muted">{row.count} orders - {row.revenue.toLocaleString()} LE</span></div>))}
                        </div>
                        <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-xl p-6">
                           <h3 className="text-lg font-black text-main mb-3">Payments</h3>
                           {dailyFlashData.paymentMix.map((row: any, i: number) => (<div key={i} className="flex justify-between py-1.5 text-xs border-b border-border/20"><span className="font-black">{row.method}</span><span className="font-mono font-bold">{row.total.toLocaleString()} LE</span></div>))}
                        </div>
                     </div>
                  </div>
               )}
               {activeCategory === 'AI' && activeSubReport === 'Daily Flash Report' && !dailyFlashData && <p className="text-center text-muted py-16">No data.</p>}

               {activeCategory === 'AI' && activeSubReport === 'Demand Forecasting' && demandForecastData && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"><div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50"><h3 className="text-xl font-black text-main">?? Weekly Demand Forecast</h3></div><div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-6 py-5 text-left">Day</th><th className="px-4 py-5 text-right">Avg Orders</th><th className="px-4 py-5 text-right">Avg Revenue</th><th className="px-4 py-5 text-right">Predicted Orders</th><th className="px-6 py-5 text-right">Predicted Revenue</th></tr></thead><tbody className="divide-y divide-border/30">{demandForecastData.weeklyForecast.map((r: any, i: number) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-6 py-4 text-xs font-black text-main">{r.dayOfWeek}</td><td className="px-4 py-4 font-mono text-right">{r.avgOrders}</td><td className="px-4 py-4 font-mono text-right">{r.avgRevenue.toLocaleString()} LE</td><td className="px-4 py-4 font-mono font-bold text-right text-blue-500">{r.predictedOrders}</td><td className="px-6 py-4 font-mono font-bold text-right text-blue-500">{r.predictedRevenue.toLocaleString()} LE</td></tr>)}</tbody></table></div></div>
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-xl p-6"><h3 className="text-lg font-black text-main mb-4">Top Items Demand (Daily Avg)</h3>{demandForecastData.topItemsDemand.map((t: any, i: number) => (<div key={i} className="flex justify-between py-1.5 text-xs border-b border-border/20"><span className="font-black text-main">{t.itemName}</span><span className="font-mono text-muted">{t.avgDailyQty}/day · {t.weeklyQty}/week</span></div>))}</div>
                  </div>
               )}
               {activeCategory === 'AI' && activeSubReport === 'Demand Forecasting' && !demandForecastData && <p className="text-center text-muted py-16">No data.</p>}

               {activeCategory === 'AI' && activeSubReport === 'Price Elasticity Simulator' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     {priceElasticityData.map((item: any, idx: number) => (<div key={idx} className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden"><div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50"><h3 className="text-sm font-black text-main">{item.itemName} <span className="text-muted font-normal">({item.currentPrice} LE · Cost: {item.cost} LE)</span></h3></div><div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-6 py-4 text-right">Change</th><th className="px-4 py-4 text-right">Price</th><th className="px-4 py-4 text-right">Est. Qty</th><th className="px-4 py-4 text-right">Est. Revenue</th><th className="px-6 py-4 text-right">Est. Profit</th></tr></thead><tbody className="divide-y divide-border/30">{item.scenarios.map((s: any, si: number) => <tr key={si} className={`hover:bg-elevated/40 transition-colors ${s.change === 0 ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''}`}><td className="px-6 py-3 font-mono text-right"><span className={s.change > 0 ? 'text-emerald-500' : s.change < 0 ? 'text-rose-500' : 'text-blue-500'}>{s.change > 0 ? '+' : ''}{s.change}%</span></td><td className="px-4 py-3 font-mono text-right">{Number(s.newPrice).toFixed(2)}</td><td className="px-4 py-3 font-mono text-right">{s.estQty}</td><td className="px-4 py-3 font-mono text-right">{s.estRevenue.toLocaleString()}</td><td className="px-6 py-3 font-mono font-bold text-right">{s.estProfit.toLocaleString()}</td></tr>)}</tbody></table></div></div>))}
                     {priceElasticityData.length === 0 && <p className="text-center text-muted py-16">No data.</p>}
                  </div>
               )}
               {activeCategory === 'AI' && activeSubReport === 'Anomaly Detection' && anomalyData && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="card-primary rounded-[2rem] border border-rose-200 dark:border-rose-800 shadow-xl p-6 bg-rose-50/30 dark:bg-rose-950/20"><h3 className="text-lg font-black text-rose-500 mb-4">?? High Discount Orders ({anomalyData.highDiscounts.length})</h3><div className="responsive-table"><table className="w-full text-xs"><thead><tr className="text-muted text-[10px] uppercase font-black"><th className="px-4 py-3 text-left">Order #</th><th className="px-4 py-3 text-right">Discount</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">% Off</th></tr></thead><tbody>{anomalyData.highDiscounts.map((o: any, i: number) => <tr key={i} className="border-t border-rose-100 dark:border-rose-900/30"><td className="px-4 py-2 font-mono">{o.orderNumber}</td><td className="px-4 py-2 font-mono text-right text-rose-500">{Number(o.discount)}</td><td className="px-4 py-2 font-mono text-right">{Number(o.total)}</td><td className="px-4 py-2 font-mono text-right">{o.discountPercent}%</td></tr>)}</tbody></table></div></div>
                     <div className="card-primary rounded-[2rem] border border-amber-200 dark:border-amber-800 shadow-xl p-6 bg-amber-50/30 dark:bg-amber-950/20"><h3 className="text-lg font-black text-amber-500 mb-4">?? High Cancel Days ({anomalyData.highCancelDays.length})</h3>{anomalyData.highCancelDays.map((d: any, i: number) => (<div key={i} className="flex justify-between py-1.5 text-xs border-b border-amber-100 dark:border-amber-900/30"><span className="font-black">{d.day}</span><span className="text-muted">{d.cancelledOrders}/{d.totalOrders} orders · <span className="text-rose-500 font-black">{d.cancelRate}% cancelled</span></span></div>))}</div>
                  </div>
               )}
               {activeCategory === 'AI' && activeSubReport === 'Anomaly Detection' && !anomalyData && <p className="text-center text-muted py-16">No data.</p>}

               {activeCategory === 'AI' && activeSubReport === 'Channel Mix Trend' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"><div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50"><h3 className="text-xl font-black text-main">Channel Mix Trend (Daily)</h3></div><div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-6 py-5 text-left">Day</th><th className="px-4 py-5 text-left">Source</th><th className="px-4 py-5 text-right">Orders</th><th className="px-6 py-5 text-right">Revenue</th></tr></thead><tbody className="divide-y divide-border/30">{channelMixData.map((r: any, i: number) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-6 py-4 font-mono text-muted">{r.day}</td><td className="px-4 py-4 text-xs font-black text-main">{r.source}</td><td className="px-4 py-4 font-mono text-right">{r.count}</td><td className="px-6 py-4 font-mono font-bold text-right">{r.revenue.toLocaleString()} LE</td></tr>)}</tbody></table></div></div>
                     {channelMixData.length === 0 && <p className="text-center text-muted py-16">No data.</p>}
                  </div>
               )}
      </>
   );
};
