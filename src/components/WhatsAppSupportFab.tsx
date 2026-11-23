/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { buildWhatsAppClickToChatUrl } from '../utils/whatsappClickToChat';

const SUPPORT_WHATSAPP_NUMBER = '919063692135';

export default function WhatsAppSupportFab() {
  const { user, language, addAuditLog } = useApp();

  const label = useMemo(() => {
    if (language === 'te') return 'కస్టమర్ సపోర్ట్ (WhatsApp)';
    if (language === 'hi') return 'कस्टमर सपोर्ट (WhatsApp)';
    return 'Chat with Support';
  }, [language]);

  const presetMessage = useMemo(() => {
    if (user?.name) {
      return `Hello Nuvvo Customer Support Team! My name is ${user.name} and I need help with my order or inquiry.`;
    }
    return 'Hello Nuvvo Customer Support Team! I need help with an order or inquiry.';
  }, [user?.name]);

  const whatsappUrl = useMemo(
    () => buildWhatsAppClickToChatUrl(SUPPORT_WHATSAPP_NUMBER, presetMessage),
    [presetMessage]
  );

  const handleSupportClick = () => {
    addAuditLog(
      'WhatsApp Support Triggered',
      `Opened WhatsApp support conversation to +${SUPPORT_WHATSAPP_NUMBER}`
    );
  };

  return (
    <div className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-[200] pointer-events-auto">
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleSupportClick}
        aria-label={label}
        title={label}
        id="whatsapp-support-fab"
        data-testid="whatsapp-support-fab"
        className="group relative flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] hover:bg-[#1EBE5D] dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/20 ring-1 ring-black/5 dark:ring-white/15 transition-transform duration-150 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950 cursor-pointer"
      >
        {/* Official WhatsApp glyph */}
        <svg
          viewBox="0 0 32 32"
          fill="currentColor"
          aria-hidden="true"
          className="h-7 w-7"
        >
          <path d="M16.004 3.2c-7.06 0-12.8 5.74-12.8 12.8 0 2.256.59 4.458 1.71 6.398L3.1 29.02l6.794-1.78a12.74 12.74 0 0 0 6.11 1.56h.005c7.058 0 12.798-5.74 12.798-12.8 0-3.42-1.332-6.634-3.75-9.052A12.72 12.72 0 0 0 16.004 3.2Zm0 23.43h-.004a10.6 10.6 0 0 1-5.404-1.48l-.388-.23-4.032 1.057 1.076-3.93-.252-.402a10.58 10.58 0 0 1-1.624-5.645c0-5.86 4.768-10.628 10.632-10.628 2.838 0 5.506 1.106 7.512 3.114a10.56 10.56 0 0 1 3.112 7.516c0 5.862-4.768 10.628-10.628 10.628Zm5.83-7.96c-.32-.16-1.89-.934-2.184-1.04-.292-.106-.506-.16-.72.16-.214.32-.826 1.04-1.012 1.254-.186.214-.372.24-.692.08-.32-.16-1.35-.498-2.572-1.588-.95-.848-1.592-1.894-1.778-2.214-.186-.32-.02-.492.14-.652.144-.144.32-.372.48-.56.16-.186.214-.32.32-.534.106-.214.054-.4-.026-.56-.08-.16-.72-1.734-.986-2.374-.26-.624-.524-.54-.72-.55h-.614c-.214 0-.56.08-.854.4-.294.32-1.12 1.094-1.12 2.668s1.146 3.094 1.306 3.308c.16.214 2.256 3.444 5.464 4.828.764.33 1.36.528 1.824.676.766.244 1.464.21 2.016.128.616-.092 1.89-.774 2.156-1.52.266-.746.266-1.386.186-1.52-.08-.134-.294-.214-.614-.374Z" />
        </svg>

        {/* Desktop hover/focus label */}
        <span className="hidden md:block absolute right-16 bg-zinc-900 dark:bg-zinc-800 text-white text-xs font-semibold px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-150 whitespace-nowrap pointer-events-none shadow-md border border-white/10">
          {label}
        </span>
      </a>
    </div>
  );
}
