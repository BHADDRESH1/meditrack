import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  getNavigationSections, 
  isRouteActive, 
  shouldBlockKeyboardShortcut, 
  KEYBOARD_SHORTCUTS 
} from '@/components/layout/navigationConfig';
import { getDataMode, setDataMode } from '@/services/supabaseClient';

describe('Phase 8 Step 4: Navigation Hierarchy & AppShell Organization', () => {
  beforeEach(() => {
    setDataMode('DEMO');
    vi.restoreAllMocks();
  });

  // A. Required Navigation Hierarchy
  it('A. organizes navigation strictly into the required 4 groups plus Dashboard', () => {
    const sections = getNavigationSections();
    const sectionIds = sections.map(s => s.id);
    expect(sectionIds).toEqual([
      'dashboard',
      'inventory',
      'intelligence',
      'procurement',
      'administration'
    ]);

    // Group 1: Dashboard
    const dashboardSec = sections.find(s => s.id === 'dashboard')!;
    expect(dashboardSec.items).toHaveLength(1);
    expect(dashboardSec.items[0].to).toBe('/');
    expect(dashboardSec.items[0].label).toBe('Dashboard');
    expect(dashboardSec.items[0].shortcut).toBe('1');
    expect(dashboardSec.items[0].exact).toBe(true);

    // Group 2: Inventory
    const invSec = sections.find(s => s.id === 'inventory')!;
    const invRoutes = invSec.items.map(i => i.to);
    expect(invRoutes).toEqual([
      '/products',
      '/receiving',
      '/stock',
      '/stock/transfer',
      '/movements'
    ]);
    expect(invSec.items.find(i => i.to === '/products')!.label).toBe('Product Master');
    expect(invSec.items.find(i => i.to === '/receiving')!.label).toBe('Receiving');
    expect(invSec.items.find(i => i.to === '/stock')!.label).toBe('Stock');
    expect(invSec.items.find(i => i.to === '/stock/transfer')!.label).toBe('Transfers');
    expect(invSec.items.find(i => i.to === '/movements')!.label).toBe('Movements');

    // Group 3: Intelligence
    const intelSec = sections.find(s => s.id === 'intelligence')!;
    const intelRoutes = intelSec.items.map(i => i.to);
    expect(intelRoutes).toEqual([
      '/command-center',
      '/expiry-risk'
    ]);
    expect(intelSec.items.find(i => i.to === '/command-center')!.label).toBe('Command Center');
    expect(intelSec.items.find(i => i.to === '/expiry-risk')!.label).toBe('Expiry & Waste');

    // Group 4: Procurement
    const procSec = sections.find(s => s.id === 'procurement')!;
    const procRoutes = procSec.items.map(i => i.to);
    expect(procRoutes).toEqual([
      '/procurement',
      '/procurement/requests'
    ]);
    expect(procSec.items.find(i => i.to === '/procurement')!.label).toBe('Procurement Planning');
    expect(procSec.items.find(i => i.to === '/procurement/requests')!.label).toBe('Purchase Requests');

    // Group 5: Administration
    const adminSec = sections.find(s => s.id === 'administration')!;
    const adminRoutes = adminSec.items.map(i => i.to);
    expect(adminRoutes).toEqual([
      '/locations',
      '/audit',
      '/users'
    ]);
  });

  // B. Active Route Highlighting for standard routes
  it('B. correctly identifies active route for primary and sub-routes', () => {
    expect(isRouteActive('/', '/')).toBe(true);
    expect(isRouteActive('/', '/products')).toBe(false);

    expect(isRouteActive('/products', '/products')).toBe(true);
    expect(isRouteActive('/products', '/receiving')).toBe(false);

    expect(isRouteActive('/command-center', '/command-center')).toBe(true);
    expect(isRouteActive('/expiry-risk', '/expiry-risk')).toBe(true);
  });

  // C. Nested /stock/transfer route highlights Transfers and NOT Stock
  it('C. strictly isolates /stock/transfer: activates Transfers and DOES NOT activate Stock', () => {
    const currentPath = '/stock/transfer';

    // Transfers item MUST be active
    const isTransfersActive = isRouteActive('/stock/transfer', currentPath);
    expect(isTransfersActive).toBe(true);

    // Stock item MUST NOT be active
    const isStockActive = isRouteActive('/stock', currentPath, true);
    expect(isStockActive).toBe(false);
  });

  // D. Nested /procurement/requests highlights Purchase Requests and NOT Procurement Planning
  it('D. strictly isolates /procurement/requests: activates Purchase Requests and DOES NOT activate Procurement Planning', () => {
    const currentPath = '/procurement/requests';

    // Purchase Requests item MUST be active
    const isPrActive = isRouteActive('/procurement/requests', currentPath);
    expect(isPrActive).toBe(true);

    // Procurement Planning item MUST NOT be active
    const isProcActive = isRouteActive('/procurement', currentPath, true);
    expect(isProcActive).toBe(false);
  });

  // E. When on parent /stock, activates Stock and NOT Transfers
  it('E. activates Stock and DOES NOT activate Transfers when current path is /stock', () => {
    const currentPath = '/stock';

    expect(isRouteActive('/stock', currentPath, true)).toBe(true);
    expect(isRouteActive('/stock/transfer', currentPath)).toBe(false);
  });

  // F. Keyboard Shortcuts Mapping (1-0)
  it('F. verifies numeric keyboard shortcuts map to all 10 required routes', () => {
    expect(KEYBOARD_SHORTCUTS['1']).toBe('/');
    expect(KEYBOARD_SHORTCUTS['2']).toBe('/products');
    expect(KEYBOARD_SHORTCUTS['3']).toBe('/receiving');
    expect(KEYBOARD_SHORTCUTS['4']).toBe('/stock');
    expect(KEYBOARD_SHORTCUTS['5']).toBe('/stock/transfer');
    expect(KEYBOARD_SHORTCUTS['6']).toBe('/movements');
    expect(KEYBOARD_SHORTCUTS['7']).toBe('/command-center');
    expect(KEYBOARD_SHORTCUTS['8']).toBe('/expiry-risk');
    expect(KEYBOARD_SHORTCUTS['9']).toBe('/procurement');
    expect(KEYBOARD_SHORTCUTS['0']).toBe('/procurement/requests');
  });

  // G. Keyboard shortcuts blocked inside <input>
  it('G. blocks keyboard shortcuts when typing inside an <input> element', () => {
    const target = { tagName: 'INPUT' };
    expect(shouldBlockKeyboardShortcut(target, {})).toBe(true);
  });

  // H. Keyboard shortcuts blocked inside <textarea>
  it('H. blocks keyboard shortcuts when typing inside a <textarea> element', () => {
    const target = { tagName: 'TEXTAREA' };
    expect(shouldBlockKeyboardShortcut(target, {})).toBe(true);
  });

  // I. Keyboard shortcuts blocked inside <select>
  it('I. blocks keyboard shortcuts when typing inside a <select> element', () => {
    const target = { tagName: 'SELECT' };
    expect(shouldBlockKeyboardShortcut(target, {})).toBe(true);
  });

  // J. Keyboard shortcuts blocked inside contenteditable
  it('J. blocks keyboard shortcuts when typing inside a contenteditable element', () => {
    const target = { isContentEditable: true };
    expect(shouldBlockKeyboardShortcut(target, {})).toBe(true);

    const childTarget = {
      tagName: 'SPAN',
      closest: (sel: string) => sel.includes('contenteditable') ? {} : null
    };
    expect(shouldBlockKeyboardShortcut(childTarget, {})).toBe(true);
  });

  // K. Keyboard shortcuts blocked inside dialog / modal forms
  it('K. blocks keyboard shortcuts when focus is inside a modal dialog form control', () => {
    const modalTarget = {
      tagName: 'DIV',
      closest: (sel: string) => sel.includes('dialog') ? {} : null
    };
    expect(shouldBlockKeyboardShortcut(modalTarget, {})).toBe(true);
  });

  // L. Keyboard shortcuts blocked when modifier keys are pressed
  it('L. blocks keyboard shortcuts when Ctrl, Alt, Meta, or Shift modifier keys are held', () => {
    expect(shouldBlockKeyboardShortcut(null, { ctrlKey: true })).toBe(true);
    expect(shouldBlockKeyboardShortcut(null, { altKey: true })).toBe(true);
    expect(shouldBlockKeyboardShortcut(null, { metaKey: true })).toBe(true);
    expect(shouldBlockKeyboardShortcut(null, { shiftKey: true })).toBe(true);
  });

  // M. Allows shortcuts on general non-input body/container elements
  it('M. allows shortcuts on standard page background or container elements', () => {
    const bodyTarget = {
      tagName: 'DIV',
      isContentEditable: false,
      closest: () => null
    };
    expect(shouldBlockKeyboardShortcut(bodyTarget, {})).toBe(false);
  });

  // N. DEMO / SUPABASE Mode Switcher Integration
  it('N. preserves DEMO and SUPABASE mode switching capability in AppShell without breaking state', () => {
    expect(getDataMode()).toBe('DEMO');

    setDataMode('SUPABASE');
    expect(getDataMode()).toBe('SUPABASE');

    setDataMode('DEMO');
    expect(getDataMode()).toBe('DEMO');
  });
});
