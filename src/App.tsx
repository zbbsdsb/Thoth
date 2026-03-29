import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  MicOff, 
  History, 
  Settings, 
  Moon, 
  Sun, 
  Sparkles, 
  Cloud, 
  Wind, 
  Zap,
  Plus,
  Trash2,
  Search,
  ChevronRight,
  LogOut,
  User,
  Globe,
  BarChart3,
  MapPin,
  Clock,
  Calendar,
  Info,
  AlertCircle,
  CheckCircle2,
  X,
  Keyboard,
  Mic2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { 
  initializeApp 
} from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp, 
  doc, 
  updateDoc, 
  deleteDoc,
  getDoc,
  setDoc,
  increment,
  getDocs,
  limit,
  Timestamp
} from 'firebase/firestore';
import { 
  getStorage, 
  ref, 
  uploadBytes, 
  getDownloadURL 
} from 'firebase/storage';
import { Toaster, toast } from 'sonner';
import Markdown from 'react-markdown';

// --- Firebase Config ---
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

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

interface UserProfile {
  email: string;
  created_at: Timestamp;
  daily_usage_count: number;
  daily_quota_limit: number;
  last_usage_date: string | null;
  total_dreams: number;
  active_provider: 'gemini' | 'openai' | 'deepseek' | 'minimax';
  external_apis: {
    [key: string]: string;
  };
  streak: number;
  last_streak_date: string | null;
}

interface Dream {
  id: string;
  user_id: string;
  transcript: string;
  audio_url?: string;
  tags: string[];
  insight: string;
  location: string;
  created_at: Timestamp;
}

interface GlobalImagery {
  tag: string;
  count: number;
}

interface GlobalLocation {
  country: string;
  count: number;
}

// --- Error Handling ---
const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
};

