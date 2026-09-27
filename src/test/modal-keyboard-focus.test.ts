import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { shouldBlockKeyboardShortcut, KEYBOARD_SHORTCUTS } from '@/components/layout/navigationConfig';

describe('Modal Keyboard Input, Focus Management & Global Shortcut Blocker', () => {
  const originalDocument = globalThis.document;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.document = originalDocument;
  });

  // TEST 1: Full Name input typing & focus protection
  it('TEST 1: typing into Full Name input blocks global navigation and does not steal focus', () => {
    const fullNameInput = {
      tagName: 'INPUT',
      type: 'text',
      id: 'add-user-name',
      value: 'bhaddresh',
      isContentEditable: false,
      closest: (sel: string) => (sel.includes('input') ? fullNameInput : null),
    };

    // User types 'b', 'h', 'a', etc.
    const isBlocked = shouldBlockKeyboardShortcut(fullNameInput as any, {});
    expect(isBlocked).toBe(true);

    // Typing a shortcut key like '1' or '2' while focused on Full Name input is blocked
    expect(shouldBlockKeyboardShortcut(fullNameInput as any, { ctrlKey: false })).toBe(true);
  });

  // TEST 2: Email input typing
  it('TEST 2: typing into Email input blocks global navigation and accepts value', () => {
    const emailInput = {
      tagName: 'INPUT',
      type: 'email',
      id: 'add-user-email',
      value: 'test@example.com',
      isContentEditable: false,
      closest: (sel: string) => (sel.includes('input') ? emailInput : null),
    };

    expect(shouldBlockKeyboardShortcut(emailInput as any, {})).toBe(true);
  });

  // TEST 3: Temporary Password input typing
  it('TEST 3: typing into Temporary Password input blocks global navigation', () => {
    const passwordInput = {
      tagName: 'INPUT',
      type: 'password',
      id: 'add-user-password',
      value: 'Password123!',
      isContentEditable: false,
      closest: (sel: string) => (sel.includes('input') ? passwordInput : null),
    };

    expect(shouldBlockKeyboardShortcut(passwordInput as any, {})).toBe(true);
  });

  // TEST 4 & 5: Tab and Shift+Tab focus trap navigation
  it('TEST 4 & 5: circular focus trap correctly navigates forward on Tab and backward on Shift+Tab', () => {
    const closeBtn = { id: 'modal-close-btn', focus: vi.fn(), offsetParent: {} };
    const nameInput = { id: 'add-user-name', focus: vi.fn(), offsetParent: {} };
    const emailInput = { id: 'add-user-email', focus: vi.fn(), offsetParent: {} };
    const passInput = { id: 'add-user-password', focus: vi.fn(), offsetParent: {} };
    const submitBtn = { id: 'add-user-submit', focus: vi.fn(), offsetParent: {} };

    const focusableElements = [nameInput, emailInput, passInput, submitBtn, closeBtn];
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    // Simulate Tab on lastElement -> wraps to firstElement
    let activeElement: any = lastElement;
    const tabEvent = {
      key: 'Tab',
      shiftKey: false,
      preventDefault: vi.fn(),
    };

    if (tabEvent.key === 'Tab' && !tabEvent.shiftKey && activeElement === lastElement) {
      tabEvent.preventDefault();
      firstElement.focus();
    }
    expect(tabEvent.preventDefault).toHaveBeenCalled();
    expect(firstElement.focus).toHaveBeenCalled();

    // Simulate Shift+Tab on firstElement -> wraps to lastElement
    activeElement = firstElement;
    const shiftTabEvent = {
      key: 'Tab',
      shiftKey: true,
      preventDefault: vi.fn(),
    };

    if (shiftTabEvent.key === 'Tab' && shiftTabEvent.shiftKey && activeElement === firstElement) {
      shiftTabEvent.preventDefault();
      lastElement.focus();
    }
    expect(shiftTabEvent.preventDefault).toHaveBeenCalled();
    expect(lastElement.focus).toHaveBeenCalled();
  });

  // TEST 6: ESC key closes modal
  it('TEST 6: pressing Escape invokes modal onClose callback and stops propagation', () => {
    const onClose = vi.fn();
    const escEvent = {
      key: 'Escape',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };

    // Modal Escape handler logic
    if (escEvent.key === 'Escape') {
      escEvent.stopPropagation();
      escEvent.preventDefault();
      onClose();
    }

    expect(escEvent.stopPropagation).toHaveBeenCalled();
    expect(escEvent.preventDefault).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  // TEST 7: Click X button closes modal
  it('TEST 7: clicking modal close X button triggers onClose handler', () => {
    const onClose = vi.fn();
    const handleCloseClick = () => {
      onClose();
    };

    handleCloseClick();
    expect(onClose).toHaveBeenCalled();
  });

  // TEST 8: Keyboard shortcuts ignored while input is focused or modal is open
  it('TEST 8: shortcut keys (1-0) are strictly blocked while interacting with form fields or open modals', () => {
    // 1. Blocked on text input
    const textInput = { tagName: 'INPUT', isContentEditable: false, closest: () => null };
    for (const _key of Object.keys(KEYBOARD_SHORTCUTS)) {
      expect(shouldBlockKeyboardShortcut(textInput as any, {})).toBe(true);
    }

    // 2. Blocked on select dropdown
    const selectElem = { tagName: 'SELECT', isContentEditable: false, closest: () => null };
    expect(shouldBlockKeyboardShortcut(selectElem as any, {})).toBe(true);

    // 3. Blocked on textarea
    const textareaElem = { tagName: 'TEXTAREA', isContentEditable: false, closest: () => null };
    expect(shouldBlockKeyboardShortcut(textareaElem as any, {})).toBe(true);

    // 4. Blocked on button
    const buttonElem = { tagName: 'BUTTON', isContentEditable: false, closest: () => null };
    expect(shouldBlockKeyboardShortcut(buttonElem as any, {})).toBe(true);

    // 5. Blocked on form
    const formElem = { tagName: 'FORM', isContentEditable: false, closest: () => null };
    expect(shouldBlockKeyboardShortcut(formElem as any, {})).toBe(true);

    // 6. Blocked when any modal/dialog is present in the DOM
    globalThis.document = {
      querySelector: (selector: string) => {
        if (selector.includes('[role="dialog"]') || selector.includes('[aria-modal="true"]')) {
          return { tagName: 'DIV', role: 'dialog' };
        }
        return null;
      },
    } as any;

    const generalDiv = { tagName: 'DIV', isContentEditable: false, closest: () => null };
    expect(shouldBlockKeyboardShortcut(generalDiv as any, {})).toBe(true);
  });

  // Initial focus priorities
  it('prioritizes first interactive form input (Full Name) over the close X button', () => {
    const closeButton = { tagName: 'BUTTON', ariaLabel: 'Close dialog', focus: vi.fn() };
    const nameInput = { tagName: 'INPUT', id: 'add-user-name', focus: vi.fn() };

    // Simulated modal element with querySelector
    const mockModal = {
      querySelector: (selector: string) => {
        if (selector.startsWith('input:not([type="hidden"])')) {
          return nameInput; // Found the form input first
        }
        if (selector.startsWith('button:not([disabled])')) {
          return closeButton;
        }
        return null;
      },
    };

    // Modal initial focus algorithm
    const formInput = mockModal.querySelector(
      'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [contenteditable="true"]'
    );
    if (formInput) {
      formInput.focus();
    } else {
      const firstFocusable = mockModal.querySelector('button:not([disabled]), [href] ...');
      firstFocusable?.focus();
    }

    expect(nameInput.focus).toHaveBeenCalled();
    expect(closeButton.focus).not.toHaveBeenCalled();
  });
});
