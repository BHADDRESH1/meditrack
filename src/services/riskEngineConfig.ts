// ==============================================================================
// MEDiTRACK: Centralized Risk Engine Configuration
// Thresholds & Formula Constants (Deterministic & Explainable)
// ==============================================================================

export interface OverstockPolicyConfig {
  targetCoverageDays: number;
  overstockThresholdDays: number;
  policyNotes: string;
}

export interface RiskEngineConfig {
  expiry: {
    criticalDays: number; // 0 - 7 days
    highDays: number;     // 8 - 30 days
    mediumDays: number;   // 31 - 60 days
    lowDays: number;      // 61+ days
  };
  stockout: {
    criticalDays: number; // < 3 days
    highDays: number;     // 3 - 7 days
    mediumDays: number;   // 8 - 14 days
    lowDays: number;      // 15+ days
  };
  overstock: OverstockPolicyConfig;
  consumption: {
    minDistinctDaysRequired: number; // Minimum distinct consumption entries for reliable ADU
    rollingHistoryDays: number;      // Rolling window for velocity calculation
  };
}

/**
 * Authoritative default configuration.
 * Configurable per hospital supply chain policy.
 */
export const DEFAULT_RISK_ENGINE_CONFIG: RiskEngineConfig = {
  expiry: {
    criticalDays: 7,
    highDays: 30,
    mediumDays: 60,
    lowDays: 61,
  },
  stockout: {
    criticalDays: 3,
    highDays: 7,
    mediumDays: 14,
    lowDays: 15,
  },
  overstock: {
    targetCoverageDays: 30,
    overstockThresholdDays: 60,
    policyNotes: 'Overstock thresholds reflect hospital department supply cycles and are configurable by formulary committee policies rather than a universal standard.',
  },
  consumption: {
    minDistinctDaysRequired: 3,
    rollingHistoryDays: 30,
  },
};

class RiskConfigService {
  private config: RiskEngineConfig = { ...DEFAULT_RISK_ENGINE_CONFIG };

  public getConfig(): Readonly<RiskEngineConfig> {
    return this.config;
  }

  public updateOverstockPolicy(targetDays: number, thresholdDays: number): void {
    if (targetDays <= 0 || thresholdDays <= targetDays) {
      throw new Error('Invalid overstock policy: threshold days must exceed target days, and target must be > 0.');
    }
    this.config.overstock.targetCoverageDays = targetDays;
    this.config.overstock.overstockThresholdDays = thresholdDays;
  }

  public resetToDefaults(): void {
    this.config = JSON.parse(JSON.stringify(DEFAULT_RISK_ENGINE_CONFIG));
  }
}

export const riskEngineConfig = new RiskConfigService();
