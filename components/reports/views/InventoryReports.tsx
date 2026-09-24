import React from 'react';
import {
   BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area, Cell, PieChart, Pie
} from 'recharts';
import {
   DollarSign, TrendingUp, ShoppingBag, Calendar, Download, Printer, ClipboardCheck,
   ChevronDown, Filter, Target, Megaphone, Zap, Scale, Info, Users, Clock, Box, ShieldCheck, Activity, LineChart as ChartIcon
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { inventoryApi } from '../../../services/api/inventory';
import { printStockCountSession } from '../../../services/stockCountPrint';
import ReportDataTable, { fmtMoney, fmtNum } from './shared/ReportDataTable';
import CoverageReportView from './shared/CoverageReportView';

export const InventoryReports = ({ state }: any) => {
   const {
      activeCategory, activeSubReport, navigate,
      dailySales, profitDaily, overview, profitSummary, foodCostData,
      paymentSummary, vatReport, hourlySales, cashierSummary, refunds,
      integrity, trialBalance, profitAndLoss, topExpenses,
       stockMovementLog, stockCounts, wasteLoss, reorderAlerts, expiringBatches,
      payrollData, attendanceData, overtimeData,
      customerLTV, campaignROI, branchPerformance, orderPrepTime,
      salesByOrderType, salesByItem, salesByCategory,
      discountAnalysis, cancelledOrders, deliveryPerformance,
      salesBySource, dineInTables, peakHoursData,
      modifierSalesData, avgTicketTrend, salesComparisonData,
      slowMovingItems, revenueByWeekday, voidItemsData,
      tipsData, serviceChargeData, shiftSummaryData,
       actualVsTheoreticalData, purchaseHistoryData, inventoryValuationData,
       productionBatchesData, suppliersData, purchaseOrdersData,
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
      deadStock, negativeStock,
      salesSeries, peakHoursLookup, peakHoursMaxOrders,
       revenueByWeekdayMax, daypartRevenueMax, settings
   } = state;
   const isAr = settings?.language !== 'en';
   const printCount = async (id: string) => {
      const count = await inventoryApi.getStockCount(id);
      printStockCountSession(count, {
         lang: settings?.language,
         restaurantName: settings?.restaurantName,
         currencySymbol: settings?.currencySymbol,
      });
   };

   return (
      <>
               {activeCategory === 'INVENTORY' && activeSubReport === 'COGS & Margin' && (
                  <div className="space-y-8 animate-in slide-in-from-bottom-5 duration-700">
                     <div className="rounded-2xl border border-border/40 bg-elevated/20 px-4 py-3 text-[11px] font-bold text-muted">{isAr ? 'تكلفة البطاقات بأسعار الوصفات الحية (اليوم) — بينما COGS الفترة من لقطة البيع. قد يختلف الرقمان.' : 'Card costs use live recipe prices (today) — period COGS uses sale-time snapshots. The two can differ.'}</div>
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div className="bg-card/80  rounded-[2rem] p-8 border border-border/50 shadow-2xl relative overflow-hidden group">
                           <div className="absolute -inset-1.5 bg-gradient-to-br from-indigo-500/20 to-cyan-500/20 rounded-[2rem] blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
                           <div className="relative z-10">
                              <p className="text-muted text-[10px] font-black uppercase tracking-[0.2em] mb-2">Avg. Food Cost %</p>
                              <h3 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-cyan-500 mb-2">{Number(profitSummary?.foodCostPercent || 0).toFixed(1)}%</h3>
                           </div>
                        </div>
                     </div>

                     <div className="bg-card/80  rounded-[2.5rem] border border-border/50 shadow-2xl overflow-hidden relative">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-cyan-500 to-emerald-500 opacity-50" />
                        <div className="p-8 border-b border-border/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-elevated/30">
                           <h3 className="text-2xl font-black text-main flex items-center gap-4 uppercase tracking-tighter">
                              <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20 text-indigo-500">
                                 <Scale size={24} />
                              </div>
                              Item Profitability
                           </h3>
                        </div>
                        <div className="responsive-table">
                           <table className="w-full text-left border-collapse">
                              <thead>
                                 <tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]">
                                    <th className="px-8 py-6">Menu Item</th>
                                    <th className="px-6 py-6">Selling Price</th>
                                    <th className="px-6 py-6">Recipe Cost</th>
                                    <th className="px-6 py-6">Gross Margin</th>
                                    <th className="px-6 py-6">Margin (%)</th>
                                    <th className="px-8 py-6 text-right">Health Status</th>
                                 </tr>
                              </thead>
                              <tbody className="divide-y divide-border/30">
                                 {foodCostData.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-elevated/40 transition-colors group">
                                       <td className="px-8 py-5 font-black text-main uppercase text-xs group-hover:text-indigo-500 transition-colors">{item.name}</td>
                                       <td className="px-6 py-5 font-mono text-sm font-bold text-main">{item.price.toFixed(2)} ج.م</td>
                                       <td className="px-6 py-5 font-mono text-sm font-bold text-rose-500 bg-rose-500/5">{item.cost.toFixed(2)} ج.م</td>
                                       <td className="px-6 py-5 font-black text-sm text-emerald-500 bg-emerald-500/5">{item.margin.toFixed(2)} ج.م</td>
                                       <td className="px-6 py-5">
                                          <div className="flex items-center gap-4">
                                             <div className="w-24 bg-elevated h-2.5 rounded-full overflow-hidden border border-border/50">
                                                <div className={`h-full transition-all duration-1000 ${item.marginPercent > 70 ? 'bg-gradient-to-r from-emerald-400 to-emerald-600' : item.marginPercent > 40 ? 'bg-gradient-to-r from-indigo-400 to-indigo-600' : 'bg-gradient-to-r from-rose-400 to-rose-600'}`} style={{ width: `${item.marginPercent}%` }} />
                                             </div>
                                             <span className="text-xs font-black text-main">{item.marginPercent.toFixed(1)}%</span>
                                          </div>
                                       </td>
                                       <td className="px-8 py-5 text-right">
                                          {item.marginPercent > 60 ? (
                                             <span className="px-3 py-1.5 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-inner inline-block">Star Performer</span>
                                          ) : item.cost > item.price ? (
                                             <span className="px-3 py-1.5 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-inner inline-block animate-pulse">Loss Maker</span>
                                          ) : (
                                             <span className="px-3 py-1.5 bg-elevated text-muted border border-border/50 rounded-lg text-[9px] font-black uppercase tracking-widest inline-block">Standard</span>
                )}
                                        </td>
                                    </tr>
                                 ))}
                              </tbody>
                           </table>
                        </div>
                     </div>
                  </div>
                )}
                {activeCategory === 'INVENTORY' && activeSubReport === 'Stock Counts' && (
                   <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150" dir={isAr ? 'rtl' : 'ltr'}>
                      <div className="overflow-hidden rounded-[2rem] border border-border/50 bg-card/80 shadow-xl">
                         <div className="border-b border-border/50 bg-elevated/30 p-6">
                            <h3 className="flex items-center gap-3 text-xl font-black text-main">
                               <ClipboardCheck size={24} className="text-violet-500" />
                               {isAr ? 'تقارير جلسات الجرد' : 'Stock Count Sessions'}
                            </h3>
                            <p className="mt-1 text-xs text-muted">{isAr ? 'راجع ملخص كل جلسة واطبع تفاصيلها كاملة.' : 'Review every session summary and print its full details.'}</p>
                         </div>
                         {stockCounts.length === 0 ? (
                            <div className="p-16 text-center text-xs font-black text-muted">{isAr ? 'لا توجد جلسات جرد في الفترة المحددة' : 'No stock counts in this period'}</div>
                         ) : (
                            <div className="responsive-table">
                               <table className="w-full border-collapse text-xs">
                                  <thead><tr className="bg-elevated/20 text-[10px] font-black uppercase tracking-wider text-muted">
                                     <th className="px-5 py-4 text-start">{isAr ? 'الجلسة' : 'Session'}</th>
                                     <th className="px-5 py-4 text-start">{isAr ? 'التاريخ / المخزن' : 'Date / Warehouse'}</th>
                                     <th className="px-4 py-4 text-center">{isAr ? 'النوع' : 'Type'}</th>
                                     <th className="px-4 py-4 text-center">{isAr ? 'الحالة' : 'Status'}</th>
                                     <th className="px-4 py-4 text-center">{isAr ? 'البنود' : 'Lines'}</th>
                                     <th className="px-4 py-4 text-center">{isAr ? 'فروق' : 'Variances'}</th>
                                     <th className="px-4 py-4 text-center">{isAr ? 'قيمة الفرق' : 'Variance Value'}</th>
                                     <th className="px-5 py-4 text-center print:hidden">{isAr ? 'طباعة' : 'Print'}</th>
                                  </tr></thead>
                                  <tbody className="divide-y divide-border/30">
                                     {stockCounts.map((count: any) => (
                                        <tr key={count.id} className="hover:bg-violet-500/5">
                                           <td className="px-5 py-4 font-black text-main">{count.id}</td>
                                           <td className="px-5 py-4"><div className="font-bold text-main">{String(count.countDate || '').split('T')[0]}</div><div className="text-[10px] text-muted">{count.warehouseName || count.warehouseId || '-'}</div></td>
                                           <td className="px-4 py-4 text-center font-bold">{count.type || '-'}</td>
                                           <td className="px-4 py-4 text-center"><span className="rounded-full bg-violet-500/10 px-2.5 py-1 font-black text-violet-600">{count.status || '-'}</span></td>
                                           <td className="px-4 py-4 text-center font-mono">{count.summary?.countedLines || 0}/{count.summary?.lines || 0}</td>
                                           <td className="px-4 py-4 text-center font-mono font-black text-rose-500">{count.summary?.varianceLines || 0}</td>
                                           <td className="px-4 py-4 text-center font-mono">{Number(count.summary?.varianceValue || 0).toLocaleString()} {settings?.currencySymbol || (isAr ? 'ج.م' : 'EGP')}</td>
                                           <td className="px-5 py-4 text-center print:hidden">
                                              <button type="button" onClick={() => void printCount(count.id)} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-3 py-2 font-black text-white hover:bg-violet-700">
                                                 <Printer size={14} /> {isAr ? 'طباعة' : 'Print'}
                                              </button>
                                           </td>
                                        </tr>
                                     ))}
                                  </tbody>
                               </table>
                            </div>
                         )}
                      </div>
                   </div>
                )}
                {activeCategory === 'INVENTORY' && activeSubReport === 'Stock Movement' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="bg-card/80  rounded-[2.5rem] border border-border/50 shadow-2xl overflow-hidden">
                        <div className="p-8 border-b border-border/50 bg-elevated/30">
                           <h3 className="text-2xl font-black text-main uppercase tracking-tighter flex items-center gap-4">
                              <div className="w-12 h-12 bg-cyan-500/10 rounded-2xl flex items-center justify-center border border-cyan-500/20 text-cyan-500"><Box size={24} /></div>
                              Stock Movement Log <span className="text-sm text-muted font-bold ml-2">({stockMovementLog.length} entries)</span>
                           </h3>
                        </div>
                        {stockMovementLog.length === 0 ? (
                           <div className="p-16 text-center text-muted text-xs font-black uppercase tracking-widest">No stock movements found for this period</div>
                        ) : (
                           <div className="responsive-table">
                              <table className="w-full text-left border-collapse">
                                 <thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]">
                                    <th className="px-8 py-5">Item</th><th className="px-6 py-5">Type</th><th className="px-6 py-5 text-right">Qty</th><th className="px-6 py-5 text-right">Cost</th><th className="px-6 py-5">Reason</th><th className="px-8 py-5">Date</th>
                                 </tr></thead>
                                 <tbody className="divide-y divide-border/30">
                                    {stockMovementLog.slice(0, 100).map((row, idx) => (
                                       <tr key={idx} className="hover:bg-elevated/40 transition-colors">
                                          <td className="px-8 py-4 text-xs font-black text-main uppercase">{row.itemName}</td>
                                          <td className="px-6 py-4"><span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${row.type === 'PURCHASE' ? 'bg-emerald-500/10 text-emerald-500' : row.type === 'WASTE' ? 'bg-rose-500/10 text-rose-500' : row.type === 'TRANSFER' ? 'bg-indigo-500/10 text-indigo-500' : 'bg-amber-500/10 text-amber-500'}`}>{row.type}</span></td>
                                          <td className="px-6 py-4 font-mono text-sm font-bold text-right">{row.quantity}</td>
                                          <td className="px-6 py-4 font-mono text-sm text-right">{Number(row.totalCost || 0).toLocaleString()} LE</td>
                                          <td className="px-6 py-4 text-xs text-muted">{row.reason || '—'}</td>
                                          <td className="px-8 py-4 text-xs text-muted">{new Date(row.createdAt).toLocaleDateString()}</td>
                                       </tr>
                                    ))}
                                 </tbody>
                              </table>
                           </div>
                        )}
                     </div>
                  </div>
               )}
               {activeCategory === 'INVENTORY' && activeSubReport === 'Waste/Loss Log' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     {wasteLoss && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           <div className="bg-card/80  rounded-[2rem] p-8 border border-rose-500/20 shadow-2xl">
                              <p className="text-muted text-[10px] font-black uppercase tracking-[0.2em] mb-2">Total Waste Cost</p>
                              <h3 className="text-4xl font-black text-rose-500">{wasteLoss.totalWasteCost.toLocaleString()} <span className="text-sm">LE</span></h3>
                           </div>
                           <div className="bg-card/80  rounded-[2rem] p-8 border border-border/50 shadow-2xl">
                              <p className="text-muted text-[10px] font-black uppercase tracking-[0.2em] mb-2">Waste Incidents</p>
                              <h3 className="text-4xl font-black text-amber-500">{wasteLoss.count}</h3>
                           </div>
                        </div>
                     )}
                     <div className="bg-card/80  rounded-[2.5rem] border border-border/50 shadow-2xl overflow-hidden">
                        <div className="responsive-table">
                           <table className="w-full text-left border-collapse">
                              <thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]">
                                 <th className="px-8 py-5">Item</th><th className="px-6 py-5">Unit</th><th className="px-6 py-5 text-right">Qty</th><th className="px-6 py-5 text-right">Cost</th><th className="px-6 py-5">Reason</th><th className="px-8 py-5">Date</th>
                              </tr></thead>
                              <tbody className="divide-y divide-border/30">
                                 {(wasteLoss?.items || []).map((row: any, idx: number) => (
                                    <tr key={idx} className="hover:bg-elevated/40 transition-colors">
                                       <td className="px-8 py-4 text-xs font-black text-main uppercase">{row.itemName}</td>
                                       <td className="px-6 py-4 text-xs text-muted uppercase">{row.unit}</td>
                                       <td className="px-6 py-4 font-mono text-sm font-bold text-rose-500 text-right">{row.quantity}</td>
                                       <td className="px-6 py-4 font-mono text-sm text-right">{Number(row.totalCost || 0).toLocaleString()} LE</td>
                                       <td className="px-6 py-4 text-xs text-muted">{row.reason || '—'}</td>
                                       <td className="px-8 py-4 text-xs text-muted">{new Date(row.createdAt).toLocaleDateString()}</td>
                                    </tr>
                                 ))}
                              </tbody>
                           </table>
                        </div>
                     </div>
                  </div>
               )}
               {activeCategory === 'INVENTORY' && activeSubReport === 'Reorder Alerts' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="bg-card/80  rounded-[2.5rem] border border-amber-500/20 shadow-2xl overflow-hidden">
                        <div className="p-8 border-b border-border/50 bg-amber-500/5">
                           <h3 className="text-2xl font-black text-main uppercase tracking-tighter flex items-center gap-4">
                              <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20 text-amber-500"><Zap size={24} /></div>
                              Reorder Alerts <span className="text-sm text-amber-500 font-bold ml-2">({reorderAlerts.length} items below threshold)</span>
                           </h3>
                        </div>
                        {reorderAlerts.length === 0 ? (
                           <div className="p-16 text-center text-emerald-500 text-xs font-black uppercase tracking-widest">? All items are above reorder thresholds</div>
                        ) : (
                           <div className="responsive-table">
                              <table className="w-full text-left border-collapse">
                                 <thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]">
                                    <th className="px-8 py-5">Item</th><th className="px-6 py-5">Unit</th><th className="px-6 py-5 text-right">Current Stock</th><th className="px-6 py-5 text-right">Threshold</th><th className="px-6 py-5 text-right">Deficit</th><th className="px-8 py-5 text-right">Urgency</th>
                                 </tr></thead>
                                 <tbody className="divide-y divide-border/30">
                                    {reorderAlerts.map((row, idx) => (
                                       <tr key={idx} className="hover:bg-elevated/40 transition-colors">
                                          <td className="px-8 py-4 text-xs font-black text-main uppercase">{row.itemName}</td>
                                          <td className="px-6 py-4 text-xs text-muted uppercase">{row.unit}</td>
                                          <td className="px-6 py-4 font-mono text-sm font-bold text-rose-500 text-right">{row.currentStock}</td>
                                          <td className="px-6 py-4 font-mono text-sm text-right">{row.threshold}</td>
                                          <td className="px-6 py-4 font-mono text-sm font-black text-rose-500 text-right">-{row.deficit}</td>
                                          <td className="px-8 py-4 text-right">
                                             <span className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest inline-block ${row.currentStock <= 0 ? 'bg-rose-500/10 text-rose-500 animate-pulse' : 'bg-amber-500/10 text-amber-500'}`}>{row.currentStock <= 0 ? 'OUT OF STOCK' : 'LOW STOCK'}</span>
                                          </td>
                                       </tr>
                                    ))}
                                 </tbody>
                              </table>
                           </div>
                        )}
                     </div>
                  </div>
               )}
               {activeCategory === 'INVENTORY' && activeSubReport === 'Expiring Batches' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     {expiringBatches && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                           <div className="bg-card/80  rounded-[2rem] p-8 border border-border/50 shadow-2xl">
                              <p className="text-muted text-[10px] font-black uppercase tracking-[0.2em] mb-2">At-Risk Batches</p>
                              <h3 className="text-4xl font-black text-amber-500">{expiringBatches.totalBatches}</h3>
                           </div>
                           <div className="bg-card/80  rounded-[2rem] p-8 border border-rose-500/20 shadow-2xl">
                              <p className="text-muted text-[10px] font-black uppercase tracking-[0.2em] mb-2">Already Expired</p>
                              <h3 className="text-4xl font-black text-rose-500">{expiringBatches.alreadyExpired}</h3>
                           </div>
                           <div className="bg-card/80  rounded-[2rem] p-8 border border-border/50 shadow-2xl">
                              <p className="text-muted text-[10px] font-black uppercase tracking-[0.2em] mb-2">At-Risk Value</p>
                              <h3 className="text-4xl font-black text-rose-500">{expiringBatches.totalAtRiskValue.toLocaleString()} <span className="text-sm">LE</span></h3>
                           </div>
                        </div>
                     )}
                     <div className="bg-card/80  rounded-[2.5rem] border border-border/50 shadow-2xl overflow-hidden">
                        <div className="responsive-table">
                           <table className="w-full text-left border-collapse">
                              <thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]">
                                 <th className="px-8 py-5">Item</th><th className="px-6 py-5">Batch #</th><th className="px-6 py-5 text-right">Qty</th><th className="px-6 py-5 text-right">Value</th><th className="px-6 py-5">Expiry</th><th className="px-8 py-5 text-right">Status</th>
                              </tr></thead>
                              <tbody className="divide-y divide-border/30">
                                 {(expiringBatches?.items || []).map((batch: any, idx: number) => {
                                    const isExpired = new Date(batch.expiryDate) <= new Date();
                                    return (
                                       <tr key={idx} className="hover:bg-elevated/40 transition-colors">
                                          <td className="px-8 py-4 text-xs font-black text-main uppercase">{batch.itemName}</td>
                                          <td className="px-6 py-4 font-mono text-xs text-indigo-500">{batch.batchNumber}</td>
                                          <td className="px-6 py-4 font-mono text-sm text-right">{batch.currentQty} {batch.unit}</td>
                                          <td className="px-6 py-4 font-mono text-sm text-right">{(batch.currentQty * batch.unitCost).toLocaleString()} LE</td>
                                          <td className="px-6 py-4 text-xs font-bold">{new Date(batch.expiryDate).toLocaleDateString()}</td>
                                          <td className="px-8 py-4 text-right"><span className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest inline-block ${isExpired ? 'bg-rose-500/10 text-rose-500 animate-pulse' : 'bg-amber-500/10 text-amber-500'}`}>{isExpired ? 'EXPIRED' : 'EXPIRING SOON'}</span></td>
                                       </tr>
                                    );
                                 })}
                              </tbody>
                           </table>
                        </div>
                     </div>
                  </div>
               )}
               {activeCategory === 'INVENTORY' && activeSubReport === 'Actual vs Theoretical' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
                        <div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50"><h3 className="text-xl font-black text-main">Actual vs Theoretical Consumption</h3><p className="text-xs text-muted mt-1">Compares recipe-based expected usage with actual stock movements</p></div>
                        <div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-8 py-5 text-left">Item</th><th className="px-4 py-5 text-left">Unit</th><th className="px-4 py-5 text-right">Theoretical</th><th className="px-4 py-5 text-right">Actual</th><th className="px-4 py-5 text-right">Variance</th><th className="px-6 py-5 text-right">Var %</th></tr></thead><tbody className="divide-y divide-border/30">{actualVsTheoreticalData.map((r: any, i: number) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-8 py-4 text-xs font-black text-main">{r.itemName}</td><td className="px-4 py-4 text-muted text-xs">{r.unit}</td><td className="px-4 py-4 font-mono text-right">{r.theoreticalQty}</td><td className="px-4 py-4 font-mono text-right">{r.actualQty}</td><td className={`px-4 py-4 font-mono font-bold text-right ${r.variance > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{r.variance > 0 ? '+' : ''}{r.variance}</td><td className="px-6 py-4 text-right"><span className={`px-2 py-1 rounded-lg text-[9px] font-black ${Math.abs(r.variancePercent) > 10 ? 'bg-rose-500/10 text-rose-500' : Math.abs(r.variancePercent) > 5 ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'}`}>{r.variancePercent > 0 ? '+' : ''}{r.variancePercent}%</span></td></tr>)}</tbody></table></div>
                        {actualVsTheoreticalData.length === 0 && <p className="text-center text-muted py-16">No recipe data to compare.</p>}
                     </div>
                  </div>
               )}
               {activeCategory === 'INVENTORY' && activeSubReport === 'Purchase History' && purchaseHistoryData && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="grid grid-cols-3 gap-4">{[{ l: 'Total POs', v: purchaseHistoryData.summary.totalPOs }, { l: 'Total Spend', v: `${purchaseHistoryData.summary.totalSpend.toLocaleString()} LE` }, { l: 'Avg PO', v: `${purchaseHistoryData.summary.avgPO} LE` }].map((c, i) => (<div key={i} className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-lg"><p className="text-[10px] font-black uppercase tracking-widest text-muted">{c.l}</p><p className="text-2xl font-black text-main mt-1">{c.v}</p></div>))}</div>
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"><div className="p-6 border-b border-slate-100 dark:border-slate-800"><h3 className="text-lg font-black text-main">By Supplier</h3></div><div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-8 py-5 text-left">Supplier</th><th className="px-6 py-5 text-right">PO Count</th><th className="px-8 py-5 text-right">Total Spend</th></tr></thead><tbody className="divide-y divide-border/30">{purchaseHistoryData.bySupplier.map((r: any, i: number) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-8 py-4 text-xs font-black text-main">{r.supplierName}</td><td className="px-6 py-4 font-mono text-right">{r.poCount}</td><td className="px-8 py-4 font-mono font-bold text-right">{r.totalSpend.toLocaleString()} LE</td></tr>)}</tbody></table></div></div>
                  </div>
               )}
               {activeCategory === 'INVENTORY' && activeSubReport === 'Purchase History' && !purchaseHistoryData && <p className="text-center text-muted py-16">No purchase data.</p>}

               {activeCategory === 'INVENTORY' && activeSubReport === 'Inventory Valuation' && inventoryValuationData && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-lg"><p className="text-[10px] font-black uppercase tracking-widest text-muted">Total Inventory Value</p><p className="text-3xl font-black text-main mt-1">{inventoryValuationData.totalValue.toLocaleString()} <span className="text-xs text-muted">LE</span></p></div>
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"><div className="p-6 border-b border-slate-100 dark:border-slate-800"><h3 className="text-lg font-black text-main">Items by Value</h3></div><div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-8 py-5 text-left">Item</th><th className="px-4 py-5 text-left">Unit</th><th className="px-4 py-5 text-right">Qty</th><th className="px-4 py-5 text-right">Avg Cost</th><th className="px-4 py-5 text-right">Batches</th><th className="px-6 py-5 text-right">Total Value</th></tr></thead><tbody className="divide-y divide-border/30">{inventoryValuationData.items.map((r: any, i: number) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-8 py-4 text-xs font-black text-main">{r.itemName}</td><td className="px-4 py-4 text-muted">{r.unit}</td><td className="px-4 py-4 font-mono text-right">{r.totalQty}</td><td className="px-4 py-4 font-mono text-right">{r.avgUnitCost}</td><td className="px-4 py-4 font-mono text-right">{r.batchCount}</td><td className="px-6 py-4 font-mono font-bold text-right">{r.totalValue.toLocaleString()} LE</td></tr>)}</tbody></table></div></div>
                  </div>
               )}
               {activeCategory === 'INVENTORY' && activeSubReport === 'Inventory Valuation' && !inventoryValuationData && <p className="text-center text-muted py-16">No valuation data.</p>}

               {/* ============ ADVANCED HR ============ */}

               {activeCategory === 'HR' && activeSubReport === 'Staff Cost %' && staffCostData && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="grid grid-cols-2 md:grid-cols-5 gap-4">{[{ l: 'Revenue', v: `${staffCostData.revenue.toLocaleString()} LE` }, { l: 'Staff Cost', v: `${staffCostData.staffCost.toLocaleString()} LE` }, { l: 'Staff Cost %', v: `${staffCostData.staffCostPercent}%`, color: staffCostData.staffCostPercent > 30 ? 'text-rose-500' : 'text-emerald-500' }, { l: 'Employees', v: staffCostData.employeeCount }, { l: 'Cost/Employee', v: `${staffCostData.costPerEmployee.toLocaleString()} LE` }].map((c: any, i: number) => (<div key={i} className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-lg"><p className="text-[10px] font-black uppercase tracking-widest text-muted">{c.l}</p><p className={`text-2xl font-black mt-1 ${c.color || 'text-main'}`}>{c.v}</p></div>))}</div>
                  </div>
               )}
               {activeCategory === 'INVENTORY' && activeSubReport === 'Supplier Price Tracking' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"><div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50"><h3 className="text-xl font-black text-main">Supplier Price Tracking</h3></div><div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-6 py-5 text-left">Item</th><th className="px-4 py-5 text-left">Supplier</th><th className="px-4 py-5 text-right">Avg Price</th><th className="px-4 py-5 text-right">Min</th><th className="px-4 py-5 text-right">Max</th><th className="px-4 py-5 text-right">Variance</th><th className="px-6 py-5 text-right">Qty</th></tr></thead><tbody className="divide-y divide-border/30">{supplierPriceData.map((r: any, i: number) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-6 py-4 text-xs font-black text-main">{r.itemName}</td><td className="px-4 py-4 text-xs text-muted">{r.supplierName}</td><td className="px-4 py-4 font-mono text-right">{r.avgPrice}</td><td className="px-4 py-4 font-mono text-right text-emerald-500">{r.minPrice}</td><td className="px-4 py-4 font-mono text-right text-rose-500">{r.maxPrice}</td><td className="px-4 py-4 font-mono font-bold text-right">{r.priceVariance}</td><td className="px-6 py-4 font-mono text-right">{r.totalQty}</td></tr>)}</tbody></table></div></div>
                     {supplierPriceData.length === 0 && <p className="text-center text-muted py-16">No data.</p>}
                  </div>
               )}
               {activeCategory === 'INVENTORY' && activeSubReport === 'Recipe Cost Alerts' && recipeCostData && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="rounded-2xl border border-border/40 bg-elevated/20 px-4 py-3 text-[11px] font-bold text-muted">{isAr ? 'عتبات تنبيه المخزون (حرج <30% / تحذير <50%) — تختلف عن عتبات التسعير الأمثل (30/80) لأن الغرض مراقبة التكلفة لا التسعير.' : 'Stock-alert thresholds (critical <30% / warning <50%) — differ from Optimal Pricing (30/80), which is a pricing lens, not a cost watch.'}</div>
                     <div className="grid grid-cols-3 gap-4">{[{ l: '?? Critical (<30%)', v: recipeCostData.critical, c: 'text-rose-500' }, { l: '?? Warning (<50%)', v: recipeCostData.warning, c: 'text-amber-500' }, { l: '?? OK (?50%)', v: recipeCostData.ok, c: 'text-emerald-500' }].map((c, i) => (<div key={i} className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-lg"><p className="text-xs font-black text-muted">{c.l}</p><p className={`text-3xl font-black mt-1 ${c.c}`}>{c.v}</p></div>))}</div>
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"><div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-6 py-5 text-left">Item</th><th className="px-4 py-5 text-right">Price</th><th className="px-4 py-5 text-right">Cost</th><th className="px-4 py-5 text-right">Margin</th><th className="px-6 py-5 text-center">Alert</th></tr></thead><tbody className="divide-y divide-border/30">{recipeCostData.items.map((r: any, i: number) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-6 py-4 text-xs font-black text-main">{r.menuItemName}</td><td className="px-4 py-4 font-mono text-right">{r.price}</td><td className="px-4 py-4 font-mono text-right text-muted">{r.cost}</td><td className="px-4 py-4 font-mono text-right">{r.margin}%</td><td className="px-6 py-4 text-center"><span className={`px-2 py-1 rounded-lg text-[9px] font-black ${r.alert === 'CRITICAL' ? 'bg-rose-500/10 text-rose-500' : r.alert === 'WARNING' ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'}`}>{r.alert}</span></td></tr>)}</tbody></table></div></div>
                  </div>
               )}
               {activeCategory === 'INVENTORY' && activeSubReport === 'Recipe Cost Alerts' && !recipeCostData && <p className="text-center text-muted py-16">No data.</p>}

               {activeCategory === 'INVENTORY' && activeSubReport === 'ABC Classification' && abcData && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="grid grid-cols-4 gap-4"><div className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-lg"><p className="text-[10px] font-black uppercase text-muted">Total Stock Value</p><p className="text-2xl font-black text-main mt-1">{abcData.totalValue.toLocaleString()} LE</p></div>{[{ l: 'A Items (80%)', v: abcData.a, c: 'text-rose-500' }, { l: 'B Items (15%)', v: abcData.b, c: 'text-amber-500' }, { l: 'C Items (5%)', v: abcData.c, c: 'text-emerald-500' }].map((c, i) => (<div key={i} className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-lg"><p className="text-[10px] font-black uppercase tracking-widest text-muted">{c.l}</p><p className={`text-2xl font-black mt-1 ${c.c}`}>{c.v}</p></div>))}</div>
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"><div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-6 py-5 text-left">Item</th><th className="px-4 py-5 text-right">Qty</th><th className="px-4 py-5 text-right">Value</th><th className="px-4 py-5 text-right">% of Total</th><th className="px-4 py-5 text-right">Cumul %</th><th className="px-6 py-5 text-center">Class</th></tr></thead><tbody className="divide-y divide-border/30">{abcData.items.map((r: any, i: number) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-6 py-4 text-xs font-black text-main">{r.itemName}</td><td className="px-4 py-4 font-mono text-right">{r.totalQty} {r.unit}</td><td className="px-4 py-4 font-mono font-bold text-right">{r.totalValue.toLocaleString()}</td><td className="px-4 py-4 font-mono text-right">{r.valuePercent}%</td><td className="px-4 py-4 font-mono text-right text-muted">{r.cumulativePercent}%</td><td className="px-6 py-4 text-center"><span className={`px-2 py-1 rounded-lg text-[9px] font-black ${r.classification === 'A' ? 'bg-rose-500/10 text-rose-500' : r.classification === 'B' ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'}`}>{r.classification}</span></td></tr>)}</tbody></table></div></div>
                  </div>
               )}
               {activeCategory === 'INVENTORY' && activeSubReport === 'ABC Classification' && !abcData && <p className="text-center text-muted py-16">No data.</p>}
               {activeCategory === 'INVENTORY' && activeSubReport === 'Dead Stock' && deadStock && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="grid grid-cols-2 gap-4"><div className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-lg"><p className="text-[10px] font-black uppercase tracking-widest text-muted">{isAr ? 'أصناف راكدة' : 'Dead items'}</p><p className="text-2xl font-black text-amber-500 mt-1">{deadStock.items.length}</p></div><div className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-lg"><p className="text-[10px] font-black uppercase tracking-widest text-muted">{isAr ? 'قيمة محبوسة' : 'Locked value'}</p><p className="text-2xl font-black text-amber-500 mt-1">{deadStock.items.reduce((s: number, r: any) => s + Number(r.lockedValue || 0), 0).toLocaleString()} LE</p></div></div>
                     <ReportDataTable
                        title={isAr ? `مخزون راكد (لا استهلاك منذ ${deadStock.days} يوم)` : `Dead stock (no consumption in ${deadStock.days}d)`}
                        data={deadStock.items}
                        columns={[
                           { key: 'itemName', label: isAr ? 'الصنف' : 'Item' },
                           { key: 'onHand', label: isAr ? 'الرصيد' : 'On hand', align: 'right', format: (v: any) => fmtNum(v) },
                           { key: 'lockedValue', label: isAr ? 'القيمة المحبوسة' : 'Locked value', align: 'right', sum: true, format: (v: any) => fmtMoney(v, 'LE') },
                           { key: 'lastConsumption', label: isAr ? 'آخر استهلاك' : 'Last used', format: (v: any) => (v ? new Date(v).toLocaleDateString() : (isAr ? 'أبدًا' : 'Never')) },
                        ]}
                        exportFilename="dead-stock"
                        lang={isAr ? 'ar' : 'en'}
                     />
                  </div>
               )}
               {activeCategory === 'INVENTORY' && activeSubReport === 'Dead Stock' && !deadStock && <p className="text-center text-muted py-16">No data.</p>}
               {activeCategory === 'INVENTORY' && activeSubReport === 'Negative Stock' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <ReportDataTable
                        title={isAr ? 'أرصدة سالبة — بيع زيادة عن المتاح (إنذار جودة بيانات)' : 'Negative stock — oversold beyond on-hand (data-quality alarm)'}
                        data={negativeStock}
                        columns={[
                           { key: 'itemName', label: isAr ? 'الصنف' : 'Item' },
                           { key: 'onHand', label: isAr ? 'الرصيد' : 'On hand', align: 'right', format: (v: any) => fmtNum(v) },
                           { key: 'threshold', label: isAr ? 'حد الطلب' : 'Reorder at', align: 'right', format: (v: any) => fmtNum(v) },
                        ]}
                        exportFilename="negative-stock"
                        lang={isAr ? 'ar' : 'en'}
                     />
                     {negativeStock.length === 0 && <p className="text-center text-muted py-16">{isAr ? 'لا توجد أرصدة سالبة — ممتاز' : 'No negative stock — all clean'}</p>}
                  </div>
               )}

               {/* ============ STRATEGIC CRM ============ */}

               {activeCategory === 'CRM' && activeSubReport === 'Customer Churn' && churnData && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="grid grid-cols-5 gap-3">{[{ l: 'Total', v: churnData.summary.total }, { l: 'Active (30d)', v: churnData.summary.active, c: 'text-emerald-500' }, { l: 'At Risk (30-60d)', v: churnData.summary.atRisk30, c: 'text-amber-500' }, { l: 'At Risk (60-90d)', v: churnData.summary.atRisk60, c: 'text-orange-500' }, { l: 'Churned (90+ d)', v: churnData.summary.churned90, c: 'text-rose-500' }].map((c: any, i: number) => (<div key={i} className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-lg"><p className="text-[10px] font-black uppercase tracking-widest text-muted">{c.l}</p><p className={`text-2xl font-black mt-1 ${c.c || 'text-main'}`}>{c.v}</p></div>))}</div>
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"><div className="p-6 border-b border-slate-100 dark:border-slate-800"><h3 className="text-lg font-black text-main">At-Risk Customers</h3></div><div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-6 py-5 text-left">Customer</th><th className="px-4 py-5 text-right">Days Since</th><th className="px-4 py-5 text-right">Orders</th><th className="px-4 py-5 text-right">Total Spent</th><th className="px-6 py-5 text-right">Last Order</th></tr></thead><tbody className="divide-y divide-border/30">{churnData.atRisk.map((r: any, i: number) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-6 py-4 text-xs font-black text-main">{r.customerName}</td><td className="px-4 py-4 font-mono text-right"><span className={`px-2 py-1 rounded-lg text-[9px] font-black ${r.daysSinceLastOrder > 90 ? 'bg-rose-500/10 text-rose-500' : r.daysSinceLastOrder > 60 ? 'bg-orange-500/10 text-orange-500' : 'bg-amber-500/10 text-amber-500'}`}>{r.daysSinceLastOrder}d</span></td><td className="px-4 py-4 font-mono text-right">{r.orderCount}</td><td className="px-4 py-4 font-mono text-right">{r.totalSpent.toLocaleString()} LE</td><td className="px-6 py-4 font-mono text-[10px] text-muted text-right">{r.lastOrder ? new Date(r.lastOrder).toLocaleDateString() : '—'}</td></tr>)}</tbody></table></div></div>
                  </div>
               )}
               {activeCategory === 'INVENTORY' && activeSubReport === 'Optimal Pricing' && optimalPricingData && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="grid grid-cols-4 gap-4"><div className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-lg"><p className="text-[10px] font-black uppercase text-muted">Target Margin</p><p className="text-2xl font-black text-blue-500 mt-1">{optimalPricingData.targetMargin}%</p></div>{[{ l: '? Needs Increase', v: optimalPricingData.needsIncrease, c: 'text-rose-500' }, { l: '? OK', v: optimalPricingData.ok, c: 'text-emerald-500' }, { l: '? Can Decrease', v: optimalPricingData.canDecrease, c: 'text-amber-500' }].map((c, i) => (<div key={i} className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-lg"><p className="text-[10px] font-black uppercase text-muted">{c.l}</p><p className={`text-2xl font-black mt-1 ${c.c}`}>{c.v}</p></div>))}</div>
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"><div className="responsive-table"><table className="w-full text-xs"><thead><tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.2em]"><th className="px-6 py-5 text-left">Item</th><th className="px-4 py-5 text-right">Price</th><th className="px-4 py-5 text-right">Cost</th><th className="px-4 py-5 text-right">Margin</th><th className="px-4 py-5 text-right">Suggested</th><th className="px-4 py-5 text-right">Change</th><th className="px-6 py-5 text-center">Action</th></tr></thead><tbody className="divide-y divide-border/30">{optimalPricingData.items.map((r: any, i: number) => <tr key={i} className="hover:bg-elevated/40 transition-colors"><td className="px-6 py-4 text-xs font-black text-main">{r.name}</td><td className="px-4 py-4 font-mono text-right">{r.currentPrice}</td><td className="px-4 py-4 font-mono text-right text-muted">{r.cost}</td><td className="px-4 py-4 font-mono text-right">{r.currentMargin}%</td><td className="px-4 py-4 font-mono font-bold text-right">{r.suggestedPrice}</td><td className="px-4 py-4 font-mono text-right"><span className={r.priceChange > 0 ? 'text-emerald-500' : 'text-rose-500'}>{r.priceChange > 0 ? '+' : ''}{r.priceChange}</span></td><td className="px-6 py-4 text-center"><span className={`px-2 py-1 rounded-lg text-[9px] font-black ${r.action === 'INCREASE' ? 'bg-rose-500/10 text-rose-500' : r.action === 'DECREASE' ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'}`}>{r.action}</span></td></tr>)}</tbody></table></div></div>
                  </div>
               )}
                {activeCategory === 'INVENTORY' && activeSubReport === 'Optimal Pricing' && !optimalPricingData && <p className="text-center text-muted py-16">No data.</p>}

                {activeCategory === 'INVENTORY' && activeSubReport === 'Production Batches' && (
                   <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                      <ReportDataTable
                         title={isAr ? 'تشغيلات الإنتاج — جدول' : 'Production Batches — table'}
                         subtitle={isAr ? 'الكميات المطلوبة مقابل المنتجة والفرق' : 'Requested vs produced quantities and variance'}
                         data={productionBatchesData || []}
                         columns={[
                            { key: 'batchNumber', label: isAr ? 'التشغيلة' : 'Batch', format: (v: any, r: any) => String(v || r.batch || r.id || '-').slice(0, 18) },
                            { key: 'targetItemName', label: isAr ? 'الصنف' : 'Item', format: (v: any, r: any) => String(v || r.itemName || r.targetItemId || '-') },
                            { key: 'quantityRequested', label: isAr ? 'المطلوب' : 'Requested', align: 'right', sum: true, format: (v: any) => fmtNum(v) },
                            { key: 'quantityProduced', label: isAr ? 'المنتج' : 'Produced', align: 'right', sum: true, format: (v: any) => fmtNum(v) },
                            { key: 'status', label: isAr ? 'الحالة' : 'Status' },
                            { key: 'createdAt', label: isAr ? 'التاريخ' : 'Date', format: (v: any) => (v ? new Date(v).toLocaleDateString(isAr ? 'ar-EG' : 'en-GB') : '-') },
                         ]}
                         exportFilename="production-batches"
                         lang={isAr ? 'ar' : 'en'}
                      />
                      {(productionBatchesData || []).length > 0 && (
                         <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 p-6 shadow-xl">
                            <h3 className="text-lg font-black text-main mb-4">{isAr ? 'حسب الحالة' : 'By status'}</h3>
                            <ResponsiveContainer width="100%" height={200}>
                               <BarChart
                                  data={(() => {
                                     const by: Record<string, number> = {};
                                     (productionBatchesData || []).forEach((o: any) => { const k = String(o.status || 'UNKNOWN'); by[k] = (by[k] || 0) + 1; });
                                     return Object.entries(by).map(([status, count]) => ({ status, count }));
                                  })()}
                                  margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
                               >
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.25)" />
                                  <XAxis dataKey="status" tick={{ fontSize: 10, fontWeight: 700 }} />
                                  <YAxis tick={{ fontSize: 10, fontWeight: 700 }} allowDecimals={false} />
                                  <Tooltip />
                                  <Bar dataKey="count" name={isAr ? 'العدد' : 'Count'} fill="#0ea5e9" radius={[6, 6, 0, 0]} />
                               </BarChart>
                            </ResponsiveContainer>
                         </div>
                      )}
                   </div>
                )}
                {activeCategory === 'INVENTORY' && activeSubReport === 'Suppliers' && (
                   <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                      <ReportDataTable
                         title={isAr ? 'الموردون — جدول' : 'Suppliers — table'}
                         data={suppliersData || []}
                         columns={[
                            { key: 'name', label: isAr ? 'المورد' : 'Supplier' },
                            { key: 'contactPerson', label: isAr ? 'جهة الاتصال' : 'Contact', format: (v: any) => String(v || '-') },
                            { key: 'phone', label: isAr ? 'الهاتف' : 'Phone', format: (v: any) => String(v || '-') },
                            { key: 'email', label: isAr ? 'البريد' : 'Email', format: (v: any) => String(v || '-') },
                            { key: 'category', label: isAr ? 'التصنيف' : 'Category', format: (v: any) => String(v || '-') },
                         ]}
                         exportFilename="suppliers"
                         lang={isAr ? 'ar' : 'en'}
                      />
                   </div>
                )}
                {activeCategory === 'INVENTORY' && activeSubReport === 'Purchase Orders' && (
                   <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                      <ReportDataTable
                         title={isAr ? 'أوامر الشراء — جدول' : 'Purchase Orders — table'}
                         subtitle={isAr ? 'الحالة والقيم والاستلام' : 'Status, values and receiving'}
                         data={purchaseOrdersData || []}
                         columns={[
                            { key: 'id', label: 'PO#', format: (v: any) => String(v || '-').slice(0, 12) },
                            { key: 'supplierName', label: isAr ? 'المورد' : 'Supplier', format: (v: any, r: any) => String(v || r.supplierId || '-') },
                            { key: 'date', label: isAr ? 'التاريخ' : 'Date', format: (v: any, r: any) => { const d = v || r.createdAt; return d ? new Date(d).toLocaleDateString(isAr ? 'ar-EG' : 'en-GB') : '-'; } },
                            { key: 'status', label: isAr ? 'الحالة' : 'Status' },
                            { key: 'totalCost', label: isAr ? 'الإجمالي' : 'Total', align: 'right', sum: true, format: (v: any) => fmtMoney(v, settings?.currencySymbol || 'LE') },
                         ]}
                         exportFilename="purchase-orders"
                         lang={isAr ? 'ar' : 'en'}
                      />
                      {(purchaseOrdersData || []).length > 0 && (
                         <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 p-6 shadow-xl">
                            <h3 className="text-lg font-black text-main mb-4">{isAr ? 'القيمة حسب الحالة' : 'Value by status'}</h3>
                            <ResponsiveContainer width="100%" height={200}>
                               <BarChart
                                  data={(() => {
                                     const by: Record<string, number> = {};
                                     (purchaseOrdersData || []).forEach((o: any) => { const k = String(o.status || 'UNKNOWN'); by[k] = (by[k] || 0) + Number(o.totalCost || 0); });
                                     return Object.entries(by).map(([status, total]) => ({ status, total }));
                                  })()}
                                  margin={{ top: 5, right: 10, left: -10, bottom: 0 }}
                               >
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.25)" />
                                  <XAxis dataKey="status" tick={{ fontSize: 10, fontWeight: 700 }} />
                                  <YAxis tick={{ fontSize: 10, fontWeight: 700 }} tickFormatter={(v: any) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
                                  <Tooltip formatter={(v: any) => [`${Number(v || 0).toLocaleString()} ${settings?.currencySymbol || 'LE'}`, isAr ? 'الإجمالي' : 'Total']} />
                                  <Bar dataKey="total" name="Total" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                               </BarChart>
                            </ResponsiveContainer>
                         </div>
                      )}
                   </div>
                )}

               {/* ============ PHASE 4: CRM ============ */}

               {activeCategory === 'CRM' && activeSubReport === 'Customer Journey Funnel' && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                     <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl p-8"><h3 className="text-xl font-black text-main mb-6">Customer Journey Funnel</h3><div className="space-y-3">{journeyFunnelData.map((s: any, i: number) => { const maxW = 100; const w = s.percent; return <div key={i} className="flex items-center gap-4"><span className="text-xs font-black text-muted w-40 text-right">{s.stage}</span><div className="flex-1 relative"><div className="h-10 rounded-xl bg-blue-500/10 transition-all" style={{ width: `${w}%` }}><div className="h-full rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 flex items-center px-4" style={{ width: `${Math.max(w, 5)}%` }}><span className="text-[10px] font-black text-white whitespace-nowrap">{s.count} ({s.percent}%)</span></div></div></div></div> })}</div></div>
                     {journeyFunnelData.length === 0 && <p className="text-center text-muted py-16">No data.</p>}
                  </div>
               )}
               {activeCategory === 'INVENTORY' && ['Butchery Yield', 'Inter-Branch Transfers', 'GRN Variance', 'Production Cost Variance'].includes(activeSubReport) && (
                  <CoverageReportView
                     reportName={activeSubReport}
                     rows={(state as any).customReportRows?.[activeSubReport] || []}
                     meta={(state as any).customReportMeta?.[activeSubReport]}
                     lang={isAr ? 'ar' : 'en'}
                     currency={settings?.currencySymbol || 'LE'}
                  />
               )}
      </>
   );
};
