import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  ShieldCheck, 
  Lock, 
  Mail, 
  AlertCircle, 
  UserCheck, 
  Warehouse, 
  Activity, 
  Boxes 
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { UserRole } from '@/types/inventory';

export const LoginView: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, switchDemoRole, isDemoMode, dataMode, setDataMode, isAuthenticated } = useAuth();

  const [email, setEmail] = useState('admin@stjude.org');
  const [password, setPassword] = useState('••••••••••••');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If already authenticated, redirect
  React.useEffect(() => {
    if (isAuthenticated) {
      const from = (location.state as any)?.from?.pathname || '/';
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, location]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    const res = await login(email, password);
    setIsSubmitting(false);

    if (!res.success) {
      setErrorMessage(res.error || 'Unable to sign in. Please verify your credentials and try again.');
    } else {
      const from = (location.state as any)?.from?.pathname || '/';
      navigate(from, { replace: true });
    }
  };

  const handleDemoSwitch = (role: UserRole, demoEmail: string) => {
    setEmail(demoEmail);
    switchDemoRole(role);
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Logo */}
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-700 via-cyan-600 to-teal-500 text-white font-black text-xl shadow-md tracking-wider mb-3">
          M
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          MED<span className="text-cyan-600">i</span>TRACK
        </h1>
        <p className="mt-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Smart Medical Inventory, Expiry &amp; Waste-Prevention System
        </p>

        {/* MODE SELECTOR TOGGLE */}
        <div className="mt-4 inline-flex items-center p-1 rounded-xl bg-slate-200/80 border border-slate-300" role="group" aria-label="System data mode">
          <button
            type="button"
            onClick={() => { setDataMode('SUPABASE'); setErrorMessage(null); }}
            aria-pressed={dataMode === 'SUPABASE'}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
              dataMode === 'SUPABASE'
                ? 'bg-cyan-700 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Supabase Connected Mode
          </button>
          <button
            type="button"
            onClick={() => { setDataMode('DEMO'); setErrorMessage(null); }}
            aria-pressed={dataMode === 'DEMO'}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
              dataMode === 'DEMO'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Local Demo Mode
          </button>
        </div>

        <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[11px] text-slate-600 font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-cyan-600" aria-hidden="true" />
          <span>
            {dataMode === 'SUPABASE' 
              ? 'Authoritative PostgreSQL & Supabase Auth' 
              : 'Isolated Local-First Simulation (Offline)'}
          </span>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-xl border border-slate-200/90 rounded-2xl sm:px-10">
          {dataMode === 'SUPABASE' && (
            <div className="mb-4 p-2.5 rounded-xl bg-cyan-50 border border-cyan-200 text-[11px] text-cyan-900" role="status">
              <span className="font-bold block mb-0.5">Authoritative Supabase Mode Active</span>
              Credentials are authenticated directly against Supabase Auth (qvijaswdtchcqhovixix.supabase.co). Manual Supabase Auth user provisioning is required if no test account has been created.
            </div>
          )}
          {errorMessage && (
            <div 
              id="login-error-message"
              role="alert" 
              className="mb-5 p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-xs text-rose-800 font-medium"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate={false}>
            <div>
              <label htmlFor="login-email" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Clinical Staff Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="name@hospital.org"
                  aria-invalid={Boolean(errorMessage)}
                  aria-describedby={errorMessage ? 'login-error-message' : undefined}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="••••••••••••"
                  aria-invalid={Boolean(errorMessage)}
                  aria-describedby={errorMessage ? 'login-error-message' : undefined}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                aria-busy={isSubmitting}
                className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-xl shadow-xs text-xs font-bold text-white bg-cyan-700 hover:bg-cyan-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {isSubmitting ? 'Verifying Hospital Credentials...' : 'Sign In to MediTrack'}
              </button>
            </div>
          </form>

          {/* DEVELOPMENT DEMO SWITCHER */}
          {isDemoMode && (
            <div className="mt-8 pt-6 border-t border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  Development Demo Mode Only
                </span>
                <span className="text-[10px] text-slate-400">One-click role tester</span>
              </div>
              <p className="text-[11px] text-slate-500 mb-3">
                Switch between active roles to test RBAC and location isolation boundaries:
              </p>

              <div className="space-y-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => handleDemoSwitch('ADMIN', 'admin@stjude.org')}
                  className="w-full flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-3.5 h-3.5 text-cyan-600" />
                    <div>
                      <span className="font-bold text-slate-800">Dr. Arthur Vance</span>
                      <span className="text-[10px] text-slate-500 block">Chief Hospital Pharmacist</span>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-[10px] text-cyan-800 bg-cyan-100 px-1.5 py-0.5 rounded">
                    ADMIN
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDemoSwitch('INVENTORY_MANAGER', 'manager@stjude.org')}
                  className="w-full flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <Boxes className="w-3.5 h-3.5 text-teal-600" />
                    <div>
                      <span className="font-bold text-slate-800">Sarah Jenkins</span>
                      <span className="text-[10px] text-slate-500 block">Supply Chain Lead</span>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-[10px] text-teal-800 bg-teal-100 px-1.5 py-0.5 rounded">
                    INVENTORY_MGR
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDemoSwitch('STOREKEEPER', 'storekeeper@stjude.org')}
                  className="w-full flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <Warehouse className="w-3.5 h-3.5 text-blue-600" />
                    <div>
                      <span className="font-bold text-slate-800">James Sterling</span>
                      <span className="text-[10px] text-slate-500 block">Central Stores Specialist</span>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-[10px] text-blue-800 bg-blue-100 px-1.5 py-0.5 rounded">
                    STOREKEEPER
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDemoSwitch('DEPARTMENT_USER', 'icu.nurse@stjude.org')}
                  className="w-full flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 text-purple-600" />
                    <div>
                      <span className="font-bold text-slate-800">Dr. Elena Rostova</span>
                      <span className="text-[10px] text-slate-500 block">ICU Clinical Lead (Locked to ICU)</span>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-[10px] text-purple-800 bg-purple-100 px-1.5 py-0.5 rounded">
                    DEPT_USER (ICU)
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
