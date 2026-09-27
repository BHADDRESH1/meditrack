import React, { useState, useRef, useEffect } from 'react';
import { 
  Barcode, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  Camera, 
  XCircle, 
  Package, 
  RefreshCw,
  ScanLine,
} from 'lucide-react';
import { 
  IdentifierResolutionResult, 
  Product, 
  ProductVariant 
} from '@/types/inventory';
import { productIdentifierService } from '@/services/productIdentifierService';
import { getDataMode } from '@/services/supabaseClient';
import { BarcodeScannerModal } from '@/components/common/BarcodeScannerModal';

interface ProductScanInputProps {
  onProductResolved: (result: IdentifierResolutionResult) => void;
  selectedProduct?: Product | null;
  selectedVariant?: ProductVariant | null;
  onClear?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export const ProductScanInput: React.FC<ProductScanInputProps> = ({
  onProductResolved,
  selectedProduct,
  selectedVariant,
  onClear,
  placeholder = 'Scan barcode / QR or enter SKU, supplier code...',
  autoFocus = false,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isSyntheticDemo, setIsSyntheticDemo] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const handleResolve = async (codeToResolve?: string) => {
    const raw = codeToResolve !== undefined ? codeToResolve : inputValue;
    if (!raw.trim()) {
      setErrorMsg('Please enter or scan a barcode, SKU, or product code.');
      return;
    }

    setIsResolving(true);
    setErrorMsg(null);

    let result: IdentifierResolutionResult;
    if (getDataMode() === 'SUPABASE') {
      result = await productIdentifierService.resolveIdentifierRemote(raw);
    } else {
      result = productIdentifierService.resolveIdentifier(raw);
    }
    setIsResolving(false);

    if (result.success) {
      setIsSyntheticDemo(!!result.isSyntheticDemo);
      onProductResolved(result);
      setErrorMsg(null);
    } else {
      setErrorMsg(result.error || 'Unknown identifier.');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleResolve();
    }
  };

  const handleClearSelection = () => {
    setInputValue('');
    setIsSyntheticDemo(false);
    setErrorMsg(null);
    if (onClear) onClear();
    if (inputRef.current) inputRef.current.focus();
  };

  // Called by BarcodeScannerModal when a valid product is resolved
  const handleScanResolved = (result: IdentifierResolutionResult) => {
    // Modal closes itself after calling this; we just forward to parent
    setIsSyntheticDemo(!!result.isSyntheticDemo);
    onProductResolved(result);
    setErrorMsg(null);
    setIsScannerOpen(false);
  };

  return (
    <div className="space-y-3">
      {/* Search / Scan Input Bar */}
      <div className="relative flex items-center">
        <div className="absolute left-3.5 text-slate-400 pointer-events-none flex items-center gap-1.5">
          <Barcode className="w-4 h-4 text-cyan-700" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={e => {
            setInputValue(e.target.value);
            if (errorMsg) setErrorMsg(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full pl-10 pr-36 py-2.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-600/20 focus:border-cyan-600 shadow-2xs transition-all"
        />

        <div className="absolute right-1.5 flex items-center gap-1">
          {/* Text Lookup Button */}
          <button
            type="button"
            onClick={() => handleResolve()}
            disabled={isResolving || !inputValue.trim()}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-700 hover:bg-cyan-800 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center gap-1"
          >
            {isResolving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            <span>Lookup</span>
          </button>
          
          {/* Camera Scanner Trigger */}
          <button
            type="button"
            onClick={() => setIsScannerOpen(true)}
            title="Open Camera Barcode / QR Scanner"
            aria-label="Open barcode scanner"
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-cyan-800 hover:bg-cyan-50 border border-slate-200 hover:border-cyan-300 transition-colors cursor-pointer"
          >
            <ScanLine className="w-3.5 h-3.5" />
            <span>Scan</span>
          </button>

          {/* Legacy camera icon for existing layout compatibility */}
          <button
            type="button"
            onClick={() => setIsScannerOpen(true)}
            title="Scan with Device Camera"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <Camera className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Unknown Identifier Error Alert */}
      {errorMsg && (
        <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2 animate-in fade-in duration-150">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">Identification Failed: </span>
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-rose-600">
            <XCircle className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Success Resolution Preview Card */}
      {selectedProduct && (
        <div className="p-3.5 rounded-xl bg-cyan-50/70 border border-cyan-200/80 shadow-2xs flex items-start justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-cyan-700 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-900 leading-tight">
                  {selectedProduct.name}
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.2 rounded-sm bg-emerald-100 text-emerald-800 border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  Identified
                </span>
                {isSyntheticDemo && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.2 rounded-sm bg-amber-100 text-amber-800 border border-amber-200">
                    Synthetic Demo Identifier
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-slate-600">
                <span className="font-mono font-semibold text-slate-800">
                  SKU: {selectedProduct.sku}
                </span>
                {selectedProduct.productCode && (
                  <span className="font-mono text-slate-500">
                    Source Code: {selectedProduct.productCode}
                  </span>
                )}
                <span className="text-slate-400">&bull;</span>
                <span className="font-medium text-slate-700">{selectedProduct.brand}</span>
                <span className="text-slate-400">&bull;</span>
                <span className="text-slate-700">{selectedProduct.category}</span>
                <span className="text-slate-400">&bull;</span>
                <span className="text-slate-700">UOM: {selectedProduct.uom}</span>
              </div>
              {selectedVariant && (
                <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-900 bg-cyan-100/70 px-2 py-0.5 rounded border border-cyan-200">
                  <span>Selected Variant:</span>
                  <span className="font-bold">{selectedVariant.variantName}</span>
                  {selectedVariant.size && <span className="text-cyan-700 font-normal">({selectedVariant.size})</span>}
                  {selectedVariant.capacity && <span className="text-cyan-700 font-normal">({selectedVariant.capacity})</span>}
                </div>
              )}
              {isSyntheticDemo && (
                <div className="mt-2 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-semibold">
                  ⚠ Synthetic Demo Identifier — for local/clinical testing only, not a genuine GS1/EAN supplier barcode.
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleClearSelection}
            className="text-xs text-slate-400 hover:text-slate-700 font-semibold px-2 py-1 rounded hover:bg-slate-200/50 transition-colors cursor-pointer"
          >
            Change
          </button>
        </div>
      )}

      {/* Barcode Scanner Modal — rendered only when user explicitly opens it */}
      {isScannerOpen && (
        <BarcodeScannerModal
          onResolved={handleScanResolved}
          onClose={() => setIsScannerOpen(false)}
        />
      )}
    </div>
  );
};
