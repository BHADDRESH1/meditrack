import React, { useState, useEffect } from 'react';
import { 
  Calculator, 
  Calendar, 
  AlertTriangle, 
  Search, 
  DollarSign, 
  X,
  RefreshCw,
  Download,
  ArrowLeftRight,
  Info,
  Package
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/common/Button';
import { StatusBadge } from '@/components/common/StatusBadge';
import { expiryRiskEngine } from '@/services/expiryRiskEngine';
import { inventoryRepo } from '@/services/inventoryRepository';
import { useAuth } from '@/context/AuthContext';
import { sanitizeSupabaseError } from '@/services/supabaseClient';
import { BatchExpiryCalculation } from '@/types/riskIntelligence';
import { pdfReportService } from '@/services/pdfReportService';

type ExpiryWindowTab = 'ALL' | 'EXPIRED' | '0_30' | '31_60' | '61_PLUS';

export const ExpiryRiskView: React.FC = () => {
  const { dataMode } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTab, setSelectedTab] = useState<ExpiryWindowTab>('ALL');
  const [selectedRiskLevel, setSelectedRiskLevel] = useState<string>('ALL');
  const [selectedLocation, setSelectedLocation] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedDetailRow, setSelectedDetailRow] = useState<BatchExpiryCalculation | null>(null);
  const [, setRefreshCount] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      if (dataMode === 'SUPABASE') {
        setIsLoading(true);
        const res = await inventoryRepo.loadFromSupabase();
        if (isMounted) {
          setIsLoading(false);
          if (!res.success) setRemoteError(res.error);
          else setRemoteError(null);
          setRefreshCount(c => c + 1);
        }
      }
    };
    load();
    return () => { isMounted = false; };
  }, [dataMode]);

  // Derive risks dynamically from authoritative engine
  const calculations = expiryRiskEngine.calculateBatchExpiryRisks();
  const locations = inventoryRepo.getLocations();
  const products = inventoryRepo.getProducts();

  // Extract unique categories
  const categories = Array.from(new Set(products.map(p => p.category))).filter(Boolean);

  // Tab count aggregations
  const countExpired = calculations.filter(r => r.daysToExpiry < 0).length;
  const count0_30 = calculations.filter(r => r.daysToExpiry >= 0 && r.daysToExpiry <= 30).length;
  const count31_60 = calculations.filter(r => r.daysToExpiry >= 31 && r.daysToExpiry <= 60).length;
  const count61Plus = calculations.filter(r => r.daysToExpiry > 60).length;

  // Apply filters
  const filteredRows = calculations.filter(row => {
    // Window tab filter
    if (selectedTab === 'EXPIRED' && row.daysToExpiry >= 0) return false;
    if (selectedTab === '0_30' && (row.daysToExpiry < 0 || row.daysToExpiry > 30)) return false;
    if (selectedTab === '31_60' && (row.daysToExpiry < 31 || row.daysToExpiry > 60)) return false;
    if (selectedTab === '61_PLUS' && row.daysToExpiry <= 60) return false;

    // Dropdown filters
    if (selectedRiskLevel !== 'ALL' && row.riskLevel !== selectedRiskLevel) {
      return false;
    }
    if (selectedLocation !== 'ALL' && row.locationId !== selectedLocation) {
      return false;
    }
    if (selectedCategory !== 'ALL' && row.category !== selectedCategory) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = row.productName.toLowerCase().includes(q);
      const matchSku = row.productSku.toLowerCase().includes(q);
      const matchBatch = row.batchNumber.toLowerCase().includes(q);
      if (!matchName && !matchSku && !matchBatch) return false;
    }
    return true;
  });

  const totalAtRiskUnits = calculations
    .filter(r => r.potentialAtRiskUnits > 0)
    .reduce((sum, r) => sum + r.potentialAtRiskUnits, 0);

  const totalLossExposure = calculations
    .filter(r => r.potentialLossExposure > 0)
    .reduce((sum, r) => sum + r.potentialLossExposure, 0);

  const criticalOrHighCount = calculations.filter(
    r => r.riskLevel === 'CRITICAL' || r.riskLevel === 'HIGH' || r.riskLevel === 'EXPIRED'
  ).length;

  const getRiskBadgeVariant = (level: string): 'danger' | 'warning' | 'info' | 'success' | 'neutral' => {
    switch (level) {
      case 'CRITICAL':
      case 'EXPIRED':
        return 'danger';
      case 'HIGH':
        return 'warning';
      case 'MEDIUM':
        return 'info';
      case 'LOW':
        return 'success';
      default:
        return 'neutral';
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expiry Risk & Loss Prevention Radar"
        subtitle="Transparent, deterministic batch shelf-life analytics. Computes expected consumption before expiration to identify potential waste risks."
        badge={
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border flex items-center gap-1.5 ${
            dataMode === 'SUPABASE' 
              ? 'bg-emerald-50 text-emerald-800 border-emerald-300' 
              : 'bg-amber-50 text-amber-800 border-amber-300'
          }`}>
            <span className={`w-2 h-2 rounded-full ${dataMode === 'SUPABASE' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {dataMode === 'SUPABASE' ? 'Supabase Live Data' : 'Local Demo Data'}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (dataMode === 'SUPABASE') {
                  setIsLoading(true);
                  inventoryRepo.loadFromSupabase().then(() => {
                    setIsLoading(false);
                    setRefreshCount(c => c + 1);
                  });
                } else {
                  setRefreshCount(c => c + 1);
                }
              }}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={() => {
                pdfReportService.generateExpiryReport(
                  filteredRows.map(r => ({
                    productName: r.productName,
                    productSku: r.productSku,
                    variantName: '',
                    batchNumber: r.batchNumber,
                    locationName: r.locationName,
                    expiryDate: r.expiryDate,
                    daysToExpiry: r.daysToExpiry,
                    quantity: r.currentQuantity,
                    adu: r.averageDailyUsage,
                    expectedUsage: r.expectedUsageBeforeExpiry,
                    potentialAtRiskUnits: r.potentialAtRiskUnits,
                    riskLevel: String(r.riskLevel),
                    recommendedAction: r.formulaExplanation,
                  })),
                  {
                    userName: 'Authorized Staff',
                    userRole: '',
                    dataMode: dataMode as 'SUPABASE' | 'DEMO',
                    appliedFilters: {
                      'Risk Level': selectedRiskLevel,
                      Location: selectedLocation,
                      Category: selectedCategory,
                      Search: searchQuery || 'All',
                    },
                  }
                );
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
              title="Export filtered expiry data as PDF"
            >
              <Download className="w-3.5 h-3.5" />
              Export PDF
            </button>
          </div>
        }
      />

      {/* DEMO DATA TRANSPARENCY BANNER */}
      {dataMode === 'DEMO' && (
        <div 
          role="region"
          aria-label="Demo simulation data notice"
          className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-300 text-amber-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs"
        >
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded font-black tracking-wider text-[10px] uppercase bg-amber-600 text-white shrink-0">
              DEMO DATA
            </span>
            <span className="font-medium text-amber-950">
              <strong>Synthetic Training Environment:</strong> Displaying simulated FEFO calculations and canonical batch risk telemetry. Zero live hospital records are modified.
            </span>
          </div>
          <span className="text-[11px] text-amber-800 shrink-0 font-mono hidden sm:inline-block">
            Canonical FEFO: Active
          </span>
        </div>
      )}

      {/* Database Error Banner (SUPABASE Mode with Retry) */}
      {remoteError && dataMode === 'SUPABASE' && (
        <div 
          role="alert"
          className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs"
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <div className="font-bold">Unable to load live inventory data.</div>
              <div className="text-xs text-amber-800 mt-0.5">
                {sanitizeSupabaseError(remoteError, 'Database connection error. Honest empty states are maintained without fallback to mock records.')}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              setIsLoading(true);
              const res = await inventoryRepo.loadFromSupabase();
              setIsLoading(false);
              if (!res.success) setRemoteError(res.error);
              else setRemoteError(null);
              setRefreshCount(c => c + 1);
            }}
            className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold transition-colors cursor-pointer shrink-0"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* 4 SUMMARY KPI CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Batches Monitored
            </span>
            <Calendar className="w-4 h-4 text-cyan-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono mt-2">
            {calculations.length}
          </div>
          <p className="text-[11px] text-slate-500 mt-1 truncate">
            Active lots across 5 clinical units
          </p>
        </div>

        <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/40 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-700">
              Elevated Risk Batches
            </span>
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-black text-rose-800 font-mono mt-2">
            {criticalOrHighCount}
          </div>
          <p className="text-[11px] text-rose-700 mt-1 truncate">
            Critical, high, or expired lots
          </p>
        </div>

        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/40 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700">
              Units At Risk
            </span>
            <Package className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-800 font-mono mt-2">
            {totalAtRiskUnits} <span className="text-xs font-normal text-slate-500">units</span>
          </div>
          <p className="text-[11px] text-amber-700 mt-1 truncate">
            Unabsorbed by daily consumption
          </p>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Loss Exposure
            </span>
            <DollarSign className="w-4 h-4 text-slate-700" />
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono mt-2">
            ${totalLossExposure.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-slate-500 mt-1 truncate">
            Projected acquisition cost at risk
          </p>
        </div>
      </div>

      {/* SHELF-LIFE WINDOW TABS */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-1.5 flex items-center gap-1 overflow-x-auto">
        <button
          type="button"
          onClick={() => setSelectedTab('ALL')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            selectedTab === 'ALL'
              ? 'bg-slate-900 text-white shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          All Batches ({calculations.length})
        </button>

        <button
          type="button"
          onClick={() => setSelectedTab('EXPIRED')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
            selectedTab === 'EXPIRED'
              ? 'bg-rose-700 text-white shadow-2xs'
              : 'text-rose-700 hover:bg-rose-50'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-rose-500" />
          Expired ({countExpired})
        </button>

        <button
          type="button"
          onClick={() => setSelectedTab('0_30')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
            selectedTab === '0_30'
              ? 'bg-amber-600 text-white shadow-2xs'
              : 'text-amber-700 hover:bg-amber-50'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          0–30 Days ({count0_30})
        </button>

        <button
          type="button"
          onClick={() => setSelectedTab('31_60')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
            selectedTab === '31_60'
              ? 'bg-cyan-700 text-white shadow-2xs'
              : 'text-cyan-800 hover:bg-cyan-50'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-cyan-500" />
          31–60 Days ({count31_60})
        </button>

        <button
          type="button"
          onClick={() => setSelectedTab('61_PLUS')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
            selectedTab === '61_PLUS'
              ? 'bg-emerald-700 text-white shadow-2xs'
              : 'text-emerald-800 hover:bg-emerald-50'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          61+ Days ({count61Plus})
        </button>
      </div>

      {/* FILTER TOOLBAR */}
      <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search product, SKU, batch..."
              aria-label="Search batch risks by product, SKU, or batch"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-lg text-xs border border-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-slate-50"
            />
          </div>

          {/* Risk Level Filter */}
          <div>
            <select
              value={selectedRiskLevel}
              onChange={(e) => setSelectedRiskLevel(e.target.value)}
              aria-label="Filter by risk level"
              className="w-full px-3 py-1.5 rounded-lg text-xs border border-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-slate-50 font-medium text-slate-800"
            >
              <option value="ALL">All Risk Tiers</option>
              <option value="CRITICAL">Critical (0–7 days)</option>
              <option value="HIGH">High (8–30 days)</option>
              <option value="MEDIUM">Medium (31–60 days)</option>
              <option value="LOW">Low (61+ days)</option>
              <option value="EXPIRED">Expired (&lt; 0 days)</option>
            </select>
          </div>

          {/* Location Filter */}
          <div>
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              aria-label="Filter by hospital location"
              className="w-full px-3 py-1.5 rounded-lg text-xs border border-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-slate-50 font-medium text-slate-800"
            >
              <option value="ALL">All Hospital Locations</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.code} &bull; {loc.name}</option>
              ))}
            </select>
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              aria-label="Filter by product category"
              className="w-full px-3 py-1.5 rounded-lg text-xs border border-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-slate-50 font-medium text-slate-800"
            >
              <option value="ALL">All Product Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* RISK TIERS LEGEND CALLOUT */}
      <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between flex-wrap gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-700 font-semibold">
          <Info className="w-4 h-4 text-cyan-600 shrink-0" />
          <span>Risk Classification Tiers:</span>
        </div>
        <div className="flex items-center gap-4 flex-wrap text-[11px] font-medium text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-600" />
            <strong>Critical:</strong> &le; 7 days left
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <strong>High:</strong> 8–30 days left
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-600" />
            <strong>Medium:</strong> 31–60 days left
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
            <strong>Low:</strong> &gt; 60 days safe buffer
          </span>
        </div>
      </div>

      {/* EXPIRY RISK TABLE */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between text-xs font-semibold text-slate-700">
          <span>{filteredRows.length} Batches Under Monitoring</span>
          <span className="text-[11px] text-slate-400 font-normal">
            Click any row to inspect deterministic formula proof
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200 text-[11px]">
              <tr>
                <th scope="col" className="px-4 py-3">Risk Level</th>
                <th scope="col" className="px-4 py-3">Product Name &amp; SKU</th>
                <th scope="col" className="px-4 py-3">Batch / Expiry</th>
                <th scope="col" className="px-4 py-3">Location</th>
                <th scope="col" className="px-4 py-3 text-right">In Stock</th>
                <th scope="col" className="px-4 py-3 text-right">Days Left</th>
                <th scope="col" className="px-4 py-3 text-right">ADU Rate</th>
                <th scope="col" className="px-4 py-3 text-right">Exp. Usage</th>
                <th scope="col" className="px-4 py-3 text-right">At Risk</th>
                <th scope="col" className="px-4 py-3 text-right">Loss Exposure</th>
                <th scope="col" className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.map((row) => (
                <tr 
                  key={`${row.batchId}-${row.locationId}`}
                  className="hover:bg-slate-50/80 transition-colors"
                >
                  <td className="px-4 py-3">
                    <StatusBadge
                      label={row.riskLevel}
                      variant={getRiskBadgeVariant(row.riskLevel)}
                      size="sm"
                      dot
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-bold text-slate-900">{row.productName}</div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      SKU: {row.productSku} &bull; {row.brand}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono font-bold text-slate-900">
                    {row.batchNumber}
                    <div className="text-[11px] text-slate-500 font-normal">Exp: {row.expiryDate}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-slate-800">{row.locationName}</span>
                    <div className="text-[10px] text-slate-400 font-mono">{row.locationCode}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 text-sm">
                    {row.currentQuantity}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold">
                    <span className={row.daysToExpiry <= 30 ? 'text-rose-700' : 'text-slate-700'}>
                      {row.daysToExpiry} d
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-700">
                    {row.hasSufficientHistory ? `${row.averageDailyUsage} /d` : 'No history'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-600">
                    {row.expectedUsageBeforeExpiry}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold">
                    {row.potentialAtRiskUnits > 0 ? (
                      <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        {row.potentialAtRiskUnits}
                      </span>
                    ) : (
                      <span className="text-emerald-700">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">
                    {row.potentialLossExposure > 0 
                      ? `$${row.potentialLossExposure.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` 
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedDetailRow(row)}
                      >
                        View
                      </Button>
                      <Link
                        to={`/transfers`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-cyan-700 bg-cyan-50 hover:bg-cyan-100 transition-colors border border-cyan-200"
                        title="Route batch to higher-turnover location"
                      >
                        <ArrowLeftRight className="w-3 h-3" />
                        <span>Transfer</span>
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-12 text-center" role="status" aria-label="Batch filter results">
                    <div className="max-w-sm mx-auto space-y-2">
                      <Calendar className="w-8 h-8 text-slate-400 mx-auto" aria-hidden="true" />
                      <div className="text-sm font-bold text-slate-800">
                        {dataMode === 'SUPABASE' ? 'No active batches found' : 'No risk items found'}
                      </div>
                      <div className="text-xs text-slate-500">
                        {dataMode === 'SUPABASE'
                          ? 'No active inventory batches found in the live Supabase database. Honest empty state maintained without demo fallback.'
                          : 'No inventory batches match the specified filters.'}
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DETAIL INSPECTION MODAL */}
      {selectedDetailRow && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
          role="presentation"
        >
          <div 
            role="dialog"
            aria-modal="true"
            aria-labelledby="expiry-detail-modal-title"
            className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6 space-y-5 border border-slate-200 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-mono font-bold text-cyan-700 uppercase">
                  Batch Inspection &amp; Calculation Proof
                </span>
                <h3 id="expiry-detail-modal-title" className="text-lg font-bold text-slate-900 mt-0.5">
                  {selectedDetailRow.productName} ({selectedDetailRow.batchNumber})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDetailRow(null)}
                aria-label="Close calculation proof dialog"
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            {/* Formula Explanation Callout */}
            <div className="p-4 bg-slate-900 text-white rounded-xl space-y-1.5">
              <div className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                <Calculator className="w-3.5 h-3.5" aria-hidden="true" />
                Deterministic Math Breakdown
              </div>
              <p className="text-xs text-slate-200 font-mono">
                {selectedDetailRow.formulaExplanation}
              </p>
            </div>

            {/* 6 Step Proof Sequence */}
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Step-by-Step Mathematical Verification
              </h4>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {selectedDetailRow.stepByStep.map((step) => (
                  <div key={step.step} className="p-3 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                    <div>
                      <div className="font-bold text-slate-900">{step.step}</div>
                      <div className="text-slate-500">{step.description}</div>
                    </div>
                    <div className="text-right font-mono sm:max-w-xs">
                      <div className="text-slate-600 text-[11px]">{step.calculation}</div>
                      <div className="font-bold text-slate-900">{step.result}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Location: <strong>{selectedDetailRow.locationName}</strong></span>
              <div className="flex items-center gap-2">
                <Link
                  to="/transfers"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-cyan-700 hover:bg-cyan-800 text-white transition-colors shadow-2xs"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  Initiate Preventive Transfer
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedDetailRow(null)}
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

