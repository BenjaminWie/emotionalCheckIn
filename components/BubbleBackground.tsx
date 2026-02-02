import React from 'react';

const BubbleBackground: React.FC = () => {
  return (
    <div className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none bg-slate-950">
      {/* Deep background gradients - Darker, more mysterious */}
      <div className="absolute top-[-20%] left-[-10%] w-[70vh] h-[70vh] rounded-full bg-indigo-900/20 blur-[100px] float-slow mix-blend-screen" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[60vh] h-[60vh] rounded-full bg-purple-900/20 blur-[100px] float-medium mix-blend-screen" />
      <div className="absolute top-[40%] left-[30%] w-[40vh] h-[40vh] rounded-full bg-emerald-900/10 blur-[80px] float-fast mix-blend-screen" />
      
      {/* Defined glowing orbs - Psychotropic aesthetic */}
      <div className="absolute top-[15%] right-[15%] w-32 h-32 rounded-full bg-indigo-500/10 backdrop-blur-3xl shadow-[0_0_40px_rgba(99,102,241,0.2)] border border-indigo-500/20 float-medium" />
      
      <div className="absolute bottom-[20%] left-[10%] w-24 h-24 rounded-full bg-fuchsia-500/10 backdrop-blur-3xl shadow-[0_0_30px_rgba(217,70,239,0.2)] border border-fuchsia-500/20 float-slow" />

      <div className="absolute top-[60%] right-[30%] w-16 h-16 rounded-full bg-teal-500/10 backdrop-blur-md shadow-[0_0_20px_rgba(45,212,191,0.2)] border border-teal-500/20 float-fast" />
    </div>
  );
};

export default BubbleBackground;