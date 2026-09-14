import React from 'react';
import {
   BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area, Cell, PieChart, Pie
} from 'recharts';
import {
   DollarSign, TrendingUp, ShoppingBag, Calendar, Download, Printer,
   ChevronDown, Filter, Target, Megaphone, Zap, Scale, Info, Users, Clock, Box, ShieldCheck, Activity, LineChart as ChartIcon
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ReportDataTable, { fmtMoney, fmtNum } from './shared/ReportDataTable';

export const OpsReports = ({ state }: any) => {
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
       revenueByWeekdayMax, daypartRevenueMax, settings
   } = state;
   const isAr = settings?.language !== 'en';
   const currency = settings?.currencySymbol || (isAr ? 'ج.م' : 'EGP');

   return (
      <>
               {activeCategory === 'OPS' && activeSubReport === 'Branch Performance' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="bg-card/80  rounded-[2.5rem] border border-border/50 shadow-2xl overflow-hidden">
                        <div className="p-8 border-b border-border/50 bg-elevated/30">
                           <h3 className="text-2xl font-black text-main uppercase tracking-tighter flex items-center gap-4">
                              <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20 text-indigo-500"><Activity size={24} /></div>
                              Branch Performance
                           </h3>
                        </div>
                        {branchPerformance.length === 0 ? (
                           <div className="p-16 text-center text-muted text-xs font-black uppercase tracking-widest">No branch data found for this period</div>
                        ) : (
                           <div className="responsive-table">
                              <table className="w-full text-left border-collapse">
                                 <thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]">
                                    <th className="px-8 py-5">Branch</th><th className="px-6 py-5 text-right">Orders</th><th className="px-6 py-5 text-right">Revenue</th><th className="px-6 py-5 text-right">Avg Ticket</th><th className="px-8 py-5 text-right">Cancelled</th>
                                 </tr></thead>
                                 <tbody className="divide-y divide-border/30">
                                    {branchPerformance.map((b, idx) => (
                                       <tr key={idx} className="hover:bg-elevated/40 transition-colors">
                                          <td className="px-8 py-4 text-xs font-black text-main uppercase">{b.branchName}</td>
                                          <td className="px-6 py-4 font-mono text-sm font-bold text-right">{b.orderCount}</td>
                                          <td className="px-6 py-4 font-mono text-sm font-black text-emerald-500 text-right">{b.revenue.toLocaleString()} LE</td>
                                          <td className="px-6 py-4 font-mono text-sm text-right">{b.avgTicket.toLocaleString()} LE</td>
                                          <td className="px-8 py-4 font-mono text-sm text-rose-500 text-right">{b.cancelledCount}</td>
                                       </tr>
                                    ))}
                                 </tbody>
                              </table>
                           </div>
                        )}
                     </div>
                  </div>
               )}
               {activeCategory === 'OPS' && activeSubReport === 'Order Preparation Time' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="bg-card/80  rounded-[2.5rem] border border-border/50 shadow-2xl overflow-hidden">
                        <div className="p-8 border-b border-border/50 bg-elevated/30">
                           <h3 className="text-2xl font-black text-main uppercase tracking-tighter flex items-center gap-4">
                              <div className="w-12 h-12 bg-cyan-500/10 rounded-2xl flex items-center justify-center border border-cyan-500/20 text-cyan-500"><Clock size={24} /></div>
                              Order Preparation Time
                           </h3>
                        </div>
                        {orderPrepTime.length === 0 ? (
                           <div className="p-16 text-center text-muted text-xs font-black uppercase tracking-widest">No completed orders with prep time data found</div>
                        ) : (
                           <div className="responsive-table">
                              <table className="w-full text-left border-collapse">
                                 <thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]">
                                    <th className="px-8 py-5">Branch</th><th className="px-6 py-5">Order Type</th><th className="px-6 py-5 text-right">Orders</th><th className="px-6 py-5 text-right">Avg (min)</th><th className="px-6 py-5 text-right">Min</th><th className="px-8 py-5 text-right">Max</th>
                                 </tr></thead>
                                 <tbody className="divide-y divide-border/30">
                                    {orderPrepTime.map((row, idx) => (
                                       <tr key={idx} className="hover:bg-elevated/40 transition-colors">
                                          <td className="px-8 py-4 text-xs font-black text-main uppercase">{row.branchName}</td>
                                          <td className="px-6 py-4"><span className="px-2 py-1 bg-indigo-500/10 text-indigo-500 rounded-lg text-[9px] font-black uppercase">{row.orderType}</span></td>
                                          <td className="px-6 py-4 font-mono text-sm text-right">{row.orderCount}</td>
                                          <td className="px-6 py-4 font-mono text-sm font-black text-right">{row.avgPrepMinutes} min</td>
                                          <td className="px-6 py-4 font-mono text-sm text-emerald-500 text-right">{row.minPrepMinutes} min</td>
                                          <td className="px-8 py-4 font-mono text-sm text-rose-500 text-right">{row.maxPrepMinutes} min</td>
                                       </tr>
                                    ))}
                                 </tbody>
                              </table>
                           </div>
                        )}
                     </div>
                  </div>
               )}
               {activeCategory === 'OPS' && activeSubReport === 'Delivery Performance' && deliveryPerformance && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {[{ label: 'Delivery Orders', value: deliveryPerformance.summary.orderCount },
                        { label: 'Revenue', value: `${deliveryPerformance.summary.revenue.toLocaleString()} LE` },
                        { label: 'Avg Ticket', value: `${deliveryPerformance.summary.avgTicket} LE` },
                        { label: 'Delivery Fees', value: `${deliveryPerformance.summary.totalDeliveryFees.toLocaleString()} LE` },
                        { label: 'Free Deliveries', value: deliveryPerformance.summary.freeDeliveryCount },
                        { label: 'Avg Delivery Time', value: `${deliveryPerformance.summary.avgDeliveryMinutes} min` },
                        ].map((card, idx) => (
                           <div key={idx} className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-lg">
                              <p className="text-[10px] font-black uppercase tracking-widest text-muted">{card.label}</p>
                              <p className="text-2xl font-black text-main mt-1">{card.value}</p>
                           </div>
                        ))}
                     </div>
                     {deliveryPerformance.byDriver.length > 0 && (
                        <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
                           <div className="p-6 border-b border-slate-100 dark:border-slate-800"><h3 className="text-lg font-black text-main">By Driver</h3></div>
                           <div className="responsive-table">
                              <table className="w-full text-xs">
                                 <thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]">
                                    <th className="px-8 py-5 text-left">Driver</th><th className="px-6 py-5 text-right">Orders</th><th className="px-6 py-5 text-right">Revenue</th><th className="px-8 py-5 text-right">Avg Time</th>
                                 </tr></thead>
                                 <tbody className="divide-y divide-border/30">
                                    {deliveryPerformance.byDriver.map((d: any, idx: number) => (
                                       <tr key={idx} className="hover:bg-elevated/40 transition-colors">
                                          <td className="px-8 py-4 text-xs font-black text-main">{d.driverId}</td>
                                          <td className="px-6 py-4 font-mono text-right">{d.orderCount}</td>
                                          <td className="px-6 py-4 font-mono font-bold text-right">{d.revenue.toLocaleString()} LE</td>
                                          <td className="px-8 py-4 font-mono text-right">{d.avgDeliveryMinutes} min</td>
                                       </tr>
                                    ))}
                                 </tbody>
                              </table>
                           </div>
                        </div>
                     )}
                  </div>
               )}
               {activeCategory === 'OPS' && activeSubReport === 'Delivery Performance' && !deliveryPerformance && (
                  <p className="text-center text-muted py-16">No delivery data available.</p>
               )}
               {activeCategory === 'OPS' && activeSubReport === 'Dine-in Tables' && (
                   <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150" dir={isAr ? 'rtl' : 'ltr'}>
                      <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
                         <div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                            <h3 className="text-xl font-black text-main">{isAr ? 'التقرير التفصيلي للطاولات' : 'Detailed Dine-in Table Report'}</h3>
                            <p className="text-xs text-muted mt-1">{isAr ? 'الإعدادات الثابتة والخصومات ونتائج التشغيل لكل طاولة.' : 'Table settings, discounts and operating results.'}</p>
                         </div>
                         <div className="responsive-table">
                            <table className="w-full min-w-[1180px] text-xs">
                               <thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]">
                                  <th className="px-5 py-5 text-start">{isAr ? 'الطاولة' : 'Table'}</th>
                                  <th className="px-4 py-5 text-start">{isAr ? 'الإعدادات' : 'Settings'}</th>
                                  <th className="px-4 py-5 text-start">{isAr ? 'تعليمات' : 'Notes'}</th>
                                  <th className="px-4 py-5 text-end">{isAr ? 'الطلبات' : 'Orders'}</th>
                                  <th className="px-4 py-5 text-end">{isAr ? 'الإيراد' : 'Revenue'}</th>
                                  <th className="px-4 py-5 text-end">{isAr ? 'متوسط الفاتورة' : 'Avg Ticket'}</th>
                                  <th className="px-4 py-5 text-end">{isAr ? 'خصم فعلي' : 'Actual Discount'}</th>
                                  <th className="px-5 py-5 text-end">{isAr ? 'متوسط المدة' : 'Avg Duration'}</th>
                               </tr></thead>
                               <tbody className="divide-y divide-border/30">
                                  {dineInTables.map((row, idx) => (
                                     <tr key={idx} className="hover:bg-elevated/40 transition-colors">
                                        <td className="px-5 py-4">
                                           <div className="font-black text-main">{row.tableName || row.tableId}</div>
                                           <div className="mt-1 text-[10px] text-muted">{row.zoneName || '—'} · {row.seats} {isAr ? 'كرسي' : 'seats'} · {row.status}</div>
                                        </td>
                                        <td className="px-4 py-4">
                                           <div className="flex max-w-[260px] flex-wrap gap-1">
                                              {row.isVIP && <span className="rounded-lg bg-amber-500/10 px-2 py-1 font-black text-amber-600">VIP</span>}
                                              {row.defaultCouponCode
                                                 ? <span className="rounded-lg bg-violet-500/10 px-2 py-1 font-black text-violet-600">{isAr ? 'كوبون' : 'Coupon'}: {row.defaultCouponCode}</span>
                                                 : row.configuredDiscountPercent > 0
                                                    ? <span className="rounded-lg bg-emerald-500/10 px-2 py-1 font-black text-emerald-600">{isAr ? 'خصم ثابت' : 'Fixed'} {row.configuredDiscountPercent}%</span>
                                                    : <span className="text-muted">—</span>}
                                              {row.minSpend > 0 && <span className="rounded-lg bg-sky-500/10 px-2 py-1 font-black text-sky-600">{isAr ? 'حد أدنى' : 'Min'} {row.minSpend} {currency}</span>}
                                           </div>
                                        </td>
                                        <td className="max-w-[220px] px-4 py-4 text-muted"><div className="line-clamp-2" title={row.notes}>{row.notes || '—'}</div></td>
                                        <td className="px-4 py-4 font-mono text-end">{row.orderCount}</td>
                                        <td className="px-4 py-4 font-mono font-bold text-end">{row.revenue.toLocaleString()} {currency}</td>
                                        <td className="px-4 py-4 font-mono text-end">{row.avgTicket} {currency}</td>
                                        <td className="px-4 py-4 font-mono text-end">{row.totalDiscount.toLocaleString()} {currency}<div className="text-[9px] text-muted">{row.discountedOrderCount} {isAr ? 'طلب' : 'orders'} · {row.discountRate}%</div></td>
                                        <td className="px-5 py-4 font-mono text-end">{row.avgDurationMinutes} {isAr ? 'د' : 'min'}</td>
                                     </tr>
                                  ))}
                               </tbody>
                            </table>
                         </div>
                         {dineInTables.length === 0 && <p className="text-center text-muted py-16">{isAr ? 'لا توجد طاولات.' : 'No tables available.'}</p>}
                     </div>
                  </div>
               )}
               {activeCategory === 'OPS' && activeSubReport === 'Kitchen Performance' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
                        <div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                           <h3 className="text-xl font-black text-main">Kitchen Performance by Item</h3>
                           <p className="text-xs text-muted mt-1">Preparation times per menu item</p>
                        </div>
                        <div className="responsive-table">
                           <table className="w-full text-xs">
                              <thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-8 py-5 text-left">Item</th><th className="px-6 py-5 text-right">Prepared</th><th className="px-4 py-5 text-right">Avg (min)</th><th className="px-4 py-5 text-right">Min</th><th className="px-6 py-5 text-right">Max</th></tr></thead>
                              <tbody className="divide-y divide-border/30">{kitchenPerformanceData.map((r: any, i: number) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-8 py-4 text-xs font-black text-main">{r.itemName}</td><td className="px-6 py-4 font-mono text-right">{r.totalPrepared}</td><td className="px-4 py-4 font-mono font-bold text-right">{r.avgPrepMinutes} min</td><td className="px-4 py-4 font-mono text-emerald-500 text-right">{r.minPrepMinutes}</td><td className="px-6 py-4 font-mono text-rose-500 text-right">{r.maxPrepMinutes}</td></tr>)}</tbody>
                           </table>
                        </div>
                        {kitchenPerformanceData.length === 0 && <p className="text-center text-muted py-16">No kitchen data available.</p>}
                     </div>
                  </div>
               )}
               {activeCategory === 'OPS' && activeSubReport === 'Table Turnover' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                      <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"><div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50"><h3 className="text-xl font-black text-main">Table Turnover Rate</h3></div><div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-8 py-5 text-left">Table</th><th className="px-4 py-5 text-left">Zone</th><th className="px-6 py-5 text-right">Orders</th><th className="px-6 py-5 text-right">Turns/Day</th><th className="px-6 py-5 text-right">Revenue</th><th className="px-8 py-5 text-right">Rev/Day</th></tr></thead><tbody className="divide-y divide-border/30">{tableTurnoverData.map((r: any) => <tr key={r.tableId} className="hover:bg-elevated/40 transition-colors"><td className="px-8 py-4 text-xs font-black text-main">{r.tableName || r.tableId}</td><td className="px-4 py-4 text-muted">{r.zoneName || '—'}</td><td className="px-6 py-4 font-mono text-right">{r.totalOrders}</td><td className="px-6 py-4 font-mono font-bold text-right">{r.turnsPerDay}</td><td className="px-6 py-4 font-mono text-right">{r.revenue.toLocaleString()} LE</td><td className="px-8 py-4 font-mono text-right">{r.revenuePerDay} LE</td></tr>)}</tbody></table></div></div>
                     {tableTurnoverData.length === 0 && <p className="text-center text-muted py-16">No data.</p>}
                  </div>
               )}
               {activeCategory === 'OPS' && activeSubReport === 'Wait Time' && waitTimeData && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{waitTimeData.byType.map((r: any, i: number) => (<div key={i} className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-lg"><p className="text-[10px] font-black uppercase tracking-widest text-muted">{r.orderType}</p><p className="text-2xl font-black text-main mt-1">{r.avgWaitMinutes} min</p><p className="text-[9px] text-muted">{r.orderCount} orders · {r.minWaitMinutes}–{r.maxWaitMinutes} min range</p></div>))}</div>
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"><div className="p-6 border-b border-slate-100 dark:border-slate-800"><h3 className="text-lg font-black text-main">Daily Avg Wait Time</h3></div><div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-8 py-5 text-left">Day</th><th className="px-6 py-5 text-right">Avg Wait (min)</th><th className="px-8 py-5 text-right">Orders</th></tr></thead><tbody className="divide-y divide-border/30">{waitTimeData.daily.map((r: any, i: number) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-8 py-4 text-xs font-black text-main">{r.day}</td><td className="px-6 py-4 font-mono font-bold text-right">{r.avgWaitMinutes} min</td><td className="px-8 py-4 font-mono text-right">{r.orderCount}</td></tr>)}</tbody></table></div></div>
                  </div>
               )}
               {activeCategory === 'OPS' && activeSubReport === 'Wait Time' && !waitTimeData && <p className="text-center text-muted py-16">No data.</p>}

               {activeCategory === 'OPS' && activeSubReport === 'Driver Utilization' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"><div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50"><h3 className="text-xl font-black text-main">Driver Utilization</h3></div><div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-6 py-5 text-left">Driver</th><th className="px-4 py-5 text-right">Orders</th><th className="px-4 py-5 text-right">Orders/Day</th><th className="px-4 py-5 text-right">Revenue</th><th className="px-4 py-5 text-right">Del. Fees</th><th className="px-6 py-5 text-right">Avg Delivery</th></tr></thead><tbody className="divide-y divide-border/30">{driverUtilData.map((r: any, i: number) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-6 py-4 text-xs font-black text-main">{r.driverName}</td><td className="px-4 py-4 font-mono text-right">{r.orderCount}</td><td className="px-4 py-4 font-mono text-right">{r.ordersPerDay}</td><td className="px-4 py-4 font-mono text-right">{r.revenue.toLocaleString()}</td><td className="px-4 py-4 font-mono text-right text-muted">{r.totalDeliveryFees.toLocaleString()}</td><td className="px-6 py-4 font-mono font-bold text-right">{r.avgDeliveryMinutes} min</td></tr>)}</tbody></table></div></div>
                     {driverUtilData.length === 0 && <p className="text-center text-muted py-16">No data.</p>}
                  </div>
               )}
               {activeCategory === 'OPS' && activeSubReport === 'Branch Comparison' && branchCompData && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="card-primary rounded-2xl border border-blue-200 dark:border-blue-800 p-5 shadow-lg bg-blue-50/30 dark:bg-blue-950/20"><p className="text-[10px] font-black uppercase tracking-widest text-blue-400">?? Top Branch</p><p className="text-2xl font-black text-blue-500 mt-1">{branchCompData.topBranch}</p></div>
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"><div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-6 py-5 text-left">Branch</th><th className="px-4 py-5 text-right">Orders</th><th className="px-4 py-5 text-right">Revenue</th><th className="px-4 py-5 text-right">Avg Ticket</th><th className="px-4 py-5 text-right">Cancelled</th><th className="px-6 py-5 text-right">Discounts</th></tr></thead><tbody className="divide-y divide-border/30">{branchCompData.branches.map((r: any, i: number) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-6 py-4 text-xs font-black text-main">{r.branchName}</td><td className="px-4 py-4 font-mono text-right">{r.orderCount}</td><td className="px-4 py-4 font-mono font-bold text-right">{r.revenue.toLocaleString()} LE</td><td className="px-4 py-4 font-mono text-right">{r.avgTicket} LE</td><td className="px-4 py-4 font-mono text-right text-rose-500">{r.cancelCount}</td><td className="px-6 py-4 font-mono text-right text-muted">{r.totalDiscount.toLocaleString()}</td></tr>)}</tbody></table></div></div>
                  </div>
               )}
               {activeCategory === 'OPS' && activeSubReport === 'Branch Comparison' && !branchCompData && <p className="text-center text-muted py-16">No data.</p>}

               {/* ============ PHASE 4: MENU INTELLIGENCE ============ */}

               {activeCategory === 'SALES' && activeSubReport === 'Menu Cannibalization' && cannibalizationData && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="grid grid-cols-2 gap-6"><div className="card-primary rounded-[2rem] border border-rose-200 dark:border-rose-800 shadow-xl p-6 bg-rose-50/30 dark:bg-rose-950/20"><h3 className="text-lg font-black text-rose-500 mb-4">?? Declining ({cannibalizationData.declining.length})</h3>{cannibalizationData.declining.slice(0, 10).map((r: any, i: number) => (<div key={i} className="flex justify-between py-1.5 text-xs border-b border-rose-100 dark:border-rose-900/30"><span className="font-black text-main">{r.itemName}</span><span className="font-mono text-rose-500">{r.qtyChangePercent}%</span></div>))}</div><div className="card-primary rounded-[2rem] border border-emerald-200 dark:border-emerald-800 shadow-xl p-6 bg-emerald-50/30 dark:bg-emerald-950/20"><h3 className="text-lg font-black text-emerald-500 mb-4">?? Growing ({cannibalizationData.growing.length})</h3>{cannibalizationData.growing.slice(0, 10).map((r: any, i: number) => (<div key={i} className="flex justify-between py-1.5 text-xs border-b border-emerald-100 dark:border-emerald-900/30"><span className="font-black text-main">{r.itemName}</span><span className="font-mono text-emerald-500">+{r.qtyChangePercent}%</span></div>))}</div></div>
                  </div>
               )}
               {activeCategory === 'OPS' && activeSubReport === 'Delivery Zone Analytics' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"><div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50"><h3 className="text-xl font-black text-main">Delivery Zone Analytics</h3></div><div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-6 py-5 text-left">Area</th><th className="px-4 py-5 text-right">Orders</th><th className="px-4 py-5 text-right">Revenue</th><th className="px-4 py-5 text-right">Avg Ticket</th><th className="px-6 py-5 text-right">Fees</th></tr></thead><tbody className="divide-y divide-border/30">{deliveryZoneData.map((r: any, i: number) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-6 py-4 text-xs font-black text-main">{r.area}</td><td className="px-4 py-4 font-mono text-right">{r.orderCount}</td><td className="px-4 py-4 font-mono font-bold text-right">{r.revenue.toLocaleString()} LE</td><td className="px-4 py-4 font-mono text-right">{r.avgTicket} LE</td><td className="px-6 py-4 font-mono text-right text-muted">{r.totalFees.toLocaleString()}</td></tr>)}</tbody></table></div></div>
                     {deliveryZoneData.length === 0 && <p className="text-center text-muted py-16">No data.</p>}
                  </div>
               )}
               {activeCategory === 'OPS' && activeSubReport === 'Delivery Cost vs Revenue' && deliveryCostData && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[{ l: 'Total Delivery Orders', v: deliveryCostData.summary.totalOrders }, { l: 'Revenue', v: `${deliveryCostData.summary.totalRevenue.toLocaleString()} LE` }, { l: 'Total Fees', v: `${deliveryCostData.summary.totalFees.toLocaleString()} LE`, c: 'text-amber-500' }, { l: 'Fee % of Revenue', v: `${deliveryCostData.summary.feePercentOfRevenue}%`, c: 'text-blue-500' }].map((c: any, i: number) => (<div key={i} className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-lg"><p className="text-[10px] font-black uppercase tracking-widest text-muted">{c.l}</p><p className={`text-2xl font-black mt-1 ${c.c || 'text-main'}`}>{c.v}</p></div>))}</div>
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"><div className="p-6 border-b border-slate-100 dark:border-slate-800"><h3 className="text-lg font-black text-main">Daily Breakdown</h3></div><div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-6 py-5 text-left">Day</th><th className="px-4 py-5 text-right">Orders</th><th className="px-4 py-5 text-right">Revenue</th><th className="px-4 py-5 text-right">Del. Fees</th><th className="px-6 py-5 text-right">Free</th></tr></thead><tbody className="divide-y divide-border/30">{deliveryCostData.daily.map((r: any, i: number) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-6 py-4 font-mono text-main">{r.day}</td><td className="px-4 py-4 font-mono text-right">{r.orderCount}</td><td className="px-4 py-4 font-mono text-right">{r.revenue.toLocaleString()}</td><td className="px-4 py-4 font-mono text-right text-muted">{r.deliveryFees.toLocaleString()}</td><td className="px-6 py-4 font-mono text-right">{r.freeDeliveries}</td></tr>)}</tbody></table></div></div>
                  </div>
               )}
               {activeCategory === 'OPS' && activeSubReport === 'Delivery Cost vs Revenue' && !deliveryCostData && <p className="text-center text-muted py-16">No data.</p>}

                {activeCategory === 'OPS' && activeSubReport === '3rd Party vs In-House' && thirdPartyData && (
                   <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                      <ReportDataTable
                         title={isAr ? 'طرف ثالث مقابل داخلي — جدول' : '3rd Party vs In-House — table'}
                         data={[
                            { channel: isAr ? 'توصيل داخلي' : 'In-House', orders: thirdPartyData.inHouse?.orderCount, revenue: thirdPartyData.inHouse?.revenue, avgMin: thirdPartyData.inHouse?.avgDeliveryMinutes },
                            { channel: isAr ? 'طرف ثالث' : '3rd Party', orders: thirdPartyData.thirdParty?.orderCount, revenue: thirdPartyData.thirdParty?.revenue, avgMin: (thirdPartyData.thirdParty as any)?.avgDeliveryMinutes },
                         ]}
                         columns={[
                            { key: 'channel', label: isAr ? 'القناة' : 'Channel', sortable: false },
                            { key: 'orders', label: isAr ? 'الطلبات' : 'Orders', align: 'right', sum: true, sortable: false, format: (v: any) => fmtNum(v) },
                            { key: 'revenue', label: isAr ? 'الإيراد' : 'Revenue', align: 'right', sum: true, sortable: false, format: (v: any) => fmtMoney(v, currency) },
                            { key: 'avgMin', label: isAr ? 'متوسط الدقائق' : 'Avg min', align: 'right', sortable: false, format: (v: any) => (v == null ? '-' : `${v}`) },
                         ]}
                         exportFilename="third-party-vs-inhouse"
                         lang={isAr ? 'ar' : 'en'}
                      />
                     <div className="grid grid-cols-2 gap-6"><div className="card-primary rounded-[2rem] border border-blue-200 dark:border-blue-800 shadow-xl p-6 bg-blue-50/30 dark:bg-blue-950/20"><h3 className="text-lg font-black text-blue-500 mb-4">?? In-House Delivery</h3><div className="space-y-2 text-xs"><div className="flex justify-between"><span className="text-muted">Orders</span><span className="font-black text-main">{thirdPartyData.inHouse.orderCount}</span></div><div className="flex justify-between"><span className="text-muted">Revenue</span><span className="font-black text-main">{thirdPartyData.inHouse.revenue.toLocaleString()} LE</span></div><div className="flex justify-between"><span className="text-muted">Avg Delivery</span><span className="font-black text-blue-500">{thirdPartyData.inHouse.avgDeliveryMinutes} min</span></div></div></div><div className="card-primary rounded-[2rem] border border-purple-200 dark:border-purple-800 shadow-xl p-6 bg-purple-50/30 dark:bg-purple-950/20"><h3 className="text-lg font-black text-purple-500 mb-4">?? 3rd Party</h3><div className="space-y-2 text-xs"><div className="flex justify-between"><span className="text-muted">Orders</span><span className="font-black text-main">{thirdPartyData.thirdParty.orderCount}</span></div><div className="flex justify-between"><span className="text-muted">Revenue</span><span className="font-black text-main">{thirdPartyData.thirdParty.revenue.toLocaleString()} LE</span></div></div></div></div>
                     {/* Call-center + platform split (from Channel Mix Trend, same period). */}
                     {Array.isArray(channelMixData) && channelMixData.length > 0 && (() => {
                        // Channel key (server): 'call_center' for in-house calls,
                        // platform id ('talabat'…​) for aggregator orders, 'pos'/'restaurant' otherwise.
                        const isCC = (s: string) => {
                           const k = String(s || '').toLowerCase();
                           return k === 'call_center' || (k !== 'pos' && k !== 'restaurant' && k !== 'unknown');
                        };
                        const rows = channelMixData.filter((r: any) => isCC(r.source));
                        const ccOrders = rows.reduce((s: number, r: any) => s + Number(r.count || 0), 0);
                        const ccRevenue = rows.reduce((s: number, r: any) => s + Number(r.revenue || 0), 0);
                        const byPlatform: Record<string, { orders: number; revenue: number }> = {};
                        rows.forEach((r: any) => {
                           const k = String(r.source || 'call_center');
                           byPlatform[k] = byPlatform[k] || { orders: 0, revenue: 0 };
                           byPlatform[k].orders += Number(r.count || 0);
                           byPlatform[k].revenue += Number(r.revenue || 0);
                        });
                        return (
                           <div className="card-primary rounded-[2rem] border border-indigo-200 dark:border-indigo-800 shadow-xl p-6">
                              <h3 className="text-lg font-black text-main mb-1">{isAr ? 'الكول سنتر والمنصات (نفس الفترة)' : 'Call Center & Platforms (same period)'}</h3>
                              <p className="text-xs text-muted font-bold mb-4">{isAr ? `طلبات: ${ccOrders} — إيراد: ${ccRevenue.toLocaleString()}` : `${ccOrders} orders — ${ccRevenue.toLocaleString()} revenue`}</p>
                              <div className="space-y-1.5">
                                 {Object.entries(byPlatform).map(([k, v]) => (
                                    <div key={k} className="flex items-center justify-between text-xs font-bold border-b border-border/20 pb-1.5">
                                       <span className="uppercase tracking-widest">{k}</span>
                                       <span className="font-mono">{v.orders} / {v.revenue.toLocaleString()}</span>
                                    </div>
                                 ))}
                                 {rows.length === 0 && <p className="text-xs text-muted font-bold">{isAr ? 'لا توجد طلبات كول سنتر في الفترة' : 'No call-center orders in range'}</p>}
                              </div>
                           </div>
                        );
                     })()}
                  </div>
               )}
               {activeCategory === 'OPS' && activeSubReport === '3rd Party vs In-House' && !thirdPartyData && <p className="text-center text-muted py-16">No data.</p>}

               {/* ============ PHASE 4: AI & PREDICTIVE ============ */}

                {activeCategory === 'AI' && activeSubReport === 'Daily Flash Report' && dailyFlashData && (
                   <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                         <ReportDataTable
                            title={isAr ? 'الفلاش حسب النوع — جدول' : 'Flash by Type — table'}
                            data={dailyFlashData.byType || []}
                            columns={[
                               { key: 'type', label: isAr ? 'النوع' : 'Type' },
                               { key: 'count', label: isAr ? 'الطلبات' : 'Orders', align: 'right', sum: true, format: (v: any) => fmtNum(v) },
                               { key: 'revenue', label: isAr ? 'الإيراد' : 'Revenue', align: 'right', sum: true, format: (v: any) => fmtMoney(v, currency) },
                            ]}
                            exportFilename="daily-flash-by-type"
                            lang={isAr ? 'ar' : 'en'}
                         />
                         <ReportDataTable
                            title={isAr ? 'مدفوعات الفلاش — جدول' : 'Flash Payments — table'}
                            data={dailyFlashData.paymentMix || []}
                            columns={[
                               { key: 'method', label: isAr ? 'الطريقة' : 'Method' },
                               { key: 'total', label: isAr ? 'الإجمالي' : 'Total', align: 'right', sum: true, format: (v: any) => fmtMoney(v, currency) },
                            ]}
                            exportFilename="daily-flash-payments"
                            lang={isAr ? 'ar' : 'en'}
                         />
                      </div>
                     <div className="card-primary rounded-2xl border border-blue-200 dark:border-blue-800 p-5 shadow-lg bg-blue-50/30 dark:bg-blue-950/20"><p className="text-[10px] font-black uppercase tracking-widest text-blue-400">?? Daily Flash — {dailyFlashData.date}</p></div>
                     <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[{ l: 'Revenue', v: `${dailyFlashData.revenue.toLocaleString()} LE` }, { l: 'Orders', v: dailyFlashData.orderCount }, { l: 'Avg Ticket', v: `${dailyFlashData.avgTicket} LE` }, { l: 'Cancelled', v: dailyFlashData.cancelledOrders, c: 'text-rose-500' }, { l: 'Discounts', v: `${dailyFlashData.totalDiscount.toLocaleString()} LE`, c: 'text-amber-500' }, { l: 'Tips', v: `${dailyFlashData.totalTips.toLocaleString()} LE`, c: 'text-emerald-500' }].map((c: any, i: number) => (<div key={i} className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-lg"><p className="text-[10px] font-black uppercase tracking-widest text-muted">{c.l}</p><p className={`text-2xl font-black mt-1 ${c.c || 'text-main'}`}>{c.v}</p></div>))}</div>
                     <div className="grid grid-cols-2 gap-6"><div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-xl p-6"><h3 className="text-lg font-black text-main mb-3">By Type</h3>{dailyFlashData.byType.map((t: any, i: number) => (<div key={i} className="flex justify-between py-1.5 text-xs border-b border-border/20"><span className="font-black">{t.type}</span><span className="text-muted">{t.count} orders · {t.revenue.toLocaleString()} LE</span></div>))}</div><div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-xl p-6"><h3 className="text-lg font-black text-main mb-3">Payments</h3>{dailyFlashData.paymentMix.map((p: any, i: number) => (<div key={i} className="flex justify-between py-1.5 text-xs border-b border-border/20"><span className="font-black">{p.method}</span><span className="font-mono font-bold">{p.total.toLocaleString()} LE</span></div>))}</div></div>
                  </div>
               )}
      </>
   );
};
