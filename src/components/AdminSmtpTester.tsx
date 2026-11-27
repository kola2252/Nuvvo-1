/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Admin Tool Component: SMTP Diagnostic & Test Email Dispatcher
 * Allows administrators to verify live SMTP connectivity and trigger real test emails
 * using the configured SMTP transport (or optional override credentials),
 * displaying immediate success/error results and real-time protocol handshake logs.
 */

import React, { useState, useEffect } from 'react';
import { 
  Mail, Send, CheckCircle2, AlertTriangle, XCircle, RefreshCw, 
  Terminal, ShieldCheck, Key, Server, Copy, Check, ChevronDown, 
  ChevronUp, Eye, EyeOff, Info, ArrowUpRight
} from 'lucide-react';
import { getStoredAuthToken } from '../config/authConfig';

interface SmtpLogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  type: 'protocol' | 'handshake' | 'auth' | 'transmission' | 'system';
  message: string;
  details?: any;
}

interface SmtpTransportConfig {
  host: string;
  port: number;
  secure: boolean;
  configured: boolean;
  authConfigured: boolean;
  userConfigured: boolean;
  passConfigured: boolean;
  isOverride?: boolean;
  maskedUser: string | null;
  fromAddress: string;
}

interface SmtpDeliveryResult {
  dispatched: boolean;
  messageId: string;
  recipient: string;
  accepted?: string[];
  rejected?: string[];
  response?: string;
}

interface SmtpResponseData {
  success: boolean;
  status: 'verified' | 'unconfigured' | 'connection_failed' | 'send_failed' | 'server_error';
  message?: string;
  error?: string;
  transport?: SmtpTransportConfig;
  delivery?: SmtpDeliveryResult;
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
    transport?: SmtpTransportConfig;
  };
  logs?: SmtpLogEntry[];
}

