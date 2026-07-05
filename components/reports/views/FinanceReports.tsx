import React, { useState } from 'react';
import {
   BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area, Cell, PieChart, Pie, ComposedChart
} from 'recharts';
import {
   DollarSign, TrendingUp, ShoppingBag, Calendar, Download, Printer,
   ChevronDown, Filter, Target, Megaphone, Zap, Scale, Info, Users, Clock, Box, ShieldCheck, Activity, LineChart as ChartIcon
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const FinanceReports = ({ state }: any) => {
   const {
      activeCategory, activeSubReport, navigate,
      dailySales, profitDaily, overview, profitSummary, foodCostData,
      paymentSummary, vatReport, hourlySales, cashierSummary, refunds,
      integrity, trialBalance, profitAndLoss, topExpenses, expenseReport,
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
      revenueByWeekdayMax, daypartRevenueMax,
      settings
   } = state;
   const isAr = settings?.language !== 'en';
   const [expenseStatusFilter, setExpenseStatusFilter] = useState<string>('ALL');
   const expenseLabels = {
      approved: isAr ? 'المصروفات المعتمدة' : 'Approved Expenses',
      entries: isAr ? 'عدد قيود المصروفات' : 'Expense Entries',
      topCategory: isAr ? 'أعلى بند مصروف' : 'Top Category',
      noData: isAr ? 'لا توجد بيانات' : 'No data',
      reportTitle: isAr ? 'تقرير المصروفات' : 'Expense Report',
      noApproved: isAr ? 'لا توجد مصروفات معتمدة' : 'No approved expenses found',
      date: isAr ? 'التاريخ' : 'Date',
      category: isAr ? 'بند المصروف' : 'Category',
      description: isAr ? 'الوصف' : 'Description',
      reference: isAr ? 'المرجع' : 'Reference',
      amount: isAr ? 'المبلغ' : 'Amount',
      byCategory: isAr ? 'حسب البند' : 'By Category',
      rows: isAr ? 'قيود' : 'entries',
      noCategory: isAr ? 'لا توجد بيانات بنود' : 'No category data',
      createdBy: isAr ? 'بواسطة' : 'Created By',
      branch: isAr ? 'الفرع' : 'Branch',
      status: isAr ? 'الحالة' : 'Status',
      posted: isAr ? 'مرحل' : 'Posted',
      pending: isAr ? 'معلق' : 'Pending',
      all: isAr ? 'الكل' : 'All',
      postedTotal: isAr ? 'إجمالي المرحّل' : 'Posted Total',
      pendingTotal: isAr ? 'إجمالي المعلق' : 'Pending Total',
      totalCount: isAr ? 'إجمالي القيود' : 'Total Entries',
   };

   return (
      <>
               {activeCategory === 'FINANCE' && activeSubReport === 'Profit & Loss (P&L)' && (
                  <div className="space-y-8 animate-in slide-in-from-bottom-5 duration-700">
                     <div className="bg-card/80  p-8 md:p-12 rounded-[3.5rem] border border-border/50 shadow-2xl relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none" />
                        <h3 className="text-3xl font-black text-main mb-10 tracking-tighter uppercase flex items-center gap-4">
                           <div className="w-1.5 h-8 bg-gradient-to-b from-indigo-500 to-cyan-500 rounded-full" />
                           Revenue vs Cost Analysis
                        </h3>
                        <div className="min-h-[360px] md:h-[460px] lg:h-[540px] w-full relative overflow-hidden z-10">
                           <ResponsiveContainer width="100%" height="100%" minHeight={400} minWidth={0}>
                              <ComposedChart data={salesSeries} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                 <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#818cf8', fontSize: 13, fontWeight: 900 }} dy={10} />
                                 <YAxis axisLine={false} tickLine={false} tick={{ fill: '#818cf8', fontSize: 12, fontWeight: 900 }} dx={-10} />
                                 <Tooltip contentStyle={{ borderRadius: '1.5rem', backgroundColor: 'rgba(15,23,42,0.9)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', padding: '24px' }} itemStyle={{ fontWeight: 'black' }} />
                                 <Legend iconType="circle" wrapperStyle={{ paddingTop: '40px', fontWeight: 'bold' }} />
                                 <Bar dataKey="revenue" name="Revenue" fill="#6366f1" radius={[8, 8, 0, 0]} />
                                 <Bar dataKey="cost" name="COGS" fill="#f43f5e" radius={[8, 8, 0, 0]} />
                                 <Line type="monotone" dataKey="profit" name="Gross Profit" stroke="#10b981" strokeWidth={5} dot={{ r: 6, fill: '#10b981', strokeWidth: 4, stroke: 'currentColor' }} activeDot={{ r: 10, strokeWidth: 0 }} />
                              </ComposedChart>
                           </ResponsiveContainer>
                        </div>
                     </div>
                  </div>
               )}
               {activeCategory === 'FINANCE' && activeSubReport === 'Z-Report / Fiscal' && (
                  <div className="space-y-8 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-800 rounded-3xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div className="flex items-start gap-3">
                           <Info className="text-indigo-600" />
                           <div>
                              <p className="text-xs font-black uppercase tracking-widest text-indigo-600">Fiscal Compliance</p>
                              <p className="text-sm font-bold text-slate-600 dark:text-slate-300">For ETA submissions and audit trail, open Fiscal Hub.</p>
                           </div>
                        </div>
                        <button
                           onClick={() => navigate('/fiscal')}
                           className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest shadow-lg"
                        >
                           Open Fiscal Hub
                        </button>
                     </div>

                     <div className="card-primary rounded-[3rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
                        <div className="p-10 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
                           <div>
                              <h3 className="text-2xl font-black text-slate-800 dark:text-white">Daily Z-Report</h3>
                              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Reconciliation for {(vatReport?.summary?.count || 0)} Taxable Transactions</p>
                           </div>
                        </div>
                        <div className="p-10">
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                              <div className="space-y-6">
                                 <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <Info size={14} className="text-indigo-500" /> Revenue Breakdown
                                 </h4>
                                 <div className="space-y-4">
                                    <div className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl">
                                       <span className="text-[11px] font-black uppercase text-slate-500">Gross Sales</span>
                                       <span className="text-sm font-black text-slate-800 dark:text-white">{(vatReport?.summary?.grandTotal || 0).toLocaleString()} LE</span>
                                    </div>
                                    <div className="flex justify-between items-center p-4">
                                       <span className="text-[11px] font-black uppercase text-slate-500 text-rose-500">Total Discounts</span>
                                       <span className="text-sm font-black text-rose-500">- {(overview?.discountTotal || 0).toLocaleString()} LE</span>
                                    </div>
                                    <div className="flex justify-between items-center p-4 bg-slate-100/50 dark:bg-slate-800/50 rounded-2xl">
                                       <span className="text-[11px] font-black uppercase text-slate-800 dark:text-white">Net Taxable Amount</span>
                                       <span className="text-sm font-black text-indigo-600 underline underline-offset-4">{(vatReport?.summary?.netTotal || 0).toLocaleString()} LE</span>
                                    </div>
                                 </div>
                              </div>

                              <div className="space-y-6">
                                 <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <Scale size={14} className="text-emerald-500" /> Tax & Charges
                                 </h4>
                                 <div className="space-y-4">
                                    <div className="flex justify-between items-center p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/10">
                                       <span className="text-[11px] font-black uppercase text-emerald-600">VAT (14%)</span>
                                       <span className="text-sm font-black text-emerald-600">+ {(vatReport?.summary?.taxTotal || 0).toLocaleString()} LE</span>
                                    </div>
                                    <div className="flex justify-between items-center p-4">
                                       <span className="text-[11px] font-black uppercase text-slate-500">Service Charge ({(vatReport?.summary?.serviceChargeTotal > 0 ? '12%' : '0%')})</span>
                                       <span className="text-sm font-black text-slate-600">+ {(vatReport?.summary?.serviceChargeTotal || 0).toLocaleString()} LE</span>
                                    </div>
                                 </div>
                              </div>
                           </div>
                        </div>
                     </div>
                  </div>
               )}
               {activeCategory === 'FINANCE' && activeSubReport === 'Trial Balance' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="bg-card/80  rounded-[2.5rem] border border-border/50 shadow-2xl overflow-hidden">
                        <div className="p-8 border-b border-border/50 bg-elevated/30">
                           <h3 className="text-2xl font-black text-main uppercase tracking-tighter flex items-center gap-4">
                              <div className="w-12 h-12 bg-violet-500/10 rounded-2xl flex items-center justify-center border border-violet-500/20 text-violet-500"><Scale size={24} /></div>
                              Trial Balance
                           </h3>
                        </div>
                        {trialBalance.length === 0 ? (
                           <div className="p-16 text-center text-muted text-xs font-black uppercase tracking-widest">No journal {expenseLabels.rows} found for this period</div>
                        ) : (
                           <div className="responsive-table">
                              <table className="w-full text-left border-collapse">
                                 <thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]">
                                    <th className="px-8 py-5">Code</th><th className="px-6 py-5">Account</th><th className="px-6 py-5">Type</th><th className="px-6 py-5 text-right">Debit</th><th className="px-6 py-5 text-right">Credit</th><th className="px-8 py-5 text-right">Balance</th>
                                 </tr></thead>
                                 <tbody className="divide-y divide-border/30">
                                    {trialBalance.map((row, idx) => (
                                       <tr key={idx} className="hover:bg-elevated/40 transition-colors">
                                          <td className="px-8 py-4 font-mono text-xs font-bold text-indigo-500">{row.accountCode}</td>
                                          <td className="px-6 py-4 text-xs font-black text-main uppercase">{row.accountName}</td>
                                          <td className="px-6 py-4"><span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${row.accountType === 'REVENUE' ? 'bg-emerald-500/10 text-emerald-500' : row.accountType === 'EXPENSE' ? 'bg-rose-500/10 text-rose-500' : 'bg-slate-500/10 text-slate-500'}`}>{row.accountType}</span></td>
                                          <td className="px-6 py-4 font-mono text-sm font-bold text-main text-right">{row.totalDebit.toLocaleString()}</td>
                                          <td className="px-6 py-4 font-mono text-sm font-bold text-main text-right">{row.totalCredit.toLocaleString()}</td>
                                          <td className={`px-8 py-4 font-mono text-sm font-black text-right ${row.balance >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{row.balance.toLocaleString()}</td>
                                       </tr>
                                    ))}
                                 </tbody>
                              </table>
                           </div>
                        )}
                     </div>
                  </div>
               )}
               {activeCategory === 'FINANCE' && activeSubReport === 'Top Expenses' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="bg-card/80  rounded-[2.5rem] border border-border/50 shadow-2xl overflow-hidden">
                        <div className="p-8 border-b border-border/50 bg-elevated/30">
                           <h3 className="text-2xl font-black text-main uppercase tracking-tighter flex items-center gap-4">
                              <div className="w-12 h-12 bg-rose-500/10 rounded-2xl flex items-center justify-center border border-rose-500/20 text-rose-500"><TrendingUp size={24} /></div>
                              Top Expenses
                           </h3>
                        </div>
                        {topExpenses.length === 0 ? (
                           <div className="p-16 text-center text-muted text-xs font-black uppercase tracking-widest">No expense data found</div>
                        ) : (
                           <div className="p-8 space-y-3">
                              {topExpenses.map((exp, idx) => (
                                 <div key={idx} className="flex items-center gap-4 p-4 rounded-2xl hover:bg-elevated/40 transition-colors group">
                                    <div className="w-8 h-8 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500 text-[10px] font-black">{idx + 1}</div>
                                    <div className="flex-1">
                                       <p className="text-xs font-black text-main uppercase">{exp.name}</p>
                                       <div className="mt-1.5 h-2 bg-elevated rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-rose-400 to-rose-600 rounded-full transition-all duration-1000" style={{ width: `${topExpenses[0]?.total ? (exp.total / topExpenses[0].total * 100) : 0}%` }} /></div>
                                    </div>
                                    <span className="font-mono text-sm font-black text-rose-500">{exp.total.toLocaleString()} LE</span>
                                 </div>
                              ))}
                           </div>
                        )}
                     </div>
                  </div>
               )}
                {activeCategory === 'FINANCE' && activeSubReport === 'Expense Report' && (
                   <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                      {/* Summary Cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
                         <div className="bg-card/80 rounded-[2rem] p-6 border border-border/50 shadow-2xl">
                            <p className="text-muted text-[10px] font-black uppercase tracking-[0.2em] mb-2">{expenseLabels.postedTotal}</p>
                            <h3 className="text-3xl font-black text-emerald-500">{(expenseReport?.summary?.postedTotal || 0).toLocaleString()} <span className="text-sm">LE</span></h3>
                         </div>
                         <div className="bg-card/80 rounded-[2rem] p-6 border border-border/50 shadow-2xl">
                            <p className="text-muted text-[10px] font-black uppercase tracking-[0.2em] mb-2">{expenseLabels.pendingTotal}</p>
                            <h3 className="text-3xl font-black text-amber-500">{(expenseReport?.summary?.pendingTotal || 0).toLocaleString()} <span className="text-sm">LE</span></h3>
                         </div>
                         <div className="bg-card/80 rounded-[2rem] p-6 border border-border/50 shadow-2xl">
                            <p className="text-muted text-[10px] font-black uppercase tracking-[0.2em] mb-2">{expenseLabels.totalCount}</p>
                            <h3 className="text-3xl font-black text-main">{(expenseReport?.summary?.totalCount || 0)}</h3>
                            <p className="text-[10px] text-muted font-bold mt-1">
                               {expenseReport?.summary?.postedCount || 0} {expenseLabels.posted} · {expenseReport?.summary?.pendingCount || 0} {expenseLabels.pending}
                            </p>
                         </div>
                         <div className="bg-card/80 rounded-[2rem] p-6 border border-border/50 shadow-2xl">
                            <p className="text-muted text-[10px] font-black uppercase tracking-[0.2em] mb-2">{expenseLabels.topCategory}</p>
                            <h3 className="text-lg font-black text-amber-500 truncate">{expenseReport?.byCategory?.[0]?.nameAr || expenseReport?.byCategory?.[0]?.name || expenseLabels.noData}</h3>
                            <p className="mt-1 text-xs font-bold text-muted">{((expenseReport?.byCategory?.[0]?.total || 0) as number).toLocaleString()} LE</p>
                         </div>
                         <div className="bg-card/80 rounded-[2rem] p-6 border border-border/50 shadow-2xl">
                            <p className="text-muted text-[10px] font-black uppercase tracking-[0.2em] mb-2">{expenseLabels.entries}</p>
                            <h3 className="text-3xl font-black text-main">{expenseReport?.summary?.count || 0}</h3>
                            <p className="text-[10px] text-muted font-bold mt-1">{isAr ? 'قيد معروض' : 'rows displayed'}</p>
                         </div>
                      </div>

                      {/* Status Filter */}
                      <div className="flex items-center gap-2 flex-wrap">
                         {['ALL', 'POSTED', 'PENDING_APPROVAL'].map((s) => {
                            const label = s === 'ALL' ? expenseLabels.all : s === 'POSTED' ? expenseLabels.posted : expenseLabels.pending;
                            const active = expenseStatusFilter === s;
                            return (
                               <button key={s} onClick={() => setExpenseStatusFilter(s)}
                                  className={`px-4 py-2 rounded-xl text-[11px] font-black tracking-wider transition-all ${
                                     active ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' : 'bg-card border border-border/60 text-muted hover:border-rose-500/30'
                                  }`}
                               >{label}</button>
                            );
                         })}
                      </div>

                      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                         <div className="xl:col-span-2 bg-card/80 rounded-[2.5rem] border border-border/50 shadow-2xl overflow-hidden">
                            <div className="p-6 border-b border-border/50 bg-elevated/30">
                               <h3 className="text-2xl font-black text-main uppercase tracking-tighter flex items-center gap-4">
                                  <div className="w-12 h-12 bg-rose-500/10 rounded-2xl flex items-center justify-center border border-rose-500/20 text-rose-500"><DollarSign size={24} /></div>
                                  {expenseLabels.reportTitle}
                               </h3>
                            </div>
                            {!expenseReport?.rows?.length ? (
                               <div className="p-16 text-center text-muted text-xs font-black uppercase tracking-widest">{expenseLabels.noApproved}</div>
                            ) : (
                               <div className="overflow-x-auto">
                                  <table className="w-full text-left border-collapse text-xs">
                                     <thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]">
                                        <th className="px-5 py-4">{expenseLabels.date}</th>
                                        <th className="px-5 py-4">{expenseLabels.category}</th>
                                        <th className="px-5 py-4">{expenseLabels.description}</th>
                                        <th className="px-5 py-4">{expenseLabels.reference}</th>
                                        <th className="px-5 py-4">{expenseLabels.createdBy}</th>
                                        <th className="px-5 py-4">{expenseLabels.status}</th>
                                        <th className="px-5 py-4 text-right">{expenseLabels.amount}</th>
                                     </tr></thead>
                                     <tbody className="divide-y divide-border/30">
                                        {expenseReport.rows
                                           .filter((row: any) => expenseStatusFilter === 'ALL' || row.status === expenseStatusFilter)
                                           .map((row: any) => (
                                           <tr key={`${row.entryId}-${row.accountCode}`} className="hover:bg-elevated/40 transition-colors">
                                              <td className="px-5 py-3.5 font-mono text-[10px] text-muted whitespace-nowrap">
                                                 {row.date ? new Date(row.date).toLocaleDateString(isAr ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}
                                              </td>
                                              <td className="px-5 py-3.5">
                                                 <p className="text-xs font-black text-main">{row.accountNameAr || row.accountName}</p>
                                                 <p className="text-[9px] font-mono text-muted">{row.accountCode}</p>
                                              </td>
                                              <td className="px-5 py-3.5 max-w-[180px]">
                                                 <p className="text-xs font-bold text-main truncate" title={row.description}>{row.description}</p>
                                                 {row.branchName && <p className="text-[9px] text-muted mt-0.5">{row.branchName}</p>}
                                              </td>
                                              <td className="px-5 py-3.5 font-mono text-[10px] text-muted">{row.reference || '-'}</td>
                                              <td className="px-5 py-3.5 text-[10px] font-bold text-muted">{row.createdByName || '-'}</td>
                                              <td className="px-5 py-3.5">
                                                 <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black ${
                                                    row.status === 'POSTED' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'
                                                 }`}>
                                                    {row.status === 'POSTED' ? expenseLabels.posted : expenseLabels.pending}
                                                 </span>
                                              </td>
                                              <td className="px-5 py-3.5 font-mono text-sm font-black text-rose-500 text-right whitespace-nowrap">{Number(row.amount || 0).toLocaleString()} LE</td>
                                           </tr>
                                        ))}
                                     </tbody>
                                  </table>
                               </div>
                            )}
                         </div>

                         <div className="space-y-6">
                            <div className="bg-card/80 rounded-[2.5rem] border border-border/50 shadow-2xl overflow-hidden">
                               <div className="p-6 border-b border-border/50 bg-elevated/30">
                                  <h3 className="text-xl font-black text-main uppercase tracking-tighter">{expenseLabels.byCategory}</h3>
                               </div>
                               <div className="p-5 space-y-2 max-h-[400px] overflow-y-auto">
                                  {(expenseReport?.byCategory || []).map((category: any, idx: number) => (
                                     <div key={category.code || idx} className="flex items-center gap-3 p-2.5 rounded-2xl hover:bg-elevated/40 transition-colors">
                                        <div className="w-7 h-7 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 text-[9px] font-black shrink-0">{idx + 1}</div>
                                        <div className="flex-1 min-w-0">
                                           <p className="text-xs font-black text-main truncate">{category.nameAr || category.name}</p>
                                           <p className="text-[9px] text-muted font-mono">{category.count} {expenseLabels.rows}</p>
                                        </div>
                                        <span className="font-mono text-xs font-black text-rose-500 shrink-0">{category.total.toLocaleString()}</span>
                                     </div>
                                  ))}
                                  {(!expenseReport?.byCategory || expenseReport.byCategory.length === 0) && (
                                     <p className="text-center text-muted py-8 text-xs font-black uppercase tracking-widest">{expenseLabels.noCategory}</p>
                                  )}
                               </div>
                            </div>

                            {/* Daily Breakdown */}
                            {(expenseReport?.byDay || []).length > 0 && (
                               <div className="bg-card/80 rounded-[2.5rem] border border-border/50 shadow-2xl overflow-hidden">
                                  <div className="p-6 border-b border-border/50 bg-elevated/30">
                                     <h3 className="text-xl font-black text-main uppercase tracking-tighter">{isAr ? 'توزيع يومي' : 'Daily Breakdown'}</h3>
                                  </div>
                                  <div className="p-5 space-y-1.5 max-h-[300px] overflow-y-auto">
                                     {(expenseReport?.byDay || []).map((day: any) => (
                                        <div key={day.day} className="flex items-center justify-between py-1.5 px-2 rounded-xl hover:bg-elevated/30 transition-colors">
                                           <span className="text-xs font-bold text-main">{new Date(day.day + 'T00:00:00').toLocaleDateString(isAr ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short' })}</span>
                                           <div className="flex items-center gap-3">
                                              <span className="text-[10px] text-muted">{day.count} {expenseLabels.rows}</span>
                                              <span className="font-mono text-xs font-black text-rose-500">{day.total.toLocaleString()}</span>
                                           </div>
                                        </div>
                                     ))}
                                  </div>
                               </div>
                            )}
                         </div>
                      </div>
                   </div>
                )}
               {activeCategory === 'FINANCE' && activeSubReport === 'Profit & Loss (P&L)' && profitAndLoss && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-card/80  rounded-[2rem] p-8 border border-border/50 shadow-2xl">
                           <p className="text-muted text-[10px] font-black uppercase tracking-[0.2em] mb-2">Total Revenue</p>
                           <h3 className="text-4xl font-black text-emerald-500">{profitAndLoss.revenue.toLocaleString()} <span className="text-sm">LE</span></h3>
                        </div>
                        <div className="bg-card/80  rounded-[2rem] p-8 border border-border/50 shadow-2xl">
                           <p className="text-muted text-[10px] font-black uppercase tracking-[0.2em] mb-2">Total Expenses</p>
                           <h3 className="text-4xl font-black text-rose-500">{profitAndLoss.expenses.toLocaleString()} <span className="text-sm">LE</span></h3>
                        </div>
                        <div className="bg-card/80  rounded-[2rem] p-8 border border-border/50 shadow-2xl">
                           <p className="text-muted text-[10px] font-black uppercase tracking-[0.2em] mb-2">Net Profit</p>
                           <h3 className={`text-4xl font-black ${profitAndLoss.netProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{profitAndLoss.netProfit.toLocaleString()} <span className="text-sm">LE</span></h3>
                        </div>
                     </div>
                     <div className="bg-card/80  rounded-[2.5rem] border border-border/50 shadow-2xl overflow-hidden">
                        <div className="responsive-table">
                           <table className="w-full text-left border-collapse">
                              <thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]">
                                 <th className="px-8 py-5">Account</th><th className="px-6 py-5">Type</th><th className="px-6 py-5 text-right">Debit</th><th className="px-6 py-5 text-right">Credit</th><th className="px-8 py-5 text-right">Net</th>
                              </tr></thead>
                              <tbody className="divide-y divide-border/30">
                                 {profitAndLoss.details.map((d, idx) => (
                                    <tr key={idx} className="hover:bg-elevated/40 transition-colors">
                                       <td className="px-8 py-4 text-xs font-black text-main uppercase">{d.name}</td>
                                       <td className="px-6 py-4"><span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase ${d.type === 'REVENUE' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>{d.type}</span></td>
                                       <td className="px-6 py-4 font-mono text-sm text-right">{d.debit.toLocaleString()}</td>
                                       <td className="px-6 py-4 font-mono text-sm text-right">{d.credit.toLocaleString()}</td>
                                       <td className={`px-8 py-4 font-mono text-sm font-black text-right ${d.net >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{d.net.toLocaleString()}</td>
                                    </tr>
                                 ))}
                              </tbody>
                           </table>
                        </div>
                     </div>
                  </div>
               )}
               {activeCategory === 'FINANCE' && activeSubReport === 'Tips Report' && tipsData && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                           { l: 'Total Tips', v: `${tipsData.summary.totalTips.toLocaleString()} LE` },
                           { l: 'Tipped Orders', v: tipsData.summary.orderCount },
                           { l: 'Average Tip', v: `${tipsData.summary.avgTip} LE` },
                           { l: 'Max Tip', v: `${tipsData.summary.maxTip} LE` },
                        ].map((c, i) => (
                           <div key={i} className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-lg">
                              <p className="text-[10px] font-black uppercase tracking-widest text-muted">{c.l}</p>
                              <p className="text-2xl font-black text-main mt-1">{c.v}</p>
                           </div>
                        ))}
                     </div>
                     {tipsData.byType.length > 0 && (
                        <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
                           <div className="p-6 border-b border-slate-100 dark:border-slate-800"><h3 className="text-lg font-black text-main">Tips by order type</h3></div>
                           <div className="divide-y divide-border/30">
                              {tipsData.byType.map((r: any, i: number) => (
                                 <div key={i} className="flex items-center justify-between px-8 py-4">
                                    <span className="text-xs font-black text-main">{r.orderType}</span>
                                    <div className="flex gap-6 text-xs"><span className="font-mono">{r.count} orders</span><span className="font-mono font-bold text-emerald-500">{r.totalTips.toLocaleString()} LE</span></div>
                                 </div>
                              ))}
                           </div>
                        </div>
                     )}
                  </div>
               )}
               {activeCategory === 'FINANCE' && activeSubReport === 'Tips Report' && !tipsData && <p className="text-center text-muted py-16">No tips data.</p>}

               {activeCategory === 'FINANCE' && activeSubReport === 'Service Charge' && serviceChargeData && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="grid grid-cols-3 gap-4">{[{ l: 'Total Service Charge', v: `${serviceChargeData.summary.totalServiceCharge.toLocaleString()} LE` }, { l: 'Orders with SC', v: serviceChargeData.summary.orderCount }, { l: 'Avg SC', v: `${serviceChargeData.summary.avgServiceCharge} LE` }].map((c, i) => (<div key={i} className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-lg"><p className="text-[10px] font-black uppercase tracking-widest text-muted">{c.l}</p><p className="text-2xl font-black text-main mt-1">{c.v}</p></div>))}</div>
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"><div className="p-6 border-b border-slate-100 dark:border-slate-800"><h3 className="text-lg font-black text-main">Daily Breakdown</h3></div><div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-8 py-5 text-left">Day</th><th className="px-6 py-5 text-right">Orders</th><th className="px-8 py-5 text-right">Total SC</th></tr></thead><tbody className="divide-y divide-border/30">{serviceChargeData.daily.map((r: any, i: number) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-8 py-4 text-xs font-black text-main">{r.day}</td><td className="px-6 py-4 font-mono text-right">{r.count}</td><td className="px-8 py-4 font-mono font-bold text-right">{r.totalServiceCharge.toLocaleString()} LE</td></tr>)}</tbody></table></div></div>
                  </div>
               )}
               {activeCategory === 'FINANCE' && activeSubReport === 'Service Charge' && !serviceChargeData && <p className="text-center text-muted py-16">No service charge data.</p>}

               {activeCategory === 'FINANCE' && activeSubReport === 'Shift Summary' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
                        <div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50"><h3 className="text-xl font-black text-main">Shift Summary / Cash Drawer</h3></div>
                         <div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-6 py-5 text-left">Open</th><th className="px-4 py-5 text-left">Close</th><th className="px-4 py-5 text-left">Status</th><th className="px-4 py-5 text-right">Orders</th><th className="px-4 py-5 text-right">Revenue</th><th className="px-4 py-5 text-right">Opening</th><th className="px-4 py-5 text-right">Expected</th><th className="px-4 py-5 text-right">Actual</th><th className="px-6 py-5 text-right">Variance</th></tr></thead><tbody className="divide-y divide-border/30">{shiftSummaryData.map((r: any, i: number) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-6 py-4 font-mono text-[10px]">{r.openingTime ? new Date(r.openingTime).toLocaleString() : '-'}</td><td className="px-4 py-4 font-mono text-[10px]">{r.closingTime ? new Date(r.closingTime).toLocaleString() : '-'}</td><td className="px-4 py-4"><span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase ${r.status === 'CLOSED' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>{r.status}</span></td><td className="px-4 py-4 font-mono text-right">{r.orderCount}</td><td className="px-4 py-4 font-mono font-bold text-right">{r.revenue.toLocaleString()}</td><td className="px-4 py-4 font-mono text-right text-muted">{r.openingBalance}</td><td className="px-4 py-4 font-mono text-right">{r.expectedBalance}</td><td className="px-4 py-4 font-mono text-right">{r.actualBalance}</td><td className={`px-6 py-4 font-mono font-bold text-right ${r.variance >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{r.variance >= 0 ? '+' : ''}{r.variance} LE</td></tr>)}</tbody></table></div>
                        {shiftSummaryData.length === 0 && <p className="text-center text-muted py-16">No shifts found.</p>}
                     </div>
                  </div>
               )}
               {activeCategory === 'FINANCE' && activeSubReport === 'Food Cost % Trend' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"><div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50"><h3 className="text-xl font-black text-main">Food Cost % Trend</h3></div><div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-8 py-5 text-left">Day</th><th className="px-6 py-5 text-right">Revenue</th><th className="px-6 py-5 text-right">Cost</th><th className="px-8 py-5 text-right">Food Cost %</th></tr></thead><tbody className="divide-y divide-border/30">{foodCostTrendData.map((r: any, i: number) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-8 py-4 text-xs font-black text-main">{r.day}</td><td className="px-6 py-4 font-mono text-right">{r.revenue.toLocaleString()}</td><td className="px-6 py-4 font-mono text-right text-muted">{r.cost.toLocaleString()}</td><td className="px-8 py-4 font-mono font-bold text-right"><span className={`px-2 py-1 rounded-lg text-[9px] font-black ${r.foodCostPercent > 40 ? 'bg-rose-500/10 text-rose-500' : r.foodCostPercent > 30 ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'}`}>{r.foodCostPercent}%</span></td></tr>)}</tbody></table></div></div>
                     {foodCostTrendData.length === 0 && <p className="text-center text-muted py-16">No data.</p>}
                  </div>
               )}
               {activeCategory === 'FINANCE' && activeSubReport === 'Cash Flow Forecast' && cashFlowData && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="grid grid-cols-2 gap-4"><div className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-lg"><p className="text-[10px] font-black uppercase tracking-widest text-muted">Avg Weekly Revenue</p><p className="text-2xl font-black text-main mt-1">{cashFlowData.avgWeeklyRevenue.toLocaleString()} LE</p></div><div className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-lg"><p className="text-[10px] font-black uppercase tracking-widest text-muted">Weekly Trend</p><p className={`text-2xl font-black mt-1 ${cashFlowData.weeklyTrend >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{cashFlowData.weeklyTrend >= 0 ? '+' : ''}{cashFlowData.weeklyTrend.toLocaleString()} LE</p></div></div>
                     <div className="grid grid-cols-2 gap-6"><div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden p-6"><h3 className="text-lg font-black text-main mb-4">History (12 wks)</h3>{cashFlowData.history.map((h: any, i: number) => (<div key={i} className="flex justify-between py-1.5 text-xs"><span className="text-muted font-mono">W{h.week}</span><span className="font-black text-main">{h.revenue.toLocaleString()} LE</span></div>))}</div><div className="card-primary rounded-[2rem] border border-blue-200 dark:border-blue-800 shadow-xl overflow-hidden p-6 bg-blue-50/30 dark:bg-blue-950/20"><h3 className="text-lg font-black text-blue-500 mb-4">Forecast</h3>{cashFlowData.forecast.map((f: any, i: number) => (<div key={i} className="flex justify-between py-2 text-xs"><span className="text-blue-400 font-mono">Week {f.week}</span><span className="font-black text-blue-500">{f.projectedRevenue.toLocaleString()} LE</span></div>))}</div></div>
                  </div>
               )}
               {activeCategory === 'FINANCE' && activeSubReport === 'Cash Flow Forecast' && !cashFlowData && <p className="text-center text-muted py-16">No data.</p>}

               {activeCategory === 'FINANCE' && activeSubReport === 'Tax Compliance' && taxComplianceData && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="grid grid-cols-2 md:grid-cols-5 gap-4">{[{ l: 'Total Invoices', v: taxComplianceData.fiscal.total }, { l: 'Submitted', v: taxComplianceData.fiscal.submitted, c: 'text-emerald-500' }, { l: 'Failed', v: taxComplianceData.fiscal.failed, c: 'text-rose-500' }, { l: 'Pending', v: taxComplianceData.fiscal.pending, c: 'text-amber-500' }, { l: 'Success Rate', v: `${taxComplianceData.fiscal.successRate}%`, c: taxComplianceData.fiscal.successRate > 90 ? 'text-emerald-500' : 'text-rose-500' }].map((c: any, i: number) => (<div key={i} className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-lg"><p className="text-[10px] font-black uppercase tracking-widest text-muted">{c.l}</p><p className={`text-2xl font-black mt-1 ${c.c || 'text-main'}`}>{c.v}</p></div>))}</div>
                     {taxComplianceData.deadLetters.length > 0 && <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden p-6"><h3 className="text-lg font-black text-main mb-4">Dead Letters by Status</h3>{taxComplianceData.deadLetters.map((d: any, i: number) => (<div key={i} className="flex justify-between py-1.5 text-xs"><span className="text-muted">{d.status}</span><span className="font-black text-main">{d.count}</span></div>))}</div>}
                  </div>
               )}
               {activeCategory === 'FINANCE' && activeSubReport === 'Tax Compliance' && !taxComplianceData && <p className="text-center text-muted py-16">No data.</p>}

               {activeCategory === 'FINANCE' && activeSubReport === 'Audit Trail' && auditTrailData && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="grid grid-cols-2 gap-6"><div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden p-6"><h3 className="text-lg font-black text-main mb-4">By Event Type</h3>{auditTrailData.byType.map((r: any, i: number) => (<div key={i} className="flex justify-between py-1.5 text-xs"><span className="text-muted font-mono">{r.eventType}</span><span className="font-black text-main">{r.count}</span></div>))}</div><div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden p-6"><h3 className="text-lg font-black text-main mb-4">By User</h3>{auditTrailData.byUser.map((r: any, i: number) => (<div key={i} className="flex justify-between py-1.5 text-xs"><span className="text-muted">{r.userName} <span className="text-[9px] text-muted/50">({r.userRole})</span></span><span className="font-black text-main">{r.count}</span></div>))}</div></div>
                      <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"><div className="p-6 border-b border-slate-100 dark:border-slate-800"><h3 className="text-lg font-black text-main">Recent Activity</h3></div><div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-6 py-5 text-left">Event</th><th className="px-4 py-5 text-left">User</th><th className="px-4 py-5 text-left">Reason</th><th className="px-6 py-5 text-right">When</th></tr></thead><tbody className="divide-y divide-border/30">{auditTrailData.recent.slice(0, 30).map((r: any, i: number) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-6 py-3 font-mono text-[10px]">{r.eventType}</td><td className="px-4 py-3 text-xs">{r.userName}</td><td className="px-4 py-3 text-xs text-muted">{r.reason || '-'}</td><td className="px-6 py-3 font-mono text-[10px] text-muted text-right">{r.createdAt ? new Date(r.createdAt).toLocaleString() : '-'}</td></tr>)}</tbody></table></div></div>
                  </div>
               )}
               {activeCategory === 'FINANCE' && activeSubReport === 'Audit Trail' && !auditTrailData && <p className="text-center text-muted py-16">No data.</p>}

               {/* ============ STRATEGIC HR ============ */}

               {activeCategory === 'HR' && activeSubReport === 'Employee Productivity' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"><div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50"><h3 className="text-xl font-black text-main">Employee Productivity Ranking</h3></div><div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-8 py-5 text-left">#</th><th className="px-6 py-5 text-left">Employee ID</th><th className="px-6 py-5 text-right">Orders</th><th className="px-6 py-5 text-right">Revenue</th><th className="px-8 py-5 text-right">Avg Ticket</th></tr></thead><tbody className="divide-y divide-border/30">{empProductivityData.map((r: any, i: number) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-8 py-4 font-mono text-muted">{i + 1}</td><td className="px-6 py-4 text-xs font-black text-main">{r.userId}</td><td className="px-6 py-4 font-mono text-right">{r.orderCount}</td><td className="px-6 py-4 font-mono font-bold text-right">{r.revenue.toLocaleString()} LE</td><td className="px-8 py-4 font-mono text-right">{r.avgTicket} LE</td></tr>)}</tbody></table></div></div>
                     {empProductivityData.length === 0 && <p className="text-center text-muted py-16">No data.</p>}
                  </div>
               )}
               {activeCategory === 'FINANCE' && activeSubReport === 'Break-Even Analysis' && breakEvenData && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[{ l: 'Avg Monthly Revenue', v: `${breakEvenData.avgMonthlyRevenue.toLocaleString()} LE` }, { l: 'Avg Monthly Orders', v: breakEvenData.avgMonthlyOrders }, { l: 'Break-Even Revenue', v: `${breakEvenData.breakEvenRevenue.toLocaleString()} LE`, c: 'text-amber-500' }, { l: 'Break-Even Orders/Day', v: breakEvenData.breakEvenOrdersPerDay, c: 'text-rose-500' }].map((c: any, i: number) => (<div key={i} className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-lg"><p className="text-[10px] font-black uppercase tracking-widest text-muted">{c.l}</p><p className={`text-2xl font-black mt-1 ${c.c || 'text-main'}`}>{c.v}</p></div>))}</div>
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden"><div className="p-6 border-b border-slate-100 dark:border-slate-800"><h3 className="text-lg font-black text-main">Monthly Revenue Trend</h3></div><div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-8 py-5 text-left">Month</th><th className="px-6 py-5 text-right">Revenue</th><th className="px-8 py-5 text-right">Orders</th></tr></thead><tbody className="divide-y divide-border/30">{breakEvenData.monthly.map((m: any, i: number) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-8 py-4 font-mono text-main">{m.month}</td><td className="px-6 py-4 font-mono font-bold text-right">{m.revenue.toLocaleString()} LE</td><td className="px-8 py-4 font-mono text-right">{m.orderCount}</td></tr>)}</tbody></table></div></div>
                  </div>
               )}
               {activeCategory === 'FINANCE' && activeSubReport === 'Break-Even Analysis' && !breakEvenData && <p className="text-center text-muted py-16">No data.</p>}

               {activeCategory === 'FINANCE' && activeSubReport === 'Payment Reconciliation' && reconciliationData && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[{ l: 'Order Total', v: `${reconciliationData.orderTotal.toLocaleString()} LE` }, { l: 'Payment Total', v: `${reconciliationData.paymentTotal.toLocaleString()} LE` }, { l: 'Discrepancy', v: `${reconciliationData.discrepancy.toLocaleString()} LE`, c: reconciliationData.discrepancy > 0 ? 'text-rose-500' : 'text-emerald-500' }, { l: 'Discrepancy %', v: `${reconciliationData.discrepancyPercent}%`, c: Math.abs(reconciliationData.discrepancyPercent) > 2 ? 'text-rose-500' : 'text-emerald-500' }].map((c: any, i: number) => (<div key={i} className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-lg"><p className="text-[10px] font-black uppercase tracking-widest text-muted">{c.l}</p><p className={`text-2xl font-black mt-1 ${c.c || 'text-main'}`}>{c.v}</p></div>))}</div>
                      <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden p-6"><h3 className="text-lg font-black text-main mb-4">By Payment Method</h3>{reconciliationData.byMethod.map((m: any, i: number) => (<div key={i} className="flex justify-between py-2 text-xs border-b border-border/20"><span className="font-black">{m.method}</span><span className="text-muted">{m.count} txns - <span className="font-black text-main">{m.total.toLocaleString()} LE</span></span></div>))}</div>
                  </div>
               )}
               {activeCategory === 'FINANCE' && activeSubReport === 'Payment Reconciliation' && !reconciliationData && <p className="text-center text-muted py-16">No data.</p>}

               {activeCategory === 'FINANCE' && activeSubReport === 'Shift Profitability' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                      <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"><div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50"><h3 className="text-xl font-black text-main">Shift Profitability</h3></div><div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-6 py-5 text-left">Opened</th><th className="px-4 py-5 text-right">Orders</th><th className="px-4 py-5 text-right">Revenue</th><th className="px-4 py-5 text-right">Opening</th><th className="px-4 py-5 text-right">Closing</th><th className="px-4 py-5 text-right">Expected</th><th className="px-6 py-5 text-right">Variance</th></tr></thead><tbody className="divide-y divide-border/30">{shiftProfitData.map((r: any, i: number) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-6 py-4 font-mono text-[10px] text-main">{r.openingTime ? new Date(r.openingTime).toLocaleString() : '-'}</td><td className="px-4 py-4 font-mono text-right">{r.orderCount}</td><td className="px-4 py-4 font-mono font-bold text-right">{r.revenue.toLocaleString()}</td><td className="px-4 py-4 font-mono text-right text-muted">{r.openingCash}</td><td className="px-4 py-4 font-mono text-right">{r.closingCash}</td><td className="px-4 py-4 font-mono text-right text-muted">{r.expectedCash}</td><td className="px-6 py-4 font-mono font-bold text-right"><span className={r.variance >= 0 ? 'text-emerald-500' : 'text-rose-500'}>{r.variance >= 0 ? '+' : ''}{r.variance}</span></td></tr>)}</tbody></table></div></div>
                     {shiftProfitData.length === 0 && <p className="text-center text-muted py-16">No data.</p>}
                  </div>
               )}
      </>
   );
};


