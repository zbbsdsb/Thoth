import React, { useState, useEffect, useRef } from 'react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User, 
  signOut 
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp, 
  getDocFromServer,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  increment,
  limit,
  deleteDoc
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from './firebase';
import { GoogleGenAI } from "@google/genai";
import { 
  Mic, 
  Square, 
  History, 
  LogOut, 
  Moon, 
  Sparkles, 
  Trash2,
  AlertCircle,
  Loader2,
  X,
  Play,
  Pause,
  Volume2,
  Search,
  Download,
  Share2,
  Settings,
  BookOpen,
  Globe,
  Cpu,
  Map as MapIcon
} from 'lucide-react';
import Markdown from 'react-markdown';
import { README_MD, QUOTA_MD, PRIVACY_MD } from './docs';
import { toPng } from 'html-to-image';
import download from 'downloadjs';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

// --- Utils ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

interface Dream {
  id: string;
  user_id: string;
  transcript: string;
  audio_url?: string;
  created_at: any;
  duration?: number;
  tags?: string[];
}

interface ExternalApi {
  key: string;
  baseUrl?: string;
  model?: string;
}

interface UserProfile {
  email: string;
  created_at: any;
  daily_usage_count: number;
  daily_quota_limit: number;
  last_usage_date?: string;
  active_provider?: 'gemini' | 'openai' | 'deepseek' | 'minimax';
  external_apis?: {
    openai?: ExternalApi;
    deepseek?: ExternalApi;
    minimax?: ExternalApi;
  };
  streak: number;
  last_streak_date?: string;
}

interface GlobalImagery {
  id: string;
  tag: string;
  count: number;
  last_updated: any;
}

type View = 'capture' | 'hall' | 'archive' | 'settings';

