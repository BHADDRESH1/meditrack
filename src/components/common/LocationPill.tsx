import React from 'react';
import { HospitalLocation } from '@/types/inventory';
import { Warehouse, HeartPulse, Activity, BedDouble, Stethoscope } from 'lucide-react';

interface LocationPillProps {
  location?: HospitalLocation;
  locationId?: string;
  name?: string;
  showIcon?: boolean;
}

export const LocationPill: React.FC<LocationPillProps> = ({
  location,
  name,
  showIcon = true,
}) => {
  const displayName = location?.name || name || 'Unknown Location';
  const type = location?.type || 'CLINICAL_DEPARTMENT';

  const typeConfig: Record<string, { bg: string; text: string; border: string; icon: React.ReactNode }> = {
    CENTRAL_STORE: {
      bg: 'bg-slate-800 text-white',
      text: 'text-slate-100',
      border: 'border-slate-700',
      icon: <Warehouse className="w-3.5 h-3.5 text-cyan-400" />,
    },
    CLINICAL_DEPARTMENT: {
      bg: 'bg-cyan-50',
      text: 'text-cyan-800',
      border: 'border-cyan-200',
      icon: <HeartPulse className="w-3.5 h-3.5 text-cyan-600" />,
    },
    OPERATING_THEATRE: {
      bg: 'bg-indigo-50',
      text: 'text-indigo-800',
      border: 'border-indigo-200',
      icon: <Activity className="w-3.5 h-3.5 text-indigo-600" />,
    },
    INPATIENT_WARD: {
      bg: 'bg-sky-50',
      text: 'text-sky-800',
      border: 'border-sky-200',
      icon: <BedDouble className="w-3.5 h-3.5 text-sky-600" />,
    },
    SPECIALTY_UNIT: {
      bg: 'bg-purple-50',
      text: 'text-purple-800',
      border: 'border-purple-200',
      icon: <Stethoscope className="w-3.5 h-3.5 text-purple-600" />,
    },
  };

  const config = typeConfig[type] || typeConfig.CLINICAL_DEPARTMENT;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${config.bg} ${config.text} ${config.border}`}
    >
      {showIcon && config.icon}
      <span>{displayName}</span>
    </span>
  );
};
