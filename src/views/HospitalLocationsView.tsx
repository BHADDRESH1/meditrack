import React from 'react';
import { 
  MapPin, 
  User,
  ArrowRight
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { LocationPill } from '@/components/common/LocationPill';
import { HOSPITAL_LOCATIONS } from '@/data/hospitalLocations';
import { inventoryRepo } from '@/services/inventoryRepository';

export const HospitalLocationsView: React.FC = () => {
  const stockRecords = inventoryRepo.getLocationStock();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hospital Locations Hierarchy"
        subtitle="Central medical storage depot and decentralized clinical consumption departments across the hospital campus."
        badge={
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            {HOSPITAL_LOCATIONS.length} Facilities Configured
          </span>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {HOSPITAL_LOCATIONS.map(location => {
          const locStocks = stockRecords.filter(s => s.locationId === location.id);
          const totalUnits = locStocks.reduce((sum, s) => sum + s.quantity, 0);
          const distinctBatches = new Set(locStocks.map(s => s.batchId)).size;

          const isCentral = location.type === 'CENTRAL_STORE';

          return (
            <div
              key={location.id}
              className={`bg-white rounded-2xl border p-5 shadow-2xs flex flex-col justify-between transition-all hover:shadow-xs ${
                isCentral 
                  ? 'border-cyan-300 ring-2 ring-cyan-500/10' 
                  : 'border-slate-200'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                    {location.code}
                  </span>
                  <LocationPill location={location} showIcon={true} />
                </div>

                <h3 className="mt-3 text-base font-bold text-slate-900 leading-snug">
                  {location.name}
                </h3>

                <div className="mt-3 space-y-1.5 text-xs text-slate-500">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{location.building} &bull; {location.floor}</span>
                  </div>
                  {location.headOfDepartment && (
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{location.headOfDepartment}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Active Stock
                  </span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-xl font-extrabold text-slate-900 font-mono">
                      {totalUnits}
                    </span>
                    <span className="text-xs text-slate-500">units</span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Lots Monitored
                  </span>
                  <span className="text-xs font-semibold text-cyan-800 bg-cyan-50 px-2.5 py-0.5 rounded-full border border-cyan-200 inline-block mt-0.5">
                    {distinctBatches} Batches
                  </span>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-100 flex justify-end">
                <Link
                  to="/stock"
                  className="text-xs font-semibold text-cyan-700 hover:text-cyan-800 flex items-center gap-1"
                >
                  <span>View Department Inventory</span>
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