// --- Error Handling ---
function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Components ---
const DreamDetailModal = ({ dream, onClose, onDelete }: { dream: Dream, onClose: () => void, onDelete: () => void }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleExport = async () => {
    if (exportRef.current) {
      setIsExporting(true);
      try {
        // Wait a bit for any layout adjustments
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const dataUrl = await toPng(exportRef.current, {
          backgroundColor: '#09090b', // zinc-950
          cacheBust: true,
          pixelRatio: 2,
        });
        
        download(dataUrl, `thoth-dream-${new Date().getTime()}.png`);
      } catch (err) {
        console.error('Export failed:', err);
      } finally {
        setIsExporting(false);
      }
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-zinc-950/90 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="bg-zinc-900 border border-zinc-800 w-full max-w-2xl rounded-[2.5rem] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-8 sm:p-12">
          <div ref={exportRef} className="bg-zinc-900 p-2 rounded-2xl">
            <header className="flex items-center justify-between mb-12">
              <div className="flex flex-col gap-1">
                <time className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.3em]">
                  {dream.created_at?.toDate().toLocaleDateString('en-US', { 
                    weekday: 'long',
                    month: 'long', 
                    day: 'numeric', 
                    year: 'numeric'
                  })}
                </time>
                <span className="text-[10px] font-mono text-zinc-700 uppercase tracking-widest">
                  Recorded at {dream.created_at?.toDate().toLocaleTimeString('en-US', { 
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                  })}
                </span>
              </div>
              <div className="flex items-center gap-2 no-export">
                <button 
                  onClick={onClose}
                  className="p-2 text-zinc-500 hover:text-zinc-100 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </header>

            <div className="max-h-[50vh] overflow-y-auto mb-12 pr-4 custom-scrollbar">
              <p className="text-zinc-100 text-2xl sm:text-3xl font-serif italic leading-relaxed selection:bg-zinc-100 selection:text-zinc-950">
                "{dream.transcript}"
              </p>
            </div>

            {dream.tags && dream.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-12">
                {dream.tags.map((tag, i) => (
                  <span 
                    key={i}
                    className="px-3 py-1 bg-zinc-800/50 border border-zinc-800 text-[9px] font-mono text-zinc-500 uppercase tracking-widest rounded-full"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center gap-3 mb-8">
              <ThothLogo className="w-6 h-6 opacity-20" />
              <span className="text-[8px] uppercase tracking-[0.5em] text-zinc-800 font-mono">Thoth Subconscious Archive</span>
            </div>
          </div>

          <footer className="flex flex-col sm:flex-row items-center justify-between gap-8 pt-8 border-t border-zinc-800">
            <div className="flex items-center gap-4">
              {dream.audio_url && (
                <>
                  <button 
                    onClick={togglePlay}
                    className="w-14 h-14 bg-zinc-100 text-zinc-950 rounded-full flex items-center justify-center hover:bg-zinc-200 transition-all shadow-lg shadow-white/5"
                  >
                    {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-1" />}
                  </button>
                  <audio 
                    ref={audioRef} 
                    src={dream.audio_url} 
                    onEnded={() => setIsPlaying(false)}
                    className="hidden"
                  />
                </>
              )}
              
              <button 
                onClick={handleExport}
                disabled={isExporting}
                className="flex items-center gap-3 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-full transition-all disabled:opacity-50"
              >
                {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                <span className="text-[10px] font-bold uppercase tracking-widest">Export Card</span>
              </button>
            </div>

            <button 
              onClick={onDelete}
              className="flex items-center gap-2 text-zinc-700 hover:text-red-500 transition-colors group"
            >
              <Trash2 className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">Delete Archive</span>
            </button>
          </footer>
        </div>
      </motion.div>
    </motion.div>
  );
};

type SettingsTab = 'guide' | 'quota' | 'privacy' | 'providers';

const SettingsContent = ({ 
  activeTab, 
  setActiveTab, 
  onSelectKey, 
  hasUserKey, 
  profile,
  onUpdateProfile
}: { 
  activeTab: SettingsTab; 
  setActiveTab: (tab: SettingsTab) => void; 
  onSelectKey: () => void; 
  hasUserKey: boolean; 
  profile: UserProfile | null;
  onUpdateProfile: (updates: Partial<UserProfile>) => Promise<void>;
}) => {
  const [providerKeys, setProviderKeys] = useState({
    openai: profile?.external_apis?.openai?.key || '',
    deepseek: profile?.external_apis?.deepseek?.key || '',
    minimax: profile?.external_apis?.minimax?.key || '',
  });

  const [providerUrls, setProviderUrls] = useState({
    openai: profile?.external_apis?.openai?.baseUrl || '',
    deepseek: profile?.external_apis?.deepseek?.baseUrl || '',
    minimax: profile?.external_apis?.minimax?.baseUrl || '',
  });

  const [saving, setSaving] = useState(false);

  const handleSaveProviders = async () => {
    setSaving(true);
    try {
      await onUpdateProfile({
        external_apis: {
          openai: { key: providerKeys.openai, baseUrl: providerUrls.openai },
          deepseek: { key: providerKeys.deepseek, baseUrl: providerUrls.deepseek },
          minimax: { key: providerKeys.minimax, baseUrl: providerUrls.minimax },
        }
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSwitchProvider = async (provider: 'gemini' | 'openai' | 'deepseek' | 'minimax') => {
    await onUpdateProfile({ active_provider: provider });
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Sidebar */}
      <div className="w-72 border-r border-zinc-800 p-8 space-y-8 hidden md:block bg-zinc-900/30">
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-zinc-600 mb-6">Documentation</p>
          <button 
            onClick={() => setActiveTab('guide')}
            className={cn(
              "w-full text-left px-5 py-3 rounded-2xl text-xs transition-all flex items-center gap-4 uppercase tracking-widest",
              activeTab === 'guide' ? "bg-zinc-100 text-zinc-950 font-bold shadow-lg shadow-white/5" : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            )}
          >
            <BookOpen className="w-4 h-4" />
            User Guide
          </button>
          <button 
            onClick={() => setActiveTab('quota')}
            className={cn(
              "w-full text-left px-5 py-3 rounded-2xl text-xs transition-all flex items-center gap-4 uppercase tracking-widest",
              activeTab === 'quota' ? "bg-zinc-100 text-zinc-950 font-bold shadow-lg shadow-white/5" : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            )}
          >
            <Sparkles className="w-4 h-4" />
            Quota & Usage
          </button>
          <button 
            onClick={() => setActiveTab('privacy')}
            className={cn(
              "w-full text-left px-5 py-3 rounded-2xl text-xs transition-all flex items-center gap-4 uppercase tracking-widest",
              activeTab === 'privacy' ? "bg-zinc-100 text-zinc-950 font-bold shadow-lg shadow-white/5" : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            )}
          >
            <AlertCircle className="w-4 h-4" />
            Privacy Policy
          </button>
        </div>

        <div className="pt-8 border-t border-zinc-800">
          <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-zinc-600 mb-6">AI Configuration</p>
          <button 
            onClick={() => setActiveTab('providers')}
            className={cn(
              "w-full text-left px-5 py-3 rounded-2xl text-xs transition-all flex items-center gap-4 uppercase tracking-widest",
              activeTab === 'providers' ? "bg-zinc-100 text-zinc-950 font-bold shadow-lg shadow-white/5" : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            )}
          >
            <Cpu className="w-4 h-4" />
            AI Providers
          </button>
        </div>

        <div className="pt-8 border-t border-zinc-800">
          <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-zinc-600 mb-6">Account & API</p>
          <button 
            onClick={onSelectKey}
            className={cn(
              "w-full px-5 py-4 rounded-2xl text-[10px] font-bold uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 border",
              hasUserKey 
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" 
                : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700"
            )}
          >
            <Sparkles className="w-4 h-4" />
            {hasUserKey ? "Personal Key Active" : "Configure API Key"}
          </button>
          {!hasUserKey && profile && (
            <div className="mt-4 p-4 bg-zinc-950/50 rounded-xl border border-zinc-800/50">
              <p className="text-[8px] uppercase tracking-widest text-zinc-600 mb-1">Daily Usage</p>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-zinc-400">{profile.daily_usage_count}/{profile.daily_quota_limit}</span>
                <div className="flex-1 h-1 bg-zinc-800 rounded-full mx-3 overflow-hidden">
                  <div 
                    className="h-full bg-zinc-100 transition-all duration-500" 
                    style={{ width: `${(profile.daily_usage_count / profile.daily_quota_limit) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-10 sm:p-16 custom-scrollbar bg-zinc-950/30">
        <div className="max-w-2xl mx-auto">
          {activeTab === 'providers' ? (
            <div className="space-y-12">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-bold text-zinc-100">AI Providers</h4>
                  <div className="px-3 py-1 bg-zinc-800 border border-zinc-700 rounded-full text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                    Active: {profile?.active_provider || 'gemini'}
                  </div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {['gemini', 'openai', 'deepseek', 'minimax'].map((p) => (
                    <button
                      key={p}
                      onClick={() => handleSwitchProvider(p as any)}
                      className={cn(
                        "p-6 rounded-3xl border transition-all text-left group",
                        (profile?.active_provider || 'gemini') === p 
                          ? "bg-zinc-100 border-zinc-100 text-zinc-950 shadow-xl shadow-white/5" 
                          : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                      )}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center",
                          (profile?.active_provider || 'gemini') === p ? "bg-zinc-950/10" : "bg-zinc-800"
                        )}>
                          <Cpu className="w-5 h-5" />
                        </div>
                        {(profile?.active_provider || 'gemini') === p && (
                          <div className="w-2 h-2 bg-zinc-950 rounded-full animate-pulse" />
                        )}
                      </div>
                      <p className="text-xs font-bold uppercase tracking-widest mb-1">{p}</p>
                      <p className="text-[10px] opacity-60 font-mono">
                        {p === 'gemini' ? 'Google AI' : p === 'openai' ? 'GPT-4o' : p === 'deepseek' ? 'Deepseek-V3' : 'Minimax-abab'}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-8 pt-8 border-t border-zinc-800">
                <h4 className="text-lg font-bold text-zinc-100">External API Keys</h4>
                
                <div className="space-y-6">
                  {['openai', 'deepseek', 'minimax'].map((p) => (
                    <div key={p} className="space-y-4 p-6 bg-zinc-900/50 rounded-3xl border border-zinc-800">
                      <div className="flex items-center gap-3">
                        <Globe className="w-4 h-4 text-zinc-500" />
                        <p className="text-[10px] uppercase tracking-widest font-bold text-zinc-400">{p} Configuration</p>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold ml-1">API Key</label>
                          <input 
                            type="password"
                            value={providerKeys[p as keyof typeof providerKeys]}
                            onChange={(e) => setProviderKeys({ ...providerKeys, [p]: e.target.value })}
                            placeholder={`Enter ${p} API Key`}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-3 text-sm text-zinc-100 placeholder:text-zinc-800 focus:outline-none focus:border-zinc-700 transition-all"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold ml-1">Base URL (Optional)</label>
                          <input 
                            type="text"
                            value={providerUrls[p as keyof typeof providerUrls]}
                            onChange={(e) => setProviderUrls({ ...providerUrls, [p]: e.target.value })}
                            placeholder={`Default ${p} endpoint`}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-3 text-sm text-zinc-100 placeholder:text-zinc-800 focus:outline-none focus:border-zinc-700 transition-all"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button 
                  onClick={handleSaveProviders}
                  disabled={saving}
                  className="w-full py-5 bg-zinc-100 text-zinc-950 rounded-2xl font-bold uppercase tracking-widest text-xs hover:bg-zinc-200 transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                >
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                  {saving ? "Saving Config..." : "Update External Keys"}
                </button>
              </div>
            </div>
          ) : (
            <div className="markdown-body prose prose-invert prose-zinc prose-sm max-w-none">
              <Markdown>
                {activeTab === 'guide' ? README_MD : activeTab === 'quota' ? QUOTA_MD : PRIVACY_MD}
              </Markdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const DreamWorldMap = ({ locations }: { locations: any[] }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapData, setMapData] = useState<any>(null);
  const [tooltip, setTooltip] = useState<{ x: number, y: number, text: string } | null>(null);

  useEffect(() => {
    fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
      .then(res => res.json())
      .then(data => setMapData(data));
  }, []);

  useEffect(() => {
    if (!mapData || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    const width = 800;
    const height = 400;
    
    svg.selectAll('*').remove();

    const g = svg.append('g');

    const projection = d3.geoNaturalEarth1()
      .scale(140)
      .translate([width / 2, height / 2]);

    const path = d3.geoPath().projection(projection);

    const countries = topojson.feature(mapData, mapData.objects.countries) as any;

    // Country name normalization map
    const nameMap: { [key: string]: string } = {
      "united states of america": "united states",
      "united kingdom": "united kingdom",
      "russian federation": "russia",
      "korea": "south korea",
      "viet nam": "vietnam"
    };

    const normalize = (name: string) => {
      const lower = name.toLowerCase();
      return nameMap[lower] || lower;
    };

    // Create a map of country names to counts
    const countsMap = new Map();
    locations.forEach(loc => {
      countsMap.set(loc.country.toLowerCase(), loc.count);
    });

    // Draw countries
    g.selectAll('path')
      .data(countries.features)
      .enter()
      .append('path')
      .attr('d', path)
      .attr('fill', (d: any) => {
        const name = normalize(d.properties.name);
        const count = countsMap.get(name) || 0;
        return count > 0 ? '#f4f4f5' : '#18181b';
      })
      .attr('stroke', '#27272a')
      .attr('stroke-width', 0.5)
      .attr('class', 'country-path transition-colors duration-300')
      .on('mouseenter', (event: any, d: any) => {
        const name = d.properties.name;
        const count = countsMap.get(normalize(name)) || 0;
        setTooltip({
          x: event.offsetX,
          y: event.offsetY,
          text: `${name}: ${count} units`
        });
        d3.select(event.currentTarget).attr('fill', count > 0 ? '#ffffff' : '#27272a');
      })
      .on('mousemove', (event: any) => {
        setTooltip(prev => prev ? { ...prev, x: event.offsetX, y: event.offsetY } : null);
      })
      .on('mouseleave', (event: any, d: any) => {
        const name = normalize(d.properties.name);
        const count = countsMap.get(name) || 0;
        setTooltip(null);
        d3.select(event.currentTarget).attr('fill', count > 0 ? '#f4f4f5' : '#18181b');
      });

    // Add glowing dots for active locations
    g.append('g')
      .selectAll('circle')
      .data(countries.features.filter((d: any) => countsMap.has(normalize(d.properties.name))))
      .enter()
      .append('circle')
      .attr('cx', (d: any) => path.centroid(d)[0])
      .attr('cy', (d: any) => path.centroid(d)[1])
      .attr('r', 3)
      .attr('fill', '#f4f4f5')
      .attr('filter', 'blur(1px)')
      .style('opacity', 0.8)
      .append('animate')
      .attr('attributeName', 'r')
      .attr('values', '2;4;2')
      .attr('dur', '2s')
      .attr('repeatCount', 'indefinite');

    // Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 8])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

  }, [mapData, locations]);

  return (
    <div ref={containerRef} className="w-full aspect-[2/1] bg-zinc-950/50 rounded-3xl overflow-hidden border border-zinc-800 relative group cursor-crosshair">
      <svg
        ref={svgRef}
        viewBox="0 0 800 400"
        className="w-full h-full"
      />
      
      {/* Legend */}
      <div className="absolute bottom-6 left-6 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-zinc-100 rounded-full" />
          <span className="text-[9px] text-zinc-500 font-mono uppercase tracking-widest">Active Archive</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-zinc-900 border border-zinc-800 rounded-full" />
          <span className="text-[9px] text-zinc-500 font-mono uppercase tracking-widest">Silent Zone</span>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div 
          className="absolute pointer-events-none bg-zinc-100 text-zinc-950 px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-widest shadow-xl z-50 transition-transform duration-75"
          style={{ 
            left: tooltip.x + 15, 
            top: tooltip.y - 15,
            transform: 'translate(0, -50%)'
          }}
        >
          {tooltip.text}
        </div>
      )}

      {/* Controls Hint */}
      <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-[9px] text-zinc-600 font-mono uppercase tracking-widest bg-zinc-950/80 px-2 py-1 rounded border border-zinc-900">
          Scroll to Zoom • Drag to Pan
        </span>
      </div>

      {!mapData && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/50 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-zinc-700" />
            <p className="text-[10px] text-zinc-700 font-mono uppercase tracking-[0.3em]">Synchronizing Map Data</p>
          </div>
        </div>
      )}
    </div>
  );
};

const ThothLogo = ({ className = "w-20 h-20" }: { className?: string }) => (
  <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="moonGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#1e3a8a" />
        <stop offset="100%" stopColor="#6b21a8" />
      </linearGradient>
      <linearGradient id="cloudGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#7c3aed" />
        <stop offset="100%" stopColor="#db2777" />
      </linearGradient>
    </defs>
    {/* Moon */}
    <path 
      d="M80,50 A30,30 0 1,1 50,20 A40,40 0 1,0 80,50" 
      fill="url(#moonGradient)" 
    />
    {/* Cloud */}
    <path 
      d="M45,45 Q55,35 65,45 T85,45 Q90,55 80,65 T50,65 Q40,55 45,45" 
      fill="url(#cloudGradient)" 
      opacity="0.9"
    />
    {/* Stars */}
    <path d="M55,15 L57,20 L62,22 L57,24 L55,29 L53,24 L48,22 L53,20 Z" fill="#fff" />
    <path d="M70,25 L71,28 L74,29 L71,30 L70,33 L69,30 L66,29 L69,28 Z" fill="#fff" opacity="0.8" />
    <circle cx="60" cy="35" r="1.5" fill="#f472b6" />
  </svg>
);

const ErrorBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hasError, setHasError] = useState(false);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      setHasError(true);
      setErrorDetails(event.error?.message || 'Unknown error');
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
        <div className="bg-zinc-900 border border-red-500/20 p-8 rounded-2xl max-w-md w-full text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-zinc-100 mb-2">Something went wrong</h2>
          <p className="text-zinc-400 text-sm mb-6">{errorDetails}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-zinc-100 text-zinc-950 rounded-full font-medium hover:bg-zinc-200 transition-colors"
          >
            Reload App
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

const Navigation = ({ currentView, setCurrentView, onSignOut }: { currentView: View, setCurrentView: (v: View) => void, onSignOut: () => void }) => {
  const navItems = [
    { id: 'capture' as View, icon: Mic, label: 'Capture' },
    { id: 'hall' as View, icon: Globe, label: 'Hall' },
    { id: 'archive' as View, icon: History, label: 'Archive' },
    { id: 'settings' as View, icon: Settings, label: 'Settings' },
  ];

  return (
    <>
      {/* Desktop Sidebar */}
      <nav className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-20 lg:w-64 bg-zinc-950 border-r border-zinc-900 z-50 p-6">
        <div className="flex items-center gap-3 mb-12 lg:px-2">
          <ThothLogo className="w-8 h-8" />
          <span className="font-bold text-xl tracking-tight hidden lg:block">Thoth</span>
        </div>
        <div className="flex-1 space-y-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id)}
              className={cn(
                "w-full flex items-center gap-4 px-4 py-3 rounded-2xl transition-all group",
                currentView === item.id 
                  ? "bg-zinc-100 text-zinc-950 shadow-lg shadow-white/5" 
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
              )}
            >
              <item.icon className={cn("w-5 h-5", currentView === item.id ? "" : "group-hover:scale-110 transition-transform")} />
              <span className="text-sm font-medium hidden lg:block">{item.label}</span>
            </button>
          ))}
        </div>
        <button 
          onClick={onSignOut}
          className="flex items-center gap-4 px-4 py-3 rounded-2xl text-zinc-500 hover:text-red-400 hover:bg-red-400/5 transition-all group lg:px-4"
        >
          <LogOut className="w-5 h-5 group-hover:rotate-12 transition-transform" />
          <span className="text-sm font-medium hidden lg:block">Sign Out</span>
        </button>
      </nav>

      {/* Mobile Bottom Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-zinc-950/80 backdrop-blur-xl border-t border-zinc-900 z-50 px-6 py-4 flex items-center justify-between">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setCurrentView(item.id)}
            className={cn(
              "flex flex-col items-center gap-1 transition-all",
              currentView === item.id ? "text-zinc-100" : "text-zinc-600"
            )}
          >
            <item.icon className={cn("w-6 h-6", currentView === item.id ? "scale-110" : "")} />
            <span className="text-[8px] font-bold uppercase tracking-widest">{item.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [dreams, setDreams] = useState<Dream[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [entryMode, setEntryMode] = useState<'voice' | 'text'>('voice');
  const [manualText, setManualText] = useState('');
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDream, setSelectedDream] = useState<Dream | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>('guide');
  const [searchQuery, setSearchQuery] = useState('');
  const [hasUserKey, setHasUserKey] = useState(false);
  const [currentView, setCurrentView] = useState<View>('capture');
  const [globalImagery, setGlobalImagery] = useState<GlobalImagery[]>([]);
  const [globalLocations, setGlobalLocations] = useState<any[]>([]);
  const [userCountry, setUserCountry] = useState<string | null>(null);
  
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);

  // --- Auth & Sign In ---
  const handleSignIn = async () => {
    try {
      setError(null);
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err: any) {
      // Ignore errors caused by user closing the popup
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        console.log("Sign-in popup closed by user.");
        return;
      }
      console.error("Sign-in error:", err);
      setError("Failed to sign in. Please try again.");
    }
  };

  // --- API Key Logic ---
  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setHasUserKey(hasKey);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      // Assume success and update state
      setHasUserKey(true);
    }
  };

  const handleUpdateProfile = async (updates: Partial<UserProfile>) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), updates);
    } catch (err) {
      console.error("Update profile error:", err);
      setError("Failed to update settings.");
    }
  };

  const getAiInstance = () => {
    // Prioritize user-selected key (process.env.API_KEY) over developer key
    const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("No API Key configured. Please check your environment or select your own key.");
    }
    return new GoogleGenAI({ apiKey });
  };

  const analyzeDream = async (text: string) => {
    const provider = profile?.active_provider || 'gemini';
    
    if (provider === 'gemini') {
      const ai = getAiInstance();
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Extract 3-5 short, evocative keywords or subconscious symbols from this dream transcript. Return them as a simple comma-separated list. Transcript: ${text}`,
      });
      return response.text?.split(',').map(t => t.trim()) || [];
    }

    const config = profile?.external_apis?.[provider];
    if (!config?.key) {
      throw new Error(`API Key for ${provider} not configured in Settings.`);
    }

    let baseUrl = config.baseUrl;
    let model = config.model;

    if (provider === 'openai') {
      baseUrl = baseUrl || 'https://api.openai.com/v1';
      model = model || 'gpt-4o-mini';
    } else if (provider === 'deepseek') {
      baseUrl = baseUrl || 'https://api.deepseek.com';
      model = model || 'deepseek-chat';
    } else if (provider === 'minimax') {
      baseUrl = baseUrl || 'https://api.minimax.chat/v1';
      model = model || 'abab6.5-chat';
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.key}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are a dream analyst. Extract 3-5 short, evocative keywords or subconscious symbols from the dream transcript. Return them as a simple comma-separated list.' },
          { role: 'user', content: text }
        ]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || `Failed to call ${provider} API`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    return content.split(',').map((t: string) => t.trim()) || [];
  };

  // --- Fetch Global Imagery ---
  useEffect(() => {
    const q = query(
      collection(db, 'global_imagery'),
      orderBy('count', 'desc'),
      limit(10)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setGlobalImagery(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GlobalImagery)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'global_imagery');
    });
    return () => unsubscribe();
  }, []);

  // --- Fetch Global Locations ---
  useEffect(() => {
    const q = query(
      collection(db, 'global_locations'),
      orderBy('count', 'desc'),
      limit(10)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setGlobalLocations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'global_locations');
    });
    return () => unsubscribe();
  }, []);

  // --- Fetch User Country ---
  useEffect(() => {
    const fetchCountry = async () => {
      try {
        const res = await fetch('https://ipapi.co/json/');
        const data = await res.json();
        if (data.country_name) {
          setUserCountry(data.country_name);
        }
      } catch (e) {
        console.error("Failed to fetch country", e);
      }
    };
    fetchCountry();
  }, []);

  // --- Auth & Connection Test ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setLoading(false);
      
      if (currentUser) {
        // Ensure user profile exists
        const userRef = doc(db, 'users', currentUser.uid);
        try {
          const userSnap = await getDoc(userRef);
          if (!userSnap.exists()) {
            await setDoc(userRef, {
              email: currentUser.email,
              created_at: serverTimestamp(),
              daily_usage_count: 0,
              daily_quota_limit: 3, // Default daily quota
              last_usage_date: new Date().toISOString().split('T')[0]
            });
          }
        } catch (err) {
          console.error("Error ensuring user profile:", err);
        }

        // Test connection with retry
        const testConnection = async (retries = 3) => {
          try {
            await getDocFromServer(doc(db, 'test', 'connection'));
            setError(null);
            console.log("Firebase connection successful.");
          } catch (err) {
            console.error("Connection test failed:", err);
            if (err instanceof Error && err.message.includes('the client is offline')) {
              if (retries > 0) {
                console.log(`Retrying connection test... (${retries} left)`);
                setTimeout(() => testConnection(retries - 1), 2000);
              } else {
                setError("Firebase connection failed. This usually means the database is still initializing. Please wait 1-2 minutes and refresh.");
              }
            } else if (err instanceof Error && (err.message.includes('permission-denied') || err.message.includes('Missing or insufficient permissions'))) {
              // This is actually a good sign - it means we reached the server!
              console.log("Reached server, but permission denied for test doc (expected if doc doesn't exist).");
              setError(null);
            } else {
              // Show actual error for debugging
              setError(`Firebase Error: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        };
        testConnection();
      }
    });

    return () => unsubscribe();
  }, []);

  // --- Real-time Dreams ---
  useEffect(() => {
    if (!user) {
      setDreams([]);
      return;
    }

    const q = query(
      collection(db, 'dreams'),
      where('user_id', '==', user.uid),
      orderBy('created_at', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dreamList: Dream[] = [];
      snapshot.forEach((doc) => {
        dreamList.push({ id: doc.id, ...doc.data() } as Dream);
      });
      setDreams(dreamList);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'dreams');
    });

    return () => unsubscribe();
  }, [user]);

  // --- Real-time Profile ---
  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    
    const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (doc) => {
      if (doc.exists()) {
        setProfile(doc.data() as UserProfile);
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
    });
    
    return () => unsubscribe();
  }, [user]);

  // --- Recording Logic ---
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Determine supported MIME type
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') 
        ? 'audio/webm' 
        : MediaRecorder.isTypeSupported('audio/ogg') 
          ? 'audio/ogg' 
          : 'audio/wav';

      mediaRecorder.current = new MediaRecorder(stream, { mimeType });
      audioChunks.current = [];

      mediaRecorder.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
        }
      };

      mediaRecorder.current.onstop = async () => {
        const audioBlob = new Blob(audioChunks.current, { type: mimeType });
        await processDream(audioBlob, mimeType);
      };

      mediaRecorder.current.start();
      setIsRecording(true);
      setError(null);
    } catch (err) {
      console.error("Recording error:", err);
      setError("Microphone access denied or not supported.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && isRecording) {
      mediaRecorder.current.stop();
      setIsRecording(false);
      mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  // --- AI Transcription & Save ---
  const processDream = async (audioBlob: Blob, mimeType: string) => {
    if (!user || !profile) return;
    
    // Quota Check
    const isUsingPublicQuota = !hasUserKey;
    const today = new Date().toISOString().split('T')[0];
    const isNewDay = profile.last_usage_date !== today;
    const currentUsage = isNewDay ? 0 : profile.daily_usage_count;

    if (isUsingPublicQuota && currentUsage >= profile.daily_quota_limit) {
      setError("You have reached your daily public quota limit (3 dreams). Please select your own API key to continue recording.");
      setTranscribing(false);
      return;
    }

    setTranscribing(true);
    setError(null);

    try {
      // 1. Upload to Storage
      const dreamId = Math.random().toString(36).substring(7);
      const extension = mimeType.split('/')[1] || 'webm';
      const storageRef = ref(storage, `dreams/${user.uid}/${dreamId}.${extension}`);
      await uploadBytes(storageRef, audioBlob);
      const audioUrl = await getDownloadURL(storageRef);

      // 2. Transcribe with Gemini
      const ai = getAiInstance();
      const reader = new FileReader();
      
      const base64Audio = await new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.readAsDataURL(audioBlob);
      });

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              { text: "Transcribe this dream recording accurately. Return only the transcription text." },
              { inlineData: { mimeType: mimeType, data: base64Audio } }
            ]
          }
        ]
      });

      const transcript = response.text || "No transcription available.";
      const tags = await analyzeDream(transcript);
      
      // 3. Save to Firestore
      await addDoc(collection(db, 'dreams'), {
        user_id: user.uid,
        transcript,
        audio_url: audioUrl,
        tags,
        location: userCountry || "Unknown",
        created_at: serverTimestamp(),
      });

      // 4. Update Global Imagery, Streak & Location
      await updateGlobalImagery(tags);
      await updateStreak();
      if (userCountry) await updateGlobalLocation(userCountry);

      // 5. Update Quota
      if (isUsingPublicQuota) {
        const userRef = doc(db, 'users', user.uid);
        const today = new Date().toISOString().split('T')[0];
        const isNewDay = profile.last_usage_date !== today;

        if (isNewDay) {
          await updateDoc(userRef, {
            daily_usage_count: 1,
            last_usage_date: today
          });
        } else {
          await updateDoc(userRef, {
            daily_usage_count: increment(1)
          });
        }
      }

    } catch (err) {
      console.error(err);
      setError("Failed to process dream. Please try again.");
    } finally {
      setTranscribing(false);
    }
  };

  const updateGlobalImagery = async (tags: string[]) => {
    for (const tag of tags) {
      const tagRef = doc(db, 'global_imagery', tag.toLowerCase());
      try {
        await setDoc(tagRef, {
          tag: tag.toLowerCase(),
          count: increment(1),
          last_updated: serverTimestamp()
        }, { merge: true });
      } catch (err) {
        console.error("Global imagery update error:", err);
      }
    }
  };

  const updateGlobalLocation = async (country: string) => {
    const locRef = doc(db, 'global_locations', country);
    try {
      await setDoc(locRef, {
        country,
        count: increment(1),
        last_updated: serverTimestamp()
      }, { merge: true });
    } catch (err) {
      console.error("Global location update error:", err);
    }
  };

  const updateStreak = async () => {
    if (!user || !profile) return;
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    
    let newStreak = profile.streak || 0;
    if (profile.last_streak_date === yesterday) {
      newStreak += 1;
    } else if (profile.last_streak_date !== today) {
      newStreak = 1;
    }

    await updateDoc(doc(db, 'users', user.uid), {
      streak: newStreak,
      last_streak_date: today
    });
  };

  const handleManualSave = async () => {
    if (!user || !profile || !manualText.trim()) return;

    // Quota Check
    const isUsingPublicQuota = !hasUserKey;
    const today = new Date().toISOString().split('T')[0];
    const isNewDay = profile.last_usage_date !== today;
    const currentUsage = isNewDay ? 0 : profile.daily_usage_count;

    if (isUsingPublicQuota && currentUsage >= profile.daily_quota_limit) {
      setError("You have reached your daily public quota limit (3 dreams). Please select your own API key to continue recording.");
      return;
    }

    setTranscribing(true);
    setError(null);

    try {
      const tags = await analyzeDream(manualText);

      await addDoc(collection(db, 'dreams'), {
        user_id: user.uid,
        transcript: manualText,
        tags,
        location: userCountry || "Unknown",
        created_at: serverTimestamp(),
      });

      // Update Global Imagery, Streak & Location
      await updateGlobalImagery(tags);
      await updateStreak();
      if (userCountry) await updateGlobalLocation(userCountry);

      // Update Quota
      if (isUsingPublicQuota) {
        const userRef = doc(db, 'users', user.uid);
        const today = new Date().toISOString().split('T')[0];
        const isNewDay = profile.last_usage_date !== today;

        if (isNewDay) {
          await updateDoc(userRef, {
            daily_usage_count: 1,
            last_usage_date: today
          });
        } else {
          await updateDoc(userRef, {
            daily_usage_count: increment(1)
          });
        }
      }

      setManualText('');
      setEntryMode('voice');
    } catch (err) {
      console.error(err);
      setError("Failed to save dream.");
    } finally {
      setTranscribing(false);
    }
  };

  const filteredDreams = dreams.filter(dream => 
    dream.transcript.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const deleteDream = async (dreamId: string) => {
    if (!window.confirm("Are you sure you want to delete this dream from the archive?")) return;
    try {
      await deleteDoc(doc(db, 'dreams', dreamId));
      setSelectedDream(null);
    } catch (err) {
      console.error("Delete error:", err);
      setError("Failed to delete dream.");
    }
  };

  // --- UI ---
  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-zinc-500 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-sm"
        >
          <div className="w-24 h-24 flex items-center justify-center mx-auto mb-8">
            <ThothLogo className="w-full h-full" />
          </div>
          <h1 className="text-4xl font-bold text-zinc-100 mb-4 tracking-tight">Thoth</h1>
          <p className="text-zinc-400 mb-10 leading-relaxed">
            The archive of human subconscious. Record your dreams before they fade.
          </p>
          
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-xs">
              {error}
            </div>
          )}

          <button 
            onClick={handleSignIn}
            className="w-full py-4 bg-zinc-100 text-zinc-950 rounded-2xl font-semibold hover:bg-zinc-200 transition-all flex items-center justify-center gap-3 shadow-lg shadow-white/5"
          >
            <Sparkles className="w-5 h-5" />
            Sign in with Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-zinc-100 selection:text-zinc-950 flex flex-col md:flex-row">
        <Navigation 
          currentView={currentView} 
          setCurrentView={setCurrentView} 
          onSignOut={() => signOut(auth)} 
        />

        <main className="flex-1 md:ml-20 lg:ml-64 min-h-screen flex flex-col">
          {/* Mobile Header */}
          <header className="md:hidden sticky top-0 z-40 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-900 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ThothLogo className="w-8 h-8" />
              <span className="font-bold text-lg tracking-tight">Thoth</span>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={handleSelectKey}
                className={cn(
                  "flex items-center gap-2 px-3 py-1 rounded-full border transition-all text-[9px] font-mono uppercase tracking-widest",
                  hasUserKey 
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" 
                    : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300"
                )}
              >
                <Sparkles className="w-3 h-3" />
                {hasUserKey ? "Personal" : "Quota"}
              </button>
            </div>
          </header>

          <div className="flex-1 max-w-5xl mx-auto w-full px-6 py-12 pb-32 md:pb-12">
            <AnimatePresence mode="wait">
              {currentView === 'capture' && (
                <motion.div
                  key="capture"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-16"
                >
                  {/* Stats & Streak */}
                  <div className="flex items-center gap-4">
                    <div className="px-6 py-3 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center gap-3">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                      <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">
                        {profile?.streak || 0} Day Streak
                      </span>
                    </div>
                    <div className="px-6 py-3 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center gap-3">
                      <Cpu className="w-4 h-4 text-zinc-500" />
                      <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">
                        {dreams.length} Atomic Units
                      </span>
                    </div>
                  </div>

                  {/* Hero / Record Section */}
                  <section className="text-center py-12">
                    <div className="flex justify-center gap-4 mb-12">
                      <button 
                        onClick={() => setEntryMode('voice')}
                        className={cn(
                          "text-[10px] uppercase tracking-[0.2em] font-bold px-6 py-2 rounded-full border transition-all",
                          entryMode === 'voice' ? "bg-zinc-100 text-zinc-950 border-zinc-100" : "text-zinc-500 border-zinc-900 hover:border-zinc-800"
                        )}
                      >
                        Voice
                      </button>
                      <button 
                        onClick={() => setEntryMode('text')}
                        className={cn(
                          "text-[10px] uppercase tracking-[0.2em] font-bold px-6 py-2 rounded-full border transition-all",
                          entryMode === 'text' ? "bg-zinc-100 text-zinc-950 border-zinc-100" : "text-zinc-500 border-zinc-900 hover:border-zinc-800"
                        )}
                      >
                        Text
                      </button>
                    </div>

                    <AnimatePresence mode="wait">
                      {entryMode === 'voice' ? (
                        !isRecording && !transcribing ? (
                          <motion.div
                            key="idle"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                          >
                            <h2 className="text-4xl font-light mb-12 text-zinc-400 tracking-tight leading-tight">
                              Just woke up? <br />
                              <span className="text-zinc-100 font-medium">Capture the dream.</span>
                            </h2>
                            <button 
                              onClick={startRecording}
                              className="group relative w-40 h-40 bg-zinc-900 rounded-full mx-auto flex items-center justify-center border border-zinc-800 hover:border-zinc-700 transition-all shadow-2xl shadow-zinc-950"
                            >
                              <div className="absolute inset-0 bg-zinc-100/5 rounded-full scale-0 group-hover:scale-100 transition-transform duration-500" />
                              <Mic className="w-12 h-12 text-zinc-100" />
                            </button>
                          </motion.div>
                        ) : isRecording ? (
                          <motion.div
                            key="recording"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex flex-col items-center"
                          >
                            <div className="w-40 h-40 bg-red-500/5 rounded-full flex items-center justify-center border border-red-500/20 mb-8 relative">
                              <motion.div 
                                animate={{ scale: [1, 1.15, 1] }}
                                transition={{ repeat: Infinity, duration: 2 }}
                                className="absolute inset-0 bg-red-500/5 rounded-full"
                              />
                              <button 
                                onClick={stopRecording}
                                className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center hover:scale-95 transition-transform"
                              >
                                <Square className="w-8 h-8 text-white fill-white" />
                              </button>
                            </div>
                            <p className="text-red-500 font-mono text-xs uppercase tracking-[0.3em] animate-pulse">Recording Subconscious</p>
                          </motion.div>
                        ) : (
                          <motion.div
                            key="transcribing"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex flex-col items-center"
                          >
                            <div className="w-40 h-40 bg-zinc-900 rounded-full flex items-center justify-center border border-zinc-800 mb-8">
                              <Loader2 className="w-12 h-12 text-zinc-500 animate-spin" />
                            </div>
                            <p className="text-zinc-500 font-mono text-xs uppercase tracking-[0.3em]">Archiving to Base</p>
                          </motion.div>
                        )
                      ) : (
                        <motion.div
                          key="text-entry"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="w-full"
                        >
                          <textarea 
                            value={manualText}
                            onChange={(e) => setManualText(e.target.value)}
                            placeholder="Type your dream here..."
                            className="w-full h-48 bg-zinc-900/50 border border-zinc-800 rounded-[2rem] p-8 text-zinc-100 placeholder:text-zinc-700 focus:outline-none focus:border-zinc-700 transition-all resize-none mb-6 text-lg leading-relaxed"
                          />
                          <button 
                            onClick={handleManualSave}
                            disabled={!manualText.trim() || transcribing}
                            className="w-full py-5 bg-zinc-100 text-zinc-950 rounded-2xl font-bold uppercase tracking-widest text-xs hover:bg-zinc-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                          >
                            {transcribing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                            {transcribing ? "Analyzing..." : "Save to Archive"}
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {error && (
                      <p className="mt-6 text-red-500/80 text-[10px] uppercase tracking-widest flex items-center justify-center gap-2">
                        <AlertCircle className="w-3 h-3" />
                        {error}
                      </p>
                    )}
                  </section>
                </motion.div>
              )}

              {currentView === 'hall' && (
                <motion.div
                  key="hall"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-16"
                >
                  {/* Imagery Hall (意象大厅) */}
                  <div>
                    <div className="flex items-center justify-between mb-8">
                      <div>
                        <h2 className="text-2xl font-bold text-zinc-100 tracking-tight">Imagery Hall</h2>
                        <p className="text-xs text-zinc-500 font-mono uppercase tracking-widest">Trending atomic information in the dreambase</p>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-full">
                        <Globe className="w-3 h-3 text-zinc-500" />
                        <span className="text-[10px] text-zinc-500 font-mono uppercase">Global</span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                      {globalImagery.length > 0 ? (
                        globalImagery.map((item, idx) => (
                          <motion.div
                            key={item.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            className="p-4 bg-zinc-900 border border-zinc-800 rounded-2xl flex flex-col items-center justify-center text-center group hover:border-zinc-700 transition-all"
                          >
                            <span className="text-xs font-bold text-zinc-200 mb-1 group-hover:text-white transition-colors">#{item.tag}</span>
                            <span className="text-[10px] font-mono text-zinc-600">{item.count} hits</span>
                          </motion.div>
                        ))
                      ) : (
                        <div className="col-span-full py-8 text-center border border-dashed border-zinc-800 rounded-3xl">
                          <p className="text-xs text-zinc-600 font-mono uppercase tracking-widest">The hall is currently silent...</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Dream Map (梦境地图) */}
                  <div>
                    <div className="flex items-center justify-between mb-8">
                      <div>
                        <h2 className="text-2xl font-bold text-zinc-100 tracking-tight">Dream Map</h2>
                        <p className="text-xs text-zinc-500 font-mono uppercase tracking-widest">Global subconscious pulse by country</p>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-full">
                        <MapIcon className="w-3 h-3 text-zinc-500" />
                        <span className="text-[10px] text-zinc-500 font-mono uppercase">Live</span>
                      </div>
                    </div>
                    
                    <div className="bg-zinc-900 border border-zinc-800 rounded-[2.5rem] p-8 space-y-8">
                      <DreamWorldMap locations={globalLocations} />
                      
                      {globalLocations.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-4">
                          {globalLocations.map((loc, idx) => (
                            <div key={loc.id} className="flex items-center gap-4">
                              <span className="text-[10px] font-mono text-zinc-700 w-6">{idx + 1}.</span>
                              <div className="flex-1">
                                <div className="flex justify-between mb-2">
                                  <span className="text-xs font-bold text-zinc-300 uppercase tracking-widest">{loc.country}</span>
                                  <span className="text-[10px] font-mono text-zinc-500">{loc.count} units</span>
                                </div>
                                <div className="h-1 bg-zinc-950 rounded-full overflow-hidden">
                                  <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${(loc.count / globalLocations[0].count) * 100}%` }}
                                    className="h-full bg-zinc-100"
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="py-8 text-center border border-dashed border-zinc-800 rounded-3xl">
                          <p className="text-xs text-zinc-600 font-mono uppercase tracking-widest">The map is currently dark...</p>
                        </div>
                      )}
                      {userCountry && (
                        <div className="mt-8 pt-8 border-t border-zinc-800 flex items-center justify-between">
                          <span className="text-[10px] text-zinc-600 font-mono uppercase tracking-widest">Your Location</span>
                          <span className="text-xs font-bold text-emerald-500 uppercase tracking-widest">{userCountry}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              {currentView === 'archive' && (
                <motion.div
                  key="archive"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-12">
                    <div className="flex items-center gap-3 text-zinc-600">
                      <History className="w-4 h-4" />
                      <h3 className="text-[10px] uppercase tracking-[0.3em] font-bold">Timeline</h3>
                    </div>
                    
                    <div className="relative flex-1 max-w-xs">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-700" />
                      <input 
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search archive..."
                        className="w-full bg-zinc-900/50 border border-zinc-900 rounded-full py-2 pl-10 pr-4 text-[10px] font-mono text-zinc-400 placeholder:text-zinc-700 focus:outline-none focus:border-zinc-800 transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-12">
                    {filteredDreams.length === 0 ? (
                      <div className="py-24 text-center border border-dashed border-zinc-900 rounded-[2.5rem]">
                        <p className="text-zinc-700 font-mono text-xs uppercase tracking-widest">
                          {searchQuery ? "No matches found" : "Archive Empty"}
                        </p>
                      </div>
                    ) : (
                      filteredDreams.map((dream) => (
                        <motion.article 
                          key={dream.id}
                          layout
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          onClick={() => setSelectedDream(dream)}
                          className="relative pl-8 border-l border-zinc-900 group cursor-pointer"
                        >
                          <div className="absolute -left-[5px] top-0 w-2 h-2 bg-zinc-800 rounded-full group-hover:bg-zinc-100 transition-colors" />
                          
                          <header className="flex items-center gap-4 mb-4">
                            <time className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
                              {dream.created_at?.toDate().toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric', 
                                year: 'numeric'
                              })}
                            </time>
                            <span className="text-[10px] font-mono text-zinc-800 tracking-tighter">
                              {dream.created_at?.toDate().toLocaleTimeString('en-US', { 
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: false
                              })}
                            </span>
                            {dream.audio_url && (
                              <Volume2 className="w-3 h-3 text-zinc-700 group-hover:text-zinc-400 transition-colors" />
                            )}
                          </header>
                          
                          <div className="bg-zinc-900/30 border border-zinc-900/50 p-8 rounded-[2rem] group-hover:border-zinc-800 transition-all">
                            <p className="text-zinc-400 leading-relaxed font-serif italic text-lg line-clamp-3">
                              "{dream.transcript}"
                            </p>
                          </div>
                        </motion.article>
                      ))
                    )}
                  </div>
                </motion.div>
              )}

              {currentView === 'settings' && (
                <motion.div
                  key="settings"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="bg-zinc-900/30 border border-zinc-900 rounded-[2.5rem] overflow-hidden min-h-[70vh] flex flex-col"
                >
                  <div className="p-8 border-b border-zinc-800 flex items-center gap-4 bg-zinc-900/50">
                    <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-400">
                      <Settings className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold">Settings</h2>
                      <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono">System Configuration</p>
                    </div>
                  </div>
                  <SettingsContent 
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    onSelectKey={handleSelectKey}
                    hasUserKey={hasUserKey}
                    profile={profile}
                    onUpdateProfile={handleUpdateProfile}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer Info */}
          <footer className="max-w-2xl mx-auto px-6 py-12 border-t border-zinc-900 text-center opacity-30">
            <p className="text-zinc-800 text-[9px] tracking-[0.4em] uppercase mb-4">
              Thoth v1.0 • Subconscious Archive System
            </p>
            <div className="flex justify-center grayscale">
              <ThothLogo className="w-4 h-4" />
            </div>
          </footer>
        </main>

        {/* Modals */}
        <AnimatePresence>
          {selectedDream && (
            <DreamDetailModal 
              dream={selectedDream} 
              onClose={() => setSelectedDream(null)} 
              onDelete={() => deleteDream(selectedDream.id)}
            />
          )}
        </AnimatePresence>
      </div>
    </ErrorBoundary>
  );

}
