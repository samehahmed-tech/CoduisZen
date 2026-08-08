import React from 'react';
import {
   BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area, Cell, PieChart, Pie, ComposedChart
} from 'recharts';
import {
   DollarSign, TrendingUp, ShoppingBag, Calendar, Download, Printer,
   ChevronDown, Filter, Target, Megaphone, Zap, Scale, Info, Users, Clock, Box, ShieldCheck, Activity, LineChart as ChartIcon
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { HOURS, WEEK_DAYS } from '../reportConstants';
import { useAuthStore } from '../../../stores/useAuthStore';
import { translations } from '../../../services/translations';

export const SalesReports = ({ state }: any) => {
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

   const { settings } = useAuthStore();
   const lang = settings.language === 'en' ? 'en' : 'ar';
   const t = translations[lang];
   const currencySymbol = settings.currencySymbol || 'LE';

   return (
      <>
               {activeCategory === 'SALES' && activeSubReport === 'Daily Sales' && (
                  <div className="space-y-8 animate-in slide-in-from-bottom-5 duration-700">
                     <div className="bg-card/80  p-8 md:p-12 rounded-[3.5rem] border border-border/50 shadow-2xl relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none" />
                        <h3 className="text-3xl font-black text-main mb-10 tracking-tighter uppercase flex items-center gap-4">
                           <div className="w-1.5 h-8 bg-gradient-to-b from-emerald-500 to-cyan-500 rounded-full" />
                           {t.daily_sales_overview}
                        </h3>
                        <div className="min-h-[360px] md:h-[460px] lg:h-[540px] w-full relative overflow-hidden z-10">
                           <ResponsiveContainer width="100%" height="100%" minHeight={400} minWidth={0}>
                              <ComposedChart data={salesSeries} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                                 <defs>
                                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                                 </defs>
                                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                 <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#10b981', fontSize: 13, fontWeight: 900 }} dy={10} />
                                 <YAxis yAxisId="money" axisLine={false} tickLine={false} tick={{ fill: '#10b981', fontSize: 12, fontWeight: 900 }} dx={-10} />
                                 <YAxis yAxisId="orders" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#0ea5e9', fontSize: 12, fontWeight: 900 }} />
                                 <Tooltip contentStyle={{ borderRadius: '1.5rem', backgroundColor: 'rgba(15,23,42,0.9)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', padding: '24px' }} itemStyle={{ fontWeight: 'black' }} />
                                 <Legend iconType="circle" wrapperStyle={{ paddingTop: '40px', fontWeight: 'bold' }} />
                                 <Area yAxisId="money" type="monotone" dataKey="revenue" name={t.revenue} stroke="#10b981" fill="url(#colorSales)" strokeWidth={4} />
                                 <Line yAxisId="orders" type="monotone" dataKey="orders" name={t.orders} stroke="#0ea5e9" strokeWidth={3} dot={{ r: 5, fill: '#0ea5e9', strokeWidth: 3, stroke: 'currentColor' }} activeDot={{ r: 8, strokeWidth: 0 }} />
                              </ComposedChart>
                           </ResponsiveContainer>
                        </div>
                     </div>
                  </div>
               )}
               {activeCategory === 'SALES' && activeSubReport === 'Hourly Trends' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
                        <div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                           <h3 className="text-xl font-black text-main">Hourly Sales Trend</h3>
                           <p className="text-xs text-muted mt-1">Revenue and orders by hour</p>
                        </div>
                        <div className="p-6 min-h-[320px]">
                           <ResponsiveContainer width="100%" height={320}>
                              <ComposedChart data={hourlySales}>
                                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.25)" />
                                 <XAxis dataKey="hour" tick={{ fontSize: 11, fontWeight: 700 }} />
                                 <YAxis yAxisId="money" tick={{ fontSize: 11, fontWeight: 700 }} />
                                 <YAxis yAxisId="orders" orientation="right" tick={{ fontSize: 11, fontWeight: 700 }} />
                                 <Tooltip />
                                 <Legend />
                                 <Bar yAxisId="money" dataKey="revenue" name="Revenue" fill="#10b981" radius={[8, 8, 0, 0]} />
                                 <Line yAxisId="orders" type="monotone" dataKey="orderCount" name="Orders" stroke="#0ea5e9" strokeWidth={3} dot={{ r: 3 }} />
                              </ComposedChart>
                           </ResponsiveContainer>
                        </div>
                        <div className="responsive-table border-t border-border/30">
                           <table className="w-full text-xs">
                              <thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-8 py-5 text-left">Hour</th><th className="px-6 py-5 text-right">Orders</th><th className="px-8 py-5 text-right">Revenue</th></tr></thead>
                              <tbody className="divide-y divide-border/30">{hourlySales.map((r: any, i: number) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-8 py-4 font-mono text-main">{r.hour}</td><td className="px-6 py-4 font-mono text-right">{r.orderCount}</td><td className="px-8 py-4 font-mono font-bold text-right">{Number(r.revenue || 0).toLocaleString()} {currencySymbol}</td></tr>)}</tbody>
                           </table>
                        </div>
                        {hourlySales.length === 0 && <p className="text-center text-muted py-16">{t.no_data}</p>}
                     </div>
                  </div>
               )}
               {activeCategory === 'SALES' && activeSubReport === 'Payment Mix' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
                        <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 p-6 shadow-lg">
                           <h3 className="text-lg font-black text-main">Payment distribution</h3>
                           <div className="mt-4 h-[280px]">
                              <ResponsiveContainer width="100%" height="100%">
                                 <PieChart>
                                    <Pie
                                       data={paymentSummary.map((r: any) => ({
                                          name: r.method || r.paymentMethod || 'UNKNOWN',
                                          value: Number(r.total || r.amount || 0),
                                       }))}
                                       dataKey="value"
                                       nameKey="name"
                                       innerRadius={64}
                                       outerRadius={104}
                                       paddingAngle={3}
                                    >
                                       {paymentSummary.map((_: any, index: number) => (
                                          <Cell key={index} fill={['#10b981', '#0ea5e9', '#f59e0b', '#8b5cf6', '#ef4444'][index % 5]} />
                                       ))}
                                    </Pie>
                                    <Tooltip formatter={(value: any) => `${Number(value || 0).toLocaleString()} ${currencySymbol}`} />
                                    <Legend />
                                 </PieChart>
                              </ResponsiveContainer>
                           </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                           {paymentSummary.map((r: any, i: number) => (
                              <div key={i} className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-lg">
                                 <p className="text-[10px] font-black uppercase tracking-widest text-muted">{r.method || r.paymentMethod || 'UNKNOWN'}</p>
                                 <p className="text-3xl font-black text-main mt-2">{Number(r.total || r.amount || 0).toLocaleString()} <span className="text-xs text-muted">{currencySymbol}</span></p>
                                 <p className="text-[11px] text-muted mt-2">{Number(r.count || r.transactionCount || 0).toLocaleString()} transactions</p>
                              </div>
                           ))}
                        </div>
                     </div>
                     {paymentSummary.length === 0 && <p className="text-center text-muted py-16">{t.no_data}</p>}
                  </div>
               )}
               {activeCategory === 'SALES' && activeSubReport === 'Cashier Summary' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
                        <div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50"><h3 className="text-xl font-black text-main">Cashier Collection Summary</h3></div>
                        <div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-8 py-5 text-left">Cashier</th><th className="px-6 py-5 text-left">Method</th><th className="px-6 py-5 text-right">Transactions</th><th className="px-8 py-5 text-right">Collected</th></tr></thead><tbody className="divide-y divide-border/30">{cashierSummary.map((r: any, i: number) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-8 py-4 text-xs font-black text-main">{r.cashier || r.cashierName || r.userName || r.userId || 'Unknown'}</td><td className="px-6 py-4 text-xs text-muted">{r.method || r.paymentMethod || 'All'}</td><td className="px-6 py-4 font-mono text-right">{r.transactionCount || r.count || r.orderCount || 0}</td><td className="px-8 py-4 font-mono font-bold text-right">{Number(r.totalCollected || r.total || r.amount || 0).toLocaleString()} {currencySymbol}</td></tr>)}</tbody></table></div>
                        {cashierSummary.length === 0 && <p className="text-center text-muted py-16">{t.no_data}</p>}
                     </div>
                  </div>
               )}
               {activeCategory === 'SALES' && activeSubReport === 'Refunds' && (
                   <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                      <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
                         <div className="p-6 md:p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                            <h3 className="text-xl font-black text-main">{lang === 'ar' ? 'تفاصيل المرتجعات والطلبات الملغاة' : 'Refunds and Cancelled Orders'}</h3>
                            <p className="mt-1 text-xs font-bold text-muted">{lang === 'ar' ? 'تاريخ الطلب ووقت الإلغاء والسبب وبيانات العميل للمراجعة.' : 'Order date, cancellation time, reason, and customer details for audit.'}</p>
                         </div>
                         <div className="responsive-table">
                            <table className="w-full min-w-[1080px] text-xs">
                               <thead><tr className="bg-elevated/20 text-muted text-[10px] font-black">
                                  <th className="px-5 py-4 text-start">{lang === 'ar' ? 'رقم الطلب' : 'Order'}</th>
                                  <th className="px-5 py-4 text-start">{lang === 'ar' ? 'النوع' : 'Type'}</th>
                                  <th className="px-5 py-4 text-start">{lang === 'ar' ? 'تاريخ الطلب' : 'Order date'}</th>
                                  <th className="px-5 py-4 text-start">{lang === 'ar' ? 'وقت الإلغاء' : 'Cancelled at'}</th>
                                  <th className="px-5 py-4 text-start">{lang === 'ar' ? 'سبب الإلغاء' : 'Reason'}</th>
                                  <th className="px-5 py-4 text-start">{lang === 'ar' ? 'العميل' : 'Customer'}</th>
                                  <th className="px-5 py-4 text-center">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                                  <th className="px-5 py-4 text-end">{lang === 'ar' ? 'القيمة' : 'Amount'}</th>
                               </tr></thead>
                               <tbody className="divide-y divide-border/30">{refunds.map((r: any, i: number) => {
                                  const createdAt = r.createdAt ? new Date(r.createdAt) : null;
                                  const cancelledAt = r.cancelledAt || r.refundedAt ? new Date(r.cancelledAt || r.refundedAt) : null;
                                  const locale = lang === 'ar' ? 'ar-EG' : 'en-GB';
                                  return <tr key={r.id || i} className="hover:bg-elevated/40 transition-colors align-top">
                                     <td className="px-5 py-4 font-mono font-black text-main" dir="ltr">#{r.orderNumber || String(r.id || '').slice(0, 8)}</td>
                                     <td className="px-5 py-4 font-bold text-main">{r.orderType || '-'}</td>
                                     <td className="px-5 py-4 text-muted"><span className="block whitespace-nowrap">{createdAt ? createdAt.toLocaleDateString(locale) : (r.businessDate || '-')}</span><span className="block whitespace-nowrap text-[10px]">{createdAt ? createdAt.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : ''}</span></td>
                                     <td className="px-5 py-4 text-muted"><span className="block whitespace-nowrap">{cancelledAt ? cancelledAt.toLocaleDateString(locale) : '-'}</span><span className="block whitespace-nowrap text-[10px] font-bold text-rose-500">{cancelledAt ? cancelledAt.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : ''}</span></td>
                                     <td className="px-5 py-4 min-w-[180px] whitespace-normal font-bold text-main">{r.cancelReason || r.refundReason || (lang === 'ar' ? 'لم يُسجل سبب' : 'No reason recorded')}</td>
                                     <td className="px-5 py-4"><span className="block font-bold text-main">{r.customerName || '-'}</span>{r.customerPhone && <span className="block font-mono text-[10px] text-muted" dir="ltr">{r.customerPhone}</span>}</td>
                                     <td className="px-5 py-4 text-center"><span className="inline-flex px-2 py-1 rounded-lg bg-rose-500/10 text-rose-500 text-[9px] font-black uppercase">{r.status || 'REFUNDED'}</span></td>
                                     <td className="px-5 py-4 font-mono font-black text-rose-500 text-end whitespace-nowrap" dir="ltr">{Number(r.total || r.amount || r.refundAmount || 0).toLocaleString()} {currencySymbol}</td>
                                  </tr>;
                               })}</tbody>
                            </table>
                         </div>
                        {refunds.length === 0 && <p className="text-center text-muted py-16">{t.no_data}</p>}
                     </div>
                  </div>
               )}
               {activeCategory === 'SALES' && activeSubReport === 'Sales by Order Type' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {salesByOrderType.map((row, idx) => (
                           <div key={idx} className="card-primary rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-lg">
                              <div className="flex items-center gap-3 mb-4">
                                 <span className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest ${row.orderType === 'DINE_IN' ? 'bg-blue-500/10 text-blue-500' : row.orderType === 'DELIVERY' ? 'bg-orange-500/10 text-orange-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                                    {row.orderType === 'DINE_IN' ? t.dine_in : row.orderType === 'DELIVERY' ? t.delivery : row.orderType === 'TAKEAWAY' ? t.takeaway : row.orderType}
                                 </span>
                                 <span className="text-xs font-black text-slate-400">{row.percentage}%</span>
                              </div>
                              <p className="text-3xl font-black text-main">{row.revenue.toLocaleString()} <span className="text-xs font-bold text-muted">{currencySymbol}</span></p>
                              <div className="mt-3 w-full bg-elevated/50 rounded-full h-2"><div className="h-2 rounded-full bg-blue-500" style={{ width: `${row.percentage}%` }} /></div>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-4 text-xs text-muted">
                                 <span>{t.orders}: <b className="text-main">{row.orderCount}</b></span>
                                 <span>{t.avg_ticket}: <b className="text-main">{row.avgTicket} {currencySymbol}</b></span>
                                 <span>{t.tax}: <b className="text-main">{row.totalTax.toLocaleString()} {currencySymbol}</b></span>
                                 <span>{t.discounts}: <b className="text-rose-500">{row.totalDiscount.toLocaleString()} {currencySymbol}</b></span>
                              </div>
                           </div>
                        ))}
                     </div>
                     {salesByOrderType.length === 0 && <p className="text-center text-muted py-16">{t.no_data}</p>}
                  </div>
               )}
               {activeCategory === 'SALES' && activeSubReport === 'Sales by Item' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
                        <div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                           <h3 className="text-xl font-black text-main">{t.sales_by_item}</h3>
                           <p className="text-xs text-muted mt-1">{t.ranked_by_revenue}</p>
                        </div>
                        <div className="responsive-table">
                           <table className="w-full text-xs">
                              <thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]">
                                 <th className="px-8 py-5 text-left">#</th><th className="px-6 py-5 text-left">{t.item}</th><th className="px-6 py-5 text-right">{t.qty_sold}</th><th className="px-6 py-5 text-right">{t.revenue}</th><th className="px-6 py-5 text-right">{t.cost}</th><th className="px-6 py-5 text-right">{t.profit}</th><th className="px-8 py-5 text-right">{t.margin_percent}</th>
                              </tr></thead>
                              <tbody className="divide-y divide-border/30">
                                 {salesByItem.map((row, idx) => (
                                    <tr key={idx} className="hover:bg-elevated/40 transition-colors">
                                       <td className="px-8 py-4 font-mono text-muted">{idx + 1}</td>
                                       <td className="px-6 py-4 text-xs font-black text-main">{row.itemName}</td>
                                       <td className="px-6 py-4 font-mono text-right">{row.qtySold}</td>
                                       <td className="px-6 py-4 font-mono font-bold text-right">{row.revenue.toLocaleString()}</td>
                                       <td className="px-6 py-4 font-mono text-muted text-right">{row.cost.toLocaleString()}</td>
                                       <td className="px-6 py-4 font-mono text-emerald-500 text-right">{row.profit.toLocaleString()}</td>
                                       <td className="px-8 py-4 text-right"><span className={`px-2 py-1 rounded-lg text-[9px] font-black ${row.marginPercent >= 50 ? 'bg-emerald-500/10 text-emerald-500' : row.marginPercent >= 30 ? 'bg-amber-500/10 text-amber-500' : 'bg-rose-500/10 text-rose-500'}`}>{row.marginPercent}%</span></td>
                                    </tr>
                                 ))}
                              </tbody>
                           </table>
                        </div>
                        {salesByItem.length === 0 && <p className="text-center text-muted py-16">{t.no_data}</p>}
                     </div>
                  </div>
               )}
               {activeCategory === 'SALES' && activeSubReport === 'Sales by Category' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
                        <div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                           <h3 className="text-xl font-black text-main">{t.sales_by_category}</h3>
                        </div>
                        <div className="responsive-table">
                           <table className="w-full text-xs">
                              <thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]">
                                 <th className="px-8 py-5 text-left">{t.category}</th><th className="px-6 py-5 text-right">{t.items}</th><th className="px-6 py-5 text-right">{t.qty_sold}</th><th className="px-6 py-5 text-right">{t.revenue}</th><th className="px-6 py-5 text-right">{t.cost}</th><th className="px-6 py-5 text-right">{t.profit}</th><th className="px-8 py-5 text-right">{t.share_percent}</th>
                              </tr></thead>
                              <tbody className="divide-y divide-border/30">
                                 {salesByCategory.map((row, idx) => (
                                    <tr key={idx} className="hover:bg-elevated/40 transition-colors">
                                       <td className="px-8 py-4 text-xs font-black text-main">{row.categoryName}</td>
                                       <td className="px-6 py-4 font-mono text-right">{row.itemCount}</td>
                                       <td className="px-6 py-4 font-mono text-right">{row.qtySold}</td>
                                       <td className="px-6 py-4 font-mono font-bold text-right">{row.revenue.toLocaleString()}</td>
                                       <td className="px-6 py-4 font-mono text-muted text-right">{row.cost.toLocaleString()}</td>
                                       <td className="px-6 py-4 font-mono text-emerald-500 text-right">{row.profit.toLocaleString()}</td>
                                       <td className="px-8 py-4 text-right">
                                          <div className="flex items-center justify-end gap-2">
                                             <div className="w-16 bg-elevated/50 rounded-full h-1.5"><div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${row.percentage}%` }} /></div>
                                             <span className="text-[10px] font-black w-8 text-right">{row.percentage}%</span>
                                          </div>
                                       </td>
                                    </tr>
                                 ))}
                              </tbody>
                           </table>
                        </div>
                        {salesByCategory.length === 0 && <p className="text-center text-muted py-16">{t.no_data}</p>}
                     </div>
                  </div>
               )}
               {activeCategory === 'SALES' && activeSubReport === 'Discounts' && discountAnalysis && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[{ label: t.total_discounts, value: `${discountAnalysis.summary.totalDiscount.toLocaleString()} ${currencySymbol}`, sub: `${discountAnalysis.summary.totalDiscountedOrders} ${t.orders}` },
                        { label: t.discount_rate, value: `${discountAnalysis.summary.discountRate}%`, sub: `${t.of} ${discountAnalysis.summary.totalOrders} ${t.orders}` },
                        { label: t.avg_discount, value: `${discountAnalysis.summary.avgDiscount} ${currencySymbol}`, sub: t.per_discounted_order },
                        { label: t.max_discount, value: `${discountAnalysis.summary.maxDiscount} ${currencySymbol}`, sub: t.single_order },
                        ].map((card, idx) => (
                           <div key={idx} className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-lg">
                              <p className="text-[10px] font-black uppercase tracking-widest text-muted">{card.label}</p>
                              <p className="text-2xl font-black text-main mt-1">{card.value}</p>
                              <p className="text-[10px] text-muted mt-1">{card.sub}</p>
                           </div>
                        ))}
                     </div>
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
                        <div className="p-8 border-b border-slate-100 dark:border-slate-800"><h3 className="text-lg font-black text-main">{t.discounts_by_reason}</h3></div>
                        <div className="responsive-table">
                           <table className="w-full text-xs">
                              <thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]">
                                 <th className="px-8 py-5 text-left">{t.reason}</th><th className="px-6 py-5 text-right">{t.orders}</th><th className="px-6 py-5 text-right">{t.total}</th><th className="px-8 py-5 text-right">{t.avg}</th>
                              </tr></thead>
                              <tbody className="divide-y divide-border/30">
                                 {discountAnalysis.byReason.map((row: any, idx: number) => (
                                    <tr key={idx} className="hover:bg-elevated/40 transition-colors">
                                       <td className="px-8 py-4 text-xs font-black text-main">{row.reason}</td>
                                       <td className="px-6 py-4 font-mono text-right">{row.orderCount}</td>
                                       <td className="px-6 py-4 font-mono font-bold text-rose-500 text-right">{row.totalDiscount.toLocaleString()} {currencySymbol}</td>
                                       <td className="px-8 py-4 font-mono text-muted text-right">{row.avgDiscount} {currencySymbol}</td>
                                    </tr>
                                 ))}
                              </tbody>
                           </table>
                        </div>
                     </div>
                  </div>
               )}
               {activeCategory === 'SALES' && activeSubReport === 'Discounts' && !discountAnalysis && (
                  <p className="text-center text-muted py-16">{t.no_data}</p>
               )}
               {activeCategory === 'SALES' && activeSubReport === 'Cancelled Orders' && cancelledOrders && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[{ label: t.cancelled_orders, value: cancelledOrders.summary.cancelledCount, color: 'text-rose-500' },
                        { label: t.lost_revenue, value: `${cancelledOrders.summary.cancelledTotal.toLocaleString()} ${currencySymbol}`, color: 'text-rose-500' },
                        { label: t.cancel_rate, value: `${cancelledOrders.summary.cancelRate}%`, color: 'text-amber-500' },
                        { label: t.total_orders, value: cancelledOrders.summary.totalOrders, color: 'text-main' },
                        ].map((card, idx) => (
                           <div key={idx} className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-lg">
                              <p className="text-[10px] font-black uppercase tracking-widest text-muted">{card.label}</p>
                              <p className={`text-2xl font-black mt-1 ${card.color}`}>{card.value}</p>
                           </div>
                        ))}
                     </div>
                     {cancelledOrders.byReason.length > 0 && (
                        <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
                           <div className="p-6 border-b border-slate-100 dark:border-slate-800"><h3 className="text-lg font-black text-main">{t.by_reason}</h3></div>
                           <div className="divide-y divide-border/30">
                              {cancelledOrders.byReason.map((r: any, idx: number) => (
                                 <div key={idx} className="flex items-center justify-between px-8 py-4">
                                    <span className="text-xs font-black text-main">{r.reason}</span>
                                    <div className="flex gap-6 text-xs">
                                       <span className="font-mono">{r.count} {t.orders}</span>
                                       <span className="font-mono text-rose-500">{r.total.toLocaleString()} {currencySymbol}</span>
                                    </div>
                                 </div>
                              ))}
                           </div>
                        </div>
                     )}
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800"><h3 className="text-lg font-black text-main">{t.cancelled_order_log}</h3></div>
                        <div className="responsive-table">
                           <table className="w-full text-xs">
                              <thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.12em]">
                                 <th className="px-5 py-5 text-start">#</th><th className="px-5 py-5 text-start">{t.type}</th><th className="px-5 py-5 text-start">{lang === 'ar' ? 'تاريخ الطلب' : 'Order date'}</th><th className="px-5 py-5 text-start">{t.customer}</th><th className="px-5 py-5 text-end">{t.total}</th><th className="px-5 py-5 text-start">{t.reason}</th><th className="px-5 py-5 text-start">{lang === 'ar' ? 'وقت الإلغاء' : 'Cancelled at'}</th>
                              </tr></thead>
                              <tbody className="divide-y divide-border/30">
                                 {cancelledOrders.orders.map((row: any, idx: number) => (
                                    <tr key={idx} className="hover:bg-elevated/40 transition-colors">
                                       <td className="px-8 py-4 font-mono text-muted">{row.orderNumber}</td>
                                       <td className="px-6 py-4"><span className="px-2 py-1 bg-slate-500/10 rounded-lg text-[9px] font-black uppercase">{row.type}</span></td>
                                       <td className="px-5 py-4 text-xs whitespace-nowrap">{row.createdAt ? new Date(row.createdAt).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US') : '—'}</td>
                                       <td className="px-6 py-4 text-xs">{row.customerName || '—'}</td>
                                       <td className="px-5 py-4 font-mono font-bold text-rose-500 text-end whitespace-nowrap" dir="ltr">{row.total.toLocaleString()} {currencySymbol}</td>
                                       <td className="px-6 py-4 text-xs text-muted">{row.cancelReason || '—'}</td>
                                       <td className="px-8 py-4 font-mono text-[10px] text-muted text-right">{row.cancelledAt ? new Date(row.cancelledAt).toLocaleString() : '—'}</td>
                                    </tr>
                                 ))}
                              </tbody>
                           </table>
                        </div>
                     </div>
                  </div>
               )}
               {activeCategory === 'SALES' && activeSubReport === 'Cancelled Orders' && !cancelledOrders && (
                  <p className="text-center text-muted py-16">{t.no_data}</p>
               )}
                {activeCategory === 'SALES' && activeSubReport === 'Sales by Source' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {salesBySource.map((row, idx) => (
                           <div key={idx} className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-lg">
                              <span className="px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest bg-indigo-500/10 text-indigo-500">{row.source}</span>
                              <p className="text-2xl font-black text-main mt-3">{row.revenue.toLocaleString()} <span className="text-xs text-muted">{currencySymbol}</span></p>
                              <div className="flex gap-4 mt-2 text-xs text-muted">
                                 <span>{row.orderCount} {t.orders}</span>
                                 <span>{t.avg} {row.avgTicket} {currencySymbol}</span>
                                 <span className="font-black">{row.percentage}%</span>
                              </div>
                              <div className="mt-2 w-full bg-elevated/50 rounded-full h-1.5"><div className="h-1.5 rounded-full bg-indigo-500" style={{ width: `${row.percentage}%` }} /></div>
                           </div>
                        ))}
                     </div>
                     {salesBySource.length === 0 && <p className="text-center text-muted py-16">{t.no_data}</p>}
                  </div>
                )}
                {activeCategory === 'SALES' && activeSubReport === 'Dine-in Tables' && (
                   <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                      <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
                         <div className="p-6 border-b border-slate-100 dark:border-slate-800">
                            <h3 className="text-lg font-black text-main">{lang === 'ar' ? 'أداء الطاولات' : 'Dine-in Table Performance'}</h3>
                         </div>
                         <div className="responsive-table">
                            <table className="w-full text-xs">
                               <thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-6 py-5 text-left">{lang === 'ar' ? 'الطاولة' : 'Table'}</th><th className="px-4 py-5 text-left">{lang === 'ar' ? 'المنطقة' : 'Zone'}</th><th className="px-4 py-5 text-right">{t.orders}</th><th className="px-4 py-5 text-right">{t.revenue}</th><th className="px-4 py-5 text-right">{t.avg_ticket}</th><th className="px-4 py-5 text-right">{lang === 'ar' ? 'المدة' : 'Duration'}</th><th className="px-6 py-5 text-right">{lang === 'ar' ? 'الخصم' : 'Discount'}</th></tr></thead>
                               <tbody className="divide-y divide-border/30">{dineInTables.map((row: any) => <tr key={row.tableId} className="hover:bg-elevated/40 transition-colors"><td className="px-6 py-4 font-black text-main">{row.tableName || row.tableId}</td><td className="px-4 py-4 text-muted">{row.zoneName || '—'}</td><td className="px-4 py-4 font-mono text-right">{row.orderCount}</td><td className="px-4 py-4 font-mono text-right">{row.revenue.toLocaleString()} {currencySymbol}</td><td className="px-4 py-4 font-mono text-right">{row.avgTicket} {currencySymbol}</td><td className="px-4 py-4 font-mono text-right">{row.avgDurationMinutes} min</td><td className="px-6 py-4 font-mono text-right">{row.totalDiscount.toLocaleString()} {currencySymbol} ({row.discountRate}%)</td></tr>)}</tbody>
                            </table>
                         </div>
                      </div>
                      {dineInTables.length === 0 && <p className="text-center text-muted py-16">{t.no_data}</p>}
                   </div>
                )}
                {activeCategory === 'SALES' && activeSubReport === 'Peak Hours Heatmap' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl p-8">
                        <h3 className="text-xl font-black text-main mb-6">{t.peak_hours_heatmap}</h3>
                        <div className="grid grid-cols-[auto_repeat(24,1fr)] gap-0.5 text-[8px]">
                           <div />{HOURS.map((hour) => <div key={hour} className="text-center text-muted font-black">{hour}:00</div>)}
                           {WEEK_DAYS.map((day, dayIndex) => (
                              <React.Fragment key={dayIndex}>
                                 <div className="text-right pr-2 text-muted font-black flex items-center">{day}</div>
                                 {HOURS.map((hour) => {
                                    const cell = peakHoursLookup.get(`${dayIndex}-${hour}`);
                                    const intensity = cell ? cell.orderCount / peakHoursMaxOrders : 0;
                                    return (
                                       <div
                                          key={hour}
                                          title={`${cell?.orderCount || 0} ${t.orders} / ${cell?.revenue || 0} ${currencySymbol}`}
                                          className="rounded-sm aspect-square"
                                          style={{ backgroundColor: `rgba(59,130,246,${Math.min(intensity, 1)})`, minHeight: 18 }}
                                       />
                                    );
                                 })}
                              </React.Fragment>
                           ))}
                        </div>
                     </div>
                  </div>
               )}
               {activeCategory === 'SALES' && activeSubReport === 'Modifier Sales' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
                        <div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50"><h3 className="text-xl font-black text-main">{t.modifier_addon_sales}</h3></div>
                        <div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-8 py-5 text-left">{t.modifier}</th><th className="px-6 py-5 text-right">{t.count}</th><th className="px-8 py-5 text-right">{t.revenue}</th></tr></thead><tbody className="divide-y divide-border/30">{modifierSalesData.map((r, i) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-8 py-4 text-xs font-black text-main">{r.name}</td><td className="px-6 py-4 font-mono text-right">{r.count}</td><td className="px-8 py-4 font-mono font-bold text-right">{r.revenue.toLocaleString()} {currencySymbol}</td></tr>)}</tbody></table></div>
                        {modifierSalesData.length === 0 && <p className="text-center text-muted py-16">{t.no_data}</p>}
                     </div>
                  </div>
               )}
               {activeCategory === 'SALES' && activeSubReport === 'Avg Ticket Trend' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
                        <div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50"><h3 className="text-xl font-black text-main">{t.avg_ticket_trend}</h3></div>
                        <div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-8 py-5 text-left">{t.day}</th><th className="px-6 py-5 text-right">{t.orders}</th><th className="px-6 py-5 text-right">{t.revenue}</th><th className="px-8 py-5 text-right">{t.avg_ticket}</th></tr></thead><tbody className="divide-y divide-border/30">{avgTicketTrend.map((r, i) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-8 py-4 text-xs font-black text-main">{r.day}</td><td className="px-6 py-4 font-mono text-right">{r.orderCount}</td><td className="px-6 py-4 font-mono text-right">{r.revenue.toLocaleString()}</td><td className="px-8 py-4 font-mono font-bold text-right">{r.avgTicket} {currencySymbol}</td></tr>)}</tbody></table></div>
                        {avgTicketTrend.length === 0 && <p className="text-center text-muted py-16">{t.no_data}</p>}
                     </div>
                  </div>
               )}
               {activeCategory === 'SALES' && activeSubReport === 'Sales Comparison' && salesComparisonData && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {['current', 'compare'].map(period => (<div key={period} className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-lg"><p className="text-[10px] font-black uppercase tracking-widest text-muted mb-2">{period === 'current' ? t.current_period : t.comparison_period}</p><p className="text-xs text-muted mb-3">{salesComparisonData[period]?.period}</p>{[{ l: t.orders, v: salesComparisonData[period]?.orderCount }, { l: t.revenue, v: `${salesComparisonData[period]?.revenue?.toLocaleString()} ${currencySymbol}` }, { l: t.avg_ticket, v: `${salesComparisonData[period]?.avgTicket} ${currencySymbol}` }].map((c, i) => (<div key={i} className="flex justify-between py-1 text-xs"><span className="text-muted">{c.l}</span><span className="font-black text-main">{c.v}</span></div>))}</div>))}
                     </div>
                     <div className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-lg"><p className="text-[10px] font-black uppercase tracking-widest text-muted mb-4">{t.change_percent}</p><div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[{ l: t.orders, v: salesComparisonData.change?.orderCount }, { l: t.revenue, v: salesComparisonData.change?.revenue }, { l: t.avg_ticket, v: salesComparisonData.change?.avgTicket }, { l: t.discounts, v: salesComparisonData.change?.totalDiscount }].map((c, i) => (<div key={i} className="text-center"><p className="text-[10px] text-muted">{c.l}</p><p className={`text-2xl font-black ${Number(c.v) > 0 ? 'text-emerald-500' : Number(c.v) < 0 ? 'text-rose-500' : 'text-muted'}`}>{Number(c.v) > 0 ? '+' : ''}{c.v}%</p></div>))}</div></div>
                  </div>
               )}
               {activeCategory === 'SALES' && activeSubReport === 'Sales Comparison' && !salesComparisonData && <p className="text-center text-muted py-16">{t.no_data}</p>}

               {activeCategory === 'SALES' && activeSubReport === 'Slow-Moving Items' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
                        <div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50"><h3 className="text-xl font-black text-main">{t.slow_moving_items}</h3><p className="text-xs text-muted mt-1">{t.items_with_lowest_sales}</p></div>
                        <div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-8 py-5 text-left">#</th><th className="px-6 py-5 text-left">{t.item}</th><th className="px-6 py-5 text-right">{t.qty_sold}</th><th className="px-8 py-5 text-right">{t.revenue}</th></tr></thead><tbody className="divide-y divide-border/30">{slowMovingItems.map((r, i) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-8 py-4 font-mono text-muted">{i + 1}</td><td className="px-6 py-4 text-xs font-black text-main">{r.itemName}</td><td className="px-6 py-4 font-mono text-right text-rose-500 font-bold">{r.qtySold}</td><td className="px-8 py-4 font-mono text-right">{r.revenue.toLocaleString()} {currencySymbol}</td></tr>)}</tbody></table></div>
                        {slowMovingItems.length === 0 && <p className="text-center text-muted py-16">{t.no_data}</p>}
                     </div>
                  </div>
               )}
               {activeCategory === 'SALES' && activeSubReport === 'Revenue by Weekday' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="grid grid-cols-7 gap-3">
                        {revenueByWeekday.map((r, i) => (
                           <div key={i} className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-lg text-center">
                              <p className="text-[10px] font-black uppercase text-muted">{r.dayName}</p>
                              <p className="text-lg font-black text-main mt-1">{r.revenue.toLocaleString()}</p>
                              <p className="text-[9px] text-muted">{currencySymbol}</p>
                              <div className="mt-2 mx-auto w-6 bg-elevated/50 rounded-full" style={{ height: 60 }}>
                                 <div className="w-6 rounded-full bg-blue-500 mt-auto" style={{ height: `${(r.revenue / revenueByWeekdayMax) * 100}%`, marginTop: `${100 - (r.revenue / revenueByWeekdayMax) * 100}%` }} />
                              </div>
                              <p className="text-[9px] text-muted mt-2">{r.orderCount} {t.orders}</p>
                              <p className="text-[9px] text-muted">{t.avg} {r.avgTicket} {currencySymbol}</p>
                           </div>
                        ))}
                     </div>
                     {revenueByWeekday.length === 0 && <p className="text-center text-muted py-16">{t.no_data}</p>}
                  </div>
               )}
               {activeCategory === 'SALES' && activeSubReport === 'Void Items Log' && voidItemsData && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="grid grid-cols-2 gap-4"><div className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-lg"><p className="text-[10px] font-black uppercase tracking-widest text-muted">{t.void_count}</p><p className="text-2xl font-black text-rose-500 mt-1">{voidItemsData.summary.voidCount}</p></div><div className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-lg"><p className="text-[10px] font-black uppercase tracking-widest text-muted">{t.lost_revenue}</p><p className="text-2xl font-black text-rose-500 mt-1">{voidItemsData.summary.voidTotal.toLocaleString()} {currencySymbol}</p></div></div>
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"><div className="p-6 border-b border-slate-100 dark:border-slate-800"><h3 className="text-lg font-black text-main">{t.voided_items_log}</h3></div><div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-8 py-5 text-left">{t.order}</th><th className="px-6 py-5 text-left">{t.item}</th><th className="px-6 py-5 text-right">{t.qty}</th><th className="px-6 py-5 text-right">{t.total}</th><th className="px-8 py-5 text-right">{t.when}</th></tr></thead><tbody className="divide-y divide-border/30">{voidItemsData.items.map((r: any, i: number) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-8 py-4 font-mono text-muted">{r.orderNumber}</td><td className="px-6 py-4 text-xs font-black text-main">{r.itemName}</td><td className="px-6 py-4 font-mono text-right">{r.quantity}</td><td className="px-6 py-4 font-mono font-bold text-rose-500 text-right">{r.total} {currencySymbol}</td><td className="px-8 py-4 font-mono text-[10px] text-muted text-right">{r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'}</td></tr>)}</tbody></table></div></div>
                  </div>
               )}
               {activeCategory === 'SALES' && activeSubReport === 'Void Items Log' && !voidItemsData && <p className="text-center text-muted py-16">{t.no_data}</p>}

               {/* ============ ADVANCED FINANCE ============ */}

               {activeCategory === 'FINANCE' && activeSubReport === 'Tips Report' && tipsData && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[{ l: t.total_tips, v: `${tipsData.summary.totalTips.toLocaleString()} ${currencySymbol}` }, { l: t.tipped_orders, v: tipsData.summary.orderCount }, { l: t.avg_tip, v: `${tipsData.summary.avgTip} ${currencySymbol}` }, { l: t.max_tip, v: `${tipsData.summary.maxTip} ${currencySymbol}` }].map((c, i) => (<div key={i} className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-lg"><p className="text-[10px] font-black uppercase tracking-widest text-muted">{c.l}</p><p className="text-2xl font-black text-main mt-1">{c.v}</p></div>))}</div>
                     {tipsData.byType.length > 0 && <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden"><div className="p-6 border-b border-slate-100 dark:border-slate-800"><h3 className="text-lg font-black text-main">{t.tips_by_order_type}</h3></div><div className="divide-y divide-border/30">{tipsData.byType.map((r: any, i: number) => (<div key={i} className="flex items-center justify-between px-8 py-4"><span className="text-xs font-black text-main">{r.orderType}</span><div className="flex gap-6 text-xs"><span className="font-mono">{r.count} {t.orders}</span><span className="font-mono font-bold text-emerald-500">{r.totalTips.toLocaleString()} {currencySymbol}</span></div></div>))}</div></div>}
                  </div>
               )}
               {activeCategory === 'SALES' && activeSubReport === 'Menu Engineering' && menuEngineeringData && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="grid grid-cols-4 gap-4">{[{ l: t.stars, v: menuEngineeringData.summary.stars, c: 'text-amber-500' }, { l: t.plowhorses, v: menuEngineeringData.summary.plowhorses, c: 'text-blue-500' }, { l: t.puzzles, v: menuEngineeringData.summary.puzzles, c: 'text-indigo-500' }, { l: t.dogs, v: menuEngineeringData.summary.dogs, c: 'text-rose-500' }].map((c, i) => (<div key={i} className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-lg"><p className="text-xs font-black text-muted">{c.l}</p><p className={`text-3xl font-black mt-1 ${c.c}`}>{c.v}</p></div>))}</div>
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"><div className="p-6 border-b border-slate-100 dark:border-slate-800"><h3 className="text-lg font-black text-main">{t.menu_engineering_matrix}</h3><p className="text-xs text-muted">{t.high_low_popularity_margin}</p></div><div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-6 py-5 text-left">{t.item}</th><th className="px-4 py-5 text-right">{t.qty}</th><th className="px-4 py-5 text-right">{t.revenue}</th><th className="px-4 py-5 text-right">{t.cost}</th><th className="px-4 py-5 text-right">{t.profit}</th><th className="px-4 py-5 text-right">{t.margin}</th><th className="px-6 py-5 text-center">{t.class}</th></tr></thead><tbody className="divide-y divide-border/30">{menuEngineeringData.items.map((r: any, i: number) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-6 py-4 text-xs font-black text-main">{r.itemName}</td><td className="px-4 py-4 font-mono text-right">{r.qtySold}</td><td className="px-4 py-4 font-mono text-right">{r.revenue.toLocaleString()}</td><td className="px-4 py-4 font-mono text-right text-muted">{r.cost.toLocaleString()}</td><td className="px-4 py-4 font-mono font-bold text-right">{r.profit.toLocaleString()}</td><td className="px-4 py-4 font-mono text-right">{r.margin}%</td><td className="px-6 py-4 text-center"><span className={`px-2 py-1 rounded-lg text-[9px] font-black ${r.classification === 'Star' ? 'bg-amber-500/10 text-amber-500' : r.classification === 'Plowhorse' ? 'bg-blue-500/10 text-blue-500' : r.classification === 'Puzzle' ? 'bg-indigo-500/10 text-indigo-500' : 'bg-rose-500/10 text-rose-500'}`}>{r.classification}</span></td></tr>)}</tbody></table></div></div>
                  </div>
               )}
               {activeCategory === 'SALES' && activeSubReport === 'Menu Engineering' && !menuEngineeringData && <p className="text-center text-muted py-16">{t.no_data}</p>}

               {activeCategory === 'SALES' && activeSubReport === 'Daypart Analysis' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="grid grid-cols-5 gap-3">{daypartData.map((d: any, i: number) => <div key={i} className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-lg text-center"><p className="text-[10px] font-black uppercase text-muted">{d.name}</p><p className="text-xl font-black text-main mt-1">{d.revenue.toLocaleString()}</p><p className="text-[9px] text-muted">{d.orderCount} orders · {d.percentage}%</p><div className="mt-2 mx-auto w-8 bg-elevated/50 rounded-full" style={{ height: 50 }}><div className="w-8 rounded-full bg-blue-500" style={{ height: `${(d.revenue / daypartRevenueMax) * 100}%`, marginTop: `${100 - (d.revenue / daypartRevenueMax) * 100}%` }} /></div><p className="text-[9px] text-muted mt-1">Avg {d.avgTicket} LE</p></div>)}</div>
                     {daypartData.length === 0 && <p className="text-center text-muted py-16">No data.</p>}
                  </div>
               )}
               {activeCategory === 'SALES' && activeSubReport === 'Basket Analysis' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"><div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50"><h3 className="text-xl font-black text-main">Cross-Sell / Basket Analysis</h3><p className="text-xs text-muted mt-1">Items most frequently purchased together</p></div><div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-8 py-5 text-left">#</th><th className="px-6 py-5 text-left">Item Pair</th><th className="px-6 py-5 text-right">Count</th><th className="px-8 py-5 text-right">% of Orders</th></tr></thead><tbody className="divide-y divide-border/30">{basketData.map((r: any, i: number) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-8 py-4 font-mono text-muted">{i + 1}</td><td className="px-6 py-4 text-xs font-black text-main">{r.pair}</td><td className="px-6 py-4 font-mono text-right">{r.count}</td><td className="px-8 py-4 font-mono font-bold text-right">{r.percentage}%</td></tr>)}</tbody></table></div></div>
                     {basketData.length === 0 && <p className="text-center text-muted py-16">No data.</p>}
                  </div>
               )}
               {activeCategory === 'SALES' && activeSubReport === 'Seasonality' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"><div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50"><h3 className="text-xl font-black text-main">Monthly Seasonality</h3></div><div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-8 py-5 text-left">Month</th><th className="px-6 py-5 text-right">Orders</th><th className="px-6 py-5 text-right">Revenue</th><th className="px-8 py-5 text-right">Avg Ticket</th></tr></thead><tbody className="divide-y divide-border/30">{seasonalityData.map((r: any, i: number) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-8 py-4 text-xs font-black text-main">{r.month}</td><td className="px-6 py-4 font-mono text-right">{r.orderCount}</td><td className="px-6 py-4 font-mono font-bold text-right">{r.revenue.toLocaleString()} LE</td><td className="px-8 py-4 font-mono text-right">{r.avgTicket} LE</td></tr>)}</tbody></table></div></div>
                     {seasonalityData.length === 0 && <p className="text-center text-muted py-16">No data.</p>}
                  </div>
               )}
               {activeCategory === 'SALES' && activeSubReport === 'Online vs Offline' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"><div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50"><h3 className="text-xl font-black text-main">Online vs Offline Trend</h3></div><div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-6 py-5 text-left">Day</th><th className="px-4 py-5 text-right">Online Rev</th><th className="px-4 py-5 text-right">Offline Rev</th><th className="px-4 py-5 text-right">Online %</th></tr></thead><tbody className="divide-y divide-border/30">{onlineOfflineData.map((r: any, i: number) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-6 py-4 text-xs font-black text-main">{r.day}</td><td className="px-4 py-4 font-mono text-right text-blue-500">{r.onlineRevenue.toLocaleString()}</td><td className="px-4 py-4 font-mono text-right">{r.offlineRevenue.toLocaleString()}</td><td className="px-4 py-4 font-mono font-bold text-right">{r.onlinePercent}%</td></tr>)}</tbody></table></div></div>
                     {onlineOfflineData.length === 0 && <p className="text-center text-muted py-16">No data.</p>}
                  </div>
               )}
               {activeCategory === 'SALES' && activeSubReport === 'Menu Cannibalization' && cannibalizationData && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="card-primary rounded-[2rem] border border-rose-200 dark:border-rose-800 shadow-xl p-6 bg-rose-50/30 dark:bg-rose-950/20">
                           <h3 className="text-lg font-black text-rose-500 mb-4">Declining Items ({cannibalizationData.declining.length})</h3>
                           {cannibalizationData.declining.slice(0, 10).map((r: any, i: number) => (<div key={i} className="flex justify-between py-1.5 text-xs border-b border-rose-100 dark:border-rose-900/30"><span className="font-black text-main">{r.itemName}</span><span className="font-mono text-rose-500">{r.qtyChangePercent}%</span></div>))}
                        </div>
                        <div className="card-primary rounded-[2rem] border border-emerald-200 dark:border-emerald-800 shadow-xl p-6 bg-emerald-50/30 dark:bg-emerald-950/20">
                           <h3 className="text-lg font-black text-emerald-500 mb-4">Growing Items ({cannibalizationData.growing.length})</h3>
                           {cannibalizationData.growing.slice(0, 10).map((r: any, i: number) => (<div key={i} className="flex justify-between py-1.5 text-xs border-b border-emerald-100 dark:border-emerald-900/30"><span className="font-black text-main">{r.itemName}</span><span className="font-mono text-emerald-500">+{r.qtyChangePercent}%</span></div>))}
                        </div>
                     </div>
                  </div>
               )}
               {activeCategory === 'SALES' && activeSubReport === 'Menu Cannibalization' && !cannibalizationData && <p className="text-center text-muted py-16">No data.</p>}

               {activeCategory === 'SALES' && activeSubReport === 'Menu Item Lifecycle' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"><div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50"><h3 className="text-xl font-black text-main">Menu Item Lifecycle (Monthly)</h3></div><div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-6 py-5 text-left">Month</th><th className="px-4 py-5 text-left">Item</th><th className="px-4 py-5 text-right">Qty</th><th className="px-6 py-5 text-right">Revenue</th></tr></thead><tbody className="divide-y divide-border/30">{menuLifecycleData.map((r: any, i: number) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-6 py-4 font-mono text-muted">{r.month}</td><td className="px-4 py-4 text-xs font-black text-main">{r.itemName}</td><td className="px-4 py-4 font-mono text-right">{r.qty}</td><td className="px-6 py-4 font-mono font-bold text-right">{r.revenue.toLocaleString()} LE</td></tr>)}</tbody></table></div></div>
                     {menuLifecycleData.length === 0 && <p className="text-center text-muted py-16">No data.</p>}
                  </div>
               )}
               {activeCategory === 'SALES' && activeSubReport === 'Category Contribution' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"><div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50"><h3 className="text-xl font-black text-main">Category Contribution Matrix</h3></div><div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-6 py-5 text-left">Category</th><th className="px-4 py-5 text-right">Qty</th><th className="px-4 py-5 text-right">Revenue</th><th className="px-4 py-5 text-right">Cost</th><th className="px-4 py-5 text-right">Profit</th><th className="px-4 py-5 text-right">Margin</th><th className="px-4 py-5 text-right">Rev %</th><th className="px-6 py-5 text-right">Profit %</th></tr></thead><tbody className="divide-y divide-border/30">{catContribData.map((r: any, i: number) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-6 py-4 text-xs font-black text-main">{r.categoryName}</td><td className="px-4 py-4 font-mono text-right">{r.qtySold}</td><td className="px-4 py-4 font-mono text-right">{r.revenue.toLocaleString()}</td><td className="px-4 py-4 font-mono text-right text-muted">{r.cost.toLocaleString()}</td><td className="px-4 py-4 font-mono font-bold text-right">{r.profit.toLocaleString()}</td><td className="px-4 py-4 font-mono text-right">{r.margin}%</td><td className="px-4 py-4 font-mono text-right text-blue-500">{r.revenueShare}%</td><td className="px-6 py-4 font-mono font-bold text-right text-emerald-500">{r.profitShare}%</td></tr>)}</tbody></table></div></div>
                     {catContribData.length === 0 && <p className="text-center text-muted py-16">No data.</p>}
                  </div>
               )}
               {activeCategory === 'SALES' && activeSubReport === 'Time-to-First-Order' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"><div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50"><h3 className="text-xl font-black text-main">Time-to-First-Order (New Items)</h3></div><div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-6 py-5 text-left">Item</th><th className="px-4 py-5 text-left">Added</th><th className="px-4 py-5 text-right">Days</th><th className="px-4 py-5 text-right">Orders</th><th className="px-4 py-5 text-right">Qty</th><th className="px-6 py-5 text-right">Revenue</th></tr></thead><tbody className="divide-y divide-border/30">{timeToFirstData.map((r: any, i: number) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-6 py-4 text-xs font-black text-main">{r.itemName}</td><td className="px-4 py-4 font-mono text-[10px] text-muted">{r.addedDate ? new Date(r.addedDate).toLocaleDateString() : '—'}</td><td className="px-4 py-4 font-mono text-right"><span className={`px-2 py-1 rounded-lg text-[9px] font-black ${r.daysToFirstOrder === null ? 'bg-rose-500/10 text-rose-500' : r.daysToFirstOrder <= 1 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>{r.daysToFirstOrder !== null ? `${r.daysToFirstOrder}d` : 'None'}</span></td><td className="px-4 py-4 font-mono text-right">{r.totalOrders}</td><td className="px-4 py-4 font-mono text-right">{r.totalQty}</td><td className="px-6 py-4 font-mono font-bold text-right">{r.totalRevenue.toLocaleString()} LE</td></tr>)}</tbody></table></div></div>
                     {timeToFirstData.length === 0 && <p className="text-center text-muted py-16">No data.</p>}
                  </div>
               )}
      </>
   );
};
