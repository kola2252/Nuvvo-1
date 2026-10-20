import React, { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { ShieldAlert, AlertTriangle, CheckCircle2, X, Database, Lock, Clock, UserCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const AdminSaveWarningModal: React.FC = () => {
  const { 
    adminSaveConfirmation, 
    confirmAdminSave, 
    cancelAdminSave, 
    isSavingConfirmedAction,
    user
  } = useApp();

  // Escape key cancels save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && adminSaveConfirmation && !isSavingConfirmedAction) {
        cancelAdminSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [adminSaveConfirmation, isSavingConfirmedAction, cancelAdminSave]);

  if (!adminSaveConfirmation) return null;

  const { title, description, itemType = 'System Record' } = adminSaveConfirmation;

  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-md animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-warning-title"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 15 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md bg-white dark:bg-zinc-900 border-2 border-amber-500/80 dark:border-amber-500/70 rounded-3xl shadow-2xl shadow-amber-500/20 overflow-hidden text-zinc-900 dark:text-zinc-100"
      >
        {/* Warning Accent Banner */}
        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 p-3.5 text-white flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-black/20 rounded-xl">
              <ShieldAlert className="w-5 h-5 text-amber-100 animate-pulse" />
            </span>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider block leading-tight">
                Admin / Super Admin Warning
              </span>
              <span className="text-[9px] text-amber-100 font-medium leading-none block">
                అడ్మిన్ సెక్యూరిటీ భద్రతా హెచ్చరిక
              </span>
            </div>
          </div>
          <button
            onClick={cancelAdminSave}
            disabled={isSavingConfirmedAction}
            className="p-1 text-white/80 hover:text-white hover:bg-black/20 rounded-lg transition cursor-pointer"
            title="Cancel and review"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4">
          {/* Pulsing Warning Callout */}
          <div className="flex items-start gap-3 p-3.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800/60 rounded-2xl">
            <div className="p-2 bg-amber-500 text-white rounded-xl shrink-0 mt-0.5 shadow-sm">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="text-xs">
              <h4 id="admin-warning-title" className="font-extrabold text-amber-900 dark:text-amber-200 text-sm">
                Confirm Save Request
              </h4>
              <p className="text-[11px] text-amber-800 dark:text-amber-300/90 mt-0.5 leading-relaxed font-medium">
                మీరు లైవ్ సిస్టమ్‌లో డేటాను సేవ్ చేయబోతున్నారు. సేవ్ చేసిన వెంటనే ఇది సర్వర్‌లో మరియు కస్టమర్లకు లైవ్‌గా మారుతుంది.
              </p>
            </div>
          </div>

          {/* Details of what is being saved */}
          <div className="p-3.5 bg-slate-50 dark:bg-zinc-800/70 border border-slate-200 dark:border-zinc-700/80 rounded-2xl space-y-2">
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-mono uppercase font-black px-2 py-0.5 rounded-md bg-orange-100 dark:bg-orange-950/70 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800/50">
                {itemType}
              </span>
              <span className="text-zinc-400 dark:text-zinc-500 flex items-center gap-1 font-medium text-[9.5px]">
                <Clock className="w-3 h-3" /> Ready to commit
              </span>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-wider">
                Target Item / Setting:
              </p>
              <h5 className="text-sm font-black text-zinc-900 dark:text-white mt-0.5">
                {title}
              </h5>
              {description && (
                <p className="text-[11px] text-zinc-600 dark:text-zinc-300 mt-1 line-clamp-3 leading-relaxed">
                  {description}
                </p>
              )}
            </div>
          </div>

          {/* Critical Security Checkpoints */}
          <div className="space-y-1.5 text-[10px] text-zinc-600 dark:text-zinc-400 bg-slate-50/50 dark:bg-zinc-800/40 p-3 rounded-2xl border border-slate-100 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <Database className="w-3.5 h-3.5 text-orange-500 shrink-0" />
              <span>Direct production Supabase & Local DB synchronisation</span>
            </div>
            <div className="flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>Logged permanently into Super Admin Security Audit stream</span>
            </div>
            <div className="flex items-center gap-2">
              <UserCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <span>Operator: <strong className="text-zinc-800 dark:text-zinc-200">{user?.name || user?.phone || '9063692135'}</strong></span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center gap-2.5">
            <button
              type="button"
              onClick={cancelAdminSave}
              disabled={isSavingConfirmedAction}
              className="flex-1 py-3 px-3 rounded-2xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-750 text-zinc-700 dark:text-zinc-300 font-bold text-xs transition active:scale-95 cursor-pointer disabled:opacity-50"
            >
              ❌ Cancel (రద్దు చేయి)
            </button>

            <button
              type="button"
              onClick={confirmAdminSave}
              disabled={isSavingConfirmedAction}
              className="flex-1 py-3 px-3 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-black text-xs shadow-md shadow-orange-500/25 transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-75"
            >
              {isSavingConfirmedAction ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Saving Live...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>✓ Confirm & Save (సేవ్ చేయి)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export const AdminSaveAlertBanner: React.FC = () => {
  const { adminSaveAlert, dismissAdminSaveAlert } = useApp();

  useEffect(() => {
    if (adminSaveAlert) {
      const timer = setTimeout(() => {
        dismissAdminSaveAlert();
      }, 7000);
      return () => clearTimeout(timer);
    }
  }, [adminSaveAlert, dismissAdminSaveAlert]);

  if (!adminSaveAlert) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -60, x: '-50%' }}
        animate={{ opacity: 1, y: 0, x: '-50%' }}
        exit={{ opacity: 0, y: -60, x: '-50%' }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
        className="fixed top-3 left-1/2 z-[9990] w-[92%] max-w-md bg-gradient-to-r from-zinc-900 to-zinc-950 text-white border-2 border-amber-500/80 p-3.5 rounded-2xl shadow-2xl shadow-zinc-950/40 flex items-start gap-3"
      >
        <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl shrink-0 border border-amber-500/30">
          <ShieldAlert className="w-4 h-4 animate-bounce" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1 font-mono">
              ⚠️ Admin Warning: Saved To Live Database
            </span>
            <button
              onClick={dismissAdminSaveAlert}
              className="p-1 text-zinc-400 hover:text-white rounded hover:bg-zinc-800 transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <h5 className="text-xs font-black text-white truncate mt-0.5">
            {adminSaveAlert.itemType}: {adminSaveAlert.title}
          </h5>
          <p className="text-[10px] text-zinc-300 mt-0.5 line-clamp-1">
            {adminSaveAlert.summary}
          </p>
          <div className="mt-1.5 flex items-center justify-between text-[8.5px] text-zinc-400 font-mono">
            <span>By: {adminSaveAlert.adminName}</span>
            <span>⏱️ {adminSaveAlert.timestamp}</span>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
