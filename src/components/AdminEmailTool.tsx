/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Component: AdminEmailTool
 * 
 * Production Admin Email Tool for verifying SMTP connectivity, configuring
 * credentials (such as Google 16-character App Passwords), dispatching real test emails,
 * and displaying live server responses and socket protocol logs.
 */

import React, { useState, useEffect } from 'react';
import { 
  Mail, Send, CheckCircle2, AlertTriangle, RefreshCw, 
  Server, ShieldCheck, Copy, Check, ChevronDown, ChevronUp, 
  Terminal, X, KeyRound, Eye, EyeOff, ExternalLink, HelpCircle, Save
} from 'lucide-react';
import { getStoredAuthToken } from '../config/authConfig';

interface SmtpLogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  type?: 'protocol' | 'handshake' | 'auth' | 'transmission' | 'system';
  message: string;
  details?: any;
}

interface SmtpTransportInfo {
  host: string;
  port: number;
  secure: boolean;
  configured: boolean;
  maskedUser: string | null;
  fromAddress: string;
}

interface SmtpDeliveryInfo {
  dispatched: boolean;
  messageId: string;
  recipient: string;
  accepted?: string[];
  rejected?: string[];
  response?: string;
}

interface ApiResponse {
  success: boolean;
  status: 'verified' | 'unconfigured' | 'connection_failed' | 'send_failed' | 'server_error';
  message?: string;
  error?: string;
  transport?: SmtpTransportInfo;
  delivery?: SmtpDeliveryInfo;
  details?: {
    errorMessage?: string;
    errorCode?: string;
    command?: string | null;
    responseCode?: number | string | null;
    smtpResponse?: string | null;
    recommendation?: string;
    missingVariables?: string[];
    requiredVariables?: string[];
    instructions?: string;
  };
  logs?: SmtpLogEntry[];
}

