import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  X,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Package,
  Barcode,
  Search,
  VideoOff,
} from 'lucide-react';
import { IdentifierResolutionResult } from '@/types/inventory';
import { productIdentifierService } from '@/services/productIdentifierService';
import { getDataMode } from '@/services/supabaseClient';

// ---------------------------------------------------------------------------
// Supported formats (library-declared; actual device decode depends on
// hardware/browser/lighting — not guaranteed in every environment):
//   QR_CODE, CODE_128, CODE_39, EAN_13, EAN_8, UPC_A, UPC_E
// ---------------------------------------------------------------------------

interface BarcodeScannerModalProps {
  /** Called when a valid identifier is resolved. The modal closes automatically. */
  onResolved: (result: IdentifierResolutionResult) => void;
  /** Called when the modal is closed without a successful scan. */
  onClose: () => void;
}

type ScannerState =
  | 'IDLE'
  | 'REQUESTING_PERMISSION'
  | 'ACTIVE'
  | 'RESOLVING'
  | 'SUCCESS'
  | 'NOT_FOUND'
  | 'CAMERA_ERROR';

interface CameraErrorInfo {
  title: string;
  detail: string;
}

function buildCameraError(err: unknown): CameraErrorInfo {
  if (!(err instanceof Error)) {
    return {
      title: 'Camera unavailable',
      detail: 'An unexpected error occurred while accessing the camera.',
    };
  }
  switch (err.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return {
        title: 'Camera access denied',
        detail:
          'Camera access was denied. You can continue by entering the SKU or supplier/catalog code manually.',
      };
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return {
        title: 'No camera detected',
        detail:
          'No camera hardware was found on this device. Please use a handheld USB barcode scanner or enter the code manually.',
      };
    case 'NotReadableError':
    case 'TrackStartError':
      return {
        title: 'Camera already in use',
        detail:
          'The camera is being used by another application. Close any other camera applications and try again.',
      };
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return {
        title: 'Camera configuration unsupported',
        detail:
          'The requested camera settings are not supported by this device. Please try manual entry.',
      };
    case 'SecurityError':
      return {
        title: 'Insecure context',
        detail:
          'Camera access requires a secure (HTTPS) context. This feature works on localhost and HTTPS-deployed environments. Please use manual entry.',
      };
    case 'TypeError':
      return {
        title: 'Browser not supported',
        detail:
          'Your browser does not support the Camera API. Please use a modern browser (Chrome, Firefox, Edge, Safari) or enter the code manually.',
      };
    default:
      return {
        title: 'Scanner initialization failed',
        detail: `Camera could not be started (${err.message || err.name}). Please enter the barcode manually.`,
      };
  }
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  onResolved,
  onClose,
}) => {
  const [scannerState, setScannerState] = useState<ScannerState>('IDLE');
  const [cameraError, setCameraError] = useState<CameraErrorInfo | null>(null);
  const [resolvedResult, setResolvedResult] = useState<IdentifierResolutionResult | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  const [isResolvingManual, setIsResolvingManual] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const readerRef = useRef<any>(null);
  const scanActiveRef = useRef(false);
  const animFrameRef = useRef<number>(0);

  // Stop all camera tracks — called on close, success, and unmount
  const stopCamera = useCallback(() => {
    scanActiveRef.current = false;
    cancelAnimationFrame(animFrameRef.current);
    if (readerRef.current) {
      try {
        readerRef.current.reset();
      } catch {
        // ignore
      }
      readerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Ensure camera is stopped when the modal unmounts
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const resolveCode = useCallback(
    async (rawCode: string) => {
      if (scannerState === 'RESOLVING' || scannerState === 'SUCCESS') return;
      setScannerState('RESOLVING');
      stopCamera();

      let result: IdentifierResolutionResult;
      const dataMode = getDataMode();

      if (dataMode === 'SUPABASE') {
        result = await productIdentifierService.resolveIdentifierRemote(rawCode);
      } else {
        result = productIdentifierService.resolveIdentifier(rawCode);
      }

      if (result.success) {
        setResolvedResult(result);
        setScannerState('SUCCESS');
        // Short pause so user sees the success state, then close + notify parent
        setTimeout(() => {
          onResolved(result);
          onClose();
        }, 1800);
      } else {
        setScannerState('NOT_FOUND');
      }
    },
    [scannerState, stopCamera, onResolved, onClose]
  );

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setManualError(null);
    setScannerState('REQUESTING_PERMISSION');

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError({
        title: 'Browser not supported',
        detail:
          'Your browser does not support the Camera API. Please enter the barcode manually.',
      });
      setScannerState('CAMERA_ERROR');
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
      });
    } catch (err) {
      setCameraError(buildCameraError(err));
      setScannerState('CAMERA_ERROR');
      return;
    }

    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      try {
        await videoRef.current.play();
      } catch (err) {
        setCameraError(buildCameraError(err));
        setScannerState('CAMERA_ERROR');
        stopCamera();
        return;
      }
    }

    // Dynamically import ZXing so it doesn't add to initial bundle if scanner is never opened
    let BrowserMultiFormatReader: any;
    try {
      const zxing = await import('@zxing/browser');
      BrowserMultiFormatReader = zxing.BrowserMultiFormatReader;
    } catch {
      setCameraError({
        title: 'Scanner library unavailable',
        detail:
          'The barcode scanning library could not be loaded. Please enter the code manually.',
      });
      setScannerState('CAMERA_ERROR');
      stopCamera();
      return;
    }

    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;
    scanActiveRef.current = true;
    setScannerState('ACTIVE');

    // Continuous decode loop via requestAnimationFrame
    const tick = async () => {
      if (!scanActiveRef.current || !videoRef.current) return;

      const video = videoRef.current;
      if (video.readyState < video.HAVE_ENOUGH_DATA) {
        animFrameRef.current = requestAnimationFrame(tick);
        return;
      }

      // Draw current video frame to an off-screen canvas for ZXing
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animFrameRef.current = requestAnimationFrame(tick);
        return;
      }
      ctx.drawImage(video, 0, 0);

      try {
        const result = await reader.decodeFromCanvas(canvas);
        if (result && scanActiveRef.current) {
          await resolveCode(result.getText());
          return; // stop the loop on decode
        }
      } catch {
        // ZXing throws NotFoundException when no code is detected — continue scanning
      }

      if (scanActiveRef.current) {
        animFrameRef.current = requestAnimationFrame(tick);
      }
    };

    animFrameRef.current = requestAnimationFrame(tick);
  }, [stopCamera, resolveCode]);

  const handleManualLookup = useCallback(async () => {
    if (!manualInput.trim()) {
      setManualError('Please enter a barcode, SKU, or product code.');
      return;
    }
    setManualError(null);
    setIsResolvingManual(true);
    await resolveCode(manualInput.trim());
    setIsResolvingManual(false);
  }, [manualInput, resolveCode]);

  const handleTryAgain = () => {
    setScannerState('IDLE');
    setCameraError(null);
    setResolvedResult(null);
    setManualInput('');
    setManualError(null);
  };

  const handleClose = useCallback(() => {
    stopCamera();
    onClose();
  }, [stopCamera, onClose]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClose]);

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      role="presentation"
    >
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby="barcode-scanner-modal-title"
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-700 text-white flex items-center justify-center shrink-0" aria-hidden="true">
              <Barcode className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 id="barcode-scanner-modal-title" className="text-sm font-bold text-slate-900">Scan Product Barcode / QR Code</h2>
              <div className="text-[10px] text-slate-400 font-medium">
                Resolves against authoritative{' '}
                {getDataMode() === 'SUPABASE' ? 'Supabase product_identifiers' : 'demo identifier registry'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close scanner dialog"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* ── IDLE STATE ─────────────────────────────────────────────────── */}
          {scannerState === 'IDLE' && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={startCamera}
                className="w-full flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed border-cyan-300 bg-cyan-50/40 hover:bg-cyan-50 hover:border-cyan-500 transition-all cursor-pointer text-cyan-800 group"
              >
                <Camera className="w-10 h-10 text-cyan-600 group-hover:scale-110 transition-transform" />
                <div className="text-sm font-bold">Start Camera</div>
                <div className="text-[11px] text-cyan-600 text-center">
                  Supports QR, Code 128, Code 39, EAN-13, EAN-8, UPC-A, UPC-E
                  <br />
                  <span className="text-amber-700 font-semibold">
                    Actual decode depends on device camera quality and lighting.
                  </span>
                </div>
              </button>
              <ManualFallback
                value={manualInput}
                onChange={setManualInput}
                onLookup={handleManualLookup}
                error={manualError}
                isLoading={isResolvingManual}
              />
            </div>
          )}

          {/* ── REQUESTING PERMISSION ──────────────────────────────────────── */}
          {scannerState === 'REQUESTING_PERMISSION' && (
            <div className="flex flex-col items-center gap-3 py-8 text-slate-600">
              <RefreshCw className="w-8 h-8 animate-spin text-cyan-600" />
              <div className="text-sm font-semibold">Requesting camera permission…</div>
              <div className="text-xs text-slate-400">
                Allow camera access when prompted by your browser.
              </div>
            </div>
          )}

          {/* ── ACTIVE SCANNING ───────────────────────────────────────────── */}
          {(scannerState === 'ACTIVE' || scannerState === 'RESOLVING') && (
            <div className="space-y-3">
              <div className="relative aspect-video bg-black rounded-xl overflow-hidden">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  playsInline
                  muted
                />
                {/* Scanning guide overlay */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-3/4 h-1/2 relative">
                    {/* Corner brackets */}
                    <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-cyan-400 rounded-tl-sm" />
                    <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-cyan-400 rounded-tr-sm" />
                    <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-cyan-400 rounded-bl-sm" />
                    <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-cyan-400 rounded-br-sm" />
                    {/* Scan line animation */}
                    <div
                      className="absolute left-0 right-0 h-0.5 bg-cyan-400/80 shadow-[0_0_8px_2px_rgba(34,211,238,0.6)]"
                      style={{ animation: 'scanline 2s linear infinite' }}
                    />
                  </div>
                </div>
                {scannerState === 'RESOLVING' && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <div className="text-white text-xs font-bold flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Resolving identifier…
                    </div>
                  </div>
                )}
                {/* Scanning indicator */}
                {scannerState === 'ACTIVE' && (
                  <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/50 px-2 py-1 rounded-md">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    <span className="text-[10px] text-white font-semibold">Scanning…</span>
                  </div>
                )}
              </div>
              <p className="text-center text-[11px] text-slate-500">
                Point the camera at a product barcode or QR label and hold steady.
              </p>
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setScannerState('IDLE');
                }}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <VideoOff className="w-3.5 h-3.5" />
                Stop Camera
              </button>
            </div>
          )}

          {/* ── SUCCESS ───────────────────────────────────────────────────── */}
          {scannerState === 'SUCCESS' && resolvedResult?.success && resolvedResult.product && (
            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-bold text-emerald-900">Product identified</div>
                  <div className="text-xs text-emerald-700 mt-0.5">
                    Resolving receiving form…
                  </div>
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-1.5 text-xs">
                <div className="flex items-center gap-2 mb-1">
                  <Package className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="font-bold text-slate-900">{resolvedResult.product.name}</span>
                </div>
                {resolvedResult.variant && (
                  <Row label="Variant" value={resolvedResult.variant.variantName} />
                )}
                <Row label="Identifier" value={resolvedResult.matchedValue || ''} mono />
                <Row
                  label="Source"
                  value={resolvedResult.product.catalogSource || resolvedResult.matchedBy || ''}
                />
                {resolvedResult.isSyntheticDemo && (
                  <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-semibold">
                    ⚠ Synthetic Demo Identifier — not a real GS1/EAN supplier barcode.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── NOT FOUND ─────────────────────────────────────────────────── */}
          {scannerState === 'NOT_FOUND' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-bold text-rose-900">Identifier not registered</div>
                  <div className="text-xs text-rose-700 mt-0.5">
                    No product found matching this barcode, QR code, or SKU in{' '}
                    {getDataMode() === 'SUPABASE' ? 'the Supabase product_identifiers table' : 'the demo identifier registry'}.
                    Products and identifiers must be registered in the Product Master before receiving.
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleTryAgain}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-cyan-700 hover:bg-cyan-800 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  Try Again
                </button>
                <ManualFallback
                  value={manualInput}
                  onChange={setManualInput}
                  onLookup={handleManualLookup}
                  error={manualError}
                  isLoading={isResolvingManual}
                />
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex items-center justify-center gap-2 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <Search className="w-3.5 h-3.5" />
                  Search Product Master manually
                </button>
              </div>
            </div>
          )}

          {/* ── CAMERA ERROR ──────────────────────────────────────────────── */}
          {scannerState === 'CAMERA_ERROR' && cameraError && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-bold text-amber-900">{cameraError.title}</div>
                  <div className="text-xs text-amber-800 mt-0.5">{cameraError.detail}</div>
                </div>
              </div>
              <ManualFallback
                value={manualInput}
                onChange={setManualInput}
                onLookup={handleManualLookup}
                error={manualError}
                isLoading={isResolvingManual}
              />
              <button
                type="button"
                onClick={handleTryAgain}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry Camera
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/70 text-[10px] text-slate-400 font-medium shrink-0">
          Camera frames are processed locally — never uploaded or stored.
        </div>
      </div>

      {/* Scanline keyframe */}
      <style>{`
        @keyframes scanline {
          0%   { top: 0%; }
          50%  { top: calc(100% - 2px); }
          100% { top: 0%; }
        }
      `}</style>
    </div>
  );
};

