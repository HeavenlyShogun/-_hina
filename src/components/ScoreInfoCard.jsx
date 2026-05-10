import React from 'react';

const ScoreInfoCard = ({ title, children }) => (
  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
    <div className="mb-3">
      <div className="text-[10px] font-black uppercase tracking-[0.3em] text-sky-200/50">
        {title}
      </div>
    </div>
    <div className="space-y-3">
      {children}
    </div>
  </div>
);

export default ScoreInfoCard;