export function AdminEmailTool() {
  const [recipientEmail, setRecipientEmail] = useState<string>('arjungorrepato@gmail.com');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [activeAction, setActiveAction] = useState<'send' | 'verify' | 'save' | null>(null);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'warning';
    title: string;
    message: string;
    details?: string;
    code?: string;
    messageId?: string;
    timestamp: string;
  } | null>(null);
  const [transportInfo, setTransportInfo] = useState<SmtpTransportInfo | null>(null);
  const [logs, setLogs] = useState<SmtpLogEntry[]>([]);
  const [showLogs, setShowLogs] = useState<boolean>(false);
  const [logsCopied, setLogsCopied] = useState<boolean>(false);

  // Configuration drawer & inputs
  const [showConfigDrawer, setShowConfigDrawer] = useState<boolean>(false);
  const [smtpUser, setSmtpUser] = useState<string>('officialnuvvo@gmail.com');
  const [smtpPass, setSmtpPass] = useState<string>('');
  const [smtpHost, setSmtpHost] = useState<string>('smtp.gmail.com');
  const [smtpPort, setSmtpPort] = useState<string>('465');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  // Check initial SMTP connectivity and configuration on mount
  useEffect(() => {
    let mounted = true;
    const fetchInitialStatus = async () => {
      try {
        const token = getStoredAuthToken();
        const res = await fetch('/api/verify-smtp?send=false', {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        const data: ApiResponse & { details?: any } = await res.json().catch(() => null);
        if (mounted && data) {
          const resolvedTransport = data.transport || data.details?.transport;
          if (resolvedTransport) {
            setTransportInfo(resolvedTransport);
            if (resolvedTransport.host) setSmtpHost(resolvedTransport.host);
            if (resolvedTransport.port) setSmtpPort(String(resolvedTransport.port));
          }
          if (Array.isArray(data.logs)) {
            setLogs(data.logs);
          }
        }
      } catch (err) {
        // Initial passive check
      }
    };
    fetchInitialStatus();
    return () => {
      mounted = false;
    };
  }, []);

  const handleTriggerTest = async (sendEmail: boolean = true) => {
    if (sendEmail && !recipientEmail.trim()) {
      setNotification({
        type: 'error',
        title: 'Recipient Required',
        message: 'Please provide a valid recipient email address to send the test message.',
        timestamp: new Date().toLocaleTimeString()
      });
      return;
    }

    setIsLoading(true);
    setActiveAction(sendEmail ? 'send' : 'verify');
    setNotification(null);

    try {
      const payload: Record<string, any> = {
        to: recipientEmail.trim(),
        send: sendEmail
      };

      if (smtpPass.trim()) {
        payload.user = smtpUser.trim();
        payload.pass = smtpPass.trim();
        payload.host = smtpHost.trim();
        payload.port = Number(smtpPort.trim());
      }

      const token = getStoredAuthToken();
      const res = await fetch('/api/verify-smtp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });

      const data: ApiResponse & { details?: any } = await res.json().catch(() => ({
        success: false,
        status: 'server_error',
        error: `Server responded with status HTTP ${res.status}`
      }));

      const resolvedTransport = data.transport || data.details?.transport;
      if (resolvedTransport) {
        setTransportInfo(resolvedTransport);
      }
      if (Array.isArray(data.logs)) {
        setLogs(data.logs);
      }

      if (data.success) {
        setNotification({
          type: 'success',
          title: sendEmail ? 'Test Email Sent Successfully!' : 'SMTP Connection Verified!',
          message: data.message || (sendEmail ? `Message delivered to ${recipientEmail}` : 'SMTP connection and authentication established.'),
          messageId: data.delivery?.messageId,
          details: data.delivery?.response || '250 OK (Accepted for delivery)',
          timestamp: new Date().toLocaleTimeString()
        });
      } else {
        const isUnconfigured = data.status === 'unconfigured';
        setNotification({
          type: isUnconfigured ? 'warning' : 'error',
          title: isUnconfigured ? 'SMTP Credentials Unconfigured' : 'SMTP Delivery Failed',
          message: data.error || data.message || 'Unable to complete SMTP verification test.',
          details: data.details?.errorMessage || data.details?.recommendation || data.details?.instructions,
          code: data.details?.errorCode || (isUnconfigured ? 'UNCONFIGURED' : 'SMTP_ERROR'),
          timestamp: new Date().toLocaleTimeString()
        });
        setShowLogs(true);
      }
    } catch (err: any) {
      setNotification({
        type: 'error',
        title: 'Connection Error',
        message: `Failed to contact /api/verify-smtp server route: ${err?.message || err}`,
        timestamp: new Date().toLocaleTimeString()
      });
      setShowLogs(true);
    } finally {
      setIsLoading(false);
      setActiveAction(null);
    }
  };

  const handleSaveAndVerifyCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!smtpUser.trim() || !smtpPass.trim()) {
      setNotification({
        type: 'error',
        title: 'Credentials Incomplete',
        message: 'Please enter both the Sender Username/Email and the 16-character App Password.',
        timestamp: new Date().toLocaleTimeString()
      });
      return;
    }

    setIsLoading(true);
    setActiveAction('save');
    setNotification(null);

    try {
      const payload = {
        user: smtpUser.trim(),
        pass: smtpPass.trim(),
        host: smtpHost.trim() || 'smtp.gmail.com',
        port: Number(smtpPort.trim()) || 465,
        to: recipientEmail.trim(),
        send: true,
        save: true
      };

      const token = getStoredAuthToken();
      const res = await fetch('/api/verify-smtp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });

      const data: ApiResponse & { details?: any } = await res.json().catch(() => null);

      const resolvedTransport = data?.transport || data?.details?.transport;
      if (resolvedTransport) {
        setTransportInfo(resolvedTransport);
      }
      if (Array.isArray(data?.logs)) {
        setLogs(data.logs);
      }

      if (data?.success) {
        setNotification({
          type: 'success',
          title: 'SMTP Connected & Saved Successfully!',
          message: `App Password verified and saved. A test email was dispatched to ${recipientEmail}. Real customer OTP emails will now deliver reliably.`,
          messageId: data.delivery?.messageId,
          details: data.delivery?.response || '250 OK',
          timestamp: new Date().toLocaleTimeString()
        });
        setShowConfigDrawer(false);
      } else {
        setNotification({
          type: 'error',
          title: 'SMTP Authentication Failed',
          message: data?.error || 'Authentication rejected by Google SMTP server.',
          details: data?.details?.errorMessage || data?.details?.recommendation || 'Please verify the 16-character Google App Password.',
          code: data?.details?.errorCode || 'AUTH_FAILED',
          timestamp: new Date().toLocaleTimeString()
        });
        setShowLogs(true);
      }
    } catch (err: any) {
      setNotification({
        type: 'error',
        title: 'Save Failed',
        message: `Network error saving credentials: ${err?.message || err}`,
        timestamp: new Date().toLocaleTimeString()
      });
    } finally {
      setIsLoading(false);
      setActiveAction(null);
    }
  };

  const handleCopyLogs = () => {
    if (!logs.length) return;
    const text = logs
      .map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`)
      .join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setLogsCopied(true);
      setTimeout(() => setLogsCopied(false), 2000);
    });
  };

  const isConfigured = transportInfo?.configured ?? false;

  return (
    <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-5 sm:p-6 shadow-sm space-y-5">
      {/* Tool Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-500 flex items-center justify-center text-white shadow-sm shrink-0">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-base font-black text-zinc-900 dark:text-zinc-100">
                Admin Email Tool
              </h4>
              <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                isConfigured
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
              }`}>
                {isConfigured ? '● SMTP Connected' : '○ Action Needed (App Password)'}
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Verify server-side SMTP connectivity &amp; dispatch real test emails to customer inboxes
            </p>
          </div>
        </div>

        {/* Server Transport Badge & Quick Setup Button */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowConfigDrawer(!showConfigDrawer)}
            className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold text-xs rounded-xl border border-indigo-200 dark:border-indigo-800 transition flex items-center gap-1.5 cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>{showConfigDrawer ? 'Close Settings' : 'Configure Credentials'}</span>
          </button>

          <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-600 dark:text-zinc-400 bg-slate-50 dark:bg-zinc-800/80 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700">
            <Server className="w-3.5 h-3.5 text-zinc-400" />
            <span>{transportInfo?.host || 'smtp.gmail.com'}:{transportInfo?.port || 465}</span>
            <span className="text-zinc-300 dark:text-zinc-600">|</span>
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">
              {transportInfo?.maskedUser || (isConfigured ? 'Active' : 'Unconfigured')}
            </span>
          </div>
        </div>
      </div>

      {/* Expandable SMTP Credentials Configuration Drawer */}
      {showConfigDrawer && (
        <form onSubmit={handleSaveAndVerifyCredentials} className="p-4 sm:p-5 bg-gradient-to-br from-indigo-50/70 to-purple-50/70 dark:from-indigo-950/30 dark:to-purple-950/30 border border-indigo-200/80 dark:border-indigo-800/60 rounded-2xl space-y-4 animate-fadeIn">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h5 className="text-xs font-black text-indigo-900 dark:text-indigo-200 uppercase tracking-wider flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                Google SMTP App Password Setup (officialnuvvo@gmail.com)
              </h5>
              <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Google blocks regular Gmail login passwords for automated mailers. You must generate a free <strong>16-character App Password</strong> from Google.
              </p>
            </div>
            <a 
              href="https://myaccount.google.com/apppasswords" 
              target="_blank" 
              rel="noreferrer"
              className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 bg-white dark:bg-zinc-800 px-3 py-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800 shrink-0"
            >
              <span>Get Google App Password</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Sender Gmail Address
              </label>
              <input
                type="email"
                value={smtpUser}
                onChange={(e) => setSmtpUser(e.target.value)}
                placeholder="officialnuvvo@gmail.com"
                required
                className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl font-mono text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                  Google 16-Character App Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-[10px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 flex items-center gap-1 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  <span>{showPassword ? 'Hide' : 'Show'}</span>
                </button>
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={smtpPass}
                onChange={(e) => setSmtpPass(e.target.value)}
                placeholder="xxxx xxxx xxxx xxxx"
                required
                className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl font-mono text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                SMTP Host
              </label>
              <input
                type="text"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                placeholder="smtp.gmail.com"
                className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl font-mono text-xs text-zinc-900 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                SMTP Port (465 for SSL)
              </label>
              <input
                type="text"
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value)}
                placeholder="465"
                className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl font-mono text-xs text-zinc-900 dark:text-zinc-100"
              />
            </div>
          </div>

          <div className="p-3 bg-white/80 dark:bg-zinc-850 rounded-xl border border-indigo-100 dark:border-indigo-900 text-[11px] text-zinc-600 dark:text-zinc-300 space-y-1">
            <p className="font-bold text-indigo-950 dark:text-indigo-200">
              📌 Quick Setup Instructions (తెలుగు &amp; English):
            </p>
            <ol className="list-decimal pl-4 space-y-0.5 leading-relaxed">
              <li>Open Google Account &rarr; Security &rarr; Enable 2-Step Verification (2-Step Verification తప్పనిసరిగా ON లో ఉండాలి).</li>
              <li>Go to <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="text-indigo-600 dark:text-indigo-400 underline font-bold">Google App Passwords</a>, create app name "NUVVO", and copy the 16-character code (e.g. <code className="bg-slate-100 dark:bg-zinc-800 px-1 rounded">abcd efgh ijkl mnop</code>).</li>
              <li>Paste the 16-character code here and click <strong>"Save &amp; Test SMTP"</strong>. Also paste the same code in Supabase Dashboard &rarr; Authentication &rarr; SMTP Settings &rarr; Password.</li>
            </ol>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowConfigDrawer(false)}
              className="px-4 py-2 bg-white dark:bg-zinc-800 hover:bg-slate-100 text-zinc-700 dark:text-zinc-300 font-bold text-xs rounded-xl border border-slate-200 dark:border-zinc-700 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              {isLoading && activeAction === 'save' ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Connecting &amp; Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save &amp; Test SMTP</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Recipient Input & Action Trigger */}
      <div className="space-y-3">
        <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300">
          Test Recipient Email
          <span className="text-[10px] font-normal text-zinc-500 dark:text-zinc-400 ml-2">
            (The email inbox where the test message will be delivered)
          </span>
        </label>

        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Mail className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="e.g. arjungorrepato@gmail.com"
              disabled={isLoading}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-zinc-800/70 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm font-medium text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleTriggerTest(true)}
              disabled={isLoading || !recipientEmail.trim()}
              className="flex-1 sm:flex-none px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
            >
              {isLoading && activeAction === 'send' ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Sending Test...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Send Test Email</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleTriggerTest(false)}
              disabled={isLoading}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 active:scale-95 disabled:opacity-50 text-zinc-700 dark:text-zinc-200 font-bold text-xs rounded-xl border border-slate-200 dark:border-zinc-700 transition flex items-center justify-center gap-1.5 cursor-pointer"
              title="Test SMTP handshake and login authentication without transmitting an email"
            >
              {isLoading && activeAction === 'verify' ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-zinc-500" />
                  <span>Testing...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Verify Handshake</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div className={`p-4 sm:p-5 rounded-2xl border transition-all animate-fadeIn ${
          notification.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100'
            : notification.type === 'warning'
            ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100'
            : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-100'
        }`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0 mt-0.5 ${
                notification.type === 'success'
                  ? 'bg-emerald-600'
                  : notification.type === 'warning'
                  ? 'bg-amber-600'
                  : 'bg-rose-600'
              }`}>
                {notification.type === 'success' ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  <AlertTriangle className="w-5 h-5" />
                )}
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h5 className="text-sm font-black">{notification.title}</h5>
                  {notification.code && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-black/10 dark:bg-white/10 font-bold">
                      {notification.code}
                    </span>
                  )}
                  <span className="text-[10px] font-mono opacity-60">
                    {notification.timestamp}
                  </span>
                </div>

                <p className="text-xs opacity-90 leading-relaxed font-medium">
                  {notification.message}
                </p>

                {notification.details && (
                  <div className="mt-2 p-2.5 bg-black/5 dark:bg-white/5 rounded-xl font-mono text-[11px] leading-relaxed break-words">
                    {notification.details}
                  </div>
                )}

                {notification.messageId && (
                  <div className="mt-1.5 text-[11px] font-mono opacity-80 break-all">
                    <strong>Message ID: </strong> {notification.messageId}
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setNotification(null)}
              className="p-1 rounded-lg opacity-60 hover:opacity-100 transition cursor-pointer"
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Collapsible Handshake / Socket Logs */}
      <div className="border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden bg-zinc-950 text-zinc-200">
        <button
          type="button"
          onClick={() => setShowLogs(!showLogs)}
          className="w-full px-4 py-3 flex items-center justify-between text-left bg-zinc-900 hover:bg-zinc-800/80 transition cursor-pointer border-b border-zinc-800"
        >
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-mono font-bold text-zinc-100">
              SMTP Protocol &amp; Socket Logs
            </span>
            <span className="text-[10px] font-mono bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-md">
              {logs.length} entries
            </span>
          </div>

          <div className="flex items-center gap-3">
            {logs.length > 0 && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyLogs();
                }}
                className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
              >
                {logsCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{logsCopied ? 'Copied' : 'Copy Logs'}</span>
              </span>
            )}
            <div className="text-zinc-400">
              {showLogs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </div>
        </button>

        {showLogs && (
          <div className="p-3 font-mono text-[11px] leading-relaxed max-h-64 overflow-y-auto space-y-1 scrollbar-thin">
            {logs.length === 0 ? (
              <div className="text-zinc-500 py-3 text-center italic">
                No logs recorded yet. Click "Send Test Email" to initiate and stream server-side verification events.
              </div>
            ) : (
              logs.map((log, idx) => {
                const color = 
                  log.level === 'error' ? 'text-rose-400' :
                  log.level === 'warn' ? 'text-amber-400' :
                  log.type === 'auth' ? 'text-purple-300' :
                  log.type === 'transmission' ? 'text-emerald-400' :
                  log.type === 'handshake' ? 'text-cyan-300' :
                  'text-zinc-400';

                return (
                  <div key={idx} className="flex items-start gap-2 border-b border-zinc-900/80 pb-1">
                    <span className="text-[9.5px] text-zinc-600 shrink-0">
                      {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '--:--:--'}
                    </span>
                    <span className={`text-[9.5px] uppercase font-bold shrink-0 px-1 py-0.2 rounded ${
                      log.level === 'error' ? 'bg-rose-950 text-rose-300' :
                      log.level === 'warn' ? 'bg-amber-950 text-amber-300' :
                      'bg-zinc-800 text-zinc-400'
                    }`}>
                      {log.type || log.level}
                    </span>
                    <span className={`break-all ${color}`}>
                      {log.message}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminEmailTool;
