import React from 'react';
import {
   BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area, Cell, PieChart, Pie
} from 'recharts';
import {
   DollarSign, TrendingUp, ShoppingBag, Calendar, Download, Printer,
   ChevronDown, Filter, Target, Megaphone, Zap, Scale, Info, Users, Clock, Box, ShieldCheck, Activity, LineChart as ChartIcon
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const CrmReports = ({ state }: any) => {
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
               {activeCategory === 'CRM' && activeSubReport === 'Customer LTV' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="bg-card/80  rounded-[2.5rem] border border-border/50 shadow-2xl overflow-hidden">
                        <div className="p-8 border-b border-border/50 bg-elevated/30">
                           <h3 className="text-2xl font-black text-main uppercase tracking-tighter flex items-center gap-4">
                              <div className="w-12 h-12 bg-violet-500/10 rounded-2xl flex items-center justify-center border border-violet-500/20 text-violet-500"><Users size={24} /></div>
                              Customer Lifetime Value
                           </h3>
                        </div>
                        {customerLTV.length === 0 ? (
                           <div className="p-16 text-center text-muted text-xs font-black uppercase tracking-widest">No customer orders found for this period</div>
                        ) : (
                           <div className="responsive-table">
                              <table className="w-full text-left border-collapse">
                                 <thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]">
                                    <th className="px-8 py-5">#</th><th className="px-6 py-5">Customer</th><th className="px-6 py-5">Phone</th><th className="px-6 py-5 text-right">Orders</th><th className="px-6 py-5 text-right">Avg Ticket</th><th className="px-8 py-5 text-right">Total Spent</th>
                                 </tr></thead>
                                 <tbody className="divide-y divide-border/30">
                                    {customerLTV.map((c, idx) => (
                                       <tr key={idx} className="hover:bg-elevated/40 transition-colors group">
                                          <td className="px-8 py-4 text-xs font-black text-muted">{idx + 1}</td>
                                          <td className="px-6 py-4 text-xs font-black text-main uppercase group-hover:text-indigo-500 transition-colors">{c.customerName}</td>
                                          <td className="px-6 py-4 font-mono text-xs text-muted">{c.phone}</td>
                                          <td className="px-6 py-4 font-mono text-sm text-right">{c.orderCount}</td>
                                          <td className="px-6 py-4 font-mono text-sm text-right">{c.avgTicket.toLocaleString()} LE</td>
                                          <td className="px-8 py-4 font-mono text-sm font-black text-emerald-500 text-right">{c.totalSpent.toLocaleString()} LE</td>
                                       </tr>
                                    ))}
                                 </tbody>
                              </table>
                           </div>
                        )}
                     </div>
                  </div>
               )}
               {activeCategory === 'CRM' && activeSubReport === 'Campaign ROI' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="bg-card/80  rounded-[2.5rem] border border-border/50 shadow-2xl overflow-hidden">
                        <div className="p-8 border-b border-border/50 bg-elevated/30">
                           <h3 className="text-2xl font-black text-main uppercase tracking-tighter flex items-center gap-4">
                              <div className="w-12 h-12 bg-fuchsia-500/10 rounded-2xl flex items-center justify-center border border-fuchsia-500/20 text-fuchsia-500"><Megaphone size={24} /></div>
                              Campaign ROI
                           </h3>
                        </div>
                        {campaignROI.length === 0 ? (
                           <div className="p-16 text-center text-muted text-xs font-black uppercase tracking-widest">No campaigns found</div>
                        ) : (
                           <div className="responsive-table">
                              <table className="w-full text-left border-collapse">
                                 <thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]">
                                    <th className="px-8 py-5">Campaign</th><th className="px-6 py-5">Type</th><th className="px-6 py-5">Status</th><th className="px-6 py-5 text-right">Reach</th><th className="px-6 py-5 text-right">Conv. %</th><th className="px-6 py-5 text-right">Revenue</th><th className="px-8 py-5 text-right">ROI %</th>
                                 </tr></thead>
                                 <tbody className="divide-y divide-border/30">
                                    {campaignROI.map((c, idx) => (
                                       <tr key={idx} className="hover:bg-elevated/40 transition-colors">
                                          <td className="px-8 py-4 text-xs font-black text-main uppercase">{c.name}</td>
                                          <td className="px-6 py-4"><span className="px-2 py-1 bg-indigo-500/10 text-indigo-500 rounded-lg text-[9px] font-black uppercase">{c.type}</span></td>
                                          <td className="px-6 py-4"><span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase ${c.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-500' : c.status === 'ACTIVE' ? 'bg-cyan-500/10 text-cyan-500' : 'bg-slate-500/10 text-slate-500'}`}>{c.status}</span></td>
                                          <td className="px-6 py-4 font-mono text-sm text-right">{c.reach.toLocaleString()}</td>
                                          <td className="px-6 py-4 font-mono text-sm text-right">{c.conversionRate}%</td>
                                          <td className="px-6 py-4 font-mono text-sm text-right">{c.revenue.toLocaleString()} LE</td>
                                          <td className={`px-8 py-4 font-mono text-sm font-black text-right ${c.roi >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{c.roi > 0 ? '+' : ''}{c.roi}%</td>
                                       </tr>
                                    ))}
                                 </tbody>
                              </table>
                           </div>
                        )}
                     </div>
                  </div>
               )}
               {activeCategory === 'CRM' && activeSubReport === 'Customer Retention' && !customerRetentionData && <p className="text-center text-muted py-16">No data.</p>}

               {activeCategory === 'CRM' && activeSubReport === 'New vs Returning' && newVsReturningData && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="grid grid-cols-2 gap-6">
                        <div className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-lg"><p className="text-[10px] font-black uppercase tracking-widest text-blue-500 mb-2">New Customers</p><p className="text-3xl font-black text-blue-500">{newVsReturningData.new.orders} <span className="text-xs text-muted">orders</span></p><p className="text-lg font-bold text-muted mt-1">{newVsReturningData.new.revenue.toLocaleString()} LE</p></div>
                        <div className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-lg"><p className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-2">Returning Customers</p><p className="text-3xl font-black text-emerald-500">{newVsReturningData.returning.orders} <span className="text-xs text-muted">orders</span></p><p className="text-lg font-bold text-muted mt-1">{newVsReturningData.returning.revenue.toLocaleString()} LE</p></div>
                     </div>
                  </div>
               )}
               {activeCategory === 'CRM' && activeSubReport === 'New vs Returning' && !newVsReturningData && <p className="text-center text-muted py-16">No data.</p>}

               {activeCategory === 'CRM' && activeSubReport === 'Customer Frequency' && customerFrequencyData && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="grid grid-cols-5 gap-3">{[{ l: '1 Visit', v: customerFrequencyData.distribution.once, c: 'text-slate-400' }, { l: '2 Visits', v: customerFrequencyData.distribution.twice, c: 'text-blue-400' }, { l: '3 Visits', v: customerFrequencyData.distribution.thrice, c: 'text-indigo-500' }, { l: '4-10 Visits', v: customerFrequencyData.distribution.frequent, c: 'text-emerald-500' }, { l: '10+ Visits', v: customerFrequencyData.distribution.veryFrequent, c: 'text-amber-500' }].map((c, i) => (<div key={i} className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-lg text-center"><p className="text-[9px] font-black uppercase text-muted">{c.l}</p><p className={`text-2xl font-black mt-1 ${c.c}`}>{c.v}</p></div>))}</div>
                     {customerFrequencyData.topCustomers?.length > 0 && <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"><div className="p-6 border-b border-slate-100 dark:border-slate-800"><h3 className="text-lg font-black text-main">Top 20 Customers by Frequency</h3></div><div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-8 py-5 text-left">Customer</th><th className="px-6 py-5 text-right">Orders</th><th className="px-8 py-5 text-right">Total Spent</th></tr></thead><tbody className="divide-y divide-border/30">{customerFrequencyData.topCustomers.map((r: any, i: number) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-8 py-4 text-xs font-black text-main">{r.customerName}</td><td className="px-6 py-4 font-mono text-right">{r.orderCount}</td><td className="px-8 py-4 font-mono font-bold text-right">{r.totalSpent.toLocaleString()} LE</td></tr>)}</tbody></table></div></div>}
                  </div>
               )}
               {activeCategory === 'CRM' && activeSubReport === 'Customer Frequency' && !customerFrequencyData && <p className="text-center text-muted py-16">No data.</p>}

               {activeCategory === 'CRM' && activeSubReport === 'Customer Churn' && churnData && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        {[
                           { l: 'Total', v: churnData.summary.total },
                           { l: 'Active (30d)', v: churnData.summary.active, c: 'text-emerald-500' },
                           { l: 'At Risk (30-60d)', v: churnData.summary.atRisk30, c: 'text-amber-500' },
                           { l: 'At Risk (60-90d)', v: churnData.summary.atRisk60, c: 'text-orange-500' },
                           { l: 'Churned (90+ d)', v: churnData.summary.churned90, c: 'text-rose-500' },
                        ].map((c: any, i: number) => (
                           <div key={i} className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-lg">
                              <p className="text-[10px] font-black uppercase tracking-widest text-muted">{c.l}</p>
                              <p className={`text-2xl font-black mt-1 ${c.c || 'text-main'}`}>{c.v}</p>
                           </div>
                        ))}
                     </div>
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800"><h3 className="text-lg font-black text-main">At-risk customers</h3></div>
                        <div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-6 py-5 text-left">Customer</th><th className="px-4 py-5 text-right">Days Since</th><th className="px-4 py-5 text-right">Orders</th><th className="px-4 py-5 text-right">Total Spent</th><th className="px-6 py-5 text-right">Last Order</th></tr></thead><tbody className="divide-y divide-border/30">{churnData.atRisk.map((r: any, i: number) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-6 py-4 text-xs font-black text-main">{r.customerName}</td><td className="px-4 py-4 font-mono text-right"><span className={`px-2 py-1 rounded-lg text-[9px] font-black ${r.daysSinceLastOrder > 90 ? 'bg-rose-500/10 text-rose-500' : r.daysSinceLastOrder > 60 ? 'bg-orange-500/10 text-orange-500' : 'bg-amber-500/10 text-amber-500'}`}>{r.daysSinceLastOrder}d</span></td><td className="px-4 py-4 font-mono text-right">{r.orderCount}</td><td className="px-4 py-4 font-mono text-right">{r.totalSpent.toLocaleString()} LE</td><td className="px-6 py-4 font-mono text-[10px] text-muted text-right">{r.lastOrder ? new Date(r.lastOrder).toLocaleDateString() : '-'}</td></tr>)}</tbody></table></div>
                     </div>
                  </div>
               )}
               {activeCategory === 'CRM' && activeSubReport === 'Customer Churn' && !churnData && <p className="text-center text-muted py-16">No data.</p>}

               {activeCategory === 'CRM' && activeSubReport === 'Customer Journey Funnel' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl p-8">
                        <h3 className="text-xl font-black text-main mb-6">Customer Journey Funnel</h3>
                        <div className="space-y-3">
                           {journeyFunnelData.map((s: any, i: number) => {
                              const width = Math.min(100, Math.max(0, Number(s.percent || 0)));
                              return (
                                 <div key={i} className="flex items-center gap-4">
                                    <span className="text-xs font-black text-muted w-40 text-right">{s.stage}</span>
                                    <div className="flex-1 rounded-xl bg-blue-500/10 overflow-hidden">
                                       <div className="h-10 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 flex items-center px-4" style={{ width: `${Math.max(width, 5)}%` }}>
                                          <span className="text-[10px] font-black text-white whitespace-nowrap">{s.count} ({s.percent}%)</span>
                                       </div>
                                    </div>
                                 </div>
                              );
                           })}
                        </div>
                     </div>
                     {journeyFunnelData.length === 0 && <p className="text-center text-muted py-16">No data.</p>}
                  </div>
               )}

               {/* ============ ADVANCED OPS ============ */}

               {activeCategory === 'OPS' && activeSubReport === 'Kitchen Performance' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
                        <div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50"><h3 className="text-xl font-black text-main">Kitchen Performance by Item</h3><p className="text-xs text-muted mt-1">Preparation times per menu item</p></div>
                        <div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-8 py-5 text-left">Item</th><th className="px-6 py-5 text-right">Prepared</th><th className="px-4 py-5 text-right">Avg (min)</th><th className="px-4 py-5 text-right">Min</th><th className="px-6 py-5 text-right">Max</th></tr></thead><tbody className="divide-y divide-border/30">{kitchenPerformanceData.map((r: any, i: number) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-8 py-4 text-xs font-black text-main">{r.itemName}</td><td className="px-6 py-4 font-mono text-right">{r.totalPrepared}</td><td className="px-4 py-4 font-mono font-bold text-right">{r.avgPrepMinutes} min</td><td className="px-4 py-4 font-mono text-emerald-500 text-right">{r.minPrepMinutes}</td><td className="px-6 py-4 font-mono text-rose-500 text-right">{r.maxPrepMinutes}</td></tr>)}</tbody></table></div>
                        {kitchenPerformanceData.length === 0 && <p className="text-center text-muted py-16">No kitchen data available.</p>}
                     </div>
                  </div>
               )}
               {activeCategory === 'CRM' && activeSubReport === 'Loyalty Points' && loyaltyData && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="grid grid-cols-3 gap-4">{[{ l: 'Total Customers', v: loyaltyData.summary.totalCustomers }, { l: 'Points Outstanding', v: loyaltyData.summary.totalPoints.toLocaleString(), c: 'text-amber-500' }, { l: 'Total Spent', v: `${loyaltyData.summary.totalSpent.toLocaleString()} LE`, c: 'text-emerald-500' }].map((c: any, i: number) => (<div key={i} className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-lg"><p className="text-[10px] font-black uppercase tracking-widest text-muted">{c.l}</p><p className={`text-2xl font-black mt-1 ${c.c || 'text-main'}`}>{c.v}</p></div>))}</div>
                     <div className="grid grid-cols-2 gap-6"><div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-xl p-6"><h3 className="text-lg font-black text-main mb-4">By Tier</h3>{loyaltyData.tiers.map((t: any, i: number) => (<div key={i} className="flex justify-between py-2 text-xs border-b border-border/20"><span className="font-black">{t.tier}</span><span className="text-muted">{t.count} customers · {t.totalPoints} pts · {t.totalSpent.toLocaleString()} LE</span></div>))}</div><div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-xl p-6"><h3 className="text-lg font-black text-main mb-4">Top Point Holders</h3>{loyaltyData.topPointHolders.slice(0, 10).map((c: any, i: number) => (<div key={i} className="flex justify-between py-1.5 text-xs"><span className="text-main font-bold">{c.name}</span><span className="font-mono text-amber-500">{c.loyaltyPoints} pts</span></div>))}</div></div>
                  </div>
               )}
               {activeCategory === 'CRM' && activeSubReport === 'Loyalty Points' && !loyaltyData && <p className="text-center text-muted py-16">No data.</p>}

               {activeCategory === 'CRM' && activeSubReport === 'Promotion Impact' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"><div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50"><h3 className="text-xl font-black text-main">Campaign / Promotion Impact</h3></div><div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-6 py-5 text-left">Campaign</th><th className="px-4 py-5 text-left">Type</th><th className="px-4 py-5 text-right">Reach</th><th className="px-4 py-5 text-right">Conv.</th><th className="px-4 py-5 text-right">Conv %</th><th className="px-4 py-5 text-right">Revenue</th><th className="px-4 py-5 text-right">Budget</th><th className="px-6 py-5 text-right">ROI</th></tr></thead><tbody className="divide-y divide-border/30">{(Array.isArray(promoImpactData) ? promoImpactData : []).map((r: any, i: number) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-6 py-4 text-xs font-black text-main">{r.name}</td><td className="px-4 py-4 text-xs text-muted">{r.type}</td><td className="px-4 py-4 font-mono text-right">{r.reach}</td><td className="px-4 py-4 font-mono text-right">{r.conversions}</td><td className="px-4 py-4 font-mono text-right">{r.conversionRate}%</td><td className="px-4 py-4 font-mono text-right">{r.revenue.toLocaleString()}</td><td className="px-4 py-4 font-mono text-right text-muted">{r.budget.toLocaleString()}</td><td className="px-6 py-4 font-mono font-bold text-right"><span className={r.roi >= 0 ? 'text-emerald-500' : 'text-rose-500'}>{r.roi}%</span></td></tr>)}</tbody></table></div></div>
                  </div>
               )}
      </>
   );
};
