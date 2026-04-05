import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Mic, 
  MicOff, 
  History, 
  Settings, 
  Sparkles, 
  Globe, 
  MapPin, 
  Clock, 
  Calendar, 
  Keyboard, 
  Mic2,
  Trash2,
  Search,
  LogOut,
  User,
  Zap,
  ChevronRight,
  Info,
  AlertCircle,
  CheckCircle2,
  X,
  Plus,
  ArrowRight,
  Share2,
  Download,
  Filter,
  BarChart3,
  Moon,
  Sun,
  Cloud,
  Wind,
  Menu,
  MoreVertical
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { 
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
  runTransaction,
  limit,
  Timestamp
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytes, 
  getDownloadURL 
} from 'firebase/storage';
import { Toaster, toast } from 'sonner';
import Markdown from 'react-markdown';

// --- Custom Components ---
import { ThothLogo } from './components/Logo';
import { WorldMap } from './components/WorldMap';

// --- Firebase Imports ---
import { db, auth, storage } from './firebase';
import { uploadToR2 } from './lib/r2';

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
  divine_oracle: string;
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
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
};

// --- Framer Motion Variants ---
const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 }
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.1
    }
  }
};

// --- Main App Component ---
export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [dreams, setDreams] = useState<Dream[]>([]);
  const [globalImagery, setGlobalImagery] = useState<GlobalImagery[]>([]);
  const [globalLocations, setGlobalLocations] = useState<GlobalLocation[]>([]);
  const [totalUserCount, setTotalUserCount] = useState(0);
  
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setTranscribing] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isDreamLost, setIsDreamLost] = useState(false);
  const [isWatchMode, setIsWatchMode] = useState(false);
  const [hasWokenUp, setHasWokenUp] = useState(false);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [activeTab, setActiveTab] = useState<'record' | 'history' | 'global' | 'settings'>('record');
  const [searchQuery, setSearchQuery] = useState("");
  const [manualText, setManualText] = useState("");
  const [entryMode, setEntryMode] = useState<'voice' | 'text'>('voice');
  const [userCountry, setUserCountry] = useState<string | null>(null);
  const [selectedDream, setSelectedDream] = useState<Dream | null>(null);
  const [dreamToDelete, setDreamToDelete] = useState<{id: string, location: string, tags: string[]} | null>(null);

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);

  // --- Loss Aversion: Memory Collapse Countdown ---
  useEffect(() => {
    if (activeTab === 'record' && !isRecording && !isTranscribing && countdown === null && !isDreamLost) {
      // In Watch Mode, only start countdown after "waking up"
      if (isWatchMode && !hasWokenUp) return;
      
      // Start a 3-minute countdown (180 seconds) when entering record tab
      setCountdown(180);
    }
  }, [activeTab, isRecording, isTranscribing, countdown, isDreamLost, isWatchMode, hasWokenUp]);

  useEffect(() => {
    if (countdown !== null && countdown > 0) {
      countdownTimerRef.current = setInterval(() => {
        setCountdown(prev => (prev !== null ? prev - 1 : null));
      }, 1000);
    } else if (countdown === 0) {
      setIsDreamLost(true);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    }
    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [countdown]);

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // --- Auth & Profile ---
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (u) => {
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
    const q = query(collection(db, 'global_imagery'), orderBy('count', 'desc'), limit(30));
    const unsubscribe = onSnapshot(q, (snap) => {
      setGlobalImagery(snap.docs.map(d => d.data() as GlobalImagery));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'global_imagery'));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'global_locations'), orderBy('count', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const locs = snap.docs.map(d => d.data() as GlobalLocation);
      console.log("Global locations updated:", locs);
      setGlobalLocations(locs);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'global_locations'));
    return () => unsubscribe();
  }, []);

  // Sync global stats if they appear empty but dreams exist
  useEffect(() => {
    if (user && dreams.length > 0 && globalLocations.length === 0) {
      console.log("Global stats seem empty, syncing...");
      const counts: Record<string, number> = {};
      dreams.forEach(d => {
        const loc = d.location || "Unknown";
        counts[loc] = (counts[loc] || 0) + 1;
      });
      
      Object.entries(counts).forEach(([country, count]) => {
        const locRef = doc(db, 'global_locations', country);
        setDoc(locRef, {
          country,
          count,
          last_updated: serverTimestamp()
        }, { merge: true }).catch(err => handleFirestoreError(err, OperationType.WRITE, `global_locations/${country}`));
      });
    }
  }, [user, dreams.length, globalLocations.length]);

  useEffect(() => {
    // Real-time count of all registered dreamers
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snap) => {
      setTotalUserCount(snap.size);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));
    return () => unsubscribe();
  }, []);

  // --- AI Service ---
  const hasUserKey = profile?.external_apis?.minimax || false;
  const apiKey = profile?.external_apis?.minimax || process.env.GEMINI_API_KEY;

  const analyzeDream = async (text: string) => {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze this dream transcript. 
      1. Extract 3-5 key imagery tags (single words).
      2. Provide a short, poetic psychological insight (max 2 sentences).
      3. Provide a mystical "divine oracle" sentence (similar to Tarot or ancient scripts, cryptic but profound).
      Return as JSON: { "tags": ["tag1", "tag2"], "insight": "...", "divine_oracle": "..." }`,
      config: {
        responseMimeType: "application/json"
      }
    });
    
    try {
      return JSON.parse(response.text || "{}");
    } catch (e) {
      return { 
        tags: ["mystery", "subconscious"], 
        insight: "The mind weaves patterns beyond immediate comprehension.",
        divine_oracle: "The gate is open, yet you remain on the threshold."
      };
    }
  };

  // --- Recording Logic ---
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/wav';
      mediaRecorder.current = new MediaRecorder(stream, { mimeType });
      audioChunks.current = [];

      // Stop countdown when recording starts
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      setCountdown(null);

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
    console.log("Processing dream...", { mimeType, size: audioBlob.size });
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
      const dreamId = Math.random().toString(36).substring(7);
      const fileName = `dreams/${user.uid}/${dreamId}.webm`;
      let audioUrl = "";

      try {
        // Try R2 first
        audioUrl = await uploadToR2(audioBlob, fileName, mimeType);
        console.log("Uploaded to R2:", audioUrl);
      } catch (r2Error) {
        console.warn("R2 upload failed, falling back to Firebase Storage:", r2Error);
        const storageRef = ref(storage, fileName);
        await uploadBytes(storageRef, audioBlob);
        audioUrl = await getDownloadURL(storageRef);
      }

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

      let tags: string[] = [];
      let insight = "Subconscious patterns detected.";
      let divine_oracle = "The silence speaks what the words cannot.";
      try {
        const analysis = await analyzeDream(transcript);
        tags = analysis.tags;
        insight = analysis.insight;
        divine_oracle = analysis.divine_oracle || divine_oracle;
      } catch (err: any) {
        console.warn("AI Analysis skipped:", err.message);
      }

      const dreamPath = 'dreams';
      await addDoc(collection(db, dreamPath), {
        user_id: user.uid,
        transcript,
        audio_url: audioUrl,
        tags,
        insight,
        divine_oracle,
        location: userCountry || "Unknown",
        created_at: serverTimestamp(),
      }).catch(err => handleFirestoreError(err, OperationType.CREATE, dreamPath));
      
      await updateGlobalImagery(tags);
      await updateGlobalLocation(userCountry || "Unknown");
      await syncUserStats(isUsingPublicQuota);

      toast.success("Dream archived successfully.");
    } catch (err: any) {
      if (err.message.includes('Firestore Error')) throw err;
      toast.error("Failed to process dream.");
    } finally {
      setTranscribing(false);
    }
  };

  const handleManualSave = async () => {
    if (!user || !profile || !manualText.trim()) return;
    
    // Stop countdown when saving starts
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    setCountdown(null);

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
      let divine_oracle = "The silence speaks what the words cannot.";
      try {
        const analysis = await analyzeDream(manualText);
        tags = analysis.tags;
        insight = analysis.insight;
        divine_oracle = analysis.divine_oracle || divine_oracle;
      } catch (err: any) {
        console.warn("AI Analysis skipped:", err.message);
      }

      const dreamPath = 'dreams';
      await addDoc(collection(db, dreamPath), {
        user_id: user.uid,
        transcript: manualText,
        tags,
        insight,
        divine_oracle,
        location: userCountry || "Unknown",
        created_at: serverTimestamp(),
      }).catch(err => handleFirestoreError(err, OperationType.CREATE, dreamPath));

      await updateGlobalImagery(tags);
      await updateGlobalLocation(userCountry || "Unknown");
      await syncUserStats(isUsingPublicQuota);

      setManualText("");
      setEntryMode('voice');
      toast.success("Dream archived successfully.");
    } catch (err: any) {
      if (err.message.includes('Firestore Error')) throw err;
      toast.error("Failed to save dream.");
    } finally {
      setTranscribing(false);
    }
  };

  const syncUserStats = async (isUsingPublicQuota: boolean) => {
    if (!user || !profile) return;
    const userRef = doc(db, 'users', user.uid);
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    try {
      await runTransaction(db, async (transaction) => {
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists()) return;

        const userData = userSnap.data() as UserProfile;
        let newStreak = userData.streak || 0;
        if (userData.last_streak_date === yesterday) {
          newStreak += 1;
        } else if (userData.last_streak_date !== today) {
          newStreak = 1;
        }

        const isNewDay = userData.last_usage_date !== today;
        const userUpdate: any = {
          total_dreams: (userData.total_dreams || 0) + 1,
          streak: newStreak,
          last_streak_date: today
        };

        if (isUsingPublicQuota) {
          if (isNewDay) {
            userUpdate.daily_usage_count = 1;
            userUpdate.last_usage_date = today;
          } else {
            userUpdate.daily_usage_count = (userData.daily_usage_count || 0) + 1;
          }
        }

        transaction.update(userRef, userUpdate);
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const updateGlobalImagery = async (tags: string[], delta: number = 1) => {
    for (const tag of tags) {
      const tagRef = doc(db, 'global_imagery', tag.toLowerCase());
      await setDoc(tagRef, {
        tag: tag.toLowerCase(),
        count: increment(delta),
        last_updated: serverTimestamp()
      }, { merge: true }).catch(err => handleFirestoreError(err, OperationType.WRITE, `global_imagery/${tag.toLowerCase()}`));
    }
  };

  const updateGlobalLocation = async (country: string, delta: number = 1) => {
    if (!country) country = "Unknown";
    console.log(`Updating global location for ${country} with delta ${delta}`);
    try {
      const locRef = doc(db, 'global_locations', country);
      await setDoc(locRef, {
        country,
        count: increment(delta),
        last_updated: serverTimestamp()
      }, { merge: true }).catch(err => handleFirestoreError(err, OperationType.WRITE, `global_locations/${country}`));
    } catch (err) {
      if (err instanceof Error && err.message.includes('Firestore Error')) throw err;
      console.error("Failed to update global location:", err);
    }
  };

  const deleteDream = async (dreamId: string, location: string, tags: string[]) => {
    if (!user) return;
    setDreamToDelete({ id: dreamId, location, tags });
  };

  const confirmDeleteDream = async () => {
    if (!user || !dreamToDelete) return;
    const { id: dreamId, location, tags } = dreamToDelete;
    
    try {
      await deleteDoc(doc(db, 'dreams', dreamId)).catch(err => handleFirestoreError(err, OperationType.DELETE, `dreams/${dreamId}`));
      await updateDoc(doc(db, 'users', user.uid), {
        total_dreams: increment(-1)
      }).catch(err => handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`));
      await updateGlobalLocation(location || "Unknown", -1);
      if (tags && tags.length > 0) {
        await updateGlobalImagery(tags, -1);
      }
      toast.success("Dream deleted successfully.");
    } catch (err) {
      if (err instanceof Error && err.message.includes('Firestore Error')) throw err;
      console.error(err);
      toast.error("Failed to delete dream.");
    } finally {
      setDreamToDelete(null);
    }
  };

  // --- Filtered Data ---
  const filteredDreams = useMemo(() => {
    return dreams.filter(d => 
      d.transcript.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [dreams, searchQuery]);

  // --- UI Components ---
  return (
    <div className="min-h-screen selection:bg-dream-accent selection:text-white">
      <Toaster position="top-center" theme="dark" />
      
      {/* Immersive Atmosphere */}
      <div className="atmosphere" />

      {/* Header Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-dream-bg/40 backdrop-blur-2xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 sm:h-24 flex items-center justify-between">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3 sm:gap-4 group cursor-pointer" 
            onClick={() => setActiveTab('record')}
          >
            <ThothLogo className="w-10 h-10 sm:w-12 h-12" />
            <div className="flex flex-col">
              <span className="text-xl sm:text-2xl font-serif italic font-light tracking-tight dream-text-gradient">Thoth</span>
              <span className="text-[8px] sm:text-[10px] uppercase tracking-[0.3em] text-white/30 font-bold">AI Dream Archive</span>
            </div>
          </motion.div>

          <div className="hidden lg:flex items-center gap-10">
            {[
              { id: 'record', label: 'Capture', icon: Mic2 },
              { id: 'history', label: 'Archive', icon: History },
              { id: 'global', label: 'Collective', icon: Globe },
              { id: 'settings', label: 'Settings', icon: Settings },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`group flex items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] transition-all relative py-2 ${
                  activeTab === tab.id ? 'text-white' : 'text-white/30 hover:text-white/60'
                }`}
              >
                <tab.icon className={`w-4 h-4 transition-transform group-hover:scale-110 ${activeTab === tab.id ? 'text-dream-accent' : ''}`} />
                {tab.label}
                {activeTab === tab.id && (
                  <motion.div 
                    layoutId="nav-underline"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-dream-accent rounded-full"
                  />
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 sm:gap-6">
            {user ? (
              <div className="flex items-center gap-3 sm:gap-4 pl-4 sm:pl-6 border-l border-white/10">
                <div className="text-right hidden sm:block">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/20">Dreamer</p>
                  <p className="text-sm font-medium text-white/80">{user.displayName?.split(' ')[0]}</p>
                </div>
                <motion.img 
                  whileHover={{ scale: 1.1 }}
                  src={user.photoURL || ""} 
                  alt="Avatar" 
                  className="w-9 h-9 sm:w-11 h-11 rounded-xl sm:rounded-2xl border border-white/10 shadow-xl"
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : (
              <button 
                onClick={() => signInWithPopup(auth, new GoogleAuthProvider())}
                className="px-4 sm:px-8 py-2.5 sm:py-3 bg-white text-black text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] rounded-xl sm:rounded-2xl hover:bg-dream-accent hover:text-white transition-all duration-500 shadow-2xl shadow-white/5"
              >
                Begin
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-dream-bg/80 backdrop-blur-3xl border-t border-white/5 px-6 py-4 pb-8">
        <div className="flex items-center justify-between">
          {[
            { id: 'record', icon: Mic2, label: 'Capture' },
            { id: 'history', icon: History, label: 'Archive' },
            { id: 'global', icon: Globe, label: 'Collective' },
            { id: 'settings', icon: Settings, label: 'Profile' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex flex-col items-center gap-1.5 transition-all ${
                activeTab === tab.id ? 'text-dream-accent' : 'text-white/30'
              }`}
            >
              <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'scale-110' : ''}`} />
              <span className="text-[8px] font-bold uppercase tracking-widest">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Main Viewport */}
      <main className="pt-32 sm:pt-40 pb-32 sm:pb-32 px-4 sm:px-6 max-w-7xl mx-auto relative z-10">
        <AnimatePresence mode="wait">
          {activeTab === 'record' && (
            <motion.div 
              key="record"
              variants={fadeInUp}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex flex-col items-center justify-center min-h-[60vh] text-center relative"
            >
              {/* Watch Mode Simulation Overlay */}
              {isWatchMode && !hasWokenUp && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-50 flex items-center justify-center bg-dream-bg/95 backdrop-blur-3xl rounded-[60px]"
                >
                  <div className="flex flex-col items-center gap-10 p-12">
                    <div className="relative">
                      <div className="absolute -inset-8 bg-dream-accent/20 rounded-full blur-3xl animate-pulse" />
                      <div className="w-40 h-40 rounded-full border border-white/10 flex items-center justify-center relative bg-zinc-900/40">
                        <Moon className="w-16 h-16 text-dream-accent/40" />
                        <div className="absolute inset-0 rounded-full border-2 border-dream-accent/40 animate-[ping_3s_infinite]" />
                      </div>
                    </div>
                    <div className="space-y-4">
                      <h2 className="text-4xl font-serif italic text-white tracking-tight">Deep Sleep</h2>
                      <p className="text-[10px] text-white/30 uppercase tracking-[0.4em] font-bold">Monitoring Subconscious Waves</p>
                    </div>
                    <button 
                      onClick={() => setHasWokenUp(true)}
                      className="group relative px-12 py-5 bg-white/5 border border-white/10 rounded-full overflow-hidden transition-all hover:border-dream-accent/50"
                    >
                      <div className="absolute inset-0 bg-dream-accent/10 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
                      <span className="relative text-[10px] font-bold uppercase tracking-[0.5em] text-white/60 group-hover:text-white">Simulate Wake Up</span>
                    </button>
                  </div>
                </motion.div>
              )}

              <div className="mb-10 sm:mb-16 relative">
                {/* Loss Aversion Mist Overlay */}
                <AnimatePresence>
                  {countdown !== null && !isDreamLost && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 0.4 + (1 - countdown / 180) * 0.6 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 -z-10 pointer-events-none"
                    >
                      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-dream-bg to-dream-bg blur-3xl scale-150" />
                    </motion.div>
                  )}
                </AnimatePresence>

                <motion.h1 
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ 
                    opacity: isDreamLost ? 0.2 : 1, 
                    y: 0,
                    filter: isDreamLost ? 'blur(8px)' : 'blur(0px)'
                  }}
                  transition={{ delay: 0.2, duration: 2 }}
                  className="text-5xl sm:text-7xl md:text-[10rem] font-serif italic font-light tracking-tighter leading-[0.9] sm:leading-none mb-6 sm:mb-8 dream-text-gradient"
                >
                  {isDreamLost ? 'The Dream has' : 'Whisper to the'} <br className="hidden sm:block" />
                  <span className={isDreamLost ? 'text-white/20' : 'text-dream-accent'}>
                    {isDreamLost ? 'Dissolved' : 'Subconscious'}
                  </span>
                </motion.h1>

                <AnimatePresence>
                  {countdown !== null && !isDreamLost && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex flex-col items-center gap-3 mb-8"
                    >
                      <div className="relative group">
                        {/* Watch Face Complication Style */}
                        <div className="absolute -inset-4 bg-dream-accent/10 rounded-full blur-xl group-hover:bg-dream-accent/20 transition-all duration-1000" />
                        <div className="relative flex items-center gap-4 px-6 py-3 bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-full shadow-2xl">
                          <div className="relative w-8 h-8 flex items-center justify-center">
                            <svg className="w-full h-full -rotate-90">
                              <circle
                                cx="16"
                                cy="16"
                                r="14"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                className="text-white/5"
                              />
                              <motion.circle
                                cx="16"
                                cy="16"
                                r="14"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeDasharray="88"
                                animate={{ strokeDashoffset: 88 * (1 - countdown / 180) }}
                                className="text-dream-accent"
                              />
                            </svg>
                            <Clock className="absolute w-3 h-3 text-dream-accent/60" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/80">
                              Collapse: {formatCountdown(countdown)}
                            </span>
                            <span className="text-[7px] uppercase tracking-[0.2em] text-white/20 font-bold">Signal Fading</span>
                          </div>
                        </div>
                      </div>
                      <p className="text-[9px] uppercase tracking-widest text-white/10 italic">The imagery is dissolving into the void</p>
                    </motion.div>
                  )}
                  {isDreamLost && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex flex-col items-center gap-4 mb-8"
                    >
                      <div className="px-6 py-3 bg-white/5 border border-white/10 rounded-2xl">
                        <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/40">
                          Signal Lost: This dreamscape has returned to the void
                        </span>
                      </div>
                      <button 
                        onClick={() => {
                          setIsDreamLost(false);
                          setCountdown(180);
                        }}
                        className="text-[9px] uppercase tracking-widest text-dream-accent hover:underline"
                      >
                        Attempt to recall fragments
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {!isDreamLost && (
                  <motion.p 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="text-base sm:text-xl text-white/30 max-w-2xl mx-auto font-light leading-relaxed px-4 sm:px-0"
                  >
                    Capture the ephemeral imagery of your sleep. Let the archive decode the patterns that emerge from the deep.
                  </motion.p>
                )}
              </div>

              <div className="flex flex-col items-center gap-8 sm:gap-12">
                {entryMode === 'voice' ? (
                  <div className="relative">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={isRecording ? stopRecording : startRecording}
                      disabled={isTranscribing}
                      className={`w-40 h-40 sm:w-48 sm:h-48 rounded-[50px] sm:rounded-[60px] flex items-center justify-center relative z-10 transition-all duration-700 shadow-2xl ${
                        isRecording 
                          ? 'bg-red-500 shadow-red-500/40 rotate-12' 
                          : 'bg-dream-accent shadow-dream-accent/40'
                      } ${isTranscribing ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
                    >
                      {isRecording ? (
                        <MicOff className="w-16 h-16 sm:w-20 sm:h-20 text-white animate-pulse" />
                      ) : (
                        <Mic className="w-16 h-16 sm:w-20 sm:h-20 text-white" />
                      )}
                    </motion.button>
                    
                    {isRecording && (
                      <div className="absolute inset-0 z-0">
                        {[1, 2, 3].map((i) => (
                          <motion.div 
                            key={i}
                            initial={{ scale: 1, opacity: 0.5 }}
                            animate={{ scale: 2.5, opacity: 0 }}
                            transition={{ repeat: Infinity, duration: 2, delay: i * 0.6 }}
                            className="absolute inset-0 bg-red-500/20 rounded-[60px]"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="w-full max-w-3xl glass-card p-10"
                  >
                    <textarea
                      value={manualText}
                      onChange={(e) => setManualText(e.target.value)}
                      placeholder="Describe the dreamscape..."
                      className="w-full h-64 bg-transparent border-none focus:ring-0 text-2xl font-serif italic font-light placeholder:text-white/10 resize-none leading-relaxed"
                    />
                    <div className="flex justify-between items-center mt-8 pt-8 border-t border-white/5">
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-white/20 font-bold">
                        <Info className="w-3 h-3" />
                        AI Analysis will be applied
                      </div>
                      <button
                        onClick={handleManualSave}
                        disabled={isTranscribing || !manualText.trim()}
                        className="group flex items-center gap-3 px-10 py-4 bg-white text-black font-bold uppercase tracking-[0.2em] text-xs rounded-2xl disabled:opacity-50 transition-all hover:bg-dream-accent hover:text-white"
                      >
                        {isTranscribing ? 'Decoding...' : 'Archive'}
                        <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                      </button>
                    </div>
                  </motion.div>
                )}

                <div className="flex items-center gap-6">
                  <button 
                    onClick={() => setEntryMode(entryMode === 'voice' ? 'text' : 'voice')}
                    className="flex items-center gap-3 px-8 py-4 rounded-2xl border border-white/5 bg-white/5 hover:bg-white/10 transition-all text-[10px] uppercase tracking-[0.2em] font-bold text-white/40 hover:text-white"
                  >
                    {entryMode === 'voice' ? <Keyboard className="w-4 h-4" /> : <Mic2 className="w-4 h-4" />}
                    {entryMode === 'voice' ? 'Type Dream' : 'Voice Entry'}
                  </button>
                </div>

                {isTranscribing && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-4 text-dream-accent"
                  >
                    <div className="flex gap-1">
                      {[0, 1, 2].map(i => (
                        <motion.div 
                          key={i}
                          animate={{ height: [4, 16, 4] }}
                          transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }}
                          className="w-1 bg-dream-accent rounded-full"
                        />
                      ))}
                    </div>
                    <span className="text-xs font-bold uppercase tracking-[0.3em]">Decoding Subconscious...</span>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div 
              key="history"
              variants={fadeInUp}
              initial="initial"
              animate="animate"
              className="space-y-10 sm:space-y-16"
            >
              {/* Ghost Prompt for Unrecorded Dreams */}
              {profile && profile.last_usage_date !== new Date().toISOString().split('T')[0] && dreams.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-8 sm:p-10 glass-card bg-red-500/5 border-red-500/10 relative overflow-hidden group"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2 group-hover:bg-red-500/10 transition-all duration-1000" />
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-6 relative z-10">
                    <div className="flex items-center gap-6">
                      <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center">
                        <Wind className="w-8 h-8 text-red-500/40 animate-pulse" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-xl font-serif italic text-red-500/80">Unconscious Noise Detected</h4>
                        <p className="text-[10px] uppercase tracking-widest text-white/20 font-bold">You had an unrecorded dream last night. It is dissolving into the void.</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setActiveTab('record')}
                      className="px-8 py-4 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 rounded-2xl text-[10px] font-bold uppercase tracking-[0.3em] transition-all"
                    >
                      Attempt Recovery
                    </button>
                  </div>
                </motion.div>
              )}

              <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 sm:gap-10">
                <div>
                  <h2 className="text-5xl sm:text-7xl font-serif italic font-light tracking-tighter dream-text-gradient">The Archive</h2>
                  <div className="flex items-center gap-4 mt-4">
                    <span className="text-[8px] sm:text-[10px] uppercase tracking-[0.3em] text-white/20 font-bold">Your personal subconscious library</span>
                    <div className="hidden sm:block h-px w-20 bg-white/10" />
                    <span className="text-[8px] sm:text-[10px] uppercase tracking-[0.3em] text-dream-accent font-bold">{dreams.length} Dreams</span>
                  </div>
                </div>
                <div className="relative w-full md:w-[400px]">
                  <Search className="absolute left-5 sm:left-6 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 h-5 text-white/20" />
                  <input 
                    type="text"
                    placeholder="Search imagery..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full glass-card bg-white/[0.03] border-white/5 rounded-xl sm:rounded-2xl py-4 sm:py-5 pl-14 sm:pl-16 pr-6 sm:pr-8 focus:border-dream-accent/50 outline-none transition-all text-sm font-medium"
                  />
                </div>
              </div>

              <motion.div 
                variants={staggerContainer}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8"
              >
                {filteredDreams.map((dream) => (
                  <motion.div 
                    layout
                    key={dream.id}
                    variants={fadeInUp}
                    onClick={() => setSelectedDream(dream)}
                    className="group glass-card p-8 sm:p-10 hover:bg-white/[0.07] transition-all duration-500 cursor-pointer relative overflow-hidden flex flex-col h-full"
                  >
                    <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-100 transition-all duration-500 translate-y-2 group-hover:translate-y-0">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteDream(dream.id, dream.location, dream.tags);
                        }}
                        className="p-3 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-all"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                    
                    <div className="flex items-center gap-3 mb-8 text-[10px] font-bold uppercase tracking-[0.2em] text-white/20">
                      <Calendar className="w-3.5 h-3.5 text-dream-accent" />
                      {dream.created_at?.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      <span className="mx-2 opacity-30">|</span>
                      <MapPin className="w-3.5 h-3.5" />
                      {dream.location}
                    </div>

                    <p className="text-xl font-serif italic font-light leading-relaxed mb-10 line-clamp-4 text-white/70 group-hover:text-white transition-colors">
                      "{dream.transcript}"
                    </p>

                    <div className="mt-auto space-y-6">
                      <div className="flex flex-wrap gap-2">
                        {dream.tags.map(tag => (
                          <span key={tag} className="px-4 py-1.5 bg-white/5 border border-white/5 rounded-full text-[9px] uppercase tracking-[0.2em] font-bold text-white/30 group-hover:text-dream-accent group-hover:border-dream-accent/20 transition-all">
                            #{tag}
                          </span>
                        ))}
                      </div>
                      <div className="pt-6 border-t border-white/5">
                        <p className="text-xs italic font-serif text-white/40 group-hover:text-dream-accent/80 leading-relaxed transition-colors">
                          {dream.insight}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>

              {filteredDreams.length === 0 && (
                <div className="flex flex-col items-center justify-center py-40 text-center space-y-6">
                  <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center">
                    <Search className="w-8 h-8 text-white/10" />
                  </div>
                  <p className="text-white/20 uppercase tracking-[0.3em] text-xs font-bold">No matching imagery found in the archive</p>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'global' && (
            <motion.div 
              key="global"
              variants={fadeInUp}
              initial="initial"
              animate="animate"
              className="grid grid-cols-1 lg:grid-cols-12 gap-8 sm:gap-12"
            >
              <div className="lg:col-span-7 space-y-8 sm:space-y-12">
                <div>
                  <h2 className="text-5xl sm:text-7xl font-serif italic font-light tracking-tighter dream-text-gradient">The Collective</h2>
                  <p className="text-white/30 uppercase tracking-[0.3em] text-[8px] sm:text-[10px] font-bold mt-4">Synthesized patterns from the global subconscious</p>
                </div>

                <div className="glass-card p-6 sm:p-12 relative overflow-hidden min-h-[400px] sm:min-h-[500px] flex flex-col">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-dream-accent/5 blur-[100px] rounded-full -translate-y-1/2 translate-x-1/2" />
                  
                  <h3 className="text-xs sm:text-sm font-bold uppercase tracking-[0.3em] mb-8 sm:mb-12 flex items-center gap-4 text-white/60">
                    <Globe className="w-4 h-4 sm:w-5 h-5 text-dream-accent" />
                    Global Subconscious Pulse
                  </h3>
                  
                  <div className="flex-1 w-full min-h-[300px]">
                    <WorldMap data={globalLocations} />
                  </div>
                </div>

                <div className="glass-card p-12 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-dream-accent/5 blur-[100px] rounded-full -translate-y-1/2 translate-x-1/2" />
                  
                  <h3 className="text-sm font-bold uppercase tracking-[0.3em] mb-12 flex items-center gap-4 text-white/60">
                    <Sparkles className="w-5 h-5 text-dream-accent" />
                    Dominant Imagery
                  </h3>
                  
                  <div className="flex flex-wrap gap-4">
                    {globalImagery.map((item, i) => (
                      <motion.div 
                        key={item.tag}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.05 }}
                        className="flex items-center gap-4 bg-white/[0.03] border border-white/5 rounded-2xl pl-5 pr-7 py-4 hover:bg-dream-accent/10 hover:border-dream-accent/20 transition-all cursor-default group"
                      >
                        <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/40 group-hover:text-white">#{item.tag}</span>
                        <div className="h-4 w-px bg-white/10" />
                        <span className="text-xs font-mono text-dream-accent font-bold">{item.count}</span>
                      </motion.div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="glass-card p-10 flex flex-col justify-between">
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/20">Global Sync</p>
                      <h4 className="text-2xl font-serif italic font-light">Active Dreamers</h4>
                    </div>
                    <div className="mt-8 flex items-end justify-between">
                      <div className="text-5xl font-mono font-bold tracking-tighter text-dream-accent">
                        {totalUserCount.toLocaleString()}
                      </div>
                      <div className="flex gap-1 mb-2">
                        {[1, 2, 3, 4].map(i => (
                          <div key={i} className="w-1 h-4 bg-dream-accent/20 rounded-full overflow-hidden">
                            <motion.div 
                              animate={{ height: ['20%', '100%', '20%'] }}
                              transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.3 }}
                              className="w-full bg-dream-accent"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  <div className="glass-card p-10 flex flex-col justify-between bg-dream-accent/5 border-dream-accent/10">
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-dream-accent/40">Collective Data</p>
                      <h4 className="text-2xl font-serif italic font-light">Total Archived</h4>
                    </div>
                    <div className="mt-8 text-6xl font-mono font-bold tracking-tighter dream-text-gradient">
                      {globalLocations.reduce((acc, curr) => acc + curr.count, 0).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 space-y-12">
                <div className="glass-card p-12 h-full">
                  <h3 className="text-sm font-bold uppercase tracking-[0.3em] mb-12 flex items-center gap-4 text-white/60">
                    <Globe className="w-5 h-5 text-[#4A90E2]" />
                    Dreaming Regions
                  </h3>
                  
                  <div className="space-y-10">
                    {globalLocations.slice(0, 12).map((loc, i) => (
                      <div key={loc.country} className="space-y-4">
                        <div className="flex justify-between items-end">
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-mono text-white/20">0{i + 1}</span>
                            <span className="text-xs font-bold uppercase tracking-[0.2em]">{loc.country}</span>
                          </div>
                          <span className="text-[10px] font-mono text-dream-accent font-bold">{loc.count} DREAMS</span>
                        </div>
                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${(loc.count / (globalLocations[0]?.count || 1)) * 100}%` }}
                            transition={{ duration: 1.5, delay: i * 0.1 }}
                            className="h-full bg-gradient-to-r from-[#4A90E2] to-dream-accent"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-16 pt-12 border-t border-white/5">
                    <div className="flex items-start gap-4 p-6 bg-white/[0.02] rounded-3xl border border-white/5">
                      <Info className="w-5 h-5 text-white/20 mt-1" />
                      <p className="text-[10px] leading-relaxed text-white/30 uppercase tracking-widest font-medium">
                        Location data is synthesized anonymously to map global subconscious trends without compromising individual dreamer privacy.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div 
              key="settings"
              variants={fadeInUp}
              initial="initial"
              animate="animate"
              className="max-w-3xl mx-auto space-y-10 sm:space-y-16"
            >
              <div className="text-center">
                <h2 className="text-5xl sm:text-7xl font-serif italic font-light tracking-tighter dream-text-gradient">Interface</h2>
                <p className="text-white/30 uppercase tracking-[0.3em] text-[8px] sm:text-[10px] font-bold mt-4">Configure your subconscious connection</p>
              </div>

              <div className="space-y-6 sm:space-y-8">
                <div className="glass-card p-8 sm:p-12">
                  <h3 className="text-xs sm:text-sm font-bold uppercase tracking-[0.3em] mb-8 sm:mb-10 flex items-center gap-4 text-white/60">
                    <User className="w-4 h-4 sm:w-5 h-5 text-dream-accent" />
                    Dreamer Identity
                  </h3>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                    <div className="bg-white/[0.03] border border-white/5 rounded-3xl p-6">
                      <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-white/20 mb-2">Total Archived</p>
                      <p className="text-3xl font-mono font-bold text-white/80">{profile?.total_dreams || 0}</p>
                    </div>
                    <div className="bg-white/[0.03] border border-white/5 rounded-3xl p-6">
                      <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-white/20 mb-2">Current Streak</p>
                      <p className="text-3xl font-mono font-bold text-dream-accent">{profile?.streak || 0} <span className="text-xs uppercase tracking-widest">Days</span></p>
                    </div>
                    <div className="bg-white/[0.03] border border-white/5 rounded-3xl p-6">
                      <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-white/20 mb-2">Member Since</p>
                      <p className="text-xl font-mono font-bold text-white/60">{profile?.created_at?.toDate().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</p>
                    </div>
                  </div>
                </div>

                <div className="glass-card p-12">
                  <h3 className="text-sm font-bold uppercase tracking-[0.3em] mb-10 flex items-center gap-4 text-white/60">
                    <Zap className="w-5 h-5 text-dream-accent" />
                    AI Synthesis
                  </h3>
                  
                  <div className="space-y-8">
                    <div className="space-y-4">
                      <div className="flex justify-between items-end">
                        <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/40">Minimax API Key</label>
                        <span className="text-[9px] text-white/20 italic">Optional: Removes public quota</span>
                      </div>
                      <input 
                        type="password"
                        placeholder="Enter your private key..."
                        value={profile?.external_apis?.minimax || ""}
                        onChange={(e) => {
                          if (!user) return;
                          updateDoc(doc(db, 'users', user.uid), {
                            'external_apis.minimax': e.target.value
                          });
                        }}
                        className="w-full bg-white/[0.03] border border-white/5 rounded-2xl py-5 px-6 focus:border-dream-accent/50 outline-none transition-all font-mono text-sm"
                      />
                    </div>

                    <div className="p-6 bg-dream-accent/5 border border-dream-accent/10 rounded-2xl flex items-start gap-4">
                      <Zap className="w-5 h-5 text-dream-accent mt-1" />
                      <div className="space-y-1">
                        <p className="text-xs font-bold uppercase tracking-widest text-dream-accent">Public Quota Active</p>
                        <p className="text-[10px] leading-relaxed text-white/40 uppercase tracking-widest">
                          You are currently using the public Gemini 3.1 Flash quota. 
                          Remaining today: <span className="text-white">{(profile?.daily_quota_limit || 3) - (profile?.daily_usage_count || 0)}</span> dreams.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="glass-card p-12">
                  <h3 className="text-sm font-bold uppercase tracking-[0.3em] mb-10 flex items-center gap-4 text-white/60">
                    <Moon className="w-5 h-5 text-dream-accent" />
                    Watch Mode (Experimental)
                  </h3>
                  
                  <div className="flex items-center justify-between p-8 bg-white/[0.03] border border-white/5 rounded-3xl">
                    <div className="space-y-1">
                      <p className="text-xs font-bold uppercase tracking-widest text-white">Enable Watch Interface</p>
                      <p className="text-[10px] text-white/40 uppercase tracking-widest leading-relaxed">Optimize UI for circular displays and wake-up detection</p>
                    </div>
                    <button 
                      onClick={() => {
                        setIsWatchMode(!isWatchMode);
                        setHasWokenUp(false);
                      }}
                      className={`w-14 h-7 rounded-full transition-all relative ${isWatchMode ? 'bg-dream-accent' : 'bg-white/10'}`}
                    >
                      <div className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all shadow-lg ${isWatchMode ? 'left-8' : 'left-1'}`} />
                    </button>
                  </div>
                </div>

                <div className="flex gap-4">
                  <button 
                    onClick={() => signOut(auth)}
                    className="flex-1 py-5 bg-red-500/5 text-red-500 border border-red-500/10 rounded-2xl font-bold uppercase tracking-[0.3em] text-[10px] hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-3"
                  >
                    <LogOut className="w-4 h-4" />
                    Terminate Connection
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Persistent Footer Stats */}
      <footer className="hidden sm:block fixed bottom-0 left-0 right-0 z-40 bg-dream-bg/40 backdrop-blur-2xl border-t border-white/5 py-6">
        <div className="max-w-7xl mx-auto px-8 flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.3em] text-white/20">
          <div className="flex items-center gap-10">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)] animate-pulse" />
              <span className="text-white/40">Collective Sync Active</span>
            </div>
            <div className="hidden md:flex items-center gap-3">
              <Clock className="w-3.5 h-3.5" />
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} UTC
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <span className="text-white/10">Quota Status</span>
              <span className={`px-2 py-0.5 rounded-md ${
                (profile?.daily_usage_count || 0) >= (profile?.daily_quota_limit || 3) 
                ? 'bg-red-500/20 text-red-500' 
                : 'bg-dream-accent/20 text-dream-accent'
              }`}>
                {profile?.daily_usage_count || 0} / {profile?.daily_quota_limit || 3}
              </span>
            </div>
            <span className="text-white/5">|</span>
            <span className="text-white/40 italic font-serif lowercase tracking-normal text-xs">Thoth v1.0.8 — Powered by dreambase</span>
          </div>
        </div>
      </footer>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {dreamToDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDreamToDelete(null)}
              className="absolute inset-0 bg-dream-bg/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-full max-w-sm glass-card p-8 sm:p-10 relative z-10 text-center"
            >
              <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-10 h-10 text-red-500" />
              </div>
              <h3 className="text-2xl font-serif italic text-white mb-4">Dissolve this memory?</h3>
              <p className="text-sm text-white/40 mb-8 leading-relaxed">
                This dream will be returned to the void. This action cannot be reversed.
              </p>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={confirmDeleteDream}
                  className="w-full py-4 bg-red-500 text-white rounded-2xl text-[10px] font-bold uppercase tracking-[0.3em] hover:bg-red-600 transition-colors"
                >
                  Confirm Dissolution
                </button>
                <button 
                  onClick={() => setDreamToDelete(null)}
                  className="w-full py-4 bg-white/5 text-white/60 rounded-2xl text-[10px] font-bold uppercase tracking-[0.3em] hover:bg-white/10 transition-colors"
                >
                  Keep Fragment
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Dream Detail Modal */}
      <AnimatePresence>
        {selectedDream && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedDream(null)}
              className="absolute inset-0 bg-dream-bg/95 backdrop-blur-2xl"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full h-full sm:h-auto sm:max-w-4xl glass-card p-8 sm:p-12 overflow-y-auto sm:max-h-[90vh] rounded-none sm:rounded-[40px]"
            >
              <button 
                onClick={() => setSelectedDream(null)}
                className="absolute top-6 sm:top-8 right-6 sm:right-8 p-3 hover:bg-white/5 rounded-2xl transition-colors z-10"
              >
                <X className="w-6 h-6 text-white/20" />
              </button>

              <div className="space-y-8 sm:space-y-10 pt-10 sm:pt-0">
                <div className="flex items-center gap-4 text-[10px] sm:text-xs font-bold uppercase tracking-[0.3em] text-dream-accent">
                  <Calendar className="w-4 h-4" />
                  {selectedDream.created_at?.toDate().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </div>

                <div className="space-y-4 sm:space-y-6">
                  <h3 className="text-[9px] sm:text-[10px] uppercase tracking-[0.4em] text-white/20 font-bold">Transcript</h3>
                  <p className="text-2xl sm:text-3xl md:text-4xl font-serif italic font-light leading-relaxed text-white/90">
                    "{selectedDream.transcript}"
                  </p>
                </div>

                {selectedDream.divine_oracle && (
                  <div className="py-8 sm:py-12 border-y border-white/5 flex flex-col items-center text-center space-y-6 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-dream-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
                    <Sparkles className="w-8 h-8 text-dream-accent/40 animate-pulse" />
                    <p className="text-xl sm:text-2xl md:text-3xl font-serif italic text-white tracking-tight max-w-2xl relative z-10">
                      {selectedDream.divine_oracle}
                    </p>
                    <div className="text-[8px] uppercase tracking-[0.5em] text-dream-accent/40 font-bold">The Oracle has Spoken</div>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-12 pt-8 sm:pt-12">
                  <div className="space-y-4 sm:space-y-6">
                    <h3 className="text-[9px] sm:text-[10px] uppercase tracking-[0.4em] text-white/20 font-bold">Psychological Insight</h3>
                    <div className="p-6 sm:p-8 bg-dream-accent/5 border border-dream-accent/10 rounded-2xl sm:rounded-[32px]">
                      <p className="text-base sm:text-lg font-serif italic text-dream-accent/90 leading-relaxed">
                        {selectedDream.insight}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-4 sm:space-y-6">
                    <h3 className="text-[9px] sm:text-[10px] uppercase tracking-[0.4em] text-white/20 font-bold">Imagery Tags</h3>
                    <div className="flex flex-wrap gap-2 sm:gap-3">
                      {selectedDream.tags.map(tag => (
                        <span key={tag} className="px-4 sm:px-6 py-2 sm:py-3 bg-white/5 border border-white/5 rounded-xl sm:rounded-2xl text-[10px] sm:text-xs uppercase tracking-[0.2em] font-bold text-white/40">
                          #{tag}
                        </span>
                      ))}
                    </div>
                    <div className="pt-6 sm:pt-8 flex items-center gap-6">
                      <div className="flex flex-col">
                        <span className="text-[8px] sm:text-[9px] uppercase tracking-widest text-white/20 font-bold">Origin</span>
                        <span className="text-xs sm:text-sm font-medium text-white/60">{selectedDream.location}</span>
                      </div>
                      <div className="h-8 w-px bg-white/5" />
                      <div className="flex flex-col">
                        <span className="text-[8px] sm:text-[9px] uppercase tracking-widest text-white/20 font-bold">Sync ID</span>
                        <span className="text-xs sm:text-sm font-mono text-white/40 truncate max-w-[100px]">{selectedDream.id}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row justify-end gap-3 sm:gap-4 pt-6 sm:pt-10 pb-10 sm:pb-0">
                  <button className="w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-4 bg-white/5 border border-white/5 rounded-xl sm:rounded-2xl text-[10px] uppercase tracking-[0.2em] font-bold text-white/40 hover:text-white transition-all">
                    <Share2 className="w-4 h-4" />
                    Share Pattern
                  </button>
                  <button className="w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-4 bg-white/5 border border-white/5 rounded-xl sm:rounded-2xl text-[10px] uppercase tracking-[0.2em] font-bold text-white/40 hover:text-white transition-all">
                    <Download className="w-4 h-4" />
                    Export Data
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
