/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { memo, useId, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  CheckCircle,
  ChefHat,
  Clock,
  Filter,
  Package,
  ShoppingBag,
  Truck,
  XCircle
} from 'lucide-react';
import { Order, OrderStatus } from '../types';

export type OrderLifecycleFilter =
  | 'all'
  | 'active'
  | 'placed'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export function matchesOrderStatusFilter(
  status: OrderStatus | string | undefined,
  filter: OrderLifecycleFilter
): boolean {
  const normalized = String(status || '').toLowerCase();
  switch (filter) {
    case 'all':
      return true;
    case 'active':
      return ['placed', 'accepted', 'preparing', 'ready', 'picked', 'on_the_way'].includes(normalized);
    case 'placed':
      return normalized === 'placed' || normalized === 'accepted';
    case 'preparing':
      return normalized === 'preparing';
    case 'ready':
      return normalized === 'ready';
    case 'out_for_delivery':
      return normalized === 'picked' || normalized === 'on_the_way';
    case 'delivered':
      return normalized === 'delivered';
    case 'cancelled':
      return normalized === 'cancelled' || normalized === 'rejected';
    default:
      return true;
  }
}

export function getOrderLifecycleBadge(status: OrderStatus | string | undefined): {
  label: string;
  badgeClass: string;
} {
  const normalized = String(status || '').toLowerCase();
  switch (normalized) {
    case 'placed':
      return {
        label: 'Placed',
        badgeClass: 'bg-sky-600 text-white'
      };
    case 'accepted':
      return {
        label: 'Accepted',
        badgeClass: 'bg-blue-600 text-white'
      };
    case 'preparing':
      return {
        label: 'Preparing',
        badgeClass: 'bg-amber-500 text-white'
      };
    case 'ready':
      return {
        label: 'Ready for Pickup',
        badgeClass: 'bg-indigo-600 text-white'
      };
    case 'picked':
    case 'on_the_way':
      return {
        label: 'Out for Delivery',
        badgeClass: 'bg-purple-600 text-white'
      };
    case 'delivered':
      return {
        label: 'Delivered',
        badgeClass: 'bg-emerald-600 text-white'
      };
    case 'rejected':
      return {
        label: 'Rejected',
        badgeClass: 'bg-rose-600 text-white'
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        badgeClass: 'bg-rose-600 text-white'
      };
    default:
      return {
        label: normalized ? normalized.replace(/_/g, ' ') : 'Unknown',
        badgeClass: 'bg-zinc-600 text-white'
      };
  }
}

interface OrderStatusFilterProps {
  orders: Order[];
  value: OrderLifecycleFilter;
  onChange: (next: OrderLifecycleFilter) => void;
  includeActiveTab?: boolean;
  includeReadyTab?: boolean;
  compact?: boolean;
  title?: string;
}

interface FilterOption {
  id: OrderLifecycleFilter;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

function OrderStatusFilter({
  orders,
  value,
  onChange,
  includeActiveTab = false,
  includeReadyTab = true,
  compact = false,
  title
}: OrderStatusFilterProps) {
  const pillId = useId();
  const options = useMemo<FilterOption[]>(() => {
    const base: FilterOption[] = [{ id: 'all', label: 'All Orders', icon: ShoppingBag }];
    if (includeActiveTab) {
      base.push({ id: 'active', label: 'Active', icon: Clock });
    }
    base.push(
      { id: 'placed', label: 'Placed', icon: Clock },
      { id: 'preparing', label: 'Preparing', icon: ChefHat }
    );
    if (includeReadyTab) {
      base.push({ id: 'ready', label: 'Ready', icon: Package });
    }
    base.push(
      { id: 'out_for_delivery', label: 'Out for Delivery', icon: Truck },
      { id: 'delivered', label: 'Delivered', icon: CheckCircle },
      { id: 'cancelled', label: 'Cancelled / Rejected', icon: XCircle }
    );
    return base;
  }, [includeActiveTab, includeReadyTab]);

  const counts = useMemo(() => {
    const map: Record<OrderLifecycleFilter, number> = {
      all: orders.length,
      active: 0,
      placed: 0,
      preparing: 0,
      ready: 0,
      out_for_delivery: 0,
      delivered: 0,
      cancelled: 0
    };
    for (const order of orders) {
      if (matchesOrderStatusFilter(order.status, 'active')) map.active += 1;
      if (matchesOrderStatusFilter(order.status, 'placed')) map.placed += 1;
      else if (matchesOrderStatusFilter(order.status, 'preparing')) map.preparing += 1;
      else if (matchesOrderStatusFilter(order.status, 'ready')) map.ready += 1;
      else if (matchesOrderStatusFilter(order.status, 'out_for_delivery')) map.out_for_delivery += 1;
      else if (matchesOrderStatusFilter(order.status, 'delivered')) map.delivered += 1;
      else if (matchesOrderStatusFilter(order.status, 'cancelled')) map.cancelled += 1;
    }
    return map;
  }, [orders]);

  return (
    <div className="space-y-1.5" role="group" aria-label={title || 'Filter orders by lifecycle status'}>
      {title && (
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            <Filter className="w-3 h-3 text-orange-500" />
            <span>{title}</span>
          </span>
          {value !== 'all' && (
            <button
              type="button"
              onClick={() => onChange('all')}
              className="text-[10px] font-bold text-orange-600 dark:text-orange-400 hover:underline cursor-pointer"
            >
              Reset Stage
            </button>
          )}
        </div>
      )}

      <div className={`flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none ${compact ? 'text-[10px]' : 'text-xs'}`}>
        {options.map(opt => {
          const Icon = opt.icon;
          const isSelected = value === opt.id;
          const count = counts[opt.id] ?? 0;

          return (
            <button
              key={opt.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onChange(opt.id)}
              className={`relative px-2.5 py-1.5 rounded-xl font-bold whitespace-nowrap cursor-pointer transition-colors inline-flex items-center gap-1.5 shrink-0 ${
                isSelected
                  ? 'text-white font-extrabold'
                  : 'bg-slate-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700'
              }`}
            >
              {isSelected && (
                <motion.span
                  layoutId={`order-status-pill-${pillId}`}
                  transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                  className="absolute inset-0 rounded-xl bg-orange-500 shadow-xs"
                  aria-hidden="true"
                />
              )}
              <Icon className="relative z-10 w-3 h-3 shrink-0" />
              <span className="relative z-10">{opt.label}</span>
              <span
                className={`relative z-10 px-1.5 py-0.5 rounded-md font-mono font-black leading-none tabular-nums ${
                  compact ? 'text-[9px]' : 'text-[10px]'
                } ${
                  isSelected
                    ? 'bg-white/20 text-white'
                    : 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default memo(OrderStatusFilter);
