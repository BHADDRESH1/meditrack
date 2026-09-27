import React from 'react';
import { 
  Home,
  Package, 
  Building2, 
  Boxes, 
  ArrowLeftRight, 
  ClockAlert, 
  FileCheck, 
  PackagePlus,
  ShoppingCart,
  FileText,
  Activity,
  Users
} from 'lucide-react';
import { Permission } from '@/services/permissions';

export interface NavItemConfig {
  to: string;
  label: string;
  displayLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  badge?: string;
  exact?: boolean;
  permission?: Permission;
}

export interface NavSectionConfig {
  id: string;
  title: string;
  displayTitle?: string;
  items: NavItemConfig[];
}

export const KEYBOARD_SHORTCUTS: Record<string, string> = {
  '1': '/',
  '2': '/products',
  '3': '/receiving',
  '4': '/stock',
  '5': '/stock/transfer',
  '6': '/movements',
  '7': '/command-center',
  '8': '/expiry-risk',
  '9': '/procurement',
  '0': '/procurement/requests',
};

export const isRouteActive = (itemTo: string, currentPath: string, exact?: boolean): boolean => {
  if (exact || itemTo === '/' || itemTo === '/stock' || itemTo === '/procurement') {
    return currentPath === itemTo;
  }
  return currentPath === itemTo || currentPath.startsWith(itemTo + '/');
};

export const shouldBlockKeyboardShortcut = (
  target: { tagName?: string; isContentEditable?: boolean; closest?: (s: string) => any } | null,
  modifiers: { ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean; shiftKey?: boolean } = {}
): boolean => {
  if (modifiers.ctrlKey || modifiers.altKey || modifiers.metaKey || modifiers.shiftKey) {
    return true;
  }

  // If any modal or dialog is open anywhere in the DOM, global navigation shortcuts MUST be blocked
  if (typeof document !== 'undefined') {
    const isDialogOpen = document.querySelector('[role="dialog"], [aria-modal="true"], dialog[open]');
    if (isDialogOpen) {
      return true;
    }
  }

  if (!target) return false;
  const tagName = target.tagName?.toLowerCase();
  if (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    tagName === 'button' ||
    tagName === 'form' ||
    target.isContentEditable ||
    Boolean(
      target.closest?.(
        'input, textarea, select, button, form, [contenteditable="true"], [role="dialog"], [aria-modal="true"], [role="combobox"]'
      )
    )
  ) {
    return true;
  }
  return false;
};

export const getNavigationSections = (
  isDeptUser = false, 
  includeRecommendations = false
): NavSectionConfig[] => {
  const intelItems: NavItemConfig[] = [
    { 
      to: '/command-center', 
      label: 'Command Center',
      displayLabel: 'Command Center',
      icon: Activity, 
      shortcut: '7',
      permission: 'inventory:read' 
    },
    { 
      to: '/expiry-risk', 
      label: 'Expiry & Waste',
      displayLabel: 'Expiry Risk',
      icon: ClockAlert, 
      shortcut: '8',
      badge: 'FEFO',
      permission: 'expiry:read' 
    },
  ];

  if (includeRecommendations) {
    intelItems.push({
      to: '/transfers',
      label: 'Transfer Recommendations',
      displayLabel: 'Recommendations',
      icon: ArrowLeftRight,
      badge: 'Advisory',
      permission: 'recommendations:read'
    });
  }

  return [
    {
      id: 'dashboard',
      title: 'DASHBOARD',
      displayTitle: 'Command Center',
      items: [
        { 
          to: '/', 
          label: 'Dashboard', 
          displayLabel: 'Command Center',
          icon: Home, 
          shortcut: '1', 
          exact: true,
          permission: 'inventory:read' 
        },
      ],
    },
    {
      id: 'inventory',
      title: 'INVENTORY',
      displayTitle: 'Inventory',
      items: [
        { 
          to: '/products', 
          label: 'Product Master', 
          displayLabel: 'Products',
          icon: Package, 
          shortcut: '2',
          badge: 'Catalogs',
          permission: 'products:read' 
        },
        { 
          to: '/receiving', 
          label: 'Receiving', 
          displayLabel: 'Receive Stock',
          icon: PackagePlus, 
          shortcut: '3',
          badge: 'Intake',
          permission: 'inventory:receive' 
        },
        { 
          to: '/stock', 
          label: 'Stock', 
          displayLabel: 'Stock',
          icon: Boxes, 
          shortcut: '4',
          exact: true,
          badge: isDeptUser ? 'Dept' : undefined,
          permission: 'inventory:read' 
        },
        { 
          to: '/stock/transfer', 
          label: 'Transfers', 
          displayLabel: 'Stock Transfers',
          icon: ArrowLeftRight, 
          shortcut: '5',
          permission: 'inventory:transfer' 
        },
        { 
          to: '/movements', 
          label: 'Movements', 
          displayLabel: 'Movements',
          icon: FileText, 
          shortcut: '6',
          permission: 'inventory:read' 
        },
      ],
    },
    {
      id: 'intelligence',
      title: 'INTELLIGENCE',
      displayTitle: 'Risk & Planning',
      items: intelItems,
    },
    {
      id: 'procurement',
      title: 'PROCUREMENT',
      displayTitle: 'Procurement',
      items: [
        { 
          to: '/procurement', 
          label: 'Procurement Planning', 
          displayLabel: 'Procurement',
          icon: ShoppingCart, 
          shortcut: '9',
          exact: true,
          permission: 'procurement:read' 
        },
        { 
          to: '/procurement/requests', 
          label: 'Purchase Requests', 
          displayLabel: 'Purchase Requests',
          icon: FileCheck, 
          shortcut: '0',
          permission: 'procurement:read' 
        },
      ],
    },
    {
      id: 'administration',
      title: 'ADMINISTRATION',
      displayTitle: 'Administration',
      items: [
        { 
          to: '/locations', 
          label: 'Hospital Locations', 
          displayLabel: 'Locations',
          icon: Building2, 
          permission: 'locations:read' 
        },
        { 
          to: '/audit', 
          label: 'Audit Trail', 
          displayLabel: 'Audit Trail',
          icon: FileCheck, 
          permission: 'audit:read' 
        },
        { 
          to: '/users', 
          label: 'User Management', 
          displayLabel: 'Users',
          icon: Users, 
          badge: 'Admin', 
          permission: 'users:read' 
        },
      ],
    },
  ];
};