// --- Main App Component ---
export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [dreams, setDreams] = useState<Dream[]>([]);
  const [globalImagery, setGlobalImagery] = useState<GlobalImagery[]>([]);
  const [globalLocations, setGlobalLocations] = useState<GlobalLocation[]>([]);
  
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'record' | 'history' | 'global' | 'settings'>('record');
  const [searchQuery, setSearchQuery] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualText, setManualText] = useState("");
  const [entryMode, setEntryMode] = useState<'voice' | 'text'>('voice');
  const [userCountry, setUserCountry] = useState<string | null>(null);

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);

  // --- Auth & Profile ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const userRef = doc(db, 'users', u.uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          const newProfile: UserProfile = {
            email: u.email || "",
            created_at: Timestamp.now(),
            daily_usage_count: 0,
            daily_quota_limit: 3,
            last_usage_date: null,
            total_dreams: 0,
            active_provider: 'gemini',
            external_apis: {},
            streak: 0,
            last_streak_date: null
          };
          await setDoc(userRef, newProfile);
          setProfile(newProfile);
        } else {
          setProfile(snap.data() as UserProfile);
        }
        
        // Fetch location
        try {
          const res = await fetch('https://ipapi.co/json/');
          const data = await res.json();
          setUserCountry(data.country_name || "Unknown");
        } catch (e) {
          console.warn("Location fetch failed", e);
        }
      } else {
        setProfile(null);
        setDreams([]);
      }
    });
    return () => unsubscribe();
  }, []);

  // --- Real-time Listeners ---
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'dreams'), where('user_id', '==', user.uid), orderBy('created_at', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      setDreams(snap.docs.map(d => ({ id: d.id, ...d.data() } as Dream)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'dreams'));
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const q = query(collection(db, 'global_imagery'), orderBy('count', 'desc'), limit(20));
    const unsubscribe = onSnapshot(q, (snap) => {
      setGlobalImagery(snap.docs.map(d => d.data() as GlobalImagery));
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'global_locations'), orderBy('count', 'desc'), limit(10));
    const unsubscribe = onSnapshot(q, (snap) => {
      setGlobalLocations(snap.docs.map(d => d.data() as GlobalLocation));
    });
    return () => unsubscribe();
  }, []);

  // --- AI Service ---
  const hasUserKey = profile?.external_apis?.minimax || false;
  const apiKey = profile?.external_apis?.minimax || process.env.GEMINI_API_KEY;

  const analyzeDream = async (text: string) => {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze this dream transcript. Extract 3-5 key imagery tags (single words) and provide a short, poetic psychological insight (max 2 sentences). Return as JSON: { "tags": ["tag1", "tag2"], "insight": "..." }`,
      config: {
        responseMimeType: "application/json"
      }
    });
    
    try {
      return JSON.parse(response.text || "{}");
    } catch (e) {
      return { tags: ["mystery", "subconscious"], insight: "The mind weaves patterns beyond immediate comprehension." };
    }
  };

  // --- Recording Logic ---
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/wav';
      mediaRecorder.current = new MediaRecorder(stream, { mimeType });
      audioChunks.current = [];

      mediaRecorder.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.current.push(e.data);
      };

      mediaRecorder.current.onstop = async () => {
        const audioBlob = new Blob(audioChunks.current, { type: mimeType });
        await processDream(audioBlob, mimeType);
      };

      mediaRecorder.current.start();
      setIsRecording(true);
    } catch (err) {
      toast.error("Microphone access denied.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && isRecording) {
      mediaRecorder.current.stop();
      setIsRecording(false);
      mediaRecorder.current.stream.getTracks().forEach(t => t.stop());
    }
  };

  const processDream = async (audioBlob: Blob, mimeType: string) => {
    if (!user || !profile) return;
    
    const isUsingPublicQuota = !hasUserKey;
    const today = new Date().toISOString().split('T')[0];
    const isNewDay = profile.last_usage_date !== today;
    const currentUsage = isNewDay ? 0 : profile.daily_usage_count;

    if (isUsingPublicQuota && currentUsage >= profile.daily_quota_limit) {
      toast.error("Daily quota reached. Please add your own API key.");
      return;
    }

    setTranscribing(true);
    try {
      // 1. Storage
      const dreamId = Math.random().toString(36).substring(7);
      const storageRef = ref(storage, `dreams/${user.uid}/${dreamId}.webm`);
      await uploadBytes(storageRef, audioBlob);
      const audioUrl = await getDownloadURL(storageRef);

      // 2. Transcription
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      const base64Audio = await new Promise<string>((resolve) => {
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      });

      const ai = new GoogleGenAI({ apiKey });
      const transcriptionRes = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ parts: [{ text: "Transcribe this dream accurately." }, { inlineData: { mimeType, data: base64Audio } }] }]
      });
      const transcript = transcriptionRes.text || "No transcription available.";

      // 3. Analysis (Non-blocking)
      let tags: string[] = [];
      let insight = "Subconscious patterns detected.";
      try {
        const analysis = await analyzeDream(transcript);
        tags = analysis.tags;
        insight = analysis.insight;
      } catch (err: any) {
        console.warn("AI Analysis skipped:", err.message);
        toast.error(`AI Analysis skipped: ${err.message}`, { duration: 3000 });
      }

      // 4. Save Dream
      await addDoc(collection(db, 'dreams'), {
        user_id: user.uid,
        transcript,
        audio_url: audioUrl,
        tags,
        insight,
        location: userCountry || "Unknown",
        created_at: serverTimestamp(),
      });
      toast.success("Dream archived successfully.");

      // 5. Global Stats
      await updateGlobalImagery(tags);
      if (userCountry) await updateGlobalLocation(userCountry);

      // 6. Consolidate User Update
      await syncUserStats(isUsingPublicQuota);

    } catch (err: any) {
      console.error("Process dream error:", err);
      let errorMessage = "Failed to process dream.";
      try {
        const parsed = JSON.parse(err.message);
        if (parsed.error) errorMessage = `Process failed: ${parsed.error}`;
      } catch {
        if (err.message) errorMessage = `Process failed: ${err.message}`;
      }
      toast.error(errorMessage);
    } finally {
      setTranscribing(false);
    }
  };

  const handleManualSave = async () => {
    if (!user || !profile || !manualText.trim()) return;
    
    const isUsingPublicQuota = !hasUserKey;
    const today = new Date().toISOString().split('T')[0];
    const isNewDay = profile.last_usage_date !== today;
    const currentUsage = isNewDay ? 0 : profile.daily_usage_count;

    if (isUsingPublicQuota && currentUsage >= profile.daily_quota_limit) {
      toast.error("Daily quota reached.");
      return;
    }

    setTranscribing(true);
    try {
      let tags: string[] = [];
      let insight = "Subconscious patterns detected.";
      try {
        const analysis = await analyzeDream(manualText);
        tags = analysis.tags;
        insight = analysis.insight;
      } catch (err: any) {
        toast.error(`AI Analysis skipped: ${err.message}`);
      }

      await addDoc(collection(db, 'dreams'), {
        user_id: user.uid,
        transcript: manualText,
        tags,
        insight,
        location: userCountry || "Unknown",
        created_at: serverTimestamp(),
      });
      toast.success("Dream archived successfully.");

      await updateGlobalImagery(tags);
      if (userCountry) await updateGlobalLocation(userCountry);
      await syncUserStats(isUsingPublicQuota);

      setManualText("");
      setEntryMode('voice');
    } catch (err: any) {
      console.error("Manual save error:", err);
      let errorMessage = "Failed to save dream.";
      try {
        const parsed = JSON.parse(err.message);
        if (parsed.error) errorMessage = `Save failed: ${parsed.error}`;
      } catch {
        if (err.message) errorMessage = `Save failed: ${err.message}`;
      }
      toast.error(errorMessage);
    } finally {
      setTranscribing(false);
    }
  };

  const syncUserStats = async (isUsingPublicQuota: boolean) => {
    if (!user || !profile) return;
    const userRef = doc(db, 'users', user.uid);
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    
    let newStreak = profile.streak || 0;
    if (profile.last_streak_date === yesterday) {
      newStreak += 1;
    } else if (profile.last_streak_date !== today) {
      newStreak = 1;
    }

    const isNewDay = profile.last_usage_date !== today;
    const userUpdate: any = {
      total_dreams: increment(1),
      streak: newStreak,
      last_streak_date: today
    };

    if (isUsingPublicQuota) {
      if (isNewDay) {
        userUpdate.daily_usage_count = 1;
        userUpdate.last_usage_date = today;
      } else {
        userUpdate.daily_usage_count = increment(1);
      }
    }

    try {
      await updateDoc(userRef, userUpdate);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const updateGlobalImagery = async (tags: string[]) => {
    for (const tag of tags) {
      const tagRef = doc(db, 'global_imagery', tag.toLowerCase());
      await setDoc(tagRef, {
        tag: tag.toLowerCase(),
        count: increment(1),
        last_updated: serverTimestamp()
      }, { merge: true });
    }
  };

  const updateGlobalLocation = async (country: string) => {
    const locRef = doc(db, 'global_locations', country);
    await setDoc(locRef, {
      country,
      count: increment(1),
      last_updated: serverTimestamp()
    }, { merge: true });
  };

  // --- UI Components ---
  return (
    <div className="min-h-screen bg-[#050505] text-[#E4E3E0] font-sans selection:bg-[#F27D26] selection:text-black overflow-x-hidden">
      <Toaster position="top-center" theme="dark" />
      
      {/* Background Atmosphere */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#F27D26]/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#4A90E2]/5 blur-[120px] rounded-full" />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#050505]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 group cursor-pointer" onClick={() => setActiveTab('record')}>
            <div className="w-10 h-10 bg-[#F27D26] rounded-xl flex items-center justify-center shadow-lg shadow-[#F27D26]/20 group-hover:scale-105 transition-transform">
              <Sparkles className="w-6 h-6 text-black" />
            </div>
            <span className="text-xl font-bold tracking-tight uppercase italic font-serif">Oneiroi</span>
          </div>

          <div className="hidden md:flex items-center gap-8">
            {[
              { id: 'record', label: 'Record', icon: Mic2 },
              { id: 'history', label: 'Archive', icon: History },
              { id: 'global', label: 'Collective', icon: Globe },
              { id: 'settings', label: 'Settings', icon: Settings },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 text-sm font-medium uppercase tracking-widest transition-colors ${
                  activeTab === tab.id ? 'text-[#F27D26]' : 'text-white/40 hover:text-white'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-3 pl-4 border-l border-white/10">
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-bold uppercase tracking-tighter text-white/40">Dreamer</p>
                  <p className="text-sm font-medium">{user.displayName?.split(' ')[0]}</p>
                </div>
                <img 
                  src={user.photoURL || ""} 
                  alt="Avatar" 
                  className="w-10 h-10 rounded-full border border-white/10"
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : (
              <button 
                onClick={() => signInWithPopup(auth, new GoogleAuthProvider())}
                className="px-6 py-2 bg-white text-black text-sm font-bold uppercase tracking-widest rounded-full hover:bg-[#F27D26] transition-colors"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pt-32 pb-20 px-6 max-w-7xl mx-auto relative z-10">
        <AnimatePresence mode="wait">
          {activeTab === 'record' && (
            <motion.div 
              key="record"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center justify-center min-h-[60vh] text-center"
            >
              <div className="mb-12">
                <h1 className="text-7xl md:text-9xl font-bold uppercase tracking-tighter leading-none mb-6 italic font-serif">
                  Capture the <span className="text-[#F27D26]">Unseen</span>
                </h1>
                <p className="text-xl text-white/40 max-w-2xl mx-auto font-light">
                  Whisper your subconscious patterns into the archive. Let the collective mind decode the imagery of your sleep.
                </p>
              </div>

              <div className="flex flex-col items-center gap-8">
                {entryMode === 'voice' ? (
                  <div className="relative">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={isRecording ? stopRecording : startRecording}
                      disabled={isTranscribing}
                      className={`w-40 h-40 rounded-full flex items-center justify-center relative z-10 transition-colors ${
                        isRecording ? 'bg-red-500' : 'bg-[#F27D26]'
                      } ${isTranscribing ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {isRecording ? (
                        <MicOff className="w-16 h-16 text-white animate-pulse" />
                      ) : (
                        <Mic className="w-16 h-16 text-black" />
                      )}
                    </motion.button>
                    
                    {isRecording && (
                      <motion.div 
                        initial={{ scale: 1, opacity: 0.5 }}
                        animate={{ scale: 1.5, opacity: 0 }}
                        transition={{ repeat: Infinity, duration: 1.5 }}
                        className="absolute inset-0 bg-red-500 rounded-full z-0"
                      />
                    )}
                  </div>
                ) : (
                  <div className="w-full max-w-2xl bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-xl">
                    <textarea
                      value={manualText}
                      onChange={(e) => setManualText(e.target.value)}
                      placeholder="Describe your dream in detail..."
                      className="w-full h-48 bg-transparent border-none focus:ring-0 text-xl font-light placeholder:text-white/20 resize-none"
                    />
                    <div className="flex justify-end mt-4">
                      <button
                        onClick={handleManualSave}
                        disabled={isTranscribing || !manualText.trim()}
                        className="px-8 py-3 bg-[#F27D26] text-black font-bold uppercase tracking-widest rounded-full disabled:opacity-50 transition-all hover:scale-105"
                      >
                        {isTranscribing ? 'Processing...' : 'Archive Dream'}
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setEntryMode(entryMode === 'voice' ? 'text' : 'voice')}
                    className="flex items-center gap-2 px-6 py-3 rounded-full border border-white/10 hover:bg-white/5 transition-colors text-sm uppercase tracking-widest font-bold"
                  >
                    {entryMode === 'voice' ? <Keyboard className="w-4 h-4" /> : <Mic2 className="w-4 h-4" />}
                    {entryMode === 'voice' ? 'Type Dream' : 'Voice Record'}
                  </button>
                </div>

                {isTranscribing && (
                  <div className="flex items-center gap-3 text-[#F27D26] animate-pulse">
                    <Sparkles className="w-5 h-5" />
                    <span className="text-sm font-bold uppercase tracking-widest">Decoding Subconscious...</span>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div 
              key="history"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-12"
            >
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                  <h2 className="text-6xl font-bold uppercase tracking-tighter italic font-serif">Archive</h2>
                  <p className="text-white/40 uppercase tracking-widest text-sm font-bold mt-2">Your personal subconscious library</p>
                </div>
                <div className="relative w-full md:w-96">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
                  <input 
                    type="text"
                    placeholder="Search imagery..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-full py-4 pl-12 pr-6 focus:border-[#F27D26] outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {dreams.filter(d => d.transcript.toLowerCase().includes(searchQuery.toLowerCase())).map((dream) => (
                  <motion.div 
                    layout
                    key={dream.id}
                    className="group bg-white/5 border border-white/10 rounded-3xl p-8 hover:bg-white/[0.08] transition-all cursor-pointer relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteDoc(doc(db, 'dreams', dream.id));
                        }}
                        className="p-2 text-white/20 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                    
                    <div className="flex items-center gap-2 mb-6 text-xs font-bold uppercase tracking-widest text-[#F27D26]">
                      <Calendar className="w-3 h-3" />
                      {dream.created_at?.toDate().toLocaleDateString()}
                      <span className="mx-2 text-white/10">•</span>
                      <MapPin className="w-3 h-3" />
                      {dream.location}
                    </div>

                    <p className="text-lg font-light leading-relaxed mb-6 line-clamp-3 text-white/80">
                      "{dream.transcript}"
                    </p>

                    <div className="space-y-4">
                      <div className="flex flex-wrap gap-2">
                        {dream.tags.map(tag => (
                          <span key={tag} className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] uppercase tracking-widest font-bold text-white/40">
                            #{tag}
                          </span>
                        ))}
                      </div>
                      <div className="pt-4 border-t border-white/5">
                        <p className="text-xs italic font-serif text-[#F27D26]/80 leading-relaxed">
                          {dream.insight}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'global' && (
            <motion.div 
              key="global"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-12"
            >
              <div className="space-y-8">
                <div>
                  <h2 className="text-6xl font-bold uppercase tracking-tighter italic font-serif">Collective</h2>
                  <p className="text-white/40 uppercase tracking-widest text-sm font-bold mt-2">Global subconscious patterns</p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-[40px] p-10">
                  <h3 className="text-xl font-bold uppercase tracking-widest mb-8 flex items-center gap-3">
                    <Sparkles className="w-6 h-6 text-[#F27D26]" />
                    Dominant Imagery
                  </h3>
                  <div className="flex flex-wrap gap-4">
                    {globalImagery.map((item, i) => (
                      <div 
                        key={item.tag}
                        className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-full pl-4 pr-6 py-3 hover:scale-105 transition-transform cursor-default"
                        style={{ opacity: 1 - (i * 0.04) }}
                      >
                        <span className="text-sm font-bold uppercase tracking-widest">#{item.tag}</span>
                        <span className="text-xs font-mono text-[#F27D26]">{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-8">
                <div className="bg-white/5 border border-white/10 rounded-[40px] p-10">
                  <h3 className="text-xl font-bold uppercase tracking-widest mb-8 flex items-center gap-3">
                    <MapPin className="w-6 h-6 text-[#4A90E2]" />
                    Dreaming Regions
                  </h3>
                  <div className="space-y-6">
                    {globalLocations.map((loc, i) => (
                      <div key={loc.country} className="space-y-2">
                        <div className="flex justify-between text-sm font-bold uppercase tracking-widest">
                          <span>{loc.country}</span>
                          <span className="text-white/40">{loc.count} dreams</span>
                        </div>
                        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${(loc.count / (globalLocations[0]?.count || 1)) * 100}%` }}
                            className="h-full bg-gradient-to-r from-[#4A90E2] to-[#F27D26]"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-[#F27D26] text-black rounded-[40px] p-10 flex items-center justify-between">
                  <div>
                    <h3 className="text-2xl font-bold uppercase tracking-tighter mb-1">Total Archived</h3>
                    <p className="text-black/60 text-sm font-bold uppercase tracking-widest">Global subconscious data</p>
                  </div>
                  <div className="text-6xl font-bold font-mono tracking-tighter">
                    {globalLocations.reduce((acc, curr) => acc + curr.count, 0)}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div 
              key="settings"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="max-w-2xl mx-auto space-y-12"
            >
              <div>
                <h2 className="text-6xl font-bold uppercase tracking-tighter italic font-serif">Settings</h2>
                <p className="text-white/40 uppercase tracking-widest text-sm font-bold mt-2">Configure your dream interface</p>
              </div>

              <div className="space-y-6">
                <div className="bg-white/5 border border-white/10 rounded-3xl p-8">
                  <h3 className="text-lg font-bold uppercase tracking-widest mb-6 flex items-center gap-3">
                    <User className="w-5 h-5 text-[#F27D26]" />
                    Profile Stats
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/5 rounded-2xl p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">Total Dreams</p>
                      <p className="text-2xl font-bold font-mono">{profile?.total_dreams || 0}</p>
                    </div>
                    <div className="bg-white/5 rounded-2xl p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">Current Streak</p>
                      <p className="text-2xl font-bold font-mono text-[#F27D26]">{profile?.streak || 0} Days</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-3xl p-8">
                  <h3 className="text-lg font-bold uppercase tracking-widest mb-6 flex items-center gap-3">
                    <Zap className="w-5 h-5 text-[#F27D26]" />
                    AI Configuration
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">Minimax API Key (Optional)</label>
                      <input 
                        type="password"
                        placeholder="••••••••••••••••"
                        value={profile?.external_apis?.minimax || ""}
                        onChange={(e) => {
                          if (!user) return;
                          updateDoc(doc(db, 'users', user.uid), {
                            'external_apis.minimax': e.target.value
                          });
                        }}
                        className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 focus:border-[#F27D26] outline-none transition-colors font-mono text-sm"
                      />
                      <p className="text-[10px] text-white/20 mt-2 italic">Providing your own key removes the 3-dream daily public quota.</p>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={() => signOut(auth)}
                  className="w-full py-4 bg-red-500/10 text-red-500 border border-red-500/20 rounded-2xl font-bold uppercase tracking-widest text-sm hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer Stats */}
      <footer className="fixed bottom-0 left-0 right-0 z-40 bg-[#050505]/80 backdrop-blur-xl border-t border-white/5 py-4">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.2em] text-white/20">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Collective Sync Active
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <Clock className="w-3 h-3" />
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} UTC
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span>Quota: {profile?.daily_usage_count || 0}/{profile?.daily_quota_limit || 3}</span>
            <span className="text-white/5">|</span>
            <span className="text-[#F27D26]/60">Oneiroi v1.0.4</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
