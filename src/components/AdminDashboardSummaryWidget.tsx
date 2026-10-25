/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { 
  TrendingUp, ShoppingBag, IndianRupee, RefreshCw, 
  Calendar, Clock, Database, BarChart3, CheckCircle2,
  Sparkles, Filter, ChevronRight
} from 'lucide-react';
import { supabase } from '../utils/supabase/client';
import { fetchAllOrdersFromSupabase } from '../services/supabaseOrders';
import { Order } from '../types';
import { useApp } from '../context/AppContext';

export interface DailySummary {
  dateKey: string; // YYYY-MM-DD
  displayLabel: string; // "Sun 25"
  revenue: number;
  orderCount: number;
  avgOrderValue: number;
}

export interface HourlySummary {
  hourKey: string; // "00", "01", ... "23"
  displayLabel: string; // "12 AM", "1 PM", ...
  revenue: number;
  orderCount: number;
}

export interface ChartItem {
  key: string;
  label: string;
  revenue: number;
  orderCount: number;
  avgOrderValue: number;
}

type TimeGrouping = 'daily_7' | 'daily_14' | 'hourly_today';
type MetricView = 'revenue' | 'orders' | 'combined';

export default function AdminDashboardSummaryWidget() {
  const { orders: localContextOrders, seedSampleOrders } = useApp();
  
  const [supabaseOrders, setSupabaseOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [timeGrouping, setTimeGrouping] = useState<TimeGrouping>('daily_7');
  const [metricView, setMetricView] = useState<MetricView>('revenue');
  const [activeTooltip, setActiveTooltip] = useState<{
    x: number;
    y: number;
    title: string;
    revenue: number;
    orderCount: number;
    avgOrderValue: number;
  } | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Fetch orders directly from Supabase public.orders table
  const fetchLiveSupabaseMetrics = async (isManualRefresh: boolean = false) => {
    if (isManualRefresh) setLoading(true);
    try {
      const result = await fetchAllOrdersFromSupabase();
      if (result.data && Array.isArray(result.data)) {
        setSupabaseOrders(result.data);
        setLastSyncedAt(new Date());
        setErrorMsg(null);
      } else if (localContextOrders && localContextOrders.length > 0) {
        // Fallback to in-memory orders if table query had transient issue
        setSupabaseOrders(localContextOrders);
        setLastSyncedAt(new Date());
      }
    } catch (err: any) {
      console.warn('Dashboard Supabase fetch notice:', err);
      if (localContextOrders && localContextOrders.length > 0) {
        setSupabaseOrders(localContextOrders);
      }
      setErrorMsg(err?.message || 'Using cached order metrics');
    } finally {
      setLoading(false);
    }
  };

  // Initial load and Realtime Supabase changes listener
  useEffect(() => {
    fetchLiveSupabaseMetrics();

    // Listen to real-time changes on Supabase 'orders' table
    const ordersChannel = supabase
      .channel('admin_dashboard_summary_stream')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          fetchLiveSupabaseMetrics(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
    };
  }, []);

  // Use Supabase orders first, or fallback to context orders
  const activeOrders = useMemo(() => {
    if (supabaseOrders && supabaseOrders.length > 0) {
      return supabaseOrders;
    }
    return localContextOrders || [];
  }, [supabaseOrders, localContextOrders]);

  // Total summary calculations
  const totalRevenue = useMemo(() => {
    return activeOrders.reduce((sum, ord) => {
      const amt = Number(ord.finalAmount || ord.subtotal || 0);
      return sum + amt;
    }, 0);
  }, [activeOrders]);

  const totalOrdersCount = activeOrders.length;

  const avgOrderValue = totalOrdersCount > 0 ? Math.round(totalRevenue / totalOrdersCount) : 0;

  // Process data for Daily breakdown (past 7 or 14 days)
  const dailyData = useMemo(() => {
    const daysCount = timeGrouping === 'daily_14' ? 14 : 7;
    const daysMap = new Map<string, { revenue: number; orderCount: number }>();

    // Generate last N days keys
    const today = new Date();
    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0]; // YYYY-MM-DD
      daysMap.set(key, { revenue: 0, orderCount: 0 });
    }

    // Accumulate orders
    for (const ord of activeOrders) {
      const orderDateStr = (ord.date || new Date().toISOString()).split('T')[0];
      if (daysMap.has(orderDateStr)) {
        const curr = daysMap.get(orderDateStr)!;
        curr.revenue += Number(ord.finalAmount || ord.subtotal || 0);
        curr.orderCount += 1;
      }
    }

    // Convert map to array of DailySummary
    const list: DailySummary[] = [];
    for (const [dateKey, val] of daysMap.entries()) {
      const d = new Date(dateKey + 'T00:00:00');
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      const dayNum = d.getDate();
      list.push({
        dateKey,
        displayLabel: `${dayName} ${dayNum}`,
        revenue: Math.round(val.revenue),
        orderCount: val.orderCount,
        avgOrderValue: val.orderCount > 0 ? Math.round(val.revenue / val.orderCount) : 0
      });
    }

    return list;
  }, [activeOrders, timeGrouping]);

  // Process data for Hourly breakdown (Today)
  const hourlyData = useMemo(() => {
    const hoursMap = new Map<number, { revenue: number; orderCount: number }>();
    for (let h = 0; h < 24; h++) {
      hoursMap.set(h, { revenue: 0, orderCount: 0 });
    }

    const todayStr = new Date().toISOString().split('T')[0];

    for (const ord of activeOrders) {
      const ordDate = new Date(ord.date || Date.now());
      const ordDateStr = ordDate.toISOString().split('T')[0];
      // Filter for today
      if (ordDateStr === todayStr) {
        const hour = ordDate.getHours();
        const curr = hoursMap.get(hour) || { revenue: 0, orderCount: 0 };
        curr.revenue += Number(ord.finalAmount || ord.subtotal || 0);
        curr.orderCount += 1;
        hoursMap.set(hour, curr);
      }
    }

    const list: HourlySummary[] = [];
    // Display every 2 hours or active hours
    for (let h = 0; h < 24; h++) {
      const val = hoursMap.get(h)!;
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 === 0 ? 12 : h % 12;
      list.push({
        hourKey: String(h).padStart(2, '0'),
        displayLabel: `${h12} ${ampm}`,
        revenue: Math.round(val.revenue),
        orderCount: val.orderCount
      });
    }

    return list;
  }, [activeOrders]);

  // Current dataset to render in D3
  const chartDataset: ChartItem[] = useMemo(() => {
    if (timeGrouping === 'hourly_today') {
      return hourlyData.map(d => ({
        key: d.hourKey,
        label: d.displayLabel,
        revenue: d.revenue,
        orderCount: d.orderCount,
        avgOrderValue: d.orderCount > 0 ? Math.round(d.revenue / d.orderCount) : 0
      }));
    }
    return dailyData.map(d => ({
      key: d.dateKey,
      label: d.displayLabel,
      revenue: d.revenue,
      orderCount: d.orderCount,
      avgOrderValue: d.avgOrderValue
    }));
  }, [timeGrouping, dailyData, hourlyData]);

  // Render D3 Bar Chart
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const svg = d3.select<SVGSVGElement, unknown>(svgRef.current);
    svg.selectAll('*').remove(); // Clear previous render

    const containerWidth = containerRef.current.clientWidth || 580;
    const width = Math.max(320, containerWidth);
    const height = 260;
    const margin = { top: 25, right: 20, bottom: 45, left: 55 };

    svg.attr('width', width).attr('height', height);

    // Defs for Gradients and Glows
    const defs = svg.append('defs');

    // Revenue Gradient (Vibrant Amber / Orange)
    const revenueGradient = defs.append('linearGradient')
      .attr('id', 'revenue-bar-gradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');
    revenueGradient.append('stop').attr('offset', '0%').attr('stop-color', '#f97316'); // orange-500
    revenueGradient.append('stop').attr('offset', '100%').attr('stop-color', '#ea580c'); // orange-600

    // Hover Gradient
    const hoverGradient = defs.append('linearGradient')
      .attr('id', 'revenue-bar-hover')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');
    hoverGradient.append('stop').attr('offset', '0%').attr('stop-color', '#fb923c'); // orange-400
    hoverGradient.append('stop').attr('offset', '100%').attr('stop-color', '#f97316');

    // Orders Count Gradient (Cyan / Indigo)
    const orderGradient = defs.append('linearGradient')
      .attr('id', 'orders-bar-gradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');
    orderGradient.append('stop').attr('offset', '0%').attr('stop-color', '#3b82f6'); // blue-500
    orderGradient.append('stop').attr('offset', '100%').attr('stop-color', '#1d4ed8'); // blue-700

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Scales
    const xScale = d3.scaleBand()
      .domain(chartDataset.map(d => d.label))
      .range([0, innerWidth])
      .padding(0.3);

    // Y Scale depending on metric view
    let maxVal: number = 10;
    if (metricView === 'revenue') {
      const computedMax = d3.max(chartDataset, (d: ChartItem) => d.revenue);
      maxVal = computedMax !== undefined && computedMax > 0 ? computedMax : 100;
    } else if (metricView === 'orders') {
      const computedMax = d3.max(chartDataset, (d: ChartItem) => d.orderCount);
      maxVal = computedMax !== undefined && computedMax > 0 ? computedMax : 10;
    } else {
      const computedMax = d3.max(chartDataset, (d: ChartItem) => d.revenue);
      maxVal = computedMax !== undefined && computedMax > 0 ? computedMax : 100;
    }

    const yScale = d3.scaleLinear()
      .domain([0, maxVal * 1.15])
      .range([innerHeight, 0])
      .nice();

    // Secondary Y Scale for order count in combined view
    const computedOrderMax = d3.max(chartDataset, (d: ChartItem) => d.orderCount);
    const maxOrdersVal: number = computedOrderMax !== undefined && computedOrderMax > 0 ? computedOrderMax : 10;
    const yOrderScale = d3.scaleLinear()
      .domain([0, maxOrdersVal * 1.25])
      .range([innerHeight, 0])
      .nice();

    // Horizontal Grid Lines
    g.append('g')
      .attr('class', 'grid-lines')
      .call(
        d3.axisLeft(yScale)
          .ticks(5)
          .tickSize(-innerWidth)
          .tickFormat(() => '')
      )
      .selectAll('line')
      .attr('stroke', 'currentColor')
      .attr('stroke-opacity', 0.08);

    g.select('.grid-lines .domain').remove();

    // X Axis
    const xAxis = d3.axisBottom(xScale);
    const xAxisGroup = g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis);

    xAxisGroup.select('.domain')
      .attr('stroke', 'currentColor')
      .attr('stroke-opacity', 0.2);

    xAxisGroup.selectAll('text')
      .attr('fill', 'currentColor')
      .attr('font-size', chartDataset.length > 10 ? '9px' : '10.5px')
      .attr('font-weight', '600')
      .attr('opacity', 0.75)
      .attr('transform', chartDataset.length > 10 ? 'rotate(-25)' : 'none')
      .style('text-anchor', chartDataset.length > 10 ? 'end' : 'middle');

    xAxisGroup.selectAll('line').attr('stroke-opacity', 0.2);

    // Y Axis
    const yAxis = d3.axisLeft(yScale)
      .ticks(5)
      .tickFormat(d => {
        const val = Number(d);
        if (metricView === 'revenue' || metricView === 'combined') {
          if (val >= 1000) return `₹${(val / 1000).toFixed(1)}k`;
          return `₹${val}`;
        }
        return `${val}`;
      });

    const yAxisGroup = g.append('g').call(yAxis);
    yAxisGroup.select('.domain').remove();
    yAxisGroup.selectAll('text')
      .attr('fill', 'currentColor')
      .attr('font-size', '10px')
      .attr('font-weight', '600')
      .attr('opacity', 0.7);

    // Render Bars
    const barWidth = xScale.bandwidth();

    if (metricView === 'combined') {
      // Dual Bars: Revenue Bar (Left) + Orders Bar (Right)
      const subBarWidth = Math.max(4, barWidth / 2 - 2);

      // Revenue Sub-bar
      g.selectAll<SVGRectElement, ChartItem>('.bar-revenue')
        .data(chartDataset)
        .enter()
        .append('rect')
        .attr('class', 'bar-revenue cursor-pointer')
        .attr('x', (d: ChartItem) => (xScale(d.label) || 0))
        .attr('width', subBarWidth)
        .attr('y', innerHeight)
        .attr('height', 0)
        .attr('rx', 4)
        .attr('fill', 'url(#revenue-bar-gradient)')
        .on('mouseenter', (event: MouseEvent, d: ChartItem) => {
          d3.select(event.currentTarget as SVGRectElement).attr('fill', 'url(#revenue-bar-hover)');
          const [x, y] = d3.pointer(event, containerRef.current);
          setActiveTooltip({
            x,
            y,
            title: d.label,
            revenue: d.revenue,
            orderCount: d.orderCount,
            avgOrderValue: d.avgOrderValue
          });
        })
        .on('mousemove', (event: MouseEvent) => {
          const [x, y] = d3.pointer(event, containerRef.current);
          setActiveTooltip(prev => prev ? { ...prev, x, y } : null);
        })
        .on('mouseleave', (event: MouseEvent) => {
          d3.select(event.currentTarget as SVGRectElement).attr('fill', 'url(#revenue-bar-gradient)');
          setActiveTooltip(null);
        })
        .transition()
        .duration(650)
        .ease(d3.easeCubicOut)
        .attr('y', (d: ChartItem) => yScale(d.revenue))
        .attr('height', (d: ChartItem) => Math.max(0, innerHeight - yScale(d.revenue)));

      // Order Count Sub-bar
      g.selectAll<SVGRectElement, ChartItem>('.bar-orders')
        .data(chartDataset)
        .enter()
        .append('rect')
        .attr('class', 'bar-orders cursor-pointer')
        .attr('x', (d: ChartItem) => (xScale(d.label) || 0) + subBarWidth + 4)
        .attr('width', subBarWidth)
        .attr('y', innerHeight)
        .attr('height', 0)
        .attr('rx', 4)
        .attr('fill', 'url(#orders-bar-gradient)')
        .on('mouseenter', (event: MouseEvent, d: ChartItem) => {
          const [x, y] = d3.pointer(event, containerRef.current);
          setActiveTooltip({
            x,
            y,
            title: d.label,
            revenue: d.revenue,
            orderCount: d.orderCount,
            avgOrderValue: d.avgOrderValue
          });
        })
        .on('mousemove', (event: MouseEvent) => {
          const [x, y] = d3.pointer(event, containerRef.current);
          setActiveTooltip(prev => prev ? { ...prev, x, y } : null);
        })
        .on('mouseleave', () => {
          setActiveTooltip(null);
        })
        .transition()
        .duration(650)
        .ease(d3.easeCubicOut)
        .attr('y', (d: ChartItem) => yOrderScale(d.orderCount))
        .attr('height', (d: ChartItem) => Math.max(0, innerHeight - yOrderScale(d.orderCount)));

    } else {
      // Single Primary Bar (Revenue or Orders)
      const isRevenue = metricView === 'revenue';
      const fillGradient = isRevenue ? 'url(#revenue-bar-gradient)' : 'url(#orders-bar-gradient)';
      const hoverFill = isRevenue ? 'url(#revenue-bar-hover)' : '#60a5fa';

      g.selectAll<SVGRectElement, ChartItem>('.bar-primary')
        .data(chartDataset)
        .enter()
        .append('rect')
        .attr('class', 'bar-primary cursor-pointer transition-colors')
        .attr('x', (d: ChartItem) => xScale(d.label) || 0)
        .attr('width', barWidth)
        .attr('y', innerHeight)
        .attr('height', 0)
        .attr('rx', 5)
        .attr('fill', fillGradient)
        .on('mouseenter', (event: MouseEvent, d: ChartItem) => {
          d3.select(event.currentTarget as SVGRectElement).attr('fill', hoverFill);
          const [x, y] = d3.pointer(event, containerRef.current);
          setActiveTooltip({
            x,
            y,
            title: d.label,
            revenue: d.revenue,
            orderCount: d.orderCount,
            avgOrderValue: d.avgOrderValue
          });
        })
        .on('mousemove', (event: MouseEvent) => {
          const [x, y] = d3.pointer(event, containerRef.current);
          setActiveTooltip(prev => prev ? { ...prev, x, y } : null);
        })
        .on('mouseleave', (event: MouseEvent) => {
          d3.select(event.currentTarget as SVGRectElement).attr('fill', fillGradient);
          setActiveTooltip(null);
        })
        .transition()
        .duration(700)
        .ease(d3.easeCubicOut)
        .attr('y', (d: ChartItem) => yScale(isRevenue ? d.revenue : d.orderCount))
        .attr('height', (d: ChartItem) => Math.max(0, innerHeight - yScale(isRevenue ? d.revenue : d.orderCount)));

      // Value label on top of bar
      g.selectAll<SVGTextElement, ChartItem>('.bar-label')
        .data(chartDataset)
        .enter()
        .append('text')
        .attr('class', 'bar-label pointer-events-none')
        .attr('text-anchor', 'middle')
        .attr('x', (d: ChartItem) => (xScale(d.label) || 0) + barWidth / 2)
        .attr('y', (d: ChartItem) => yScale(isRevenue ? d.revenue : d.orderCount) - 6)
        .attr('fill', 'currentColor')
        .attr('opacity', 0)
        .attr('font-size', '9.5px')
        .attr('font-weight', '700')
        .text((d: ChartItem) => {
          const val = isRevenue ? d.revenue : d.orderCount;
          if (val === 0) return '';
          if (isRevenue) {
            return val >= 1000 ? `₹${(val / 1000).toFixed(1)}k` : `₹${val}`;
          }
          return `${val}`;
        })
        .transition()
        .delay(350)
        .duration(400)
        .attr('opacity', 0.85);
    }
  }, [chartDataset, metricView, timeGrouping]);

  // Handle window resize dynamically
  useEffect(() => {
    const handleResize = () => {
      // Force trigger re-render
      setTimeGrouping(curr => curr);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-zinc-800 rounded-3xl p-5 shadow-sm space-y-5 transition-all text-zinc-900 dark:text-zinc-100">
      
      {/* HEADER WITH SUPABASE STATUS & REFRESH */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-zinc-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="p-1.5 bg-orange-500/10 text-orange-600 dark:text-orange-400 rounded-xl">
              <BarChart3 className="w-5 h-5" />
            </span>
            <h3 className="text-base font-black tracking-tight">
              Supabase Revenue & Orders Dashboard
            </h3>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
              <Database className="w-3 h-3 animate-pulse" />
              Live Supabase
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Real-time aggregate sales analytics and order frequency powered by D3.js visualization.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {lastSyncedAt && (
            <span className="text-[10.5px] font-mono text-zinc-400 hidden md:inline">
              Synced: {lastSyncedAt.toLocaleTimeString()}
            </span>
          )}
          <button
            type="button"
            onClick={() => fetchLiveSupabaseMetrics(true)}
            disabled={loading}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 disabled:opacity-50 text-zinc-700 dark:text-zinc-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95"
            title="Refresh metrics directly from Supabase public.orders"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-orange-500' : ''}`} />
            <span>{loading ? 'Fetching...' : 'Live Refresh'}</span>
          </button>
        </div>
      </div>

      {/* METRIC HIGHLIGHT STAT CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Total Revenue Card */}
        <div className="relative overflow-hidden p-4 rounded-2xl bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent border border-orange-200/60 dark:border-orange-900/30">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] uppercase font-black tracking-wider text-orange-600 dark:text-orange-400">
              Total Live Revenue
            </span>
            <div className="w-8 h-8 rounded-xl bg-orange-500/15 text-orange-600 dark:text-orange-400 flex items-center justify-center">
              <IndianRupee className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-2xl font-black font-mono tracking-tight text-zinc-900 dark:text-zinc-50">
              ₹{totalRevenue.toLocaleString('en-IN')}
            </p>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 flex items-center gap-1">
              <span>From {totalOrdersCount} verified orders in Supabase</span>
            </p>
          </div>
        </div>

        {/* Total Orders Card */}
        <div className="relative overflow-hidden p-4 rounded-2xl bg-gradient-to-br from-blue-500/10 via-indigo-500/5 to-transparent border border-blue-200/60 dark:border-blue-900/30">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] uppercase font-black tracking-wider text-blue-600 dark:text-blue-400">
              Total Order Count
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-2xl font-black font-mono tracking-tight text-zinc-900 dark:text-zinc-50">
              {totalOrdersCount}
            </p>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              Across all Chirala territory hubs
            </p>
          </div>
        </div>

        {/* Average Order Value (AOV) Card */}
        <div className="relative overflow-hidden p-4 rounded-2xl bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-200/60 dark:border-emerald-900/30">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] uppercase font-black tracking-wider text-emerald-600 dark:text-emerald-400">
              Average Order Value (AOV)
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-2xl font-black font-mono tracking-tight text-zinc-900 dark:text-zinc-50">
              ₹{avgOrderValue.toLocaleString('en-IN')}
            </p>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              Average customer transaction ticket
            </p>
          </div>
        </div>
      </div>

      {/* CONTROLS: TIME GROUPING & METRIC SELECTOR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        {/* Metric Selector Buttons */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-800/80 p-1 rounded-2xl border border-slate-200/80 dark:border-zinc-700/60 text-xs">
          <button
            type="button"
            onClick={() => setMetricView('revenue')}
            className={`px-3 py-1.5 rounded-xl font-bold cursor-pointer transition text-[11px] ${
              metricView === 'revenue'
                ? 'bg-orange-500 text-white shadow-xs'
                : 'text-zinc-600 dark:text-zinc-300 hover:text-zinc-900'
            }`}
          >
            💰 Revenue (₹)
          </button>
          <button
            type="button"
            onClick={() => setMetricView('orders')}
            className={`px-3 py-1.5 rounded-xl font-bold cursor-pointer transition text-[11px] ${
              metricView === 'orders'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-zinc-600 dark:text-zinc-300 hover:text-zinc-900'
            }`}
          >
            📦 Order Count
          </button>
          <button
            type="button"
            onClick={() => setMetricView('combined')}
            className={`px-3 py-1.5 rounded-xl font-bold cursor-pointer transition text-[11px] ${
              metricView === 'combined'
                ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-xs'
                : 'text-zinc-600 dark:text-zinc-300 hover:text-zinc-900'
            }`}
          >
            📊 Both (Dual Bar)
          </button>
        </div>

        {/* Time Window Buttons */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-800/80 p-1 rounded-2xl border border-slate-200/80 dark:border-zinc-700/60 text-xs">
          <button
            type="button"
            onClick={() => setTimeGrouping('daily_7')}
            className={`px-2.5 py-1.5 rounded-xl font-bold cursor-pointer transition text-[11px] ${
              timeGrouping === 'daily_7'
                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                : 'text-zinc-500 dark:text-zinc-400'
            }`}
          >
            Last 7 Days
          </button>
          <button
            type="button"
            onClick={() => setTimeGrouping('daily_14')}
            className={`px-2.5 py-1.5 rounded-xl font-bold cursor-pointer transition text-[11px] ${
              timeGrouping === 'daily_14'
                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                : 'text-zinc-500 dark:text-zinc-400'
            }`}
          >
            14 Days
          </button>
          <button
            type="button"
            onClick={() => setTimeGrouping('hourly_today')}
            className={`px-2.5 py-1.5 rounded-xl font-bold cursor-pointer transition text-[11px] ${
              timeGrouping === 'hourly_today'
                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                : 'text-zinc-500 dark:text-zinc-400'
            }`}
          >
            Today (24h)
          </button>
        </div>
      </div>

      {/* D3 BAR CHART CONTAINER */}
      <div 
        ref={containerRef} 
        className="relative w-full overflow-hidden bg-slate-50/80 dark:bg-zinc-950/40 rounded-2xl p-2 border border-slate-200/60 dark:border-zinc-800/60"
      >
        {totalOrdersCount === 0 && !loading ? (
          <div className="py-12 text-center space-y-3">
            <ShoppingBag className="w-10 h-10 mx-auto text-zinc-300 dark:text-zinc-600" />
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
              No orders have been recorded in Supabase yet.
            </p>
            <button
              type="button"
              onClick={() => seedSampleOrders && seedSampleOrders()}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer inline-flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Seed Sample Orders for Dashboard</span>
            </button>
          </div>
        ) : (
          <>
            <svg ref={svgRef} className="w-full text-zinc-400 dark:text-zinc-500" />

            {/* Custom Interactive Floating Tooltip */}
            {activeTooltip && (
              <div 
                style={{ 
                  left: `${Math.min(activeTooltip.x + 12, (containerRef.current?.clientWidth || 300) - 150)}px`, 
                  top: `${Math.max(10, activeTooltip.y - 70)}px` 
                }}
                className="absolute z-20 pointer-events-none bg-zinc-900/95 dark:bg-zinc-800/95 text-white p-2.5 rounded-xl shadow-xl border border-zinc-700 text-xs backdrop-blur-md min-w-[130px] animate-fade-in"
              >
                <div className="font-extrabold text-orange-400 border-b border-zinc-700/80 pb-1 mb-1.5">
                  {activeTooltip.title}
                </div>
                <div className="space-y-0.5 text-[11px]">
                  <div className="flex justify-between gap-3">
                    <span className="text-zinc-400">Revenue:</span>
                    <span className="font-mono font-black text-emerald-400">₹{activeTooltip.revenue.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-zinc-400">Orders:</span>
                    <span className="font-mono font-bold text-blue-400">{activeTooltip.orderCount}</span>
                  </div>
                  {activeTooltip.orderCount > 0 && (
                    <div className="flex justify-between gap-3 text-[10px] text-zinc-400 pt-0.5">
                      <span>Avg Ticket:</span>
                      <span className="font-mono text-zinc-200">₹{activeTooltip.avgOrderValue}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* FOOTER LEGEND & CAPTION */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 pt-1 border-t border-slate-100 dark:border-zinc-800/60">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-gradient-to-t from-orange-600 to-orange-400 inline-block shadow-2xs" />
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Revenue (₹)</span>
          </div>
          {metricView === 'combined' && (
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-gradient-to-t from-blue-700 to-blue-500 inline-block shadow-2xs" />
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Order Count</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 text-[10.5px]">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          <span>Real-time CDC listener active on <code className="font-mono text-zinc-600 dark:text-zinc-300">public.orders</code></span>
        </div>
      </div>

    </div>
  );
}
