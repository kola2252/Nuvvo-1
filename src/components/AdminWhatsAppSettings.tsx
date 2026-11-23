/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Admin WhatsApp Notification Settings & History Console
 *
 * Displays:
 * - Meta WhatsApp Cloud API Configuration Status & Missing Environment Variables
 * - Fixed Admin WhatsApp Recipient (+91 9063692135)
 * - Latest Admin & Customer Notification Status & Lifecycle Breakdown
 * - Approval Status for all 7 Meta Message Templates (live Graph API lookup)
 * - Last Notification Error Diagnostics
 * - Full Notification History Table (filterable, searchable, idempotent retry on failed rows)
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  MessageSquare,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Copy,
  Check,
  Search,
  RotateCcw,
  CheckCheck,
  ShieldAlert,
  Shield,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Terminal,
  X
} from 'lucide-react';

interface TemplateStatusItem {
  key: string;
  label: string;
  recipientRole: 'admin' | 'customer';
  templateName: string;
  category: string;
  language: string;
  description: string;
  parameterLabels: string[];
  approvalStatus: 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED' | 'NOT_SUBMITTED' | 'UNVERIFIED';
  metaTemplateId?: string;
  rejectionReason?: string;
}

interface NotificationHistoryItem {
  id: string;
  order_id: string;
  recipient: string;
  recipient_role: 'admin' | 'customer';
  notification_type: string;
  template_name: string;
  status: string;
  idempotency_key: string;
  attempt_count: number;
  consent_verified: boolean;
  message_id: string | null;
  error_message: string | null;
  submitted_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface WhatsAppStatusResponse {
  success: boolean;
  isConfigured: boolean;
  hasAccessToken: boolean;
  hasPhoneNumberId: boolean;
  hasBusinessAccountId: boolean;
  hasVerifyToken: boolean;
  graphApiVersion: string;
  adminWhatsappNumber: string;
  businessRecipientMasked: string;
  phoneNumberIdMasked: string;
  businessAccountIdMasked: string;
  missingVars: string[];
  requiredSetupSteps: string[];
  webhookUrl: string;
  templates: {
    source: string;
    items: TemplateStatusItem[];
    error?: string;
  };
  summaryCounts: {
    total: number;
    pending: number;
    submitted: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    recentFailed24h?: number;
    recentFailedAdmin24h?: number;
    recentFailedCustomer24h?: number;
    skippedNoConsent: number;
  };
  latestAdminNotification: NotificationHistoryItem | null;
  latestCustomerNotification: NotificationHistoryItem | null;
  lastError: {
    id: string;
    orderId: string;
    recipientRole: string;
    recipient: string;
    message: string;
    timestamp: string;
  } | null;
  error?: string;
}

interface RawWebhookEventItem {
  id: string;
  received_at: string;
  event_type: 'status' | 'message' | 'opt_out' | 'mixed' | 'invalid_signature' | 'unknown';
  signature_valid: boolean | null;
  wamid: string | null;
  status_summary: string | null;
  phone_number_id: string | null;
  recipient_or_sender: string | null;
  matched_notification_id: string | null;
  matched_order_id: string | null;
  processed_statuses: number;
  processed_opt_outs: number;
  error_summary: string | null;
  raw_headers: Record<string, any>;
  raw_payload: any;
}

function getStatusBadgeStyle(status?: string) {
  switch (String(status || '').toLowerCase()) {
    case 'approved':
    case 'delivered':
    case 'sent':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60';
    case 'read':
      return 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/60';
    case 'submitted':
      return 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/60';
    case 'pending':
    case 'opt_out':
    case 'mixed':
      return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60';
    case 'failed':
    case 'rejected':
    case 'paused':
    case 'invalid_signature':
      return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60';
    case 'skipped_no_consent':
    case 'not_submitted':
    case 'unverified':
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700';
  }
}

function renderSignatureStatusBadge(signatureValid: boolean | null, detailed: boolean = false) {
  if (signatureValid === true) {
    return (
      <span
        title="Meta X-Hub-Signature-256 HMAC-SHA256 verification succeeded"
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wide whitespace-nowrap bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60"
      >
        <ShieldCheck className="w-3 h-3 shrink-0" />
        <span>{detailed ? 'Signature Verified' : 'Sig Verified'}</span>
      </span>
    );
  }

  if (signatureValid === false) {
    return (
      <span
        title="Meta X-Hub-Signature-256 HMAC-SHA256 verification failed (rejected with HTTP 401)"
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wide whitespace-nowrap bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60"
      >
        <ShieldAlert className="w-3 h-3 shrink-0" />
        <span>{detailed ? 'Signature Failed' : 'Sig Failed'}</span>
      </span>
    );
  }

  return (
    <span
      title="WHATSAPP_APP_SECRET not configured — webhook received without HMAC signature verification"
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wide whitespace-nowrap bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60"
    >
      <Shield className="w-3 h-3 shrink-0" />
      <span>{detailed ? 'Unsigned (No Secret)' : 'Unsigned'}</span>
    </span>
  );
}

function isFailedWebhookEvent(ev: RawWebhookEventItem): boolean {
  if (ev.event_type === 'invalid_signature' || ev.signature_valid === false) return true;
  if (String(ev.status_summary || '').toLowerCase().includes('failed')) return true;
  if (Boolean(ev.error_summary && ev.error_summary.trim().length > 0)) return true;

  const entries = Array.isArray(ev.raw_payload?.entry) ? ev.raw_payload.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const statuses = Array.isArray(change?.value?.statuses) ? change.value.statuses : [];
      for (const st of statuses) {
        if (String(st?.status || '').toLowerCase() === 'failed') return true;
        if (Array.isArray(st?.errors) && st.errors.length > 0) return true;
      }
    }
  }
  return false;
}

interface AdminWhatsAppSettingsProps {
  focusFailedTrigger?: number;
  onNotificationRetried?: () => void;
}