// ── Sub-component: Manual fallback input ────────────────────────────────────
interface ManualFallbackProps {
  value: string;
  onChange: (v: string) => void;
  onLookup: () => void;
  error: string | null;
  isLoading: boolean;
}
const ManualFallback: React.FC<ManualFallbackProps> = ({
  value, onChange, onLookup, error, isLoading,
}) => (
  <div className="space-y-1.5">
    <label htmlFor="manual-barcode-input" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
      Or enter SKU / barcode manually
    </label>
    <div className="flex gap-2">
      <input
        id="manual-barcode-input"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onLookup(); } }}
        placeholder="e.g. SCICO-EB-75, 8901234567890..."
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'manual-barcode-error' : undefined}
        className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-600/20 focus:border-cyan-600"
      />
      <button
        type="button"
        onClick={onLookup}
        disabled={isLoading || !value.trim()}
        aria-label="Lookup entered barcode or SKU"
        className="px-3 py-2 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center gap-1.5"
      >
        {isLoading ? <RefreshCw className="w-3 h-3 animate-spin" aria-hidden="true" /> : <Search className="w-3 h-3" aria-hidden="true" />}
        Lookup
      </button>
    </div>
    {error && (
      <p id="manual-barcode-error" className="text-[10px] text-rose-700 font-semibold" role="alert">{error}</p>
    )}
  </div>
);

// ── Sub-component: Detail row ───────────────────────────────────────────────
const Row: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="flex items-start gap-2 text-xs">
    <span className="text-slate-400 font-semibold w-20 shrink-0">{label}</span>
    <span className={`text-slate-800 font-medium ${mono ? 'font-mono' : ''}`}>{value}</span>
  </div>
);