export default function AdminSmtpTester() {
  const [recipient, setRecipient] = useState<string>('arjungorrepato@gmail.com');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [actionType, setActionType] = useState<'send' | 'verify' | null>(null);
  const [response, setResponse] = useState<SmtpResponseData | null>(null);
  const [logs, setLogs] = useState<SmtpLogEntry[]>([]);
  const [showLogs, setShowLogs] = useState<boolean>(false);
  const [copiedLogs, setCopiedLogs] = useState<boolean>(false);
  const [showOverrides, setShowOverrides] = useState<boolean>(false);
  const [showPassword, setShowPassword] = useState<boolean>(false);

  // Custom credentials overrides (optional)
  const [overrideUser, setOverrideUser] = useState<string>('');
  const [overridePass, setOverridePass] = useState<string>('');
  const [overrideHost, setOverrideHost] = useState<string>('');
  const [overridePort, setOverridePort] = useState<string>('');
  const [overrideFrom, setOverrideFrom] = useState<string>('');

  // Initial status check to determine if SMTP is already configured on the server
  useEffect(() => {
    let isMounted = true;
    const checkInitialStatus = async () => {
      try {
        const token = getStoredAuthToken();
        const res = await fetch('/api/verify-email?send=false', {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (!res.ok && res.status !== 502) return;
        const data = await res.json().catch(() => null);
        if (isMounted && data) {
          setResponse(data);
          if (Array.isArray(data.logs)) {
            setLogs(data.logs);
          }
        }
      } catch (e) {
        // Silent initial check failure
      }
    };
    checkInitialStatus();
    return () => {
      isMounted = false;
    };
  }, []);

  const executeSmtpTest = async (sendEmail: boolean) => {
    setIsLoading(true);
    setActionType(sendEmail ? 'send' : 'verify');
    setResponse(null);

    const payload: Record<string, any> = {
      to: recipient.trim(),
      send: sendEmail
    };

    if (overrideUser.trim()) payload.user = overrideUser.trim();
    if (overridePass.trim()) payload.pass = overridePass.trim();
    if (overrideHost.trim()) payload.host = overrideHost.trim();
    if (overridePort.trim()) payload.port = Number(overridePort.trim());
    if (overrideFrom.trim()) payload.from = overrideFrom.trim();

    try {
      const token = getStoredAuthToken();
      const res = await fetch('/api/verify-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({
        success: false,
        status: 'server_error',
        error: `Server returned HTTP ${res.status} with unparseable response`
      }));

      setResponse(data);
      if (Array.isArray(data.logs)) {
        setLogs(data.logs);
      }
      if (!data.success) {
        // Automatically expand logs on error so admin sees what happened
        setShowLogs(true);
      }
    } catch (err: any) {
      const errorEntry: SmtpLogEntry = {
        timestamp: new Date().toISOString(),
        level: 'error',
        type: 'system',
        message: `Network request to /api/verify-email failed: ${err?.message || err}`
      };
      setResponse({
        success: false,
        status: 'server_error',
        error: `Network error communicating with server: ${err?.message || err}`
      });
      setLogs(prev => [errorEntry, ...prev]);
      setShowLogs(true);
    } finally {
      setIsLoading(false);
      setActionType(null);
    }
  };

  const handleCopyLogs = () => {
    if (!logs.length) return;
    const logText = logs
      .map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.type.toUpperCase()}] ${l.message}`)
      .join('\n');
    navigator.clipboard.writeText(logText).then(() => {
      setCopiedLogs(true);
      setTimeout(() => setCopiedLogs(false), 2500);
    });
  };

  const isConfigured = response?.transport?.configured ?? false;
  const isOverrideActive = Boolean(overrideUser.trim() || overridePass.trim() || overrideHost.trim());

  return (
    <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-5 sm:p-6 shadow-sm space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-zinc-800">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-sm shrink-0">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-base font-black text-zinc-900 dark:text-zinc-100">
                SMTP Diagnostic & Live Email Dispatcher
              </h4>
              <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                response?.success
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : isConfigured
                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
              }`}>
                {response?.success 
                  ? '● Live & Verified' 
                  : isConfigured 
                  ? '● Credentials Active' 
                  : '○ Unconfigured'}
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Verify live SMTP transport connectivity and dispatch a real test email with deep protocol inspection
            </p>
          </div>
        </div>

        {/* Quick Config Pills */}
        <div className="flex items-center gap-2 self-start sm:self-auto text-[11px] font-mono text-zinc-500 dark:text-zinc-400 bg-slate-50 dark:bg-zinc-800/80 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700">
          <Server className="w-3.5 h-3.5 text-zinc-400" />
          <span>{response?.transport?.host || 'smtp.gmail.com'}:{response?.transport?.port || 465}</span>
          <span className="text-zinc-300 dark:text-zinc-600">|</span>
          <span className={isConfigured ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-amber-600 dark:text-amber-400 font-bold'}>
            {response?.transport?.maskedUser || (isConfigured ? 'Active' : 'Missing')}
          </span>
        </div>
      </div>

      {/* Recipient Input & Primary Actions */}
      <div className="space-y-3">
        <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300">
          Recipient Email Address
          <span className="text-[10px] font-normal text-zinc-500 dark:text-zinc-400 ml-2">
            (The email inbox where the test verification message will be delivered)
          </span>
        </label>
        
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Mail className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="email"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="e.g. arjungorrepato@gmail.com"
              disabled={isLoading}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-zinc-800/70 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm font-medium text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => executeSmtpTest(true)}
              disabled={isLoading || !recipient.trim()}
              className="flex-1 sm:flex-none px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
            >
              {isLoading && actionType === 'send' ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Sending Test Email...</span>
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
              onClick={() => executeSmtpTest(false)}
              disabled={isLoading}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 active:scale-95 disabled:opacity-50 text-zinc-700 dark:text-zinc-200 font-bold text-xs rounded-xl border border-slate-200 dark:border-zinc-700 transition flex items-center justify-center gap-1.5 cursor-pointer"
              title="Test SMTP handshake and login authentication without transmitting an email"
            >
              {isLoading && actionType === 'verify' ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-zinc-500" />
                  <span>Verifying...</span>
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

      {/* Expandable Custom Overrides (For testing credentials before committing to environment variables) */}
      <div className="border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden bg-slate-50/50 dark:bg-zinc-800/40">
        <button
          type="button"
          onClick={() => setShowOverrides(!showOverrides)}
          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-100/60 dark:hover:bg-zinc-800/80 transition cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Key className="w-3.5 h-3.5 text-orange-500" />
            <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
              Custom SMTP Credentials Override
            </span>
            {isOverrideActive && (
              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300">
                Override Active
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-[11px] font-bold text-zinc-500">
            <span>{showOverrides ? 'Hide Overrides' : 'Configure Custom Host/Pass'}</span>
            {showOverrides ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </div>
        </button>

        {showOverrides && (
          <div className="p-4 border-t border-slate-200 dark:border-zinc-800 space-y-3 bg-white dark:bg-zinc-900/80">
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Enter credentials below to test them immediately. Leave blank to use server environment variables (<code className="font-mono text-emerald-600 dark:text-emerald-400">EMAIL_USER</code> &amp; <code className="font-mono text-emerald-600 dark:text-emerald-400">EMAIL_PASS</code>).
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 mb-1">
                  SMTP Host
                </label>
                <input
                  type="text"
                  value={overrideHost}
                  onChange={(e) => setOverrideHost(e.target.value)}
                  placeholder="smtp.gmail.com"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-mono text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 mb-1">
                  SMTP Port
                </label>
                <input
                  type="text"
                  value={overridePort}
                  onChange={(e) => setOverridePort(e.target.value)}
                  placeholder="465 (SSL) or 587 (TLS)"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-mono text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 mb-1">
                  Username / Sender Email
                </label>
                <input
                  type="email"
                  value={overrideUser}
                  onChange={(e) => setOverrideUser(e.target.value)}
                  placeholder="officialnuvvo@gmail.com"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-mono text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 mb-1 flex items-center justify-between">
                  <span>App Password (16 chars)</span>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-[10px] flex items-center gap-1 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    <span>{showPassword ? 'Hide' : 'Show'}</span>
                  </button>
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={overridePass}
                  onChange={(e) => setOverridePass(e.target.value)}
                  placeholder="16-character Google App Password"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-mono text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {isOverrideActive && (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setOverrideHost('');
                    setOverridePort('');
                    setOverrideUser('');
                    setOverridePass('');
                    setOverrideFrom('');
                  }}
                  className="text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                >
                  Clear Overrides &amp; Restore Server Defaults
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Response Results Display */}
      {response && (
        <div className="space-y-3 animate-fadeIn">
          {response.success ? (
            /* Success Card */
            <div className="p-4 sm:p-5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 rounded-2xl space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center text-white shrink-0 mt-0.5">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <h5 className="text-sm font-black text-emerald-900 dark:text-emerald-200">
                      {response.delivery?.dispatched ? 'Test Email Delivered Successfully!' : 'SMTP Handshake Verified!'}
                    </h5>
                    <span className="text-[10px] font-mono font-bold text-emerald-700 dark:text-emerald-300">
                      {new Date().toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-1">
                    {response.message || 'SMTP connection and authentication verified with the mail server.'}
                  </p>
                </div>
              </div>

              {/* Delivery Metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-emerald-200 dark:border-emerald-800 text-[11px] font-mono">
                {response.delivery?.messageId && (
                  <div className="p-2 bg-emerald-100/60 dark:bg-emerald-900/40 rounded-lg text-emerald-900 dark:text-emerald-200 break-all">
                    <span className="font-bold">Message ID: </span>
                    {response.delivery.messageId}
                  </div>
                )}
                <div className="p-2 bg-emerald-100/60 dark:bg-emerald-900/40 rounded-lg text-emerald-900 dark:text-emerald-200">
                  <span className="font-bold">Recipient: </span>
                  {response.delivery?.recipient || recipient}
                </div>
                <div className="p-2 bg-emerald-100/60 dark:bg-emerald-900/40 rounded-lg text-emerald-900 dark:text-emerald-200">
                  <span className="font-bold">Transport: </span>
                  {response.transport?.host}:{response.transport?.port} ({response.transport?.secure ? 'SSL' : 'TLS'})
                </div>
                <div className="p-2 bg-emerald-100/60 dark:bg-emerald-900/40 rounded-lg text-emerald-900 dark:text-emerald-200">
                  <span className="font-bold">Status: </span>
                  {response.delivery?.response || '250 OK'}
                </div>
              </div>

              <div className="text-[11px] text-emerald-800/90 dark:text-emerald-300/90 flex items-center gap-1.5 pt-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>
                  Customer OTP registration emails and password recovery codes will deliver with high deliverability.
                </span>
              </div>
            </div>
          ) : (
            /* Error Card */
            <div className="p-4 sm:p-5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 rounded-2xl space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-rose-500 flex items-center justify-center text-white shrink-0 mt-0.5">
                  <XCircle className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <div className="flex items-center gap-2">
                      <h5 className="text-sm font-black text-rose-900 dark:text-rose-200">
                        {response.status === 'unconfigured' ? 'SMTP Credentials Unconfigured' : 'SMTP Delivery Failed'}
                      </h5>
                      {response.details?.errorCode && (
                        <span className="text-[9px] font-mono font-bold bg-rose-200 dark:bg-rose-900 text-rose-800 dark:text-rose-200 px-2 py-0.5 rounded-md">
                          {response.details.errorCode}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono font-bold text-rose-700 dark:text-rose-300">
                      {new Date().toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-xs text-rose-800 dark:text-rose-300 mt-1 font-medium">
                    {response.error || response.message || 'SMTP operation could not be completed.'}
                  </p>
                </div>
              </div>

              {/* Server Error Details */}
              {response.details?.errorMessage && (
                <div className="p-2.5 bg-rose-100/60 dark:bg-rose-900/30 rounded-xl text-[11px] font-mono text-rose-900 dark:text-rose-200 break-words border border-rose-200 dark:border-rose-800">
                  <span className="font-bold">Server Output: </span>
                  {response.details.errorMessage}
                </div>
              )}

              {/* Troubleshooting Guidance */}
              <div className="p-3 bg-white/70 dark:bg-zinc-900/60 rounded-xl border border-rose-200 dark:border-rose-800/60 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-900 dark:text-zinc-100">
                  <Info className="w-3.5 h-3.5 text-amber-500" />
                  <span>Troubleshooting Steps</span>
                </div>
                <ul className="text-[11px] text-zinc-600 dark:text-zinc-300 space-y-1 list-disc pl-4 leading-relaxed">
                  {response.details?.recommendation ? (
                    <li className="font-semibold text-zinc-800 dark:text-zinc-200">{response.details.recommendation}</li>
                  ) : null}
                  <li>
                    <strong>Gmail App Password:</strong> Go to <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 underline inline-flex items-center gap-0.5">Google Account App Passwords <ArrowUpRight className="w-2.5 h-2.5" /></a>, enable 2-Step Verification, generate a 16-character App Password, and paste it into the override box or <code className="font-mono text-xs">EMAIL_PASS</code>.
                  </li>
                  <li>
                    <strong>Never use your personal password:</strong> Standard Google account passwords will be rejected with <code className="font-mono text-xs">535 5.7.8 BadCredentials</code> by Gmail SMTP.
                  </li>
                  <li>
                    <strong>Supabase Custom SMTP:</strong> Ensure your Supabase Dashboard &gt; Authentication &gt; Email Templates uses <code className="font-mono text-xs">{"{{ .Token }}"}</code> so real 6-digit OTP codes are delivered.
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Collapsible SMTP Protocol Logs */}
      <div className="border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden bg-zinc-950 text-zinc-200">
        <button
          type="button"
          onClick={() => setShowLogs(!showLogs)}
          className="w-full px-4 py-3 flex items-center justify-between text-left bg-zinc-900 hover:bg-zinc-800/80 transition cursor-pointer border-b border-zinc-800"
        >
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-mono font-bold text-zinc-100">
              Raw SMTP Protocol &amp; Socket Logs
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
                className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
              >
                {copiedLogs ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{copiedLogs ? 'Copied' : 'Copy Logs'}</span>
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
                No logs recorded yet. Click "Send Test Email" or "Verify Handshake" to stream live connection events.
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
                      {log.type}
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
