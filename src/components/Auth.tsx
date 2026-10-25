/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { motion } from 'motion/react';
import { Phone, Lock, User, Mail, MapPin, Sparkles, Building2, Globe, ShieldCheck, ShoppingBag, Bike, Building, RotateCcw } from 'lucide-react';
import { Address } from '../types';
import NuvvoLogo from './NuvvoLogo';
import { translations } from '../utils/translations';

export default function Auth() {
  const { loginWithPhone, verifyOtpAndLogin, completeUserProfile, user, setCurrentPage, language, setLanguage, otpCode } = useApp();

  const t = translations[language] || translations.en;

  const [phoneNumber, setPhoneNumber] = useState('');
  const [roleOption, setRoleOption] = useState(() => {
    try {
      const saved = localStorage.getItem('nuvvo_auth_role');
      if (saved) return saved;
    } catch {}
    return 'Customer';
  });
  const [step, setStep] = useState<'phone' | 'otp' | 'profile'>('phone');
  const [otpValue, setOtpValue] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [resendTimer, setResendTimer] = useState(30);
  const [smsDetected, setSmsDetected] = useState(false);
  const [gatewayNotice, setGatewayNotice] = useState<string>('');
  const [sessionPin, setSessionPin] = useState<string>('');
  const [smsConfigured, setSmsConfigured] = useState<boolean>(true);
  const [isDevTesting, setIsDevTesting] = useState<boolean>(false);
  const [devOtp, setDevOtp] = useState<string>('');

  const handleSelectRole = (newRole: string) => {
    setRoleOption(newRole);
    try {
      localStorage.setItem('nuvvo_auth_role', newRole);
    } catch {}
    setErrorMsg('');
  };

  // Profile data
  const [fullName, setFullName] = useState('');
  const [emailAddress, setEmailAddress] = useState('');
  const [flatNo, setFlatNo] = useState('');
  const [area, setArea] = useState('');
  const [landmark, setLandmark] = useState('');
  const [city, setCity] = useState('Chirala');

  // Timer countdown
  useEffect(() => {
    if (step !== 'otp' || resendTimer <= 0) return;
    const interval = setInterval(() => {
      setResendTimer(prev => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [step, resendTimer]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setGatewayNotice('');
    
    // Simple validation
    if (!phoneNumber || phoneNumber.length < 10) {
      setErrorMsg('Please supply a valid 10-digit mobile number.');
      return;
    }

    const res = await loginWithPhone(phoneNumber, roleOption);
    if (res.success) {
      setStep('otp');
      setResendTimer(30);
      setIsDevTesting(Boolean(res.isDevTesting));
      if (res.devOtp) {
        setDevOtp(res.devOtp);
        setSessionPin(res.devOtp);
      } else if (res.sessionOtp) {
        setDevOtp(res.sessionOtp);
        setSessionPin(res.sessionOtp);
      } else {
        setDevOtp('');
        setSessionPin('');
      }
      if (res.setupNotice) {
        setGatewayNotice(res.setupNotice);
      }
      setSmsConfigured(res.smsConfigured !== false);
    } else {
      setErrorMsg(res.error || 'Failed to transmit OTP. Please try again.');
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const codeToVerify = (otpValue.trim() || '').trim();
    if (codeToVerify.length < 4 || codeToVerify.length > 6) {
      setErrorMsg('The authentication verification code must contain 6 digits (or 4-digit security PIN).');
      return;
    }

    const result = await verifyOtpAndLogin(phoneNumber, codeToVerify, roleOption);
    if (result.success) {
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      const isMasterAdmin = cleanPhone === '9063692135' && result.isAuthorizedAdmin;

      // If server verified as Admin / Super Admin (with verified OTP/PIN), open Admin Dashboard!
      if (isMasterAdmin || result.isAuthorizedAdmin) {
        setCurrentPage('admin');
        return;
      }

      // Check if profile is complete for normal customers
      const stored = localStorage.getItem(`nuvvo_registered_${cleanPhone}`);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed.isProfileComplete) {
            if (roleOption === 'Delivery Partner') {
              setCurrentPage('partner');
            } else if (roleOption === 'Franchise') {
              setCurrentPage('franchise');
            } else {
              setCurrentPage('home');
            }
            return;
          }
        } catch {}
      }
      setStep('profile');
    } else {
      setErrorMsg(result.error || 'The verification OTP code is incorrect. Please check the code and try again.');
    }
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!fullName.trim() || !emailAddress.trim() || !flatNo.trim() || !area.trim()) {
      setErrorMsg('Complete all requested demographics and address markers to locate packages.');
      return;
    }

    const homeAddress: Address = {
      id: `addr_${Date.now()}`,
      type: 'Home',
      flatNo,
      area,
      landmark,
      city,
      gpsCoordinates: { lat: 17.4483 + (Math.random() - 0.5) * 0.01, lng: 78.3741 + (Math.random() - 0.5) * 0.01 }
    };

    const cleanPhone = (phoneNumber || user?.phone || '').replace(/\D/g, '');
    completeUserProfile(fullName, emailAddress, homeAddress, language, cleanPhone);
    setCurrentPage('home');
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-zinc-950 p-4 transition-colors duration-300">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-2xl shadow-xl overflow-hidden">
        
        {/* Banner with Logo branding */}
        <div className="bg-gradient-to-b from-[#FAF8F5] to-white dark:from-zinc-900 dark:to-zinc-950 p-6 text-center relative border-b dark:border-zinc-800">
          <div className="absolute top-4 right-4 text-zinc-300 dark:text-zinc-700 text-3xl opacity-30 select-none">✨</div>
          <NuvvoLogo size="md" showText={true} animate={false} />
          <p className="text-[9px] font-bold font-mono tracking-widest text-zinc-400 uppercase mt-2">{t.secureGateway}</p>
        </div>

        {/* Global Language Selector Bar at Registration & Login */}
        <div className="flex items-center justify-between px-5 py-2.5 bg-slate-50 dark:bg-zinc-850/80 border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
            <Globe className="w-3.5 h-3.5 text-orange-500" />
            <span className="text-[10px] font-black uppercase tracking-wider font-mono">Language / భాష:</span>
          </div>
          <div className="flex items-center gap-1">
            {[
              { id: 'en', label: 'English', flag: '🇬🇧' },
              { id: 'te', label: 'తెలుగు', flag: '🇮🇳' },
              { id: 'hi', label: 'हिंदी', flag: '🇮🇳' }
            ].map(l => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLanguage(l.id as any)}
                className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  language === l.id
                    ? 'bg-orange-500 text-white shadow-xs'
                    : 'bg-white dark:bg-zinc-800 text-zinc-650 dark:text-zinc-350 hover:bg-slate-200 dark:hover:bg-zinc-700 border border-slate-200 dark:border-zinc-700'
                }`}
              >
                {l.flag} {l.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {errorMsg && (
            <div className="mb-4 bg-rose-50 dark:bg-rose-950/25 border border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 text-xs p-3.5 rounded-xl font-medium flex flex-col gap-2">
              <div className="flex items-start gap-2">
                <span className="text-sm">⚠️</span>
                <span className="flex-1 leading-relaxed">{errorMsg}</span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-rose-200/60 dark:border-rose-900/40">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg('');
                    if (step === 'otp') setOtpValue('');
                  }}
                  className="text-[11px] font-black text-rose-700 dark:text-rose-300 hover:underline uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" /> Retry
                </button>
                {roleOption === 'Admin' && (
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMsg('');
                      handleSelectRole('Customer');
                      setStep('phone');
                    }}
                    className="text-[10.5px] font-bold text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:underline cursor-pointer"
                  >
                    Switch to Customer Login
                  </button>
                )}
              </div>
            </div>
          )}

          {step === 'phone' && (
            <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
              <div className="text-center mb-6">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Welcome to Nuvvo</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Enter your mobile number to instantly sign up or login with high secure OTP validation.</p>
              </div>

              <form onSubmit={handleSendOtp} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Mobile Number</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 font-bold font-mono text-sm">+91</span>
                    <input 
                      type="tel"
                      maxLength={10}
                      pattern="[0-9]{10}"
                      placeholder="Enter 10 digit number"
                      value={phoneNumber}
                      onChange={e => setPhoneNumber(e.target.value.replace(/[^0-9]/g, ''))}
                      className="w-full bg-slate-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 pl-14 pr-4 py-3 rounded-xl border border-slate-200 dark:border-zinc-700 focus:outline-none focus:border-orange-500 text-base font-bold tracking-widest font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                    <span>{t.chooseRole}</span>
                    {roleOption === 'Admin' && (
                      <span className="text-[10px] text-rose-600 dark:text-rose-400 font-extrabold flex items-center gap-1 font-mono">
                        <ShieldCheck className="w-3 h-3" /> ADMIN PORTAL
                      </span>
                    )}
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleSelectRole('Customer')}
                      className={`p-2.5 text-left rounded-xl border transition-all cursor-pointer flex items-center gap-2.5 ${
                        roleOption === 'Customer'
                          ? 'bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-500/15'
                          : 'bg-slate-50 dark:bg-zinc-800 text-zinc-650 dark:text-zinc-350 border-slate-200 dark:border-zinc-700 hover:bg-slate-100'
                      }`}
                    >
                      <ShoppingBag className="w-4 h-4 shrink-0" />
                      <div>
                        <div className="text-xs font-bold">{t.customer}</div>
                        <div className={`text-[9.5px] ${roleOption === 'Customer' ? 'text-white/80' : 'text-zinc-400'}`}>Order Biryani & Food</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectRole('Admin')}
                      className={`p-2.5 text-left rounded-xl border transition-all cursor-pointer flex items-center gap-2.5 ${
                        roleOption === 'Admin'
                          ? 'bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-600/20'
                          : 'bg-slate-50 dark:bg-zinc-800 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/50 hover:bg-rose-50/50'
                      }`}
                    >
                      <ShieldCheck className="w-4 h-4 shrink-0 text-rose-500" />
                      <div>
                        <div className="text-xs font-bold">Admin Login</div>
                        <div className={`text-[9.5px] ${roleOption === 'Admin' ? 'text-white/80' : 'text-zinc-400'}`}>Manager & Operations</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectRole('Delivery Partner')}
                      className={`p-2.5 text-left rounded-xl border transition-all cursor-pointer flex items-center gap-2.5 ${
                        roleOption === 'Delivery Partner'
                          ? 'bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-500/15'
                          : 'bg-slate-50 dark:bg-zinc-800 text-zinc-650 dark:text-zinc-350 border-slate-200 dark:border-zinc-700 hover:bg-slate-100'
                      }`}
                    >
                      <Bike className="w-4 h-4 shrink-0" />
                      <div>
                        <div className="text-xs font-bold">{t.deliveryPartner}</div>
                        <div className={`text-[9.5px] ${roleOption === 'Delivery Partner' ? 'text-white/80' : 'text-zinc-400'}`}>Rider Deliveries</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectRole('Franchise')}
                      className={`p-2.5 text-left rounded-xl border transition-all cursor-pointer flex items-center gap-2.5 ${
                        roleOption === 'Franchise'
                          ? 'bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-500/15'
                          : 'bg-slate-50 dark:bg-zinc-800 text-zinc-650 dark:text-zinc-350 border-slate-200 dark:border-zinc-700 hover:bg-slate-100'
                      }`}
                    >
                      <Building className="w-4 h-4 shrink-0" />
                      <div>
                        <div className="text-xs font-bold">{t.franchise}</div>
                        <div className={`text-[9.5px] ${roleOption === 'Franchise' ? 'text-white/80' : 'text-zinc-400'}`}>Cloud Kitchen Partner</div>
                      </div>
                    </button>
                  </div>
                </div>

                {roleOption === 'Admin' && (
                  <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200/80 dark:border-rose-900/40 p-3 rounded-xl flex items-start gap-2.5 text-xs text-rose-800 dark:text-rose-200">
                    <ShieldCheck className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-extrabold text-[11px] uppercase tracking-wide text-rose-700 dark:text-rose-300">
                        Administrator Access Gateway
                      </p>
                      <p className="text-[10px] text-zinc-600 dark:text-zinc-400 mt-0.5 leading-snug">
                        Configured for authorized administrator (<span className="font-mono font-bold text-rose-700 dark:text-rose-300">+91 9063692135</span>). Server-side single-use OTP verification required.
                      </p>
                    </div>
                  </div>
                )}

                <button 
                  type="submit"
                  className={`w-full text-white py-3.5 rounded-xl font-bold transition-all shadow-lg flex items-center justify-center gap-2 mt-4 active:scale-98 cursor-pointer ${
                    roleOption === 'Admin'
                      ? 'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 shadow-rose-600/15'
                      : 'bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 shadow-orange-500/10'
                  }`}
                >
                  <Phone className="w-5 h-5" />
                  {roleOption === 'Admin' ? 'Request Admin Security OTP' : t.getOtp}
                </button>

              </form>
            </motion.div>
          )}

          {step === 'otp' && (
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
              <div className="text-center mb-5">
                <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider mb-2 font-mono border ${
                  roleOption === 'Admin'
                    ? 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/40 dark:border-rose-900/40'
                    : 'bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-950/40 dark:border-orange-900/40'
                }`}>
                  {roleOption === 'Admin' ? '🛡️ Administrator Verification' : '🔐 OTP Verification'}
                </div>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Enter Verification Code</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Please enter the 6-digit verification code for <span className="font-bold text-zinc-800 dark:text-zinc-200 font-mono">+91 {phoneNumber}</span>.
                </p>
              </div>

              {/* Instant Verification Code Card (Clean, production-grade presentation) */}
              {(devOtp || sessionPin) && (
                <div className="mb-4 bg-orange-50/80 dark:bg-zinc-800/80 border border-orange-200/70 dark:border-zinc-700 p-3.5 rounded-2xl text-left space-y-2 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-zinc-900 dark:text-zinc-100 text-xs">
                      <ShieldCheck className="w-4 h-4 text-orange-500" />
                      <span>Security Verification Code</span>
                    </div>
                    <span className="text-[10px] bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded-full font-mono font-bold">Valid 5m</span>
                  </div>
                  <p className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
                    Use your official one-time security code to verify and sign in:
                  </p>
                  <div className="flex items-center justify-between pt-1 border-t border-orange-100 dark:border-zinc-700">
                    <span className="font-mono font-black text-xl text-zinc-900 dark:text-zinc-50 tracking-widest bg-white dark:bg-zinc-900 px-3 py-1 rounded-xl border border-slate-200 dark:border-zinc-700 shadow-xs">
                      {devOtp || sessionPin}
                    </span>
                    <button
                      type="button"
                      onClick={() => setOtpValue(devOtp || sessionPin)}
                      className="text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 px-3.5 py-1.5 rounded-xl cursor-pointer transition shadow-xs flex items-center gap-1 font-sans active:scale-95"
                      title="Tap to auto-fill verification code"
                    >
                      Auto-fill Code
                    </button>
                  </div>
                </div>
              )}

              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Verification Pass Code</label>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 w-5 h-5" />
                    <input 
                      type="text" 
                      maxLength={6}
                      pattern="[0-9]{4,6}"
                      placeholder="Enter 6-digit OTP"
                      value={otpValue}
                      onChange={e => setOtpValue(e.target.value.replace(/[^0-9]/g, ''))}
                      className="w-full bg-slate-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 pl-11 pr-4 py-3 rounded-xl border border-slate-200 dark:border-zinc-700 focus:outline-none focus:border-orange-500 text-center text-xl font-extrabold tracking-widest font-mono"
                    />
                  </div>
                </div>

                <button 
                  type="submit"
                  className={`w-full text-white py-3.5 rounded-xl font-bold transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-98 ${
                    roleOption === 'Admin'
                      ? 'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 shadow-rose-600/20'
                      : 'bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 shadow-orange-500/10'
                  }`}
                >
                  <ShieldCheck className="w-5 h-5" />
                  {roleOption === 'Admin' ? 'Verify & Access Admin Dashboard' : 'Verify One-Time Passcode'}
                </button>
              </form>

              <div className="flex items-center justify-between mt-6 text-xs text-zinc-500 dark:text-zinc-400">
                <button 
                  type="button" 
                  onClick={() => setStep('phone')}
                  className="text-orange-500 hover:underline font-bold cursor-pointer"
                >
                  Edit phone cell
                </button>
                <span>
                  {resendTimer > 0 ? (
                    `Request new OTP in ${resendTimer}s`
                  ) : (
                    <button 
                      type="button" 
                      onClick={() => { loginWithPhone(phoneNumber, roleOption); setResendTimer(30); }}
                      className="text-orange-500 hover:underline font-bold cursor-pointer"
                    >
                      Resend SMS OTP
                    </button>
                  )}
                </span>
              </div>
            </motion.div>
          )}

          {step === 'profile' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div className="text-center mb-6">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">{t.createProfile}</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{t.profileSubtitle}</p>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-4">
                {/* Language Choice Tile in Profile Registration */}
                <div className="bg-orange-50/70 dark:bg-orange-950/30 border border-orange-200/80 dark:border-orange-900/40 p-3 rounded-2xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-orange-800 dark:text-orange-300 uppercase tracking-wider flex items-center gap-1">
                      <Globe className="w-3.5 h-3.5 text-orange-500" /> {t.selectLanguage}
                    </label>
                    <span className="text-[9px] bg-orange-200 dark:bg-orange-900/60 text-orange-900 dark:text-orange-200 px-1.5 py-0.2 rounded font-bold">
                      {language === 'te' ? 'తెలుగు' : language === 'hi' ? 'हिंदी' : 'English'}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-1.5 pt-1">
                    {[
                      { id: 'te', label: 'తెలుగు', sub: 'Telugu', badge: 'ఆంధ్రప్రదేశ్' },
                      { id: 'en', label: 'English', sub: 'Global', badge: 'Standard' },
                      { id: 'hi', label: 'हिंदी', sub: 'Hindi', badge: 'भारतीय' }
                    ].map(l => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => setLanguage(l.id as any)}
                        className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                          language === l.id
                            ? 'bg-white dark:bg-zinc-800 border-orange-500 text-orange-600 dark:text-orange-400 shadow-sm ring-2 ring-orange-500/20 font-black'
                            : 'bg-white/60 dark:bg-zinc-900/60 border-slate-200 dark:border-zinc-800 text-zinc-650 dark:text-zinc-400 font-bold hover:border-slate-300'
                        }`}
                      >
                        <span className="block text-xs font-black">{l.label}</span>
                        <span className="block text-[8.5px] opacity-75">{l.sub}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Visible Registered Phone for transparency */}
                <div className="bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 p-2.5 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-orange-500" />
                    <div>
                      <p className="text-[9.5px] font-bold text-zinc-400 uppercase tracking-wider">Account Mobile (ఖాతా మొబైల్)</p>
                      <p className="text-xs font-mono font-bold text-zinc-800 dark:text-zinc-200">+91 {(phoneNumber || user?.phone || '').replace(/\D/g, '') || 'Registered'}</p>
                    </div>
                  </div>
                  <span className="text-[9px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-bold px-2 py-0.5 rounded-md">
                    Active Login
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">{t.fullName}</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 w-5 h-5" />
                    <input 
                      type="text"
                      placeholder={t.fullNamePlaceholder}
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 pl-11 pr-4 py-3 rounded-xl border border-slate-200 dark:border-zinc-700 focus:outline-none focus:border-orange-500 text-sm font-semibold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">{t.emailAddress}</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 w-5 h-5" />
                    <input 
                      type="email"
                      placeholder={t.emailPlaceholder}
                      value={emailAddress}
                      onChange={e => setEmailAddress(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 pl-11 pr-4 py-3 rounded-xl border border-slate-200 dark:border-zinc-700 focus:outline-none focus:border-orange-500 text-sm font-semibold"
                    />
                  </div>
                </div>

                {/* Address Group */}
                <div className="border-t border-slate-100 dark:border-zinc-800 pt-4 mt-2">
                  <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-2 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-orange-500" /> {t.primaryDeliverySetup}
                  </p>
                  
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-0.5">{t.flatNo}</label>
                      <input 
                        type="text" 
                        placeholder="Penthouse 4B" 
                        value={flatNo}
                        onChange={e => setFlatNo(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 focus:outline-none focus:border-orange-500 text-xs font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-0.5">{t.landmark}</label>
                      <input 
                        type="text" 
                        placeholder="Near Clock Tower" 
                        value={landmark}
                        onChange={e => setLandmark(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 focus:outline-none focus:border-orange-500 text-xs font-semibold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-0.5">{t.areaStreet}</label>
                    <input 
                      type="text" 
                      placeholder="Chirala Main Road" 
                      value={area}
                      onChange={e => setArea(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 focus:outline-none focus:border-orange-500 text-xs font-semibold"
                    />
                  </div>

                  <div className="mt-2 text-xs">
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-0.5">{t.city}</label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 w-4 h-4" />
                      <select 
                        value={city}
                        onChange={e => setCity(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 pl-10 pr-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 focus:outline-none focus:border-orange-500 font-bold"
                      >
                        <option value="Chirala">Chirala</option>
                        <option value="Bapatla">Bapatla</option>
                        <option value="Ongole">Ongole</option>
                        <option value="Guntur">Guntur</option>
                        <option value="Vijayawada">Vijayawada</option>
                        <option value="Hyderabad">Hyderabad</option>
                      </select>
                    </div>
                  </div>
                </div>

                <button 
                  type="submit"
                  className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white py-3 rounded-xl font-bold transition-all shadow-lg cursor-pointer active:scale-98 mt-4"
                >
                  {t.saveAndStart}
                </button>
              </form>
            </motion.div>
          )}

        </div>
      </div>
    </div>
  );
}
