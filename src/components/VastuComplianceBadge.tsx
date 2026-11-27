import React from 'react';
import { Compass, CheckCircle2, AlertTriangle, ShieldCheck, Info } from 'lucide-react';

export type VastuFacing = 'NORTH' | 'EAST' | 'NORTH_EAST' | 'SOUTH_EAST' | 'SOUTH' | 'SOUTH_WEST' | 'WEST' | 'NORTH_WEST';

export interface VastuDetails {
  facing: VastuFacing;
  score?: number; // 0 - 100
  kitchenDirection?: VastuFacing;
  masterBedroomDirection?: VastuFacing;
  mainEntryDirection?: VastuFacing;
  poojaRoomDirection?: VastuFacing;
  notes?: string;
}

export function getVastuScore(details: VastuDetails): { score: number; rating: 'EXCELLENT' | 'GOOD' | 'AVERAGE' | 'NEEDS_REMEDY'; highlights: string[]; remedies: string[] } {
  let score = 50;
  const highlights: string[] = [];
  const remedies: string[] = [];

  // Facing
  if (details.facing === 'NORTH_EAST' || details.facing === 'EAST' || details.facing === 'NORTH') {
    score += 25;
    highlights.push(`${details.facing.replace('_', '-')} facing brings abundant natural light and positive cosmic energy.`);
  } else if (details.facing === 'NORTH_WEST' || details.facing === 'WEST') {
    score += 15;
    highlights.push(`${details.facing.replace('_', '-')} facing is acceptable with proper ventilation.`);
  } else if (details.facing === 'SOUTH_EAST' || details.facing === 'SOUTH') {
    score += 5;
    remedies.push('South/South-East entrance recommended with copper pyramid or Panchdhatu Vastu Patti at threshold.');
  } else if (details.facing === 'SOUTH_WEST') {
    score -= 10;
    remedies.push('South-West entrance (Nairutya) requires lead Vastu helix/pyramid correction.');
  }

  // Kitchen
  if (details.kitchenDirection === 'SOUTH_EAST') {
    score += 15;
    highlights.push('Kitchen in Agni Mool (South-East) perfectly aligns with the Fire element.');
  } else if (details.kitchenDirection === 'NORTH_WEST') {
    score += 10;
    highlights.push('Kitchen in Vayu Kon (North-West) is secondary ideal placement.');
  } else if (details.kitchenDirection === 'NORTH_EAST') {
    score -= 15;
    remedies.push('Kitchen in Ishanya (North-East) disrupts water-fire balance; use yellow jaisalmer stone under stove.');
  }

  // Master Bedroom
  if (details.masterBedroomDirection === 'SOUTH_WEST') {
    score += 10;
    highlights.push('Master Bedroom in Nairutya (South-West) promotes financial stability and leadership.');
  } else if (details.masterBedroomDirection === 'SOUTH' || details.masterBedroomDirection === 'WEST') {
    score += 5;
  }

  // Pooja room
  if (details.poojaRoomDirection === 'NORTH_EAST' || details.poojaRoomDirection === 'EAST') {
    score += 10;
    highlights.push('Mandir/Pooja in Ishanya (North-East) invites spiritual harmony.');
  }

  const finalScore = Math.min(100, Math.max(10, score));
  let rating: 'EXCELLENT' | 'GOOD' | 'AVERAGE' | 'NEEDS_REMEDY' = 'GOOD';
  if (finalScore >= 80) rating = 'EXCELLENT';
  else if (finalScore >= 65) rating = 'GOOD';
  else if (finalScore >= 45) rating = 'AVERAGE';
  else rating = 'NEEDS_REMEDY';

  return { score: finalScore, rating, highlights, remedies };
}

export const VastuBadge: React.FC<{
  facing?: string;
  score?: number;
  compact?: boolean;
}> = ({ facing, score = 85, compact = false }) => {
  if (!facing) return null;

  const fUpper = facing.toUpperCase().replace(/\s+/g, '_') as VastuFacing;
  const isHigh = score >= 75;

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border ${
        isHigh
          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
          : 'bg-amber-50 text-amber-800 border-amber-200'
      }`}>
        <Compass className="w-3 h-3 text-emerald-600" />
        Vastu: {facing} ({score}%)
      </span>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-100 bg-gradient-to-r from-emerald-50/80 to-teal-50/40 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-emerald-600/10 p-2 text-emerald-700">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900">Vastu Shastra Compliant</span>
              <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-xs font-bold text-white">
                {score}% Score
              </span>
            </div>
            <p className="text-xs text-slate-600">
              Primary Facing: <strong className="text-slate-800">{facing}</strong>
            </p>
          </div>
        </div>
        <ShieldCheck className="w-5 h-5 text-emerald-600" />
      </div>
    </div>
  );
};
