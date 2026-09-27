import { useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthProvider';
import { ProtectedRoute } from '@/auth/ProtectedRoute';
import { AppShell } from '@/components/layout/AppShell';
import { PageLoadingFallback } from '@/components/common/PageLoadingFallback';

// Route-level code-split views (Phase 8 Performance & Bundle Optimization)
const LoginView = lazy(() => import('@/views/LoginView').then(m => ({ default: m.LoginView })));
const CommandCenterView = lazy(() => import('@/views/CommandCenterView').then(m => ({ default: m.CommandCenterView })));
const ProductMasterView = lazy(() => import('@/views/ProductMasterView').then(m => ({ default: m.ProductMasterView })));
const HospitalLocationsView = lazy(() => import('@/views/HospitalLocationsView').then(m => ({ default: m.HospitalLocationsView })));
const GoodsReceivingView = lazy(() => import('@/views/GoodsReceivingView').then(m => ({ default: m.GoodsReceivingView })));
const StockBalancesView = lazy(() => import('@/views/StockBalancesView').then(m => ({ default: m.StockBalancesView })));
const StockTransferView = lazy(() => import('@/views/StockTransferView').then(m => ({ default: m.StockTransferView })));
const MovementsLedgerView = lazy(() => import('@/views/MovementsLedgerView').then(m => ({ default: m.MovementsLedgerView })));
const ExpiryRiskView = lazy(() => import('@/views/ExpiryRiskView').then(m => ({ default: m.ExpiryRiskView })));
const TransferRecommendationsView = lazy(() => import('@/views/TransferRecommendationsView').then(m => ({ default: m.TransferRecommendationsView })));
const ProcurementDashboardView = lazy(() => import('@/views/ProcurementDashboardView').then(m => ({ default: m.ProcurementDashboardView })));
const PurchaseRequestsView = lazy(() => import('@/views/PurchaseRequestsView').then(m => ({ default: m.PurchaseRequestsView })));
const AuditTrailView = lazy(() => import('@/views/AuditTrailView').then(m => ({ default: m.AuditTrailView })));
const UserManagementView = lazy(() => import('@/views/UserManagementView').then(m => ({ default: m.UserManagementView })));

export function App() {
  const [selectedLocationId, setSelectedLocationId] = useState<string>('ALL');

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Authentication Route */}
          <Route 
            path="/login" 
            element={
              <Suspense fallback={<PageLoadingFallback />}>
                <LoginView />
              </Suspense>
            } 
          />

          {/* Authenticated Protected Root */}
          <Route element={<ProtectedRoute />}>
            <Route
              path="/"
              element={
                <AppShell
                  selectedLocationId={selectedLocationId}
                  onLocationChange={setSelectedLocationId}
                />
              }
            >
              {/* Command Center: Available to all authenticated roles */}
              <Route
                index
                element={<CommandCenterView selectedLocationId={selectedLocationId} />}
              />
              <Route
                path="command-center"
                element={<CommandCenterView selectedLocationId={selectedLocationId} />}
              />

              {/* Product Master: ADMIN and INVENTORY_MANAGER */}
              <Route
                path="products"
                element={
                  <ProtectedRoute requiredPermission="products:read">
                    <ProductMasterView />
                  </ProtectedRoute>
                }
              />

              {/* Hospital Locations: Reference catalog for all staff */}
              <Route
                path="locations"
                element={
                  <ProtectedRoute requiredPermission="locations:read">
                    <HospitalLocationsView />
                  </ProtectedRoute>
                }
              />

              {/* Goods Receiving: ADMIN, INVENTORY_MANAGER, STOREKEEPER */}
              <Route
                path="receiving"
                element={
                  <ProtectedRoute requiredPermission="inventory:receive">
                    <GoodsReceivingView />
                  </ProtectedRoute>
                }
              />

              {/* Stock by Location: Available to all (filtered for department users) */}
              <Route
                path="stock"
                element={
                  <ProtectedRoute requiredPermission="inventory:read">
                    <StockBalancesView selectedLocationId={selectedLocationId} />
                  </ProtectedRoute>
                }
              />

              {/* Inter-Store Transfer: ADMIN, INVENTORY_MANAGER, STOREKEEPER */}
              <Route
                path="stock/transfer"
                element={
                  <ProtectedRoute requiredPermission="inventory:transfer">
                    <StockTransferView />
                  </ProtectedRoute>
                }
              />

              {/* Movement Ledger: Available to all staff */}
              <Route
                path="movements"
                element={
                  <ProtectedRoute requiredPermission="inventory:read">
                    <MovementsLedgerView />
                  </ProtectedRoute>
                }
              />

              {/* Expiry Risk & FEFO: Available to all staff */}
              <Route
                path="expiry-risk"
                element={
                  <ProtectedRoute requiredPermission="expiry:read">
                    <ExpiryRiskView />
                  </ProtectedRoute>
                }
              />

              {/* Transfer Recommendations: ADMIN, INVENTORY_MANAGER, STOREKEEPER */}
              <Route
                path="transfers"
                element={
                  <ProtectedRoute requiredPermission="recommendations:read">
                    <TransferRecommendationsView />
                  </ProtectedRoute>
                }
              />

              {/* Phase 7: Smart Procurement & Replenishment Planning */}
              <Route
                path="procurement"
                element={
                  <ProtectedRoute requiredPermission="procurement:read">
                    <ProcurementDashboardView selectedLocationId={selectedLocationId} />
                  </ProtectedRoute>
                }
              />
              <Route
                path="procurement/requests"
                element={
                  <ProtectedRoute requiredPermission="procurement:read">
                    <PurchaseRequestsView />
                  </ProtectedRoute>
                }
              />

              {/* Audit Trail: ADMIN, INVENTORY_MANAGER */}
              <Route
                path="audit"
                element={
                  <ProtectedRoute requiredPermission="audit:read">
                    <AuditTrailView />
                  </ProtectedRoute>
                }
              />

              {/* Staff & User Management: ADMIN ONLY */}
              <Route
                path="users"
                element={
                  <ProtectedRoute requiredPermission="users:read">
                    <UserManagementView />
                  </ProtectedRoute>
                }
              />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