export default function AdminWhatsAppSettings({
  focusFailedTrigger = 0,
  onNotificationRetried
}: AdminWhatsAppSettingsProps = {}) {
  const [statusData, setStatusData] = useState<WhatsAppStatusResponse | null>(null);
  const [history, setHistory] = useState<NotificationHistoryItem[]>([]);
  const [webhookEvents, setWebhookEvents] = useState<RawWebhookEventItem[]>([]);
  const [webhookLoading, setWebhookLoading] = useState<boolean>(false);
  const [webhookError, setWebhookError] = useState<string | null>(null);
  const [selectedWebhookEventId, setSelectedWebhookEventId] = useState<string | null>(null);
  const [webhookTypeFilter, setWebhookTypeFilter] = useState<'all' | 'status' | 'message' | 'opt_out' | 'invalid_signature'>('all');
  const [webhookSignatureFilter, setWebhookSignatureFilter] = useState<'all' | 'verified' | 'failed' | 'unsigned'>('all');
  const [webhookSearch, setWebhookSearch] = useState<string>('');
  const [webhookSearchBy, setWebhookSearchBy] = useState<'all' | 'wamid' | 'matched_order_id'>('all');
  const [copiedWebhookPayloadId, setCopiedWebhookPayloadId] = useState<string | null>(null);
  const [isWebhookHeadersExpanded, setIsWebhookHeadersExpanded] = useState<boolean>(false);
  const [isWebhookJsonExpanded, setIsWebhookJsonExpanded] = useState<boolean>(true);
  const [isWebhookJsonFullHeight, setIsWebhookJsonFullHeight] = useState<boolean>(false);
  const [activeLogView, setActiveLogView] = useState<'history' | 'webhooks'>('history');
  const hasSearchedWebhooksRef = React.useRef<boolean>(false);

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [copiedWebhook, setCopiedWebhook] = useState<boolean>(false);

  // History filters
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'customer'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'failed' | 'delivered' | 'skipped_no_consent'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryNotice, setRetryNotice] = useState<{ id: string; text: string; ok: boolean } | null>(null);
  const [retryingWebhookId, setRetryingWebhookId] = useState<string | null>(null);
  const [webhookRetryNotice, setWebhookRetryNotice] = useState<{ id: string; text: string; ok: boolean } | null>(null);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('nuvvo_auth_token') || '';
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  };

  const fetchWebhookEvents = useCallback(async (opts?: {
    query?: string;
    searchBy?: 'all' | 'wamid' | 'matched_order_id';
  }) => {
    setWebhookLoading(true);
    setWebhookError(null);
    try {
      const params = new URLSearchParams({ limit: '50' });
      const activeQ = (opts?.query ?? '').trim();
      const activeScope = opts?.searchBy ?? 'all';
      if (activeQ) {
        params.set('q', activeQ);
        params.set('searchBy', activeScope);
      }

      const res = await fetch(`/api/admin/whatsapp/webhook-events?${params.toString()}`, {
        headers: getAuthHeaders()
      });
      const json = await res.json().catch(() => null);
      if (res.status === 401 || res.status === 403) {
        setWebhookError(json?.error || 'Admin authentication required to inspect webhook payloads.');
        return;
      }
      if (!res.ok || !json?.success) {
        setWebhookError(json?.error || 'Failed to load Meta webhook events.');
        return;
      }
      const events: RawWebhookEventItem[] = Array.isArray(json.events) ? json.events : [];
      setWebhookEvents(events);
      setSelectedWebhookEventId(prev => (prev && events.some(e => e.id === prev) ? prev : (events[0]?.id || null)));
    } catch (err: any) {
      setWebhookError(err?.message || 'Network error fetching webhook events.');
    } finally {
      setWebhookLoading(false);
    }
  }, []);

  const fetchAll = useCallback(async (forceTemplateRefresh: boolean = false) => {
    setRefreshing(true);
    setAuthError(null);
    try {
      const headers = getAuthHeaders();
      const [statusRes, historyRes] = await Promise.all([
        fetch(`/api/admin/whatsapp/status${forceTemplateRefresh ? '?refresh=true' : ''}`, { headers }),
        fetch('/api/admin/order-notifications', { headers }),
        fetchWebhookEvents()
      ]);

      const statusJson = await statusRes.json().catch(() => null);
      if (statusRes.status === 401 || statusRes.status === 403) {
        setAuthError(statusJson?.error || 'Admin or Super Admin session required to view WhatsApp Cloud API logs.');
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (statusJson?.success) {
        setStatusData(statusJson);
      } else if (statusJson?.error) {
        setAuthError(statusJson.error);
      }

      const historyJson = await historyRes.json().catch(() => null);
      if (historyJson?.success && Array.isArray(historyJson.notifications)) {
        setHistory(historyJson.notifications);
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Unable to connect to WhatsApp diagnostics API.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchWebhookEvents]);

  useEffect(() => {
    fetchAll(false);
  }, [fetchAll]);

  useEffect(() => {
    if (activeLogView !== 'webhooks') return;
    const trimmed = webhookSearch.trim();
    if (!trimmed && !hasSearchedWebhooksRef.current) return;
    hasSearchedWebhooksRef.current = Boolean(trimmed);
    const timer = setTimeout(() => {
      fetchWebhookEvents({ query: trimmed, searchBy: webhookSearchBy });
    }, 300);
    return () => clearTimeout(timer);
  }, [activeLogView, webhookSearch, webhookSearchBy, fetchWebhookEvents]);

  useEffect(() => {
    if (focusFailedTrigger > 0) {
      setActiveLogView('history');
      setStatusFilter('failed');
      setRoleFilter('all');
      setTimeout(() => {
        document.getElementById('whatsapp-notification-console-panel')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }, 60);
    }
  }, [focusFailedTrigger]);

  const handleCopyWebhook = async () => {
    if (!statusData?.webhookUrl) return;
    try {
      await navigator.clipboard.writeText(statusData.webhookUrl);
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 2000);
    } catch {}
  };

  const handleCopyWebhookPayload = async (event: RawWebhookEventItem) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(event.raw_payload, null, 2));
      setCopiedWebhookPayloadId(event.id);
      setTimeout(() => setCopiedWebhookPayloadId(null), 2000);
    } catch {}
  };

  const handleRetryFailed = async (item: NotificationHistoryItem) => {
    setRetryingId(item.id);
    setRetryNotice(null);
    try {
      const res = await fetch(`/api/admin/whatsapp/retry/${encodeURIComponent(item.id)}`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      const data = await res.json().catch(() => null);
      const outcome = data?.result;
      setRetryNotice({
        id: item.id,
        ok: Boolean(outcome?.success),
        text: outcome?.success
          ? `Retried ${item.order_id}: Meta accepted message (${outcome.messageId || 'submitted'})`
          : `Retry recorded as failed: ${outcome?.error || data?.error || 'Meta credentials or template not configured.'}`
      });
      await fetchAll(false);
      onNotificationRetried?.();
    } catch (err: any) {
      setRetryNotice({
        id: item.id,
        ok: false,
        text: err?.message || 'Network error retrying notification.'
      });
    } finally {
      setRetryingId(null);
    }
  };

  const handleRetryWebhookEvent = async (ev: RawWebhookEventItem) => {
    setSelectedWebhookEventId(ev.id);
    setRetryingWebhookId(ev.id);
    setWebhookRetryNotice(null);
    try {
      const res = await fetch(`/api/admin/whatsapp/webhook-events/${encodeURIComponent(ev.id)}/retry`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      const data = await res.json().catch(() => null);

      const ok = Boolean(res.ok && data?.success);
      const orderRef = data?.orderId || ev.matched_order_id || ev.id;
      const msgText = ok
        ? data?.status === 'duplicate_skipped'
          ? `Notification for ${orderRef} was already delivered/submitted (${data?.messageId || 'duplicate resend skipped'}).`
          : `Resent WhatsApp notification for ${orderRef}${data?.messageId ? ` (Meta WAMID: ${data.messageId})` : '.'}`
        : `Webhook retry failed: ${data?.error || 'Could not resend notification for this webhook event.'}`;

      setWebhookRetryNotice({
        id: ev.id,
        ok,
        text: msgText
      });

      await fetchAll(false);
      onNotificationRetried?.();
    } catch (err: any) {
      setWebhookRetryNotice({
        id: ev.id,
        ok: false,
        text: err?.message || 'Network error retrying webhook event.'
      });
    } finally {
      setRetryingWebhookId(null);
    }
  };

  const filteredHistory = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return history.filter(item => {
      if (roleFilter !== 'all' && item.recipient_role !== roleFilter) return false;
      if (statusFilter === 'failed' && item.status !== 'failed') return false;
      if (statusFilter === 'delivered' && !['sent', 'delivered', 'read', 'submitted'].includes(item.status)) return false;
      if (statusFilter === 'skipped_no_consent' && item.status !== 'skipped_no_consent') return false;
      if (q) {
        const matchOrder = item.order_id.toLowerCase().includes(q);
        const matchRecip = item.recipient.toLowerCase().includes(q);
        const matchTpl = item.template_name.toLowerCase().includes(q);
        const matchWamid = (item.message_id || '').toLowerCase().includes(q);
        if (!matchOrder && !matchRecip && !matchTpl && !matchWamid) return false;
      }
      return true;
    });
  }, [history, roleFilter, statusFilter, searchQuery]);

  const filteredWebhookEvents = useMemo(() => {
    const q = webhookSearch.trim().toLowerCase();
    return webhookEvents.filter(ev => {
      if (webhookTypeFilter !== 'all' && ev.event_type !== webhookTypeFilter) return false;
      if (webhookSignatureFilter === 'verified' && ev.signature_valid !== true) return false;
      if (webhookSignatureFilter === 'failed' && ev.signature_valid !== false) return false;
      if (webhookSignatureFilter === 'unsigned' && ev.signature_valid !== null) return false;
      if (!q) return true;

      const payloadWamids: string[] = [];
      const entries = Array.isArray(ev.raw_payload?.entry) ? ev.raw_payload.entry : [];
      for (const entry of entries) {
        const changes = Array.isArray(entry?.changes) ? entry.changes : [];
        for (const change of changes) {
          const value = change?.value || {};
          if (Array.isArray(value.statuses)) {
            for (const st of value.statuses) {
              if (st?.id) payloadWamids.push(String(st.id));
            }
          }
          if (Array.isArray(value.messages)) {
            for (const msg of value.messages) {
              if (msg?.id) payloadWamids.push(String(msg.id));
            }
          }
        }
      }

      const wamidMatch = [ev.wamid || '', ...payloadWamids]
        .filter(Boolean)
        .some(id => id.toLowerCase().includes(q));
      const orderMatch = (ev.matched_order_id || '').toLowerCase().includes(q);

      if (webhookSearchBy === 'wamid') return wamidMatch;
      if (webhookSearchBy === 'matched_order_id') return orderMatch;

      if (wamidMatch || orderMatch) return true;
      const secondaryHaystack = [
        ev.id,
        ev.recipient_or_sender || '',
        ev.matched_notification_id || '',
        ev.status_summary || '',
        ev.error_summary || '',
        JSON.stringify(ev.raw_payload || {})
      ].join(' ').toLowerCase();
      return secondaryHaystack.includes(q);
    });
  }, [webhookEvents, webhookTypeFilter, webhookSignatureFilter, webhookSearch, webhookSearchBy]);

  const webhookSignatureSummary = useMemo(() => {
    let verified = 0;
    let failed = 0;
    let unsigned = 0;
    for (const ev of webhookEvents) {
      if (ev.signature_valid === true) verified += 1;
      else if (ev.signature_valid === false) failed += 1;
      else unsigned += 1;
    }
    return { verified, failed, unsigned };
  }, [webhookEvents]);

  const selectedWebhookEvent = useMemo(() => {
    return filteredWebhookEvents.find(e => e.id === selectedWebhookEventId)
      || filteredWebhookEvents[0]
      || null;
  }, [filteredWebhookEvents, selectedWebhookEventId]);

  const selectedWebhookFormattedJson = useMemo(() => {
    if (!selectedWebhookEvent) return '';
    return JSON.stringify(selectedWebhookEvent.raw_payload ?? {}, null, 2);
  }, [selectedWebhookEvent]);

  const selectedWebhookJsonStats = useMemo(() => {
    if (!selectedWebhookFormattedJson) return { lines: 0, keys: [] as string[] };
    const lines = selectedWebhookFormattedJson.split('\n').length;
    const raw = selectedWebhookEvent?.raw_payload;
    const keys = raw && typeof raw === 'object' && !Array.isArray(raw) ? Object.keys(raw) : [];
    return { lines, keys };
  }, [selectedWebhookFormattedJson, selectedWebhookEvent]);

  if (loading) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-6 text-xs text-zinc-500 flex items-center gap-2.5">
        <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
        <span>Loading Meta WhatsApp Cloud API configuration & notification history...</span>
      </div>
    );
  }

  return (
    <div id="admin-whatsapp-settings-console" className="space-y-4 text-left">
      {/* Header Card */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-zinc-950 dark:text-zinc-50 tracking-tight">
                WhatsApp Notification Settings (Meta Cloud API)
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Automatic backend order dispatch, webhook delivery tracking, and template compliance
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => fetchAll(true)}
              disabled={refreshing}
              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 hover:bg-slate-100 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-100 text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Syncing Meta...' : 'Refresh & Check Templates'}</span>
            </button>
          </div>
        </div>

        {authError && (
          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{authError}</span>
          </div>
        )}

        {/* Top Summary KPI Strip (4 core metrics required) */}
        {statusData && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* 1. Meta API Config Status */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200/80 dark:border-zinc-800 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Meta API Configuration
              </span>
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <strong className="text-sm font-black text-zinc-900 dark:text-zinc-50">
                  {statusData.isConfigured ? 'Configured' : 'Incomplete'}
                </strong>
                <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase ${
                  statusData.isConfigured
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
                    : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60'
                }`}>
                  {statusData.graphApiVersion}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono truncate tabular-nums">
                {statusData.missingVars.length === 0
                  ? `Phone ID: ${statusData.phoneNumberIdMasked}`
                  : `${statusData.missingVars.length} env var${statusData.missingVars.length === 1 ? '' : 's'} missing`}
              </p>
            </div>

            {/* 2. Fixed Admin WhatsApp Number */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200/80 dark:border-zinc-800 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Admin WhatsApp Number
              </span>
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <strong className="text-sm font-black font-mono text-zinc-900 dark:text-zinc-50 tabular-nums">
                  {statusData.adminWhatsappNumber || '+919063692135'}
                </strong>
                <span className="px-2 py-0.5 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[10px] font-bold text-zinc-600 dark:text-zinc-300">
                  FIXED
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Receives automatic alert on every order
              </p>
            </div>

            {/* 3. Admin Notification Status */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200/80 dark:border-zinc-800 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Admin Notification Status
              </span>
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <strong className="text-sm font-black text-zinc-900 dark:text-zinc-50 capitalize">
                  {statusData.latestAdminNotification
                    ? statusData.latestAdminNotification.status.replace(/_/g, ' ')
                    : 'No Orders Yet'}
                </strong>
                {statusData.latestAdminNotification && (
                  <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase ${getStatusBadgeStyle(statusData.latestAdminNotification.status)}`}>
                    {statusData.latestAdminNotification.status}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums truncate">
                {statusData.latestAdminNotification
                  ? `Order ${statusData.latestAdminNotification.order_id.slice(-8)}`
                  : 'Dispatches automatically on order'}
              </p>
            </div>

            {/* 4. Customer Notification Status */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200/80 dark:border-zinc-800 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Customer Notification Status
              </span>
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <strong className="text-sm font-black text-zinc-900 dark:text-zinc-50 capitalize">
                  {statusData.latestCustomerNotification
                    ? statusData.latestCustomerNotification.status.replace(/_/g, ' ')
                    : 'No Opted Orders'}
                </strong>
                {statusData.latestCustomerNotification && (
                  <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase ${getStatusBadgeStyle(statusData.latestCustomerNotification.status)}`}>
                    {statusData.latestCustomerNotification.status === 'skipped_no_consent' ? 'No Consent' : statusData.latestCustomerNotification.status}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                Sent/Delivered: {statusData.summaryCounts.sent + statusData.summaryCounts.delivered + statusData.summaryCounts.read} • Failed: {statusData.summaryCounts.failed}
              </p>
            </div>
          </div>
        )}

        {/* Environment Variables Inspection & Webhook Callback URL */}
        {statusData && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-1">
            <div className="p-4 rounded-xl border border-slate-200 dark:border-zinc-800 space-y-2.5">
              <h4 className="text-xs font-black uppercase tracking-wider text-zinc-700 dark:text-zinc-200">
                Server Environment Variables
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                {[
                  { name: 'WHATSAPP_ACCESS_TOKEN', ok: statusData.hasAccessToken },
                  { name: 'WHATSAPP_PHONE_NUMBER_ID', ok: statusData.hasPhoneNumberId },
                  { name: 'WHATSAPP_BUSINESS_ACCOUNT_ID', ok: statusData.hasBusinessAccountId },
                  { name: 'WHATSAPP_VERIFY_TOKEN', ok: statusData.hasVerifyToken }
                ].map(v => (
                  <div
                    key={v.name}
                    className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-zinc-800/60 border border-slate-200/70 dark:border-zinc-800"
                  >
                    <span className="truncate text-zinc-700 dark:text-zinc-300">{v.name}</span>
                    <span className={`font-bold whitespace-nowrap ${v.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {v.ok ? 'Set' : 'Missing'}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Graph API Version: <code className="font-mono font-bold text-zinc-700 dark:text-zinc-200">{statusData.graphApiVersion}</code> • WABA ID: <code className="font-mono text-zinc-700 dark:text-zinc-200">{statusData.businessAccountIdMasked}</code>
              </p>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-zinc-800 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-zinc-700 dark:text-zinc-200">
                  Meta Cloud API Webhook Endpoint
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    setActiveLogView('webhooks');
                    fetchWebhookEvents();
                  }}
                  className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer whitespace-nowrap"
                >
                  Inspect Last 50 Webhook Events ({webhookEvents.length})
                </button>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 rounded-lg bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-[11px] font-mono text-zinc-800 dark:text-zinc-200 truncate">
                  {statusData.webhookUrl}
                </code>
                <button
                  type="button"
                  onClick={handleCopyWebhook}
                  className="px-3 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-700 hover:bg-zinc-800 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                >
                  {copiedWebhook ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedWebhook ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Subscribe this callback URL in Meta Developer App &rarr; WhatsApp &rarr; Configuration using your <code className="font-mono">WHATSAPP_VERIFY_TOKEN</code> and enable webhook fields for <code className="font-mono">messages</code> so Sent, Delivered, Read, and Failed statuses sync automatically.
              </p>
            </div>
          </div>
        )}

        {/* Honest Meta Setup Steps Banner when incomplete */}
        {statusData && !statusData.isConfigured && (
          <div className="p-4 rounded-xl bg-amber-50/80 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-900/50 space-y-2">
            <div className="flex items-center gap-2 text-xs font-black text-amber-900 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>Meta Cloud API Configuration Required Before Live WhatsApp Delivery</span>
            </div>
            <p className="text-[11px] text-amber-900/80 dark:text-amber-200/80 leading-relaxed">
              Orders still save safely in Supabase and never fail due to missing WhatsApp credentials. Dispatch attempts log honest <code className="font-mono font-bold">failed</code> diagnostic records until you complete these steps:
            </p>
            <ol className="list-decimal pl-5 space-y-1 text-[11px] text-amber-900 dark:text-amber-200">
              {statusData.requiredSetupSteps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>
        )}

        {/* Last Notification Error Panel */}
        {statusData?.lastError && (
          <div className="p-4 rounded-xl bg-rose-50/80 dark:bg-rose-950/25 border border-rose-200 dark:border-rose-900/50 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-black text-rose-800 dark:text-rose-300">
                <XCircle className="w-4 h-4 shrink-0" />
                <span>
                  Last Notification Error
                  {(statusData.summaryCounts.recentFailed24h ?? statusData.summaryCounts.failed) > 0 && (
                    <> ({statusData.summaryCounts.recentFailed24h ?? statusData.summaryCounts.failed} recent in 24h)</>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-rose-700 dark:text-rose-400 tabular-nums">
                  {new Date(statusData.lastError.timestamp).toLocaleString()}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setActiveLogView('history');
                    setStatusFilter('failed');
                    document.getElementById('whatsapp-notification-console-panel')?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start'
                    });
                  }}
                  className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold cursor-pointer whitespace-nowrap"
                >
                  Filter Failed &amp; Retry
                </button>
              </div>
            </div>
            <p className="text-[11px] font-mono text-rose-900 dark:text-rose-200">
              Order: <strong>{statusData.lastError.orderId}</strong> • Role: <strong className="uppercase">{statusData.lastError.recipientRole}</strong> ({statusData.lastError.recipient})
            </p>
            <p className="text-xs text-rose-800 dark:text-rose-300">
              {statusData.lastError.message}
            </p>
          </div>
        )}
      </div>

      {/* Template Approval Status Card (7 Meta Utility Templates) */}
      {statusData && (
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-zinc-800">
            <div>
              <h4 className="text-sm font-black text-zinc-900 dark:text-zinc-50">
                Template Approval Status (7 Meta Utility Templates)
              </h4>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {statusData.templates.source === 'meta_graph_api'
                  ? 'Live template approval states synchronized from your WhatsApp Business Account.'
                  : 'Connect WHATSAPP_ACCESS_TOKEN and WHATSAPP_BUSINESS_ACCOUNT_ID to verify live Meta approval statuses.'}
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-[10px] font-mono font-bold text-zinc-600 dark:text-zinc-300 self-start sm:self-auto whitespace-nowrap">
              Source: {statusData.templates.source === 'meta_graph_api' ? 'Meta Graph API' : 'Local Registry'}
            </span>
          </div>

          {statusData.templates.error && (
            <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
              Template lookup notice: {statusData.templates.error}
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-zinc-800 text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  <th className="py-2.5 pr-3">Workflow Event</th>
                  <th className="py-2.5 px-3">Template Name</th>
                  <th className="py-2.5 px-3">Recipient</th>
                  <th className="py-2.5 px-3">Variables</th>
                  <th className="py-2.5 pl-3 text-right">Meta Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                {statusData.templates.items.map(tpl => (
                  <tr key={tpl.key} className="hover:bg-slate-50/70 dark:hover:bg-zinc-800/30">
                    <td className="py-2.5 pr-3">
                      <div className="font-bold text-zinc-900 dark:text-zinc-100">{tpl.label}</div>
                      <div className="text-[10.5px] text-zinc-500 dark:text-zinc-400">{tpl.description}</div>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                      {tpl.templateName}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded-md border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-[10px] font-bold uppercase text-zinc-700 dark:text-zinc-300">
                        {tpl.recipientRole}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                      {tpl.parameterLabels.length} fields ({tpl.language})
                    </td>
                    <td className="py-2.5 pl-3 text-right">
                      <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase whitespace-nowrap ${getStatusBadgeStyle(tpl.approvalStatus)}`}>
                        {tpl.approvalStatus.replace(/_/g, ' ')}
                      </span>
                      {tpl.rejectionReason && (
                        <div className="text-[10px] text-rose-600 mt-0.5">{tpl.rejectionReason}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Segmented Console Switcher: Notification History vs Last-50 Raw Webhook Events Debugger */}
      <div id="whatsapp-notification-console-panel" className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-zinc-800">
          <div className="space-y-1">
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-zinc-800 rounded-xl border border-slate-200 dark:border-zinc-700 w-fit">
              <button
                type="button"
                onClick={() => setActiveLogView('history')}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeLogView === 'history'
                    ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-zinc-50 shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                Notification History ({history.length})
              </button>
              <button
                type="button"
                id="whatsapp-webhook-debugger-tab"
                onClick={() => setActiveLogView('webhooks')}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1.5 ${
                  activeLogView === 'webhooks'
                    ? 'bg-white dark:bg-zinc-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Webhook Debugger (Last 50 · {webhookEvents.length})</span>
              </button>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
              {activeLogView === 'history'
                ? `Showing ${filteredHistory.length} of ${history.length} notification records · Admin alerts & Customer confirmations`
                : `Fetched last ${webhookEvents.length} raw Meta webhook events (max 50) · Click any event to inspect raw JSON payload`}
            </p>
          </div>

          {activeLogView === 'history' ? (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search order ID, phone, WAMID..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <select
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value as any)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-xs font-bold text-zinc-700 dark:text-zinc-200"
              >
                <option value="all">All Recipients</option>
                <option value="admin">Admin Only</option>
                <option value="customer">Customer Only</option>
              </select>

              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as any)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-xs font-bold text-zinc-700 dark:text-zinc-200"
              >
                <option value="all">All Statuses</option>
                <option value="delivered">Sent / Delivered / Read</option>
                <option value="failed">Failed</option>
                <option value="skipped_no_consent">No Consent</option>
              </select>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Filter webhook event type"
                value={webhookTypeFilter}
                onChange={e => setWebhookTypeFilter(e.target.value as any)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-xs font-bold text-zinc-700 dark:text-zinc-200"
              >
                <option value="all">All Event Types</option>
                <option value="status">Delivery Status</option>
                <option value="message">Inbound Message</option>
                <option value="opt_out">STOP Opt-Out</option>
                <option value="invalid_signature">Invalid Signature</option>
              </select>

              <select
                aria-label="Filter webhook signature status"
                value={webhookSignatureFilter}
                onChange={e => setWebhookSignatureFilter(e.target.value as any)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-xs font-bold text-zinc-700 dark:text-zinc-200"
              >
                <option value="all">All Signatures</option>
                <option value="verified">Verified Only</option>
                <option value="failed">Failed Only</option>
                <option value="unsigned">Unsigned Only</option>
              </select>

              <button
                type="button"
                id="fetch-webhook-events-btn"
                onClick={() => fetchWebhookEvents({ query: webhookSearch.trim(), searchBy: webhookSearchBy })}
                disabled={webhookLoading}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 hover:bg-slate-100 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-100 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${webhookLoading ? 'animate-spin' : ''}`} />
                <span>{webhookLoading ? 'Fetching...' : 'Fetch Last 50 Events'}</span>
              </button>
            </div>
          )}
        </div>

        {activeLogView === 'history' ? (
          <>
            {retryNotice && (
              <div className={`p-3 rounded-xl border text-xs font-medium flex items-center gap-2 ${
                retryNotice.ok
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800/50'
                  : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-800/50'
              }`}>
                {retryNotice.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                <span>{retryNotice.text}</span>
              </div>
            )}

            {filteredHistory.length === 0 ? (
              <div className="p-6 rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-dashed border-slate-200 dark:border-zinc-800 text-center text-xs text-zinc-500">
                No WhatsApp notification records match the current filter. Place an order to trigger automatic backend dispatch.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-zinc-800 text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      <th className="py-2.5 pr-3">Order &amp; Time</th>
                      <th className="py-2.5 px-3">Recipient</th>
                      <th className="py-2.5 px-3">Template / Event</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Message ID / Diagnostics</th>
                      <th className="py-2.5 pl-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                    {filteredHistory.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-zinc-800/30 align-top">
                        <td className="py-3 pr-3 whitespace-nowrap">
                          <div className="font-mono font-bold text-zinc-900 dark:text-zinc-100">{item.order_id}</div>
                          <div className="text-[10.5px] text-zinc-500 tabular-nums">
                            {new Date(item.created_at).toLocaleString()}
                          </div>
                        </td>

                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className={`px-1.5 py-0.5 rounded-md border text-[9.5px] font-bold uppercase mr-1.5 ${
                            item.recipient_role === 'admin'
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/60'
                              : 'bg-slate-100 text-zinc-700 border-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700'
                          }`}>
                            {item.recipient_role}
                          </span>
                          <span className="font-mono text-zinc-800 dark:text-zinc-200 tabular-nums">
                            {item.recipient || 'No number'}
                          </span>
                          {item.recipient_role === 'customer' && (
                            <div className="text-[10px] text-zinc-500 mt-0.5">
                              Consent: {item.consent_verified ? 'Verified' : 'Not granted'}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-3">
                          <div className="font-mono text-[11px] text-zinc-800 dark:text-zinc-200">{item.template_name}</div>
                          <div className="text-[10.5px] text-zinc-500 capitalize">
                            {item.notification_type.replace(/_/g, ' ')} · Attempts: {item.attempt_count}
                          </div>
                        </td>

                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase ${getStatusBadgeStyle(item.status)}`}>
                            {item.status === 'skipped_no_consent' ? 'No Consent' : item.status}
                          </span>
                        </td>

                        <td className="py-3 px-3 max-w-xs">
                          {item.message_id ? (
                            <div className="font-mono text-[10.5px] text-zinc-600 dark:text-zinc-300 break-all">
                              {item.message_id}
                            </div>
                          ) : (
                            <div className="text-[10.5px] text-zinc-400">No Meta message ID</div>
                          )}
                          {item.error_message && (
                            <div className="text-[10.5px] text-rose-600 dark:text-rose-400 mt-0.5 leading-snug">
                              {item.error_message}
                            </div>
                          )}
                        </td>

                        <td className="py-3 pl-3 text-right whitespace-nowrap">
                          {item.status === 'failed' ? (
                            <button
                              type="button"
                              onClick={() => handleRetryFailed(item)}
                              disabled={retryingId === item.id}
                              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white hover:bg-slate-100 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-100 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <RotateCcw className={`w-3 h-3 ${retryingId === item.id ? 'animate-spin' : ''}`} />
                              <span>{retryingId === item.id ? 'Retrying...' : 'Retry'}</span>
                            </button>
                          ) : (
                            <span className="text-[10.5px] text-zinc-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <div id="whatsapp-raw-webhook-debugger" className="space-y-3">
            {/* Dedicated Search Bar for wamid and matched_order_id */}
            <form
              onSubmit={e => {
                e.preventDefault();
                hasSearchedWebhooksRef.current = Boolean(webhookSearch.trim());
                fetchWebhookEvents({ query: webhookSearch.trim(), searchBy: webhookSearchBy });
              }}
              className="flex flex-col md:flex-row md:items-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-800/40"
            >
              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="webhook-debug-search-input"
                  type="text"
                  aria-label="Search webhook events by wamid or matched_order_id"
                  placeholder="Search webhook events by wamid (e.g. wamid.HBgM...) or matched_order_id..."
                  value={webhookSearch}
                  onChange={e => setWebhookSearch(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono text-xs text-zinc-900 dark:text-zinc-100 placeholder:font-sans placeholder:text-zinc-400 focus:outline-none focus:border-emerald-500"
                />
                {webhookSearch && (
                  <button
                    type="button"
                    aria-label="Clear webhook search"
                    onClick={() => {
                      setWebhookSearch('');
                      hasSearchedWebhooksRef.current = false;
                      fetchWebhookEvents({ query: '', searchBy: webhookSearchBy });
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <div
                  role="group"
                  aria-label="Webhook search field scope"
                  className="flex items-center gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700"
                >
                  {[
                    { id: 'all', label: 'All Fields' },
                    { id: 'wamid', label: 'wamid' },
                    { id: 'matched_order_id', label: 'matched_order_id' }
                  ].map(scope => (
                    <button
                      key={scope.id}
                      type="button"
                      onClick={() => setWebhookSearchBy(scope.id as any)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        webhookSearchBy === scope.id
                          ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 shadow-xs'
                          : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                      }`}
                    >
                      {scope.label}
                    </button>
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={webhookLoading}
                  className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Search</span>
                </button>
              </div>
            </form>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums px-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span>
                  Showing <strong className="text-zinc-800 dark:text-zinc-200">{filteredWebhookEvents.length}</strong> of <strong className="text-zinc-800 dark:text-zinc-200">{webhookEvents.length}</strong> webhook events
                  {webhookSearch.trim() ? ` · Matching "${webhookSearch.trim()}" in ${webhookSearchBy === 'all' ? 'wamid / matched_order_id / payload' : webhookSearchBy}` : ''}
                </span>
                {webhookEvents.length > 0 && (
                  <span className="inline-flex items-center gap-2 text-[10.5px] border-l border-slate-200 dark:border-zinc-700 pl-2">
                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                      {webhookSignatureSummary.verified} Verified
                    </span>
                    <span className="text-rose-700 dark:text-rose-400 font-semibold">
                      {webhookSignatureSummary.failed} Sig Failed
                    </span>
                    {webhookSignatureSummary.unsigned > 0 && (
                      <span className="text-amber-700 dark:text-amber-400 font-semibold">
                        {webhookSignatureSummary.unsigned} Unsigned
                      </span>
                    )}
                  </span>
                )}
              </div>
              {(webhookSearch.trim() || webhookTypeFilter !== 'all' || webhookSignatureFilter !== 'all' || webhookSearchBy !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setWebhookSearch('');
                    setWebhookSearchBy('all');
                    setWebhookTypeFilter('all');
                    setWebhookSignatureFilter('all');
                    hasSearchedWebhooksRef.current = false;
                    fetchWebhookEvents({ query: '', searchBy: 'all' });
                  }}
                  className="font-bold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer whitespace-nowrap"
                >
                  Reset Search &amp; Filters
                </button>
              )}
            </div>

            {webhookError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                <XCircle className="w-4 h-4 shrink-0" />
                <span>{webhookError}</span>
              </div>
            )}

            {webhookRetryNotice && (
              <div
                id="webhook-retry-notice"
                className={`p-3 rounded-xl border text-xs font-medium flex items-center justify-between gap-2 ${
                  webhookRetryNotice.ok
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800/50'
                    : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-800/50'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {webhookRetryNotice.ok ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{webhookRetryNotice.text}</span>
                </div>
                <button
                  type="button"
                  aria-label="Dismiss webhook retry notice"
                  onClick={() => setWebhookRetryNotice(null)}
                  className="p-0.5 rounded text-current opacity-70 hover:opacity-100 cursor-pointer shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {webhookLoading && webhookEvents.length === 0 ? (
              <div className="p-6 rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200 dark:border-zinc-800 text-xs text-zinc-500 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
                <span>Fetching last 50 Meta webhook events...</span>
              </div>
            ) : webhookEvents.length === 0 ? (
              <div className="p-6 rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-dashed border-slate-200 dark:border-zinc-800 text-center space-y-2">
                <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                  {webhookSearch.trim()
                    ? `No raw Meta webhook events matched "${webhookSearch.trim()}" (${webhookSearchBy}).`
                    : 'No raw Meta WhatsApp webhook events recorded yet'}
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 max-w-xl mx-auto leading-relaxed">
                  {webhookSearch.trim()
                    ? 'Verify the exact wamid or matched_order_id, switch search scope to All Fields, or reset the search query to inspect the latest 50 events.'
                    : 'Whenever Meta sends delivery callbacks (`sent`, `delivered`, `read`, `failed`), inbound customer replies, or signature-rejected requests to your webhook URL, the last 50 raw JSON payloads will appear here for troubleshooting.'}
                </p>
                <div className="pt-1 flex items-center justify-center gap-2">
                  {webhookSearch.trim() ? (
                    <button
                      type="button"
                      onClick={() => {
                        setWebhookSearch('');
                        setWebhookSearchBy('all');
                        hasSearchedWebhooksRef.current = false;
                        fetchWebhookEvents({ query: '', searchBy: 'all' });
                      }}
                      className="px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold text-zinc-800 dark:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-700 cursor-pointer"
                    >
                      Clear Search
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fetchWebhookEvents()}
                      className="px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold text-zinc-800 dark:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-700 cursor-pointer"
                    >
                      Check Again
                    </button>
                  )}
                </div>
              </div>
            ) : filteredWebhookEvents.length === 0 ? (
              <div className="p-6 rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-dashed border-slate-200 dark:border-zinc-800 text-center space-y-2">
                <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                  No webhook events match your current search or filter.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setWebhookSearch('');
                    setWebhookSearchBy('all');
                    setWebhookTypeFilter('all');
                    setWebhookSignatureFilter('all');
                    hasSearchedWebhooksRef.current = false;
                    fetchWebhookEvents({ query: '', searchBy: 'all' });
                  }}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold text-zinc-700 dark:text-zinc-200 cursor-pointer"
                >
                  Clear Filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                {/* Left: Event Stream Table (Last 50) */}
                <div className="lg:col-span-7 overflow-x-auto border border-slate-200 dark:border-zinc-800 rounded-xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/50 text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        <th className="py-2.5 px-3">Received Time</th>
                        <th className="py-2.5 px-3">Event &amp; Signature</th>
                        <th className="py-2.5 px-3">Status / Error</th>
                        <th className="py-2.5 px-3">WAMID / Target</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                      {filteredWebhookEvents.map(ev => {
                        const isSelected = selectedWebhookEvent?.id === ev.id;
                        return (
                          <tr
                            key={ev.id}
                            onClick={() => setSelectedWebhookEventId(ev.id)}
                            className={`cursor-pointer transition-colors align-top ${
                              isSelected
                                ? 'bg-emerald-50/70 dark:bg-emerald-950/30'
                                : 'hover:bg-slate-50/80 dark:hover:bg-zinc-800/30'
                            }`}
                          >
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <div className="font-mono text-[11px] font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                                {new Date(ev.received_at).toLocaleString()}
                              </div>
                              <div className="font-mono text-[10px] text-zinc-500">
                                {ev.id}
                              </div>
                            </td>

                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <div className="flex flex-col items-start gap-1">
                                <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase ${getStatusBadgeStyle(ev.event_type)}`}>
                                  {ev.event_type.replace(/_/g, ' ')}
                                </span>
                                {renderSignatureStatusBadge(ev.signature_valid, false)}
                              </div>
                            </td>

                            <td className="py-2.5 px-3 max-w-[200px]">
                              <div className="font-mono text-[11px] font-bold text-zinc-800 dark:text-zinc-200 truncate">
                                {ev.status_summary || '—'}
                              </div>
                              {ev.error_summary ? (
                                <div className="text-[10.5px] text-rose-600 dark:text-rose-400 line-clamp-2 mt-0.5">
                                  {ev.error_summary}
                                </div>
                              ) : (
                                <div className="text-[10px] text-zinc-500 mt-0.5 tabular-nums">
                                  Matched: {ev.processed_statuses} st · {ev.processed_opt_outs} opt-out
                                </div>
                              )}
                              {isFailedWebhookEvent(ev) && (
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation();
                                    handleRetryWebhookEvent(ev);
                                  }}
                                  disabled={retryingWebhookId === ev.id}
                                  className="mt-1.5 px-2.5 py-1 rounded-md border border-rose-200 dark:border-rose-800/70 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 text-[10.5px] font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                                >
                                  <RotateCcw className={`w-3 h-3 shrink-0 ${retryingWebhookId === ev.id ? 'animate-spin' : ''}`} />
                                  <span>{retryingWebhookId === ev.id ? 'Retrying...' : 'Retry Webhook'}</span>
                                </button>
                              )}
                            </td>

                            <td className="py-2.5 px-3 max-w-[180px]">
                              <div className="font-mono text-[10.5px] text-zinc-700 dark:text-zinc-300 truncate">
                                {ev.wamid || 'No WAMID'}
                              </div>
                              <div className="font-mono text-[10px] text-zinc-500 truncate mt-0.5 tabular-nums">
                                {ev.matched_order_id ? `Order ${ev.matched_order_id}` : (ev.recipient_or_sender || 'Unmatched')}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Right: Selected Raw JSON Inspector */}
                <div className="lg:col-span-5 border border-slate-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-slate-50 dark:bg-zinc-950">
                  {selectedWebhookEvent ? (
                    <div className="divide-y divide-slate-200 dark:divide-zinc-800">
                      <div className="p-3.5 bg-white dark:bg-zinc-900 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h5 className="text-xs font-black text-zinc-900 dark:text-zinc-50 truncate">
                                Raw Payload Inspector
                              </h5>
                              {renderSignatureStatusBadge(selectedWebhookEvent.signature_valid, true)}
                            </div>
                            <p className="text-[10.5px] font-mono text-zinc-500 truncate tabular-nums mt-0.5">
                              {selectedWebhookEvent.id} · {new Date(selectedWebhookEvent.received_at).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isFailedWebhookEvent(selectedWebhookEvent) && (
                              <button
                                type="button"
                                id="inspector-retry-webhook-btn"
                                onClick={() => handleRetryWebhookEvent(selectedWebhookEvent)}
                                disabled={retryingWebhookId === selectedWebhookEvent.id}
                                className="px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800/70 bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
                              >
                                <RotateCcw className={`w-3 h-3 shrink-0 ${retryingWebhookId === selectedWebhookEvent.id ? 'animate-spin' : ''}`} />
                                <span>{retryingWebhookId === selectedWebhookEvent.id ? 'Retrying...' : 'Retry Webhook'}</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleCopyWebhookPayload(selectedWebhookEvent)}
                              className="px-2.5 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-800 hover:bg-zinc-800 dark:hover:bg-zinc-700 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                            >
                              {copiedWebhookPayloadId === selectedWebhookEvent.id ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span>Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Copy JSON</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="p-3 bg-white dark:bg-zinc-900/60 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                        <div className="truncate">
                          <span className="text-zinc-500">Order Match: </span>
                          {selectedWebhookEvent.matched_order_id ? (
                            <button
                              type="button"
                              onClick={() => {
                                setWebhookSearchBy('matched_order_id');
                                setWebhookSearch(selectedWebhookEvent.matched_order_id || '');
                              }}
                              title="Search all webhook events for this matched_order_id"
                              className="font-mono font-bold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                            >
                              {selectedWebhookEvent.matched_order_id}
                            </button>
                          ) : (
                            <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">Unmatched</span>
                          )}
                        </div>
                        <div className="truncate">
                          <span className="text-zinc-500">WAMID: </span>
                          {selectedWebhookEvent.wamid ? (
                            <button
                              type="button"
                              onClick={() => {
                                setWebhookSearchBy('wamid');
                                setWebhookSearch(selectedWebhookEvent.wamid || '');
                              }}
                              title="Search all webhook events for this wamid"
                              className="font-mono font-bold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                            >
                              {selectedWebhookEvent.wamid}
                            </button>
                          ) : (
                            <span className="font-mono text-zinc-800 dark:text-zinc-200">—</span>
                          )}
                        </div>
                        <div className="truncate">
                          <span className="text-zinc-500">Notification: </span>
                          <span className="font-mono text-zinc-800 dark:text-zinc-200">
                            {selectedWebhookEvent.matched_notification_id || '—'}
                          </span>
                        </div>
                        <div className="truncate">
                          <span className="text-zinc-500">Peer Phone: </span>
                          <span className="font-mono text-zinc-800 dark:text-zinc-200 tabular-nums">
                            {selectedWebhookEvent.recipient_or_sender || '—'}
                          </span>
                        </div>
                        <div className="truncate">
                          <span className="text-zinc-500">Phone ID: </span>
                          <span className="font-mono text-zinc-800 dark:text-zinc-200 tabular-nums">
                            {selectedWebhookEvent.phone_number_id || '—'}
                          </span>
                        </div>
                        <div className="truncate">
                          <span className="text-zinc-500">Event Type: </span>
                          <span className="font-mono font-bold text-zinc-800 dark:text-zinc-200 uppercase">
                            {selectedWebhookEvent.event_type.replace(/_/g, ' ')}
                          </span>
                        </div>
                        {selectedWebhookEvent.error_summary && (
                          <div className="col-span-2 text-rose-600 dark:text-rose-400 font-medium pt-0.5">
                            Error: {selectedWebhookEvent.error_summary}
                          </div>
                        )}
                      </div>

                      <div className="p-3 space-y-2.5">
                        {/* Collapsible Headers Snapshot */}
                        <div className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 overflow-hidden">
                          <button
                            type="button"
                            id="toggle-webhook-headers-btn"
                            aria-expanded={isWebhookHeadersExpanded}
                            aria-controls="webhook-headers-snapshot-panel"
                            onClick={() => setIsWebhookHeadersExpanded(v => !v)}
                            className="w-full px-2.5 py-2 flex items-center justify-between gap-2 text-left hover:bg-slate-50 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer"
                          >
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
                              {isWebhookHeadersExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                              )}
                              <span>Headers Snapshot</span>
                              <span className="font-mono font-normal normal-case text-zinc-400 tabular-nums">
                                ({Object.keys(selectedWebhookEvent.raw_headers || {}).length} keys)
                              </span>
                            </span>
                            <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 whitespace-nowrap shrink-0">
                              {isWebhookHeadersExpanded ? 'Collapse' : 'Expand'}
                            </span>
                          </button>

                          {isWebhookHeadersExpanded && (
                            <pre
                              id="webhook-headers-snapshot-panel"
                              className="p-2.5 border-t border-slate-200 dark:border-zinc-800 bg-zinc-900 text-zinc-100 font-mono text-[10.5px] leading-relaxed overflow-x-auto max-h-36"
                            >
                              {JSON.stringify(selectedWebhookEvent.raw_headers || {}, null, 2)}
                            </pre>
                          )}
                        </div>

                        {/* Collapsible Raw Meta Webhook JSON Payload */}
                        <div className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 overflow-hidden">
                          <div className="px-2.5 py-2 flex items-center justify-between gap-2 bg-white dark:bg-zinc-900/70">
                            <button
                              type="button"
                              id="toggle-webhook-json-btn"
                              aria-expanded={isWebhookJsonExpanded}
                              aria-controls="webhook-raw-json-payload-panel"
                              onClick={() => setIsWebhookJsonExpanded(v => !v)}
                              className="inline-flex items-center gap-1.5 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-200 hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors cursor-pointer min-w-0"
                            >
                              {isWebhookJsonExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                              )}
                              <span className="truncate">Raw Meta Webhook JSON Payload</span>
                              <span className="font-mono font-normal normal-case text-zinc-400 tabular-nums shrink-0">
                                ({selectedWebhookJsonStats.lines} lines)
                              </span>
                            </button>

                            <div className="flex items-center gap-2 shrink-0">
                              {isWebhookJsonExpanded && selectedWebhookJsonStats.lines > 18 && (
                                <button
                                  type="button"
                                  onClick={() => setIsWebhookJsonFullHeight(v => !v)}
                                  className="px-2 py-0.5 rounded border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-700 text-[10px] font-bold text-zinc-600 dark:text-zinc-300 whitespace-nowrap cursor-pointer"
                                >
                                  {isWebhookJsonFullHeight ? 'Compact Height' : 'Full Height'}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setIsWebhookJsonExpanded(v => !v)}
                                className="px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 whitespace-nowrap cursor-pointer"
                              >
                                {isWebhookJsonExpanded ? 'Collapse JSON' : 'Expand JSON'}
                              </button>
                            </div>
                          </div>

                          {isWebhookJsonExpanded ? (
                            <pre
                              id="webhook-raw-json-payload-panel"
                              className={`p-3 border-t border-zinc-800 bg-zinc-950 text-emerald-300 font-mono text-[11px] leading-relaxed overflow-x-auto ${
                                isWebhookJsonFullHeight ? 'max-h-none' : 'max-h-96 overflow-y-auto'
                              }`}
                            >
                              {selectedWebhookFormattedJson}
                            </pre>
                          ) : (
                            <div
                              id="webhook-raw-json-payload-panel"
                              className="px-3 py-2 border-t border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/60 flex items-center justify-between gap-2 text-[11px] text-zinc-500 dark:text-zinc-400"
                            >
                              <span className="font-mono truncate">
                                {selectedWebhookJsonStats.keys.length > 0
                                  ? `{ ${selectedWebhookJsonStats.keys.join(', ')} } · ${selectedWebhookJsonStats.lines} lines`
                                  : `Collapsed JSON payload (${selectedWebhookJsonStats.lines} lines)`}
                              </span>
                              <button
                                type="button"
                                onClick={() => setIsWebhookJsonExpanded(true)}
                                className="font-bold text-emerald-700 dark:text-emerald-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                Show Payload
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
