// ==============================================================================
// MEDiTRACK: Centralized Procurement & Replenishment Policy Configuration
// Strict Separation of Days and Units Formulas
// ==============================================================================

export interface ReplenishmentPolicyConfig {
  defaultLeadTimeDays: number;
  defaultSafetyStockDays: number;
  defaultTargetCoverageDays: number;
  policyNotes: string;
}

export interface ProcurementConfig {
  policy: ReplenishmentPolicyConfig;
  riskThresholds: {
    urgentDays: number; // < 3 days
    highDays: number;   // 3 - 7 days
    mediumDays: number; // 8 - 14 days
    lowDays: number;    // 15+ days
  };
  overstockDaysThreshold: number; // Configurable days threshold for excess stock (default 60)
  minConsumptionDaysRequired: number; // Minimum distinct days for reliable ADU
  targetCoverageDays?: number;
}

export const DEFAULT_PROCUREMENT_CONFIG: ProcurementConfig = {
  policy: {
    defaultLeadTimeDays: 7,
    defaultSafetyStockDays: 5,
    defaultTargetCoverageDays: 30,
    policyNotes: 'Replenishment parameters (lead times, safety stock days, target coverage) depend on hospital supply chain contracts, clinical specialty requirements, and departmental delivery frequencies. They are configurable formulary policy variables rather than universal standards.',
  },
  riskThresholds: {
    urgentDays: 3,
    highDays: 7,
    mediumDays: 14,
    lowDays: 15,
  },
  overstockDaysThreshold: 60,
  minConsumptionDaysRequired: 3,
};

class ProcurementConfigService {
  private config: ProcurementConfig = JSON.parse(JSON.stringify(DEFAULT_PROCUREMENT_CONFIG));

  public getConfig(): Readonly<ProcurementConfig & { targetCoverageDays: number }> {
    return {
      ...this.config,
      targetCoverageDays: this.config.policy.defaultTargetCoverageDays,
    };
  }

  public updatePolicy(leadTimeDays: number, safetyStockDays: number, targetCoverageDays: number): void {
    if (leadTimeDays <= 0 || safetyStockDays < 0 || targetCoverageDays <= 0) {
      throw new Error('Invalid replenishment policy: lead time and target coverage must be > 0, safety stock days must be >= 0.');
    }
    this.config.policy.defaultLeadTimeDays = leadTimeDays;
    this.config.policy.defaultSafetyStockDays = safetyStockDays;
    this.config.policy.defaultTargetCoverageDays = targetCoverageDays;
  }

  public resetToDefaults(): void {
    this.config = JSON.parse(JSON.stringify(DEFAULT_PROCUREMENT_CONFIG));
  }
}

export const procurementConfig = new ProcurementConfigService();
